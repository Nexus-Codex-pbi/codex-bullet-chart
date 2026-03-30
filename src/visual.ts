"use strict";

import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ITooltipService = powerbi.extensibility.ITooltipService;
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;
import ILocalizationManager = powerbi.extensibility.ILocalizationManager;
import DataView = powerbi.DataView;

import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { scaleLinear } from "d3-scale";
import { select } from "d3-selection";

import { VisualFormattingSettingsModel } from "./settings";
import { CODEX_TOKENS, formatValue, clamp } from "./utils";

import "./../style/visual.less";

interface BulletRow {
    category: string;
    actual: number;
    target: number | null;
    maximum: number;
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
            const labels = this.formattingSettings.labelSettings;

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

            for (let i = 0; i < values.length; i++) {
                const roles = values[i].source.roles;
                if (roles["actual"]) actualCol = values[i];
                if (roles["target"]) targetCol = values[i];
                if (roles["maximum"]) maximumCol = values[i];
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
                    maximum: computedMax
                });
            }

            if (rows.length === 0) {
                this.renderEmpty();
                this.eventService.renderingFinished(options);
                return;
            }

            // Render based on orientation
            const orientation = bullet.orientation.value.value as string;
            if (orientation === "vertical") {
                this.renderVertical(rows, options, bullet, ranges, labels);
            } else {
                this.renderHorizontal(rows, options, bullet, ranges, labels);
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
        labels: VisualFormattingSettingsModel["labelSettings"]
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

        // Calculate label width — use 0.65em average char width + generous padding
        const labelWidth = showLabels
            ? Math.min(
                Math.max(...rows.map(r => r.category.length)) * (labelFontSize * 0.65) + 16,
                viewportWidth * 0.4
            )
            : 0;

        const valueWidth = showValue ? 70 : 0;
        const chartWidth = Math.max(viewportWidth - labelWidth - valueWidth - 8, 40);
        const totalHeight = rows.length * rowHeight;

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

                // Poor band (0 to poorThreshold)
                g.append("rect")
                    .attr("x", 0)
                    .attr("y", rangeTop)
                    .attr("width", xScale(row.maximum * poorPct))
                    .attr("height", rangeHeight)
                    .attr("fill", ranges.poorColor.value.value)
                    .attr("rx", 2);

                // Acceptable band (poorThreshold to acceptableThreshold)
                g.append("rect")
                    .attr("x", xScale(row.maximum * poorPct))
                    .attr("y", rangeTop)
                    .attr("width", xScale(row.maximum * acceptPct) - xScale(row.maximum * poorPct))
                    .attr("height", rangeHeight)
                    .attr("fill", ranges.acceptableColor.value.value);

                // Good band (acceptableThreshold to max)
                g.append("rect")
                    .attr("x", xScale(row.maximum * acceptPct))
                    .attr("y", rangeTop)
                    .attr("width", chartWidth - xScale(row.maximum * acceptPct))
                    .attr("height", rangeHeight)
                    .attr("fill", ranges.goodColor.value.value)
                    .attr("rx", 2);
            } else {
                // Neutral background when ranges disabled
                g.append("rect")
                    .attr("x", 0)
                    .attr("y", rangeTop)
                    .attr("width", chartWidth)
                    .attr("height", rangeHeight)
                    .attr("fill", CODEX_TOKENS.neutralBg)
                    .attr("rx", 2);
            }

            // Actual value bar
            const barWidth = xScale(row.actual);
            g.append("rect")
                .attr("x", 0)
                .attr("y", yTop)
                .attr("width", Math.max(barWidth, 1))
                .attr("height", barHeight)
                .attr("fill", bullet.barColor.value.value)
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
                    .attr("fill", bullet.targetColor.value.value)
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
                    .attr("fill", labels.color.value.value)
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
                    .attr("fill", valueColor)
                    .text(formatted);
            }
        });
    }

    private renderVertical(
        rows: BulletRow[],
        options: VisualUpdateOptions,
        bullet: VisualFormattingSettingsModel["bulletSettings"],
        ranges: VisualFormattingSettingsModel["qualitativeRanges"],
        labels: VisualFormattingSettingsModel["labelSettings"]
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

        const labelAreaHeight = showLabels ? labelFontSize + 12 : 0;
        const valueAreaHeight = showValue ? valueFontSize + 8 : 0;
        const chartHeight = Math.max(viewportHeight - labelAreaHeight - valueAreaHeight - 8, 40);
        const colWidth = clamp(bullet.rowHeight.value, 20, 100);
        const totalWidth = rows.length * colWidth;

        // Centre horizontally when content is narrower than viewport
        const xOffset = totalWidth < viewportWidth ? (viewportWidth - totalWidth) / 2 : 0;

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

                // Poor band (bottom)
                g.append("rect")
                    .attr("x", rangeLeft)
                    .attr("y", yScale(row.maximum * poorPct))
                    .attr("width", rangeWidth)
                    .attr("height", yScale(0) - yScale(row.maximum * poorPct))
                    .attr("fill", ranges.poorColor.value.value)
                    .attr("rx", 2);

                // Acceptable band (middle)
                g.append("rect")
                    .attr("x", rangeLeft)
                    .attr("y", yScale(row.maximum * acceptPct))
                    .attr("width", rangeWidth)
                    .attr("height", yScale(row.maximum * poorPct) - yScale(row.maximum * acceptPct))
                    .attr("fill", ranges.acceptableColor.value.value);

                // Good band (top)
                g.append("rect")
                    .attr("x", rangeLeft)
                    .attr("y", yScale(row.maximum))
                    .attr("width", rangeWidth)
                    .attr("height", yScale(row.maximum * acceptPct) - yScale(row.maximum))
                    .attr("fill", ranges.goodColor.value.value)
                    .attr("rx", 2);
            } else {
                g.append("rect")
                    .attr("x", rangeLeft)
                    .attr("y", yScale(row.maximum))
                    .attr("width", rangeWidth)
                    .attr("height", chartHeight)
                    .attr("fill", CODEX_TOKENS.neutralBg)
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
                .attr("fill", bullet.barColor.value.value)
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
                    .attr("fill", bullet.targetColor.value.value)
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
                    .attr("fill", labels.color.value.value)
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
                    .attr("fill", valueColor)
                    .text(formatted);
            }
        });
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
        text.appendChild(document.createTextNode("Drop a measure into "));
        const strong = document.createElement("strong");
        strong.textContent = "Actual";
        text.appendChild(strong);
        text.appendChild(document.createTextNode(" to render bullets"));

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

    public destroy(): void {
        while (this.svgContainer.firstChild) {
            this.svgContainer.removeChild(this.svgContainer.firstChild);
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
