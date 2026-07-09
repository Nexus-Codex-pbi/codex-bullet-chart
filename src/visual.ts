"use strict";

import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import ITooltipService = powerbi.extensibility.ITooltipService;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;
import ILocalizationManager = powerbi.extensibility.ILocalizationManager;
import DataView = powerbi.DataView;

import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import { dataViewWildcard } from "powerbi-visuals-utils-dataviewutils";
import { ColorHelper } from "powerbi-visuals-utils-colorutils";

import { VisualFormattingSettingsModel } from "./settings";
import { CODEX_TOKENS, formatValue, clamp } from "./utils";
import { toRgba } from "../../_shared/formatting/colorHelpers";

import "./../style/visual.less";

interface BulletRow {
    category: string;
    actual: number;
    target: number | null;
    maximum: number;
    sortOrder: number | null;
    originalIndex: number;
}

export class Visual implements IVisual {
    private target: HTMLElement;
    private host: IVisualHost;
    private eventService: IVisualEventService;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;

    private selectionManager: ISelectionManager;
    private tooltipService: ITooltipService;
    private colorPalette: ISandboxExtendedColorPalette;
    private localizationManager: ILocalizationManager;
    private isHighContrast: boolean;
    private container: HTMLElement;
    private svgContainer: HTMLElement;

    // State for tooltips and cross-filtering
    private rowSelectionIds: ISelectionId[] = [];

    // Conditional formatting (fx) state — Bar Colour (TRANS-04): the raw
    // categorical categories column (for per-row `.objects[originalIndex]`
    // override reads) and the ColorHelper resolved once per update().
    private categoricalCategories: powerbi.DataViewCategoryColumn | undefined;
    private barColorHelper: ColorHelper | null = null;

    constructor(options: VisualConstructorOptions) {
        this.formattingSettingsService = new FormattingSettingsService();
        this.target = options.element;
        this.host = options.host;
        this.eventService = options.host.eventService;
        this.selectionManager = options.host.createSelectionManager();
        this.tooltipService = options.host.tooltipService;
        this.colorPalette = options.host.colorPalette as ISandboxExtendedColorPalette;
        this.localizationManager = options.host.createLocalizationManager();
        this.isHighContrast = this.colorPalette.isHighContrast;

        // Context menu on right-click
        this.target.addEventListener("contextmenu", (e: MouseEvent) => {
            this.selectionManager.showContextMenu(
                {},
                { x: e.clientX, y: e.clientY }
            );
            e.preventDefault();
        });

        // Build DOM skeleton
        this.container = document.createElement("div");
        this.container.className = "bullet-chart-container";

        this.svgContainer = document.createElement("div");
        this.svgContainer.className = "bullet-chart-svg-area";

        this.container.appendChild(this.svgContainer);
        this.target.appendChild(this.container);

        // Allow deselection
        this.selectionManager.registerOnSelectCallback(() => {});
    }

    public update(options: VisualUpdateOptions): void {
        this.eventService.renderingStarted(options);

        try {
            const dataView: DataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel, dataView
            );

            // High contrast mode detection
            this.isHighContrast = this.colorPalette.isHighContrast;

            const bullet = this.formattingSettings.bulletSettings;
            const ranges = this.formattingSettings.qualitativeRanges;
            const bgBar = this.formattingSettings.backgroundBar;
            const labels = this.formattingSettings.labelSettings;
            const axis = this.formattingSettings.axisSettings;

            // ─── Dedicated outer background layer (D-05) ───────────────
            // Suite-wide shared Background card (Colour + Transparency,
            // sourced from _shared/formatting/), painted on `this.container`
            // — the outer render root appended directly to options.element
            // — never on the existing backgroundBar region colour. Its
            // transparency default is overridden to 100 in settings.ts
            // specifically so an OLD saved report (this property never
            // previously existed) renders alpha 0 — pixel-identical to
            // "nothing painted" (D-06).
            const background = this.formattingSettings.background;
            const outerBgHex = background.backgroundColor.value?.value ?? "#ffffff";
            const outerBgTransparencyPct = background.transparency.value ?? 100;
            this.container.style.backgroundColor = this.isHighContrast
                ? ""
                : toRgba(outerBgHex, outerBgTransparencyPct);

            // Clear previous render
            while (this.svgContainer.firstChild) {
                this.svgContainer.removeChild(this.svgContainer.firstChild);
            }

            if (!dataView || !dataView.categorical || !dataView.categorical.values) {
                this.renderEmpty();
                this.eventService.renderingFinished(options);
                return;
            }

            const categorical = dataView.categorical;
            const categories = categorical.categories && categorical.categories[0];
            const values = categorical.values;

            // Identify columns by role
            let actualCol: powerbi.DataViewValueColumn | null = null;
            let targetCol: powerbi.DataViewValueColumn | null = null;
            let maximumCol: powerbi.DataViewValueColumn | null = null;
            let sortOrderCol: powerbi.DataViewValueColumn | null = null;

            for (let i = 0; i < values.length; i++) {
                const roles = values[i].source.roles;
                if (roles["actual"]) actualCol = values[i];
                if (roles["target"]) targetCol = values[i];
                if (roles["maximum"]) maximumCol = values[i];
                if (roles["sortOrder"]) sortOrderCol = values[i];
            }

            if (!actualCol) {
                this.renderEmpty();
                this.eventService.renderingFinished(options);
                return;
            }

            // Parse rows
            const rowCount = actualCol.values.length;
            const rows: BulletRow[] = [];

            for (let i = 0; i < rowCount; i++) {
                const actualVal = actualCol.values[i] as number;
                if (actualVal == null || isNaN(actualVal)) continue;

                const targetVal = targetCol ? targetCol.values[i] as number : null;
                const maxVal = maximumCol ? maximumCol.values[i] as number : null;
                const sortOrderVal = sortOrderCol ? sortOrderCol.values[i] as number : null;
                const categoryLabel = categories ? String(categories.values[i]) : `Row ${i + 1}`;

                // Auto-calculate maximum if not provided
                const computedMax = maxVal != null && !isNaN(maxVal) && maxVal > 0
                    ? maxVal
                    : Math.max(
                        actualVal,
                        targetVal != null && !isNaN(targetVal) ? targetVal : 0
                    ) * 1.2;

                rows.push({
                    category: categoryLabel,
                    actual: actualVal,
                    target: targetVal != null && !isNaN(targetVal) ? targetVal : null,
                    maximum: computedMax,
                    sortOrder: sortOrderVal != null && !isNaN(sortOrderVal) ? sortOrderVal : null,
                    originalIndex: i
                });
            }

            // Sort by sortOrder ascending if any row has a sort order value
            const hasSortOrder = rows.some(r => r.sortOrder !== null);
            if (hasSortOrder) {
                rows.sort((a, b) => {
                    // Rows without sort order go to the end
                    if (a.sortOrder === null && b.sortOrder === null) return 0;
                    if (a.sortOrder === null) return 1;
                    if (b.sortOrder === null) return 1;
                    return a.sortOrder - b.sortOrder;
                });
            }

            if (rows.length === 0) {
                this.renderEmpty();
                this.rowSelectionIds = [];
                this.eventService.renderingFinished(options);
                return;
            }

            // Build selection IDs per row (after sort, using originalIndex)
            this.rowSelectionIds = [];
            if (categories) {
                for (let i = 0; i < rows.length; i++) {
                    this.rowSelectionIds.push(
                        this.host.createSelectionIdBuilder()
                            .withCategory(categories, rows[i].originalIndex)
                            .createSelectionId()
                    );
                }
            }

            // ─── Conditional formatting (fx) wiring — Bar Colour (TRANS-04) ──
            // bullet.barColor already carried a bare `instanceKind:
            // ConstantOrRule` declaration but with no
            // selector/altConstantSelector wired it was inert (Pitfall 5).
            // Wired here: a dataViewWildcard selector (so a rule can match
            // this property's instances/totals) + an altConstantSelector
            // bound to the first row's selectionId (the "set for all"
            // swatch edit path), resolved per-row at render via
            // ColorHelper.getColorForMeasure against each category's own
            // per-instance object overrides (categories.objects[originalIndex]) —
            // same pattern already proven on pbiProgressBarCard's Fixed Colour.
            this.categoricalCategories = categories;
            bullet.barColor.selector = dataViewWildcard.createDataViewWildcardSelector(
                dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals
            );
            bullet.barColor.altConstantSelector = this.rowSelectionIds[0]
                ? this.rowSelectionIds[0].getSelector()
                : undefined;
            this.barColorHelper = new ColorHelper(
                this.colorPalette,
                { objectName: "bulletSettings", propertyName: "barColor" },
                bullet.barColor.value.value
            );

            // Render based on orientation
            const orientation = bullet.orientation.value.value as string;
            if (orientation === "vertical") {
                this.renderVertical(rows, options, bullet, ranges, bgBar, labels, axis);
            } else {
                this.renderHorizontal(rows, options, bullet, ranges, bgBar, labels, axis);
            }

            this.eventService.renderingFinished(options);
        } catch (e) {
            this.eventService.renderingFailed(options, String(e));
        }
    }

    private renderHorizontal(
        rows: BulletRow[],
        options: VisualUpdateOptions,
        bullet: VisualFormattingSettingsModel["bulletSettings"],
        ranges: VisualFormattingSettingsModel["qualitativeRanges"],
        bgBar: VisualFormattingSettingsModel["backgroundBar"],
        labels: VisualFormattingSettingsModel["labelSettings"],
        axis: VisualFormattingSettingsModel["axisSettings"]
    ): void {
        const viewportWidth = options.viewport.width;
        const viewportHeight = options.viewport.height;
        const rowHeight = clamp(bullet.rowHeight.value, 20, 100);
        const barHeight = clamp(bullet.barHeight.value, 6, rowHeight - 4);
        const showLabels = labels.show.value;
        const labelFontSize = clamp(labels.fontSize.value, 8, 24);
        const showValue = bullet.showValue.value;
        const valueColor = bullet.valueColor.value.value;
        const valueFontSize = bullet.valueFontSize.value > 0
            ? clamp(bullet.valueFontSize.value, 6, 30)
            : labelFontSize - 1;

        const showAxis = axis.show.value;
        const axisFontSize = clamp(axis.fontSize.value, 6, 18);
        const axisColor = this.isHighContrast ? this.colorPalette.foreground.value : axis.color.value.value;
        const axisLabelText = axis.axisLabel.value || "";
        const axisLabelFontSize = clamp(axis.labelFontSize.value, 6, 24);
        const showGridlines = axis.gridlines.value;
        const gridlineColor = this.isHighContrast ? this.colorPalette.foreground.value : axis.gridlineColor.value.value;
        const gridlineWidth = clamp(axis.gridlineWidth.value, 1, 4);
        const axisAreaHeight = showAxis ? axisFontSize + 12 + (axisLabelText ? axisLabelFontSize + 4 : 0) : 0;

        // Calculate label width — use 0.65em average char width + generous padding
        const labelWidth = showLabels
            ? Math.min(
                Math.max(...rows.map(r => r.category.length)) * (labelFontSize * 0.65) + 16,
                viewportWidth * 0.4
            )
            : 0;

        const valueWidth = showValue ? 70 : 0;
        const chartWidth = Math.max(viewportWidth - labelWidth - valueWidth - 8, 40);
        const totalHeight = rows.length * rowHeight + axisAreaHeight;

        // Centre the visual horizontally
        const usedWidth = labelWidth + chartWidth + valueWidth + 8;
        const xOffset = Math.max(0, (viewportWidth - usedWidth) / 2);

        const svg = select(this.svgContainer)
            .append("svg")
            .attr("width", viewportWidth)
            .attr("height", Math.min(totalHeight, viewportHeight))
            .attr("class", "bullet-svg");

        // Scrollable if needed
        if (totalHeight > viewportHeight) {
            this.svgContainer.style.overflowY = "auto";
            svg.attr("height", totalHeight);
        } else {
            this.svgContainer.style.overflowY = "hidden";
        }

        rows.forEach((row, idx) => {
            const yCenter = idx * rowHeight + rowHeight / 2;
            const yTop = yCenter - barHeight / 2;
            const rangeHeight = barHeight * 1.6;
            const rangeTop = yCenter - rangeHeight / 2;

            const xScale = scaleLinear()
                .domain([0, row.maximum])
                .range([0, chartWidth])
                .clamp(true);

            const g = svg.append("g")
                .attr("class", "bullet-row")
                .attr("transform", `translate(${xOffset + labelWidth}, 0)`);

            // Qualitative range bands
            if (ranges.enabled.value) {
                const poorPct = clamp(ranges.poorThreshold.value, 0, 100) / 100;
                const acceptPct = clamp(ranges.acceptableThreshold.value, 0, 100) / 100;

                const hcRangeFill = this.isHighContrast ? this.colorPalette.foreground.value : null;

                // Poor band (0 to poorThreshold)
                g.append("rect")
                    .attr("x", 0)
                    .attr("y", rangeTop)
                    .attr("width", xScale(row.maximum * poorPct))
                    .attr("height", rangeHeight)
                    .attr("fill", hcRangeFill || ranges.poorColor.value.value)
                    .attr("opacity", this.isHighContrast ? 0.2 : 1)
                    .attr("rx", 2);

                // Acceptable band (poorThreshold to acceptableThreshold)
                g.append("rect")
                    .attr("x", xScale(row.maximum * poorPct))
                    .attr("y", rangeTop)
                    .attr("width", xScale(row.maximum * acceptPct) - xScale(row.maximum * poorPct))
                    .attr("height", rangeHeight)
                    .attr("fill", hcRangeFill || ranges.acceptableColor.value.value)
                    .attr("opacity", this.isHighContrast ? 0.4 : 1);

                // Good band (acceptableThreshold to max)
                g.append("rect")
                    .attr("x", xScale(row.maximum * acceptPct))
                    .attr("y", rangeTop)
                    .attr("width", chartWidth - xScale(row.maximum * acceptPct))
                    .attr("height", rangeHeight)
                    .attr("fill", hcRangeFill || ranges.goodColor.value.value)
                    .attr("opacity", this.isHighContrast ? 0.6 : 1)
                    .attr("rx", 2);
            } else {
                // Configurable background when ranges disabled. Always
                // render the rect — transparency is expressed via alpha,
                // never by omitting the element (D-05) — with the D-06
                // old-report migration read (see resolveBackgroundBarTransparency).
                const bgBarTransparencyPct = this.resolveBackgroundBarTransparency(bgBar);
                g.append("rect")
                    .attr("x", 0)
                    .attr("y", rangeTop)
                    .attr("width", chartWidth)
                    .attr("height", rangeHeight)
                    .attr("fill", this.isHighContrast
                        ? this.colorPalette.background.value
                        : toRgba(bgBar.color.value.value ?? "#f0eee6", bgBarTransparencyPct))
                    .attr("rx", 2);
            }

            // Actual value bar
            const barWidth = xScale(row.actual);
            g.append("rect")
                .attr("x", 0)
                .attr("y", yTop)
                .attr("width", Math.max(barWidth, 1))
                .attr("height", barHeight)
                .attr("fill", this.isHighContrast ? this.colorPalette.foreground.value : this.getBarColor(bullet, row.originalIndex))
                .attr("rx", barHeight / 4);

            // Target marker line
            if (row.target !== null) {
                const targetX = xScale(row.target);
                const markerHeight = rangeHeight + 4;
                const markerTop = yCenter - markerHeight / 2;

                g.append("rect")
                    .attr("x", targetX - bullet.targetWidth.value / 2)
                    .attr("y", markerTop)
                    .attr("width", bullet.targetWidth.value)
                    .attr("height", markerHeight)
                    .attr("fill", this.isHighContrast
                        ? (this.colorPalette.foregroundSelected?.value || this.colorPalette.foreground.value)
                        : bullet.targetColor.value.value)
                    .attr("rx", 1);
            }

            // Category label
            if (showLabels) {
                svg.append("text")
                    .attr("x", xOffset + labelWidth - 6)
                    .attr("y", yCenter)
                    .attr("dy", "0.35em")
                    .attr("text-anchor", "end")
                    .attr("class", "bullet-label")
                    .attr("font-size", labelFontSize + "px")
                    .attr("font-weight", "600")
                    .attr("fill", this.isHighContrast ? this.colorPalette.foreground.value : labels.color.value.value)
                    .text(row.category);
            }

            // Value label at end of bar
            if (showValue) {
                const formatted = this.formatDisplayValue(row.actual, bullet.valueFormat.value.value as string);
                g.append("text")
                    .attr("x", Math.max(barWidth, 1) + 6)
                    .attr("y", yCenter)
                    .attr("dy", "0.35em")
                    .attr("text-anchor", "start")
                    .attr("class", "bullet-value-label")
                    .attr("font-size", valueFontSize + "px")
                    .attr("fill", this.isHighContrast ? this.colorPalette.foreground.value : valueColor)
                    .text(formatted);
            }

            // Invisible hit rect for tooltip and cross-filtering
            const hitRect = g.append("rect")
                .attr("x", 0)
                .attr("y", yCenter - rowHeight / 2)
                .attr("width", chartWidth)
                .attr("height", rowHeight)
                .attr("fill", "none")
                .style("pointer-events", "all")
                .style("cursor", "pointer");

            const tooltipItems: VisualTooltipDataItem[] = [
                { displayName: "Category", value: row.category },
                { displayName: "Actual", value: this.formatDisplayValue(row.actual, bullet.valueFormat.value.value as string) }
            ];
            if (row.target !== null) {
                tooltipItems.push({ displayName: "Target", value: this.formatDisplayValue(row.target, bullet.valueFormat.value.value as string) });
                const variance = row.actual - row.target;
                tooltipItems.push({ displayName: "Variance", value: this.formatDisplayValue(variance, bullet.valueFormat.value.value as string) });
            }

            const hitNode = hitRect.node() as SVGRectElement;
            const selId = this.rowSelectionIds[idx];
            hitNode.addEventListener("mousemove", (e: MouseEvent) => {
                this.tooltipService.show({
                    coordinates: [e.clientX, e.clientY],
                    isTouchEvent: false,
                    dataItems: tooltipItems,
                    identities: selId ? [selId] : []
                });
            });
            hitNode.addEventListener("mouseleave", () => {
                this.tooltipService.hide({ isTouchEvent: false, immediately: false });
            });
            hitNode.addEventListener("click", (e: MouseEvent) => {
                if (selId) {
                    this.selectionManager.select(selId, e.ctrlKey || e.metaKey);
                }
                e.stopPropagation();
            });
        });

        // Axis ticks below the chart + gridlines
        if (showAxis && rows.length > 0) {
            const tickCount = clamp(axis.tickCount.value, 2, 10);
            const globalMax = Math.max(...rows.map(r => r.maximum));
            const axisScale = scaleLinear().domain([0, globalMax]).range([0, chartWidth]);
            const chartBottom = rows.length * rowHeight;
            const axisY = chartBottom + 4;
            const axisG = svg.append("g")
                .attr("class", "bullet-axis")
                .attr("transform", `translate(${xOffset + labelWidth}, 0)`);

            // Axis line
            axisG.append("line")
                .attr("x1", 0).attr("y1", axisY)
                .attr("x2", chartWidth).attr("y2", axisY)
                .attr("stroke", axisColor).attr("stroke-width", 1);

            for (let i = 0; i <= tickCount; i++) {
                const val = (globalMax / tickCount) * i;
                const x = axisScale(val);

                // Gridline (skip first — that's the left edge)
                if (showGridlines && i > 0) {
                    axisG.append("line")
                        .attr("x1", x).attr("y1", 0)
                        .attr("x2", x).attr("y2", chartBottom)
                        .attr("stroke", gridlineColor)
                        .attr("stroke-width", gridlineWidth)
                        .attr("stroke-dasharray", "3,3")
                        .attr("opacity", 0.6);
                }

                // Tick mark
                axisG.append("line")
                    .attr("x1", x).attr("y1", axisY)
                    .attr("x2", x).attr("y2", axisY + 4)
                    .attr("stroke", axisColor).attr("stroke-width", 1);

                // Tick label
                const formatted = this.formatDisplayValue(val, bullet.valueFormat.value.value as string);
                axisG.append("text")
                    .attr("x", x)
                    .attr("y", axisY + 6)
                    .attr("dy", "0.7em")
                    .attr("text-anchor", "middle")
                    .attr("class", "bullet-axis-label")
                    .attr("font-size", axisFontSize + "px")
                    .attr("fill", axisColor)
                    .text(formatted);
            }

            // Axis title label
            if (axisLabelText) {
                axisG.append("text")
                    .attr("x", chartWidth / 2)
                    .attr("y", axisY + axisFontSize + 14)
                    .attr("dy", "0.7em")
                    .attr("text-anchor", "middle")
                    .attr("class", "bullet-axis-title")
                    .attr("font-size", axisLabelFontSize + "px")
                    .attr("font-weight", "600")
                    .attr("fill", axisColor)
                    .text(axisLabelText);
            }
        }

        // Axis titles (horizontal mode: X = value axis below, Y = category axis left)
        const showAxisTitles = axis.showAxisTitles.value;
        const xAxisTitleText = axis.xAxisTitle.value || "";
        const yAxisTitleText = axis.yAxisTitle.value || "";
        if (showAxisTitles) {
            const axisTitleFontSize = axisFontSize + 2;
            const titleColor = this.isHighContrast ? this.colorPalette.foreground.value : axisColor;
            const svgEl = svg;
            if (xAxisTitleText) {
                const titleY = Math.min(totalHeight, viewportHeight) - 4;
                svgEl.append("text")
                    .attr("x", xOffset + labelWidth + chartWidth / 2)
                    .attr("y", titleY)
                    .attr("text-anchor", "middle")
                    .attr("class", "axis-title x-axis-title")
                    .attr("font-size", axisTitleFontSize + "px")
                    .attr("font-weight", "600")
                    .attr("fill", titleColor)
                    .attr("font-family", "Segoe UI, Tahoma, Geneva, Verdana, sans-serif")
                    .text(xAxisTitleText);
            }
            if (yAxisTitleText) {
                const chartMidY = (rows.length * rowHeight) / 2;
                svgEl.append("text")
                    .attr("x", -chartMidY)
                    .attr("y", xOffset + 12)
                    .attr("text-anchor", "middle")
                    .attr("transform", "rotate(-90)")
                    .attr("class", "axis-title y-axis-title")
                    .attr("font-size", axisTitleFontSize + "px")
                    .attr("font-weight", "600")
                    .attr("fill", titleColor)
                    .attr("font-family", "Segoe UI, Tahoma, Geneva, Verdana, sans-serif")
                    .text(yAxisTitleText);
            }
        }
    }

    private renderVertical(
        rows: BulletRow[],
        options: VisualUpdateOptions,
        bullet: VisualFormattingSettingsModel["bulletSettings"],
        ranges: VisualFormattingSettingsModel["qualitativeRanges"],
        bgBar: VisualFormattingSettingsModel["backgroundBar"],
        labels: VisualFormattingSettingsModel["labelSettings"],
        axis: VisualFormattingSettingsModel["axisSettings"]
    ): void {
        const viewportWidth = options.viewport.width;
        const viewportHeight = options.viewport.height;
        const showLabels = labels.show.value;
        const labelFontSize = clamp(labels.fontSize.value, 8, 24);
        const showValue = bullet.showValue.value;
        const valueColor = bullet.valueColor.value.value;
        const valueFontSize = bullet.valueFontSize.value > 0
            ? clamp(bullet.valueFontSize.value, 6, 30)
            : labelFontSize - 1;
        const barWidth = clamp(bullet.barHeight.value, 6, 60);

        const showAxis = axis.show.value;
        const axisFontSize = clamp(axis.fontSize.value, 6, 18);
        const axisColor = this.isHighContrast ? this.colorPalette.foreground.value : axis.color.value.value;
        const axisLabelText = axis.axisLabel.value || "";
        const axisLabelFontSize = clamp(axis.labelFontSize.value, 6, 24);
        const showGridlines = axis.gridlines.value;
        const gridlineColor = this.isHighContrast ? this.colorPalette.foreground.value : axis.gridlineColor.value.value;
        const gridlineWidth = clamp(axis.gridlineWidth.value, 1, 4);
        const axisAreaWidth = showAxis ? axisFontSize * 4 + 8 + (axisLabelText ? axisLabelFontSize + 4 : 0) : 0;

        const labelAreaHeight = showLabels ? labelFontSize + 12 : 0;
        const valueAreaHeight = showValue ? valueFontSize + 8 : 0;
        const chartHeight = Math.max(viewportHeight - labelAreaHeight - valueAreaHeight - 8, 40);
        const colWidth = clamp(bullet.rowHeight.value, 20, 100);
        const totalWidth = rows.length * colWidth + axisAreaWidth;

        // Centre horizontally when content is narrower than viewport
        const xOffset = totalWidth < viewportWidth ? (viewportWidth - totalWidth) / 2 + axisAreaWidth : axisAreaWidth;

        const svg = select(this.svgContainer)
            .append("svg")
            .attr("width", Math.max(totalWidth, viewportWidth))
            .attr("height", viewportHeight)
            .attr("class", "bullet-svg");

        if (totalWidth > viewportWidth) {
            this.svgContainer.style.overflowX = "auto";
            svg.attr("width", totalWidth);
        } else {
            this.svgContainer.style.overflowX = "hidden";
        }

        rows.forEach((row, idx) => {
            const xCenter = xOffset + idx * colWidth + colWidth / 2;
            const xLeft = xCenter - barWidth / 2;
            const rangeWidth = barWidth * 1.6;
            const rangeLeft = xCenter - rangeWidth / 2;

            const yScale = scaleLinear()
                .domain([0, row.maximum])
                .range([chartHeight + valueAreaHeight, valueAreaHeight])
                .clamp(true);

            const g = svg.append("g")
                .attr("class", "bullet-row-vert");

            // Qualitative range bands
            if (ranges.enabled.value) {
                const poorPct = clamp(ranges.poorThreshold.value, 0, 100) / 100;
                const acceptPct = clamp(ranges.acceptableThreshold.value, 0, 100) / 100;

                const hcRangeFill = this.isHighContrast ? this.colorPalette.foreground.value : null;

                // Poor band (bottom)
                g.append("rect")
                    .attr("x", rangeLeft)
                    .attr("y", yScale(row.maximum * poorPct))
                    .attr("width", rangeWidth)
                    .attr("height", yScale(0) - yScale(row.maximum * poorPct))
                    .attr("fill", hcRangeFill || ranges.poorColor.value.value)
                    .attr("opacity", this.isHighContrast ? 0.2 : 1)
                    .attr("rx", 2);

                // Acceptable band (middle)
                g.append("rect")
                    .attr("x", rangeLeft)
                    .attr("y", yScale(row.maximum * acceptPct))
                    .attr("width", rangeWidth)
                    .attr("height", yScale(row.maximum * poorPct) - yScale(row.maximum * acceptPct))
                    .attr("fill", hcRangeFill || ranges.acceptableColor.value.value)
                    .attr("opacity", this.isHighContrast ? 0.4 : 1);

                // Good band (top)
                g.append("rect")
                    .attr("x", rangeLeft)
                    .attr("y", yScale(row.maximum))
                    .attr("width", rangeWidth)
                    .attr("height", yScale(row.maximum * acceptPct) - yScale(row.maximum))
                    .attr("fill", hcRangeFill || ranges.goodColor.value.value)
                    .attr("opacity", this.isHighContrast ? 0.6 : 1)
                    .attr("rx", 2);
            } else {
                // Always render the rect — transparency is expressed via
                // alpha, never by omitting the element (D-05) — with the
                // D-06 old-report migration read (see
                // resolveBackgroundBarTransparency).
                const bgBarTransparencyPct = this.resolveBackgroundBarTransparency(bgBar);
                g.append("rect")
                    .attr("x", rangeLeft)
                    .attr("y", yScale(row.maximum))
                    .attr("width", rangeWidth)
                    .attr("height", chartHeight)
                    .attr("fill", this.isHighContrast
                        ? this.colorPalette.background.value
                        : toRgba(bgBar.color.value.value ?? "#f0eee6", bgBarTransparencyPct))
                    .attr("rx", 2);
            }

            // Actual value bar
            const barTopY = yScale(row.actual);
            const barHeightPx = yScale(0) - barTopY;
            g.append("rect")
                .attr("x", xLeft)
                .attr("y", barTopY)
                .attr("width", barWidth)
                .attr("height", Math.max(barHeightPx, 1))
                .attr("fill", this.isHighContrast ? this.colorPalette.foreground.value : this.getBarColor(bullet, row.originalIndex))
                .attr("rx", barWidth / 4);

            // Target marker line
            if (row.target !== null) {
                const targetY = yScale(row.target);
                const markerWidth = rangeWidth + 4;
                const markerLeft = xCenter - markerWidth / 2;

                g.append("rect")
                    .attr("x", markerLeft)
                    .attr("y", targetY - bullet.targetWidth.value / 2)
                    .attr("width", markerWidth)
                    .attr("height", bullet.targetWidth.value)
                    .attr("fill", this.isHighContrast
                        ? (this.colorPalette.foregroundSelected?.value || this.colorPalette.foreground.value)
                        : bullet.targetColor.value.value)
                    .attr("rx", 1);
            }

            // Category label (bottom)
            if (showLabels) {
                svg.append("text")
                    .attr("x", xCenter)
                    .attr("y", viewportHeight - 4)
                    .attr("text-anchor", "middle")
                    .attr("class", "bullet-label")
                    .attr("font-size", labelFontSize + "px")
                    .attr("font-weight", "600")
                    .attr("fill", this.isHighContrast ? this.colorPalette.foreground.value : labels.color.value.value)
                    .text(row.category);
            }

            // Value label (top)
            if (showValue) {
                const formatted = this.formatDisplayValue(row.actual, bullet.valueFormat.value.value as string);
                g.append("text")
                    .attr("x", xCenter)
                    .attr("y", Math.max(barTopY - 4, valueFontSize))
                    .attr("text-anchor", "middle")
                    .attr("class", "bullet-value-label")
                    .attr("font-size", valueFontSize + "px")
                    .attr("fill", this.isHighContrast ? this.colorPalette.foreground.value : valueColor)
                    .text(formatted);
            }

            // Invisible hit rect for tooltip and cross-filtering
            const hitRectV = g.append("rect")
                .attr("x", rangeLeft - 2)
                .attr("y", yScale(row.maximum))
                .attr("width", rangeWidth + 4)
                .attr("height", chartHeight)
                .attr("fill", "none")
                .style("pointer-events", "all")
                .style("cursor", "pointer");

            const tooltipItemsV: VisualTooltipDataItem[] = [
                { displayName: "Category", value: row.category },
                { displayName: "Actual", value: this.formatDisplayValue(row.actual, bullet.valueFormat.value.value as string) }
            ];
            if (row.target !== null) {
                tooltipItemsV.push({ displayName: "Target", value: this.formatDisplayValue(row.target, bullet.valueFormat.value.value as string) });
                const varianceV = row.actual - row.target;
                tooltipItemsV.push({ displayName: "Variance", value: this.formatDisplayValue(varianceV, bullet.valueFormat.value.value as string) });
            }

            const hitNodeV = hitRectV.node() as SVGRectElement;
            const selIdV = this.rowSelectionIds[idx];
            hitNodeV.addEventListener("mousemove", (e: MouseEvent) => {
                this.tooltipService.show({
                    coordinates: [e.clientX, e.clientY],
                    isTouchEvent: false,
                    dataItems: tooltipItemsV,
                    identities: selIdV ? [selIdV] : []
                });
            });
            hitNodeV.addEventListener("mouseleave", () => {
                this.tooltipService.hide({ isTouchEvent: false, immediately: false });
            });
            hitNodeV.addEventListener("click", (e: MouseEvent) => {
                if (selIdV) {
                    this.selectionManager.select(selIdV, e.ctrlKey || e.metaKey);
                }
                e.stopPropagation();
            });
        });

        // Axis ticks on the left side + gridlines
        if (showAxis && rows.length > 0) {
            const tickCount = clamp(axis.tickCount.value, 2, 10);
            const globalMax = Math.max(...rows.map(r => r.maximum));
            const yScale = scaleLinear()
                .domain([0, globalMax])
                .range([chartHeight + valueAreaHeight, valueAreaHeight]);
            const axisX = xOffset - 4;
            const chartRight = xOffset + rows.length * colWidth;
            const axisG = svg.append("g").attr("class", "bullet-axis");

            // Axis line
            axisG.append("line")
                .attr("x1", axisX).attr("y1", yScale(0))
                .attr("x2", axisX).attr("y2", yScale(globalMax))
                .attr("stroke", axisColor).attr("stroke-width", 1);

            for (let i = 0; i <= tickCount; i++) {
                const val = (globalMax / tickCount) * i;
                const y = yScale(val);

                // Gridline (skip bottom — that's the baseline)
                if (showGridlines && i > 0) {
                    axisG.append("line")
                        .attr("x1", axisX).attr("y1", y)
                        .attr("x2", chartRight).attr("y2", y)
                        .attr("stroke", gridlineColor)
                        .attr("stroke-width", gridlineWidth)
                        .attr("stroke-dasharray", "3,3")
                        .attr("opacity", 0.6);
                }

                // Tick mark
                axisG.append("line")
                    .attr("x1", axisX - 4).attr("y1", y)
                    .attr("x2", axisX).attr("y2", y)
                    .attr("stroke", axisColor).attr("stroke-width", 1);

                // Tick label
                const formatted = this.formatDisplayValue(val, bullet.valueFormat.value.value as string);
                axisG.append("text")
                    .attr("x", axisX - 6)
                    .attr("y", y)
                    .attr("dy", "0.35em")
                    .attr("text-anchor", "end")
                    .attr("class", "bullet-axis-label")
                    .attr("font-size", axisFontSize + "px")
                    .attr("fill", axisColor)
                    .text(formatted);
            }

            // Axis title label (rotated, left side)
            if (axisLabelText) {
                const midY = (yScale(0) + yScale(globalMax)) / 2;
                axisG.append("text")
                    .attr("x", -midY)
                    .attr("y", axisX - axisFontSize * 4 - 10)
                    .attr("text-anchor", "middle")
                    .attr("transform", "rotate(-90)")
                    .attr("class", "bullet-axis-title")
                    .attr("font-size", axisLabelFontSize + "px")
                    .attr("font-weight", "600")
                    .attr("fill", axisColor)
                    .text(axisLabelText);
            }
        }

        // Axis titles (vertical mode: X = category axis bottom, Y = value axis left)
        const showAxisTitles = axis.showAxisTitles.value;
        const xAxisTitleText = axis.xAxisTitle.value || "";
        const yAxisTitleText = axis.yAxisTitle.value || "";
        if (showAxisTitles) {
            const axisTitleFontSize = axisFontSize + 2;
            const titleColor = this.isHighContrast ? this.colorPalette.foreground.value : axisColor;
            const svgEl = svg;
            if (xAxisTitleText) {
                svgEl.append("text")
                    .attr("x", xOffset + rows.length * colWidth / 2)
                    .attr("y", viewportHeight - 4)
                    .attr("text-anchor", "middle")
                    .attr("class", "axis-title x-axis-title")
                    .attr("font-size", axisTitleFontSize + "px")
                    .attr("font-weight", "600")
                    .attr("fill", titleColor)
                    .attr("font-family", "Segoe UI, Tahoma, Geneva, Verdana, sans-serif")
                    .text(xAxisTitleText);
            }
            if (yAxisTitleText) {
                const midY = (valueAreaHeight + chartHeight + valueAreaHeight) / 2;
                svgEl.append("text")
                    .attr("x", -midY)
                    .attr("y", 12)
                    .attr("text-anchor", "middle")
                    .attr("transform", "rotate(-90)")
                    .attr("class", "axis-title y-axis-title")
                    .attr("font-size", axisTitleFontSize + "px")
                    .attr("font-weight", "600")
                    .attr("fill", titleColor)
                    .attr("font-family", "Segoe UI, Tahoma, Geneva, Verdana, sans-serif")
                    .text(yAxisTitleText);
            }
        }
    }

    private renderEmpty(): void {
        while (this.svgContainer.firstChild) {
            this.svgContainer.removeChild(this.svgContainer.firstChild);
        }
        const empty = document.createElement("div");
        empty.className = "bullet-empty";

        const icon = document.createElement("div");
        icon.className = "bullet-empty-icon";
        icon.textContent = "\u25A0";

        const text = document.createElement("div");
        text.className = "bullet-empty-text";
        text.appendChild(document.createTextNode(this.localizationManager.getDisplayName("Empty_DropMeasure")));
        const strong = document.createElement("strong");
        strong.textContent = this.localizationManager.getDisplayName("Empty_Actual");
        text.appendChild(strong);
        text.appendChild(document.createTextNode(this.localizationManager.getDisplayName("Empty_ToRender")));

        empty.appendChild(icon);
        empty.appendChild(text);
        this.svgContainer.appendChild(empty);
    }

    private formatDisplayValue(value: number, format: string): string {
        if (format === "percent") {
            return (value * 100).toFixed(1) + "%";
        }
        if (format === "currency") {
            return "$" + formatValue(value, "auto", 1);
        }
        return formatValue(value, "auto", 1);
    }

    /** Get bar colour — per-row Bar Colour fx resolution (TRANS-04): reads
     *  the rule-evaluated fill (if a rule is set) via the official
     *  ColorHelper.getColorForMeasure path against this row's own
     *  per-instance object overrides, falling back to the static
     *  format-pane value otherwise. */
    private getBarColor(bullet: VisualFormattingSettingsModel["bulletSettings"], originalIndex: number): string {
        const defaultColor = bullet.barColor.value.value;
        const instanceObjects = this.categoricalCategories?.objects?.[originalIndex];
        return this.barColorHelper?.getColorForMeasure(instanceObjects, "barColor") ?? defaultColor;
    }

    /** Resolve the background-bar transparency percentage, honouring the
     *  D-06 old-report migration path: this visual's ONLY pre-existing
     *  transparency control was the (now-retired) `transparent` boolean
     *  ToggleSwitch. If the new `transparency` slider is still at its
     *  untouched default (0) AND the old boolean is `true` on the saved
     *  report, map to full transparency (100) so the old report keeps
     *  rendering as fully transparent. Otherwise the new slider value
     *  drives — the slider always wins once a user has actually set it. */
    private resolveBackgroundBarTransparency(bgBar: VisualFormattingSettingsModel["backgroundBar"]): number {
        const sliderValue = bgBar.transparency.value ?? 0;
        if (sliderValue === 0 && bgBar.transparent.value === true) {
            return 100;
        }
        return sliderValue;
    }

    public destroy(): void {
        while (this.svgContainer.firstChild) {
            this.svgContainer.removeChild(this.svgContainer.firstChild);
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
