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
import { select, Selection } from "d3-selection";
import { dataViewWildcard } from "powerbi-visuals-utils-dataviewutils";
import { ColorHelper } from "powerbi-visuals-utils-colorutils";

import { VisualFormattingSettingsModel, textAlignFor } from "./settings";
import { CODEX_TOKENS, formatValue, clamp } from "./utils";
import { toRgba } from "./shared/colorHelpers";
import { applyBorder } from "./shared/borderSettings";
import { Band, Theme, band, bandColor, targetToken, accentToken } from "./shared/bandEngine";
import { surfaceTokens, TABULAR_NUMS, mix } from "./shared/designTokens";
import { makeCornerBrackets, CardSignatureHandle, CardSignatureVariant } from "./shared/cardSignature";
import { settle } from "./shared/motion";
import { applyHighContrast, statusGlyph, HighContrastResolved } from "./shared/highContrast";

import "./../style/visual.less";

// ─── v2 board look (01-17): D-16 default sentinels ───────────
// The v2 defaults ship the redesigned look ONLY while the corresponding
// property is still at its original shipped default — any user-set value
// (or fx rule) resolves exactly as before. These are the original
// shipped defaults, used as "untouched" sentinels.
const BAR_COLOR_DEFAULT = "#130064";
const TARGET_COLOR_DEFAULT = "#e60e22";
const RANGE_POOR_DEFAULT = "#fde8ea";
const RANGE_ACCEPT_DEFAULT = "#fef3d6";
const RANGE_GOOD_DEFAULT = "#e0f5ef";
// Text-surface shipped defaults (D-16 sentinels): designed for light
// surfaces. When untouched AND the theme resolves dark, render swaps to
// the theme text token so default text stays readable on dark
// backgrounds. Light theme stays pixel-identical.
const LABEL_COLOR_DEFAULT = "#333333";
const VALUE_COLOR_DEFAULT = "#5e5d5a";
const AXIS_COLOR_DEFAULT = "#888888";
const TITLE_COLOR_DEFAULT = "#1a1a2e";

/** Dim-step opacity for qualitative range zones (board: zones "always
 *  sit at 14% opacity so they never compete" with the measure). */
const ZONE_DIM_OPACITY = 0.14;

/** Luminance-based theme pick — same 0.55 threshold convention as the
 *  pbiKpiCard v3 pilot: decides whether the resolved outer background
 *  reads as a "dark" or "light" surface so the v3 token set stays legible. */
function themeFor(hex: string): Theme {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(hex || "");
    if (!m) return "dark";
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.55 ? "light" : "dark";
}

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

    // Conditional formatting (fx) state — Value Color / data-label colour
    // (TEXT-02): resolved once per update(), same shape as barColorHelper.
    private valueColorHelper: ColorHelper | null = null;

    // ─── v2 board look (01-17) state ───────────────────────────
    // Theme + HC resolved once per update(); corner-bracket signature
    // created once (constructor) and re-tinted per render; data signature
    // gates the settle-once motion (§6 — values settle ONCE, never loop).
    private theme: Theme = "dark";
    private hc: HighContrastResolved = applyHighContrast(null);
    private cornerSignature: CardSignatureHandle | null = null;
    private lastDataSignature: string | null = null;
    private shouldSettle: boolean = false;

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

        // v2 card signature (01-17): corner brackets created once, after
        // svgContainer, so they stay the container's LAST children (paint
        // above the chart) — svgContainer's own children are what gets
        // cleared per render, never these siblings. Re-tinted per update().
        this.cornerSignature = makeCornerBrackets(this.container, "#8f8ab8", {
            variant: "cornerBracket",
            mirror: true,
            muted: true,
        });

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

            const titleFmt = this.formattingSettings.titleSettings;
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

            // Visual's own Border card (native host border stays off).
            applyBorder(this.container, this.formattingSettings.visualBorder, {
                hcActive: this.isHighContrast,
                hcColor: this.colorPalette.foreground.value,
            });

            // ─── v2 board look (01-17): theme + the single HC rule ─────
            // Theme keys off the resolved outer background hex (pbiKpiCard
            // pilot convention). When our Background is fully transparent
            // (the shipped default) the visual shows the PAGE, not its own
            // hex — so derive the theme from the report theme's background
            // via the host palette instead of assuming white (2026-07-11:
            // dark report pages resolved "light", leaving default text
            // grey-on-black).
            const themeSourceHex = outerBgTransparencyPct >= 100
                ? (this.colorPalette.background?.value ?? outerBgHex)
                : outerBgHex;
            this.theme = themeFor(themeSourceHex);
            this.hc = applyHighContrast(this.colorPalette, {
                fallbackColor: this.formattingSettings.bulletSettings.barColor.value.value,
            });

            // Corner-accent signature — user-controllable (Corner Accents
            // card): show toggle, style variant, auto (theme accent) vs
            // custom colour. Under HC the system colour always wins.
            const sig = this.formattingSettings.cardSignature;
            if (!sig.show.value) {
                this.cornerSignature?.elements.forEach((el) => { el.style.display = "none"; });
            } else {
                const sigVariant = sig.style.value.value as CardSignatureVariant;
                const bracketColor = this.hc.active
                    ? this.hc.color
                    : (sig.autoColor.value ? accentToken(this.theme) : sig.color.value.value);
                this.cornerSignature?.update(bracketColor, {
                    variant: sigVariant,
                    glowMix: this.hc.active || this.theme === "light" ? 0 : 55,
                    muted: false,
                    cardRadius: clamp(sig.cornerRadius.value, 0, 24),
                });
            }

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
            // No altConstantSelector: the swatch (constant) edit persists
            // CARD-LEVEL so it applies to every row and round-trips into the
            // pane. Binding it to rowSelectionIds[0] (the old shape, copied
            // from the single-row ProgressBarCard) persisted the constant as
            // a per-instance override on the FIRST ROW ONLY.
            bullet.barColor.altConstantSelector = undefined;
            this.barColorHelper = new ColorHelper(
                this.colorPalette,
                { objectName: "bulletSettings", propertyName: "barColor" },
                bullet.barColor.value.value
            );

            // ─── Conditional formatting (fx) wiring — Value Color / the
            // data-label colour shown at the end of each bar (TEXT-02). A
            // bare `instanceKind: ConstantOrRule` declaration in settings.ts
            // does not make the fx button functional on its own — mirrors
            // the barColor wiring above exactly, distinct property, same
            // per-row resolution pattern (categories.objects[originalIndex]).
            bullet.valueColor.selector = dataViewWildcard.createDataViewWildcardSelector(
                dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals
            );
            // Card-level constant persistence — same reasoning as barColor.
            bullet.valueColor.altConstantSelector = undefined;
            this.valueColorHelper = new ColorHelper(
                this.colorPalette,
                { objectName: "bulletSettings", propertyName: "valueColor" },
                bullet.valueColor.value.value
            );

            // v2 motion gate (§6): the measure settles ONCE per data change —
            // a resize/format-pane update re-renders without replaying it.
            const dataSignature = rows
                .map((r) => `${r.category}:${r.actual}:${r.target ?? ""}`)
                .join("|");
            this.shouldSettle = dataSignature !== this.lastDataSignature;
            this.lastDataSignature = dataSignature;

            // Render based on orientation
            const orientation = bullet.orientation.value.value as string;
            if (orientation === "vertical") {
                this.renderVertical(rows, options, bullet, ranges, bgBar, labels, axis, titleFmt);
            } else {
                this.renderHorizontal(rows, options, bullet, ranges, bgBar, labels, axis, titleFmt);
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
        axis: VisualFormattingSettingsModel["axisSettings"],
        titleFmt: VisualFormattingSettingsModel["titleSettings"]
    ): void {
        const viewportWidth = options.viewport.width;
        const viewportHeight = options.viewport.height;
        const rowHeight = clamp(bullet.rowHeight.value, 20, 100);
        const barHeight = clamp(bullet.barHeight.value, 6, rowHeight - 4);
        const showLabels = labels.show.value;
        const labelFontSize = clamp(labels.fontSize.value, 8, 24);
        const labelFontFamily = labels.fontFamily.value || "Segoe UI, Tahoma, Geneva, Verdana, sans-serif";
        const labelWeight = this.weightFor(labels.bold.value, "600");
        const labelStyle = labels.italic.value ? "italic" : "normal";
        const labelDecoration = labels.underline.value ? "underline" : "none";
        const showValue = bullet.showValue.value;
        const valueFontSize = bullet.valueFontSize.value > 0
            ? clamp(bullet.valueFontSize.value, 6, 30)
            : labelFontSize - 1;

        const showAxis = axis.show.value;
        const axisFontSize = clamp(axis.fontSize.value, 6, 18);
        const axisFontFamily = axis.fontFamily.value || "Segoe UI, Tahoma, Geneva, Verdana, sans-serif";
        const axisWeight = this.weightFor(axis.bold.value, "400");
        const axisStyle = axis.italic.value ? "italic" : "normal";
        const axisDecoration = axis.underline.value ? "underline" : "none";

        // ─── Title (iframe-internal, Policy 1180.2.5) — reserves vertical
        // space above the chart, threaded as an explicit titleH parameter
        // (matches pbiVarianceWaterfall/pbiTimeBreakdown precedent). This
        // visual rebuilds its SVG from scratch every render (no persistent
        // title element), so the title text is appended fresh below.
        const showTitle = !!titleFmt.showTitle.value && !!titleFmt.titleText.value;
        const titleFontSize = titleFmt.titleFontSize.value || 14;
        const titleH = showTitle ? titleFontSize + 12 : 0;
        const axisColor = this.textColorFor(axis.color.value.value, AXIS_COLOR_DEFAULT);
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
        const totalHeight = rows.length * rowHeight + axisAreaHeight + titleH;

        // Centre the visual horizontally
        const usedWidth = labelWidth + chartWidth + valueWidth + 8;
        const xOffset = Math.max(0, (viewportWidth - usedWidth) / 2);

        const svg = select(this.svgContainer)
            .append("svg")
            .attr("width", viewportWidth)
            .attr("height", Math.min(totalHeight, viewportHeight))
            .attr("class", "bullet-svg");

        // v2 measure-bar bevel gradients (one def per distinct base colour).
        const defs = svg.append("defs") as unknown as Selection<SVGDefsElement, unknown, null, undefined>;
        const gradCache = new Map<string, string>();

        if (showTitle) {
            const tAlign = textAlignFor(String(titleFmt.titleAlign?.value || "left"));
            const tx = tAlign === "center" ? viewportWidth / 2 : tAlign === "right" ? viewportWidth - 8 : 8;
            const tAnchor = tAlign === "center" ? "middle" : tAlign === "right" ? "end" : "start";
            svg.append("text")
                .attr("x", tx)
                .attr("y", titleFontSize + 4)
                .attr("text-anchor", tAnchor)
                .attr("class", "bullet-title")
                .style("font-family", titleFmt.titleFontFamily.value || "Segoe UI, sans-serif")
                .style("font-size", `${titleFontSize}px`)
                .style("font-weight", this.weightFor(titleFmt.titleBold.value, "400"))
                .style("font-style", titleFmt.titleItalic.value ? "italic" : "normal")
                .style("text-decoration", titleFmt.titleUnderline.value ? "underline" : "none")
                .style("fill", this.textColorFor(titleFmt.titleColor.value.value, TITLE_COLOR_DEFAULT))
                .text(String(titleFmt.titleText.value));
        }

        // Scrollable if needed
        if (totalHeight > viewportHeight) {
            this.svgContainer.style.overflowY = "auto";
            svg.attr("height", totalHeight);
        } else {
            this.svgContainer.style.overflowY = "hidden";
        }

        rows.forEach((row, idx) => {
            const yCenter = titleH + idx * rowHeight + rowHeight / 2;
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

                // v2 (01-17): qualitative ranges render as DIM zone steps —
                // band-token tints at 14% opacity (never competing with the
                // measure, same semantics as the Zone Gauge). User-set zone
                // colours still resolve via the D-16 sentinels; HC keeps its
                // pre-existing foreground opacity ladder.

                // Poor band (0 to poorThreshold)
                g.append("rect")
                    .attr("x", 0)
                    .attr("y", rangeTop)
                    .attr("width", xScale(row.maximum * poorPct))
                    .attr("height", rangeHeight)
                    .attr("fill", hcRangeFill || this.resolveZoneColor(ranges.poorColor.value.value, RANGE_POOR_DEFAULT, "danger"))
                    .attr("opacity", this.isHighContrast ? 0.2 : ZONE_DIM_OPACITY)
                    .attr("rx", 3);

                // Acceptable band (poorThreshold to acceptableThreshold)
                g.append("rect")
                    .attr("x", xScale(row.maximum * poorPct))
                    .attr("y", rangeTop)
                    .attr("width", xScale(row.maximum * acceptPct) - xScale(row.maximum * poorPct))
                    .attr("height", rangeHeight)
                    .attr("fill", hcRangeFill || this.resolveZoneColor(ranges.acceptableColor.value.value, RANGE_ACCEPT_DEFAULT, "warning"))
                    .attr("opacity", this.isHighContrast ? 0.4 : ZONE_DIM_OPACITY);

                // Good band (acceptableThreshold to max)
                g.append("rect")
                    .attr("x", xScale(row.maximum * acceptPct))
                    .attr("y", rangeTop)
                    .attr("width", chartWidth - xScale(row.maximum * acceptPct))
                    .attr("height", rangeHeight)
                    .attr("fill", hcRangeFill || this.resolveZoneColor(ranges.goodColor.value.value, RANGE_GOOD_DEFAULT, "success"))
                    .attr("opacity", this.isHighContrast ? 0.6 : ZONE_DIM_OPACITY)
                    .attr("rx", 3);
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

            // Actual value bar — v2 (01-17): band-engine tint (colour =
            // value vs its own target), beveled gradient + glow on dark,
            // with the optional quantised LED mode (§5, equaliser DNA).
            const { base, measureBand } = this.resolveMeasure(bullet, row);
            const quantised = bullet.quantisedMode?.value ?? false;
            const barWidth = xScale(row.actual);
            if (quantised) {
                const n = clamp(bullet.quantisedBlocks?.value ?? 20, 4, 60);
                const gap = 3;
                const blockW = Math.max((chartWidth - (n - 1) * gap) / n, 1);
                const lit = Math.round(clamp(row.actual / row.maximum, 0, 1) * n);
                const blocksG = g.append("g").attr("class", "bullet-measure-blocks");
                for (let bi = 0; bi < n; bi++) {
                    const block = blocksG.append("rect")
                        .attr("x", bi * (blockW + gap))
                        .attr("y", yTop)
                        .attr("width", blockW)
                        .attr("height", barHeight)
                        .attr("rx", 2);
                    if (bi < lit) {
                        block.attr("fill", this.isHighContrast ? this.colorPalette.foreground.value : base);
                        const blockGlow = this.glowFor(base, 5);
                        if (blockGlow) block.style("filter", blockGlow);
                    } else if (this.isHighContrast) {
                        block.attr("fill", this.colorPalette.background.value)
                            .attr("stroke", this.colorPalette.foreground.value)
                            .attr("stroke-width", 1);
                    } else {
                        block.attr("fill", surfaceTokens(this.theme).track);
                    }
                }
                this.settleMeasure(blocksG.node() as SVGElement, "fade");
            } else {
                const barRect = g.append("rect")
                    .attr("x", 0)
                    .attr("y", yTop)
                    .attr("width", Math.max(barWidth, 1))
                    .attr("height", barHeight)
                    .attr("fill", this.isHighContrast
                        ? this.colorPalette.foreground.value
                        : this.measureFillFor(defs, gradCache, base, false))
                    .attr("rx", barHeight / 4);
                const barGlow = this.glowFor(base, 8);
                if (barGlow) barRect.style("filter", barGlow);
                this.settleMeasure(barRect.node() as SVGElement, "scaleX");
            }

            // Target marker — v2 (01-17): the suite-wide violet target tick
            // (§2 — never a band colour), extending past the zone track,
            // rounded, glowing on dark. User-set colour/width still resolve.
            if (row.target !== null) {
                const targetX = xScale(row.target);
                const markerHeight = rangeHeight + 6;
                const markerTop = yCenter - markerHeight / 2;
                const tickColor = this.resolveTargetColor(bullet);

                const tick = g.append("rect")
                    .attr("x", targetX - bullet.targetWidth.value / 2)
                    .attr("y", markerTop)
                    .attr("width", bullet.targetWidth.value)
                    .attr("height", markerHeight)
                    .attr("fill", tickColor)
                    .attr("rx", 2);
                const tickGlow = this.glowFor(tickColor, 6);
                if (tickGlow) tick.style("filter", tickGlow);
            }

            // Category label
            if (showLabels) {
                svg.append("text")
                    .attr("x", xOffset + labelWidth - 6)
                    .attr("y", yCenter)
                    .attr("dy", "0.35em")
                    .attr("text-anchor", "end")
                    .attr("class", "bullet-label")
                    .attr("font-family", labelFontFamily)
                    .attr("font-size", labelFontSize + "px")
                    .attr("font-weight", labelWeight)
                    .attr("font-style", labelStyle)
                    .attr("text-decoration", labelDecoration)
                    .attr("fill", this.textColorFor(labels.color.value.value, LABEL_COLOR_DEFAULT))
                    .text(row.category);
            }

            // Value label at end of bar — Value Color fx (TEXT-02),
            // resolved per-row via resolveValueColor (mirrors getBarColor).
            if (showValue) {
                const formatted = this.formatDisplayValue(row.actual, bullet.valueFormat.value.value as string);
                // v2: tabular numerals + row weight (board .bval); under HC a
                // band reading is never colour-only — the status glyph rides
                // along (§8).
                const hcGlyph = this.hc.active && measureBand ? statusGlyph(measureBand) + " " : "";
                g.append("text")
                    .attr("x", Math.max(barWidth, 1) + 6)
                    .attr("y", yCenter)
                    .attr("dy", "0.35em")
                    .attr("text-anchor", "start")
                    .attr("class", "bullet-value-label")
                    .attr("font-size", valueFontSize + "px")
                    .attr("font-weight", "700")
                    .style("font-feature-settings", TABULAR_NUMS)
                    .attr("fill", this.isHighContrast ? this.colorPalette.foreground.value : this.resolveValueColor(bullet, row.originalIndex))
                    .text(hcGlyph + formatted);
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
            const chartBottom = titleH + rows.length * rowHeight;
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
                        .attr("x1", x).attr("y1", titleH)
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
                    .attr("font-family", axisFontFamily)
                    .attr("font-size", axisFontSize + "px")
                    .attr("font-weight", axisWeight)
                    .attr("font-style", axisStyle)
                    .attr("text-decoration", axisDecoration)
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
        axis: VisualFormattingSettingsModel["axisSettings"],
        titleFmt: VisualFormattingSettingsModel["titleSettings"]
    ): void {
        const viewportWidth = options.viewport.width;
        const viewportHeight = options.viewport.height;
        const showLabels = labels.show.value;
        const labelFontSize = clamp(labels.fontSize.value, 8, 24);
        const labelFontFamily = labels.fontFamily.value || "Segoe UI, Tahoma, Geneva, Verdana, sans-serif";
        const labelWeight = this.weightFor(labels.bold.value, "600");
        const labelStyle = labels.italic.value ? "italic" : "normal";
        const labelDecoration = labels.underline.value ? "underline" : "none";
        const showValue = bullet.showValue.value;
        const valueFontSize = bullet.valueFontSize.value > 0
            ? clamp(bullet.valueFontSize.value, 6, 30)
            : labelFontSize - 1;
        const barWidth = clamp(bullet.barHeight.value, 6, 60);

        const showAxis = axis.show.value;
        const axisFontSize = clamp(axis.fontSize.value, 6, 18);
        const axisFontFamily = axis.fontFamily.value || "Segoe UI, Tahoma, Geneva, Verdana, sans-serif";
        const axisWeight = this.weightFor(axis.bold.value, "400");
        const axisStyle = axis.italic.value ? "italic" : "normal";
        const axisDecoration = axis.underline.value ? "underline" : "none";
        const axisColor = this.textColorFor(axis.color.value.value, AXIS_COLOR_DEFAULT);
        const axisLabelText = axis.axisLabel.value || "";
        const axisLabelFontSize = clamp(axis.labelFontSize.value, 6, 24);
        const showGridlines = axis.gridlines.value;
        const gridlineColor = this.isHighContrast ? this.colorPalette.foreground.value : axis.gridlineColor.value.value;
        const gridlineWidth = clamp(axis.gridlineWidth.value, 1, 4);
        const axisAreaWidth = showAxis ? axisFontSize * 4 + 8 + (axisLabelText ? axisLabelFontSize + 4 : 0) : 0;

        // ─── Title (iframe-internal, Policy 1180.2.5) — reserves vertical
        // space above the chart (see renderHorizontal for the full note).
        const showTitle = !!titleFmt.showTitle.value && !!titleFmt.titleText.value;
        const titleFontSize = titleFmt.titleFontSize.value || 14;
        const titleH = showTitle ? titleFontSize + 12 : 0;

        const labelAreaHeight = showLabels ? labelFontSize + 12 : 0;
        const valueAreaHeight = showValue ? valueFontSize + 8 : 0;
        const chartHeight = Math.max(viewportHeight - labelAreaHeight - valueAreaHeight - titleH - 8, 40);
        const colWidth = clamp(bullet.rowHeight.value, 20, 100);
        const totalWidth = rows.length * colWidth + axisAreaWidth;

        // Centre horizontally when content is narrower than viewport
        const xOffset = totalWidth < viewportWidth ? (viewportWidth - totalWidth) / 2 + axisAreaWidth : axisAreaWidth;

        const svg = select(this.svgContainer)
            .append("svg")
            .attr("width", Math.max(totalWidth, viewportWidth))
            .attr("height", viewportHeight)
            .attr("class", "bullet-svg");

        // v2 measure-bar bevel gradients (one def per distinct base colour).
        const defs = svg.append("defs") as unknown as Selection<SVGDefsElement, unknown, null, undefined>;
        const gradCache = new Map<string, string>();

        if (totalWidth > viewportWidth) {
            this.svgContainer.style.overflowX = "auto";
            svg.attr("width", totalWidth);
        } else {
            this.svgContainer.style.overflowX = "hidden";
        }

        if (showTitle) {
            const tAlign = textAlignFor(String(titleFmt.titleAlign?.value || "left"));
            const tx = tAlign === "center" ? viewportWidth / 2 : tAlign === "right" ? viewportWidth - 8 : 8;
            const tAnchor = tAlign === "center" ? "middle" : tAlign === "right" ? "end" : "start";
            svg.append("text")
                .attr("x", tx)
                .attr("y", titleFontSize + 4)
                .attr("text-anchor", tAnchor)
                .attr("class", "bullet-title")
                .style("font-family", titleFmt.titleFontFamily.value || "Segoe UI, sans-serif")
                .style("font-size", `${titleFontSize}px`)
                .style("font-weight", this.weightFor(titleFmt.titleBold.value, "400"))
                .style("font-style", titleFmt.titleItalic.value ? "italic" : "normal")
                .style("text-decoration", titleFmt.titleUnderline.value ? "underline" : "none")
                .style("fill", this.textColorFor(titleFmt.titleColor.value.value, TITLE_COLOR_DEFAULT))
                .text(String(titleFmt.titleText.value));
        }

        rows.forEach((row, idx) => {
            const xCenter = xOffset + idx * colWidth + colWidth / 2;
            const xLeft = xCenter - barWidth / 2;
            const rangeWidth = barWidth * 1.6;
            const rangeLeft = xCenter - rangeWidth / 2;

            const yScale = scaleLinear()
                .domain([0, row.maximum])
                .range([chartHeight + valueAreaHeight + titleH, valueAreaHeight + titleH])
                .clamp(true);

            const g = svg.append("g")
                .attr("class", "bullet-row-vert");

            // Qualitative range bands
            if (ranges.enabled.value) {
                const poorPct = clamp(ranges.poorThreshold.value, 0, 100) / 100;
                const acceptPct = clamp(ranges.acceptableThreshold.value, 0, 100) / 100;

                const hcRangeFill = this.isHighContrast ? this.colorPalette.foreground.value : null;

                // v2 (01-17): dim zone steps — see renderHorizontal note.

                // Poor band (bottom)
                g.append("rect")
                    .attr("x", rangeLeft)
                    .attr("y", yScale(row.maximum * poorPct))
                    .attr("width", rangeWidth)
                    .attr("height", yScale(0) - yScale(row.maximum * poorPct))
                    .attr("fill", hcRangeFill || this.resolveZoneColor(ranges.poorColor.value.value, RANGE_POOR_DEFAULT, "danger"))
                    .attr("opacity", this.isHighContrast ? 0.2 : ZONE_DIM_OPACITY)
                    .attr("rx", 3);

                // Acceptable band (middle)
                g.append("rect")
                    .attr("x", rangeLeft)
                    .attr("y", yScale(row.maximum * acceptPct))
                    .attr("width", rangeWidth)
                    .attr("height", yScale(row.maximum * poorPct) - yScale(row.maximum * acceptPct))
                    .attr("fill", hcRangeFill || this.resolveZoneColor(ranges.acceptableColor.value.value, RANGE_ACCEPT_DEFAULT, "warning"))
                    .attr("opacity", this.isHighContrast ? 0.4 : ZONE_DIM_OPACITY);

                // Good band (top)
                g.append("rect")
                    .attr("x", rangeLeft)
                    .attr("y", yScale(row.maximum))
                    .attr("width", rangeWidth)
                    .attr("height", yScale(row.maximum * acceptPct) - yScale(row.maximum))
                    .attr("fill", hcRangeFill || this.resolveZoneColor(ranges.goodColor.value.value, RANGE_GOOD_DEFAULT, "success"))
                    .attr("opacity", this.isHighContrast ? 0.6 : ZONE_DIM_OPACITY)
                    .attr("rx", 3);
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

            // Actual value bar — v2 (01-17): band-engine tint, beveled
            // gradient across the bar width, glow on dark, with the
            // optional quantised LED mode (see renderHorizontal note).
            const { base, measureBand } = this.resolveMeasure(bullet, row);
            const quantised = bullet.quantisedMode?.value ?? false;
            const barTopY = yScale(row.actual);
            const barHeightPx = yScale(0) - barTopY;
            if (quantised) {
                const n = clamp(bullet.quantisedBlocks?.value ?? 20, 4, 60);
                const gap = 3;
                const blockH = Math.max((chartHeight - (n - 1) * gap) / n, 1);
                const lit = Math.round(clamp(row.actual / row.maximum, 0, 1) * n);
                const blocksG = g.append("g").attr("class", "bullet-measure-blocks");
                for (let bi = 0; bi < n; bi++) {
                    const block = blocksG.append("rect")
                        .attr("x", xLeft)
                        .attr("y", yScale(0) - (bi + 1) * blockH - bi * gap)
                        .attr("width", barWidth)
                        .attr("height", blockH)
                        .attr("rx", 2);
                    if (bi < lit) {
                        block.attr("fill", this.isHighContrast ? this.colorPalette.foreground.value : base);
                        const blockGlow = this.glowFor(base, 5);
                        if (blockGlow) block.style("filter", blockGlow);
                    } else if (this.isHighContrast) {
                        block.attr("fill", this.colorPalette.background.value)
                            .attr("stroke", this.colorPalette.foreground.value)
                            .attr("stroke-width", 1);
                    } else {
                        block.attr("fill", surfaceTokens(this.theme).track);
                    }
                }
                this.settleMeasure(blocksG.node() as SVGElement, "fade");
            } else {
                const barRect = g.append("rect")
                    .attr("x", xLeft)
                    .attr("y", barTopY)
                    .attr("width", barWidth)
                    .attr("height", Math.max(barHeightPx, 1))
                    .attr("fill", this.isHighContrast
                        ? this.colorPalette.foreground.value
                        : this.measureFillFor(defs, gradCache, base, true))
                    .attr("rx", barWidth / 4);
                const barGlow = this.glowFor(base, 8);
                if (barGlow) barRect.style("filter", barGlow);
                this.settleMeasure(barRect.node() as SVGElement, "scaleY");
            }

            // Target marker — v2 (01-17): violet target tick (see
            // renderHorizontal note).
            if (row.target !== null) {
                const targetY = yScale(row.target);
                const markerWidth = rangeWidth + 6;
                const markerLeft = xCenter - markerWidth / 2;
                const tickColor = this.resolveTargetColor(bullet);

                const tick = g.append("rect")
                    .attr("x", markerLeft)
                    .attr("y", targetY - bullet.targetWidth.value / 2)
                    .attr("width", markerWidth)
                    .attr("height", bullet.targetWidth.value)
                    .attr("fill", tickColor)
                    .attr("rx", 2);
                const tickGlow = this.glowFor(tickColor, 6);
                if (tickGlow) tick.style("filter", tickGlow);
            }

            // Category label (bottom)
            if (showLabels) {
                svg.append("text")
                    .attr("x", xCenter)
                    .attr("y", viewportHeight - 4)
                    .attr("text-anchor", "middle")
                    .attr("class", "bullet-label")
                    .attr("font-family", labelFontFamily)
                    .attr("font-size", labelFontSize + "px")
                    .attr("font-weight", labelWeight)
                    .attr("font-style", labelStyle)
                    .attr("text-decoration", labelDecoration)
                    .attr("fill", this.textColorFor(labels.color.value.value, LABEL_COLOR_DEFAULT))
                    .text(row.category);
            }

            // Value label (top) — Value Color fx (TEXT-02), resolved
            // per-row via resolveValueColor (mirrors getBarColor).
            if (showValue) {
                const formatted = this.formatDisplayValue(row.actual, bullet.valueFormat.value.value as string);
                // v2: tabular numerals + row weight; HC band reading gets a
                // status glyph (see renderHorizontal note).
                const hcGlyph = this.hc.active && measureBand ? statusGlyph(measureBand) + " " : "";
                g.append("text")
                    .attr("x", xCenter)
                    .attr("y", Math.max(barTopY - 4, titleH + valueFontSize))
                    .attr("text-anchor", "middle")
                    .attr("class", "bullet-value-label")
                    .attr("font-size", valueFontSize + "px")
                    .attr("font-weight", "700")
                    .style("font-feature-settings", TABULAR_NUMS)
                    .attr("fill", this.isHighContrast ? this.colorPalette.foreground.value : this.resolveValueColor(bullet, row.originalIndex))
                    .text(hcGlyph + formatted);
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
                .range([chartHeight + valueAreaHeight + titleH, valueAreaHeight + titleH]);
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
                    .attr("font-family", axisFontFamily)
                    .attr("font-size", axisFontSize + "px")
                    .attr("font-weight", axisWeight)
                    .attr("font-style", axisStyle)
                    .attr("text-decoration", axisDecoration)
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
        // Muted card signature on the landing/empty state (§4) — still
        // honours the Corner Accents show toggle.
        if (this.formattingSettings && !this.formattingSettings.cardSignature.show.value) {
            this.cornerSignature?.elements.forEach((el) => { el.style.display = "none"; });
        } else {
            this.cornerSignature?.update("#8f8ab8", { muted: true });
        }
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

    /** Resolve the data-label (Value Color) fx (TEXT-02): per-row fx
     *  resolution via the official ColorHelper.getColorForMeasure path
     *  against this row's own per-instance object overrides, falling back
     *  to the static format-pane value otherwise. (The Bar Colour fx read
     *  moved into resolveMeasure() with the 01-17 v2 look — same
     *  resolution, now part of the D-16 ladder.) */
    /** D-16 text ladder: HC foreground > user-set colour > (dark theme →
     *  theme text token) > shipped light default. */
    private textColorFor(setValue: string, shippedDefault: string): string {
        if (this.isHighContrast) return this.colorPalette.foreground.value;
        if (setValue !== shippedDefault) return setValue;
        return this.theme === "dark" ? surfaceTokens("dark").text : setValue;
    }

    private resolveValueColor(bullet: VisualFormattingSettingsModel["bulletSettings"], originalIndex: number): string {
        const defaultColor = this.textColorFor(bullet.valueColor.value.value, VALUE_COLOR_DEFAULT);
        const instanceObjects = this.categoricalCategories?.objects?.[originalIndex];
        return this.valueColorHelper?.getColorForMeasure(instanceObjects, "valueColor") ?? defaultColor;
    }

    // ─── v2 board look (01-17) helpers ─────────────────────────

    /** Resolve the measure bar's base colour + the band that drove it.
     *  D-16 ladder: a per-row fx override wins; a user-changed constant
     *  wins; only the untouched shipped default hands over to the shared
     *  band engine (colour = value vs its own target — the board's law,
     *  "a chart of five bullets reads as a RAG column at a glance"). */
    private resolveMeasure(
        bullet: VisualFormattingSettingsModel["bulletSettings"],
        row: BulletRow
    ): { base: string; measureBand: Band | null } {
        const constant = bullet.barColor.value.value;
        const instanceObjects = this.categoricalCategories?.objects?.[row.originalIndex];
        const fxResolved = this.barColorHelper?.getColorForMeasure(instanceObjects, "barColor") ?? constant;
        if (fxResolved !== constant) return { base: fxResolved, measureBand: null };
        if (constant !== BAR_COLOR_DEFAULT) return { base: constant, measureBand: null };
        const measureBand = band(row.actual, row.target ?? NaN);
        return { base: bandColor(measureBand, this.theme), measureBand };
    }

    /** Ensure a <linearGradient> def exists for this base colour /
     *  direction; returns the fill url. Stop formula mirrors the frozen
     *  engine's accentBarGradient() (designTokens — light / base at 45% /
     *  dark via mix()), expressed as SVG stops because a CSS gradient
     *  string cannot fill an SVG rect. `acrossX` runs the bevel across the
     *  bar's width (vertical orientation) instead of its height. */
    private measureFillFor(
        defs: Selection<SVGDefsElement, unknown, null, undefined>,
        cache: Map<string, string>,
        base: string,
        acrossX: boolean
    ): string {
        const key = `${base}|${acrossX ? "x" : "y"}`;
        let id = cache.get(key);
        if (!id) {
            id = `bullet-grad-${base.replace("#", "")}-${acrossX ? "x" : "y"}`;
            const grad = defs.append("linearGradient").attr("id", id);
            if (acrossX) {
                grad.attr("x1", "0").attr("y1", "0").attr("x2", "1").attr("y2", "0");
            } else {
                grad.attr("x1", "0").attr("y1", "0").attr("x2", "0").attr("y2", "1");
            }
            grad.append("stop").attr("offset", "0%").attr("stop-color", mix(base, "#ffffff", 0.55));
            grad.append("stop").attr("offset", "45%").attr("stop-color", base);
            grad.append("stop").attr("offset", "100%").attr("stop-color", mix(base, "#000000", 0.7));
            cache.set(key, id);
        }
        return `url(#${id})`;
    }

    /** Glow filter for the measure/tick — dark theme only, never under HC
     *  (§8 drops all glow). Empty string = no filter applied. */
    private glowFor(base: string, radius: number): string {
        return this.hc.active || this.theme === "light"
            ? ""
            : `drop-shadow(0 0 ${radius}px color-mix(in srgb, ${base} 55%, transparent))`;
    }

    /** Target tick colour — the suite-wide violet target token (§2, never
     *  a band colour) as the new default; a user-set Target Color still
     *  resolves (D-16 sentinel); HC keeps the system-slot mapping. */
    private resolveTargetColor(bullet: VisualFormattingSettingsModel["bulletSettings"]): string {
        if (this.hc.active) {
            return this.colorPalette.foregroundSelected?.value || this.hc.color;
        }
        const constant = bullet.targetColor.value.value;
        return constant !== TARGET_COLOR_DEFAULT ? constant : targetToken(this.theme);
    }

    /** Qualitative zone colour — band tokens as the new defaults (dim
     *  steps, same semantics as the Zone Gauge); user-set colours still
     *  resolve (D-16 sentinel). */
    private resolveZoneColor(userHex: string, shippedDefault: string, zoneBand: Band): string {
        return userHex !== shippedDefault ? userHex : bandColor(zoneBand, this.theme);
    }

    /** Settle-once motion (§6) on the measure — scale-in for the solid
     *  bar, fade-in for quantised blocks; gated on the data signature so
     *  resizes/format tweaks never replay it. Reduced-motion handled
     *  inside the shared settle() helper. */
    private settleMeasure(node: SVGElement | null, kind: "scaleX" | "scaleY" | "fade"): void {
        if (!this.shouldSettle || !node) return;
        if (kind === "fade") {
            settle(node, [{ opacity: 0.25 }, { opacity: 1 }], { duration: 400 });
            return;
        }
        node.style.setProperty("transform-box", "fill-box");
        node.style.setProperty("transform-origin", kind === "scaleY" ? "bottom" : "left");
        settle(node, [
            { transform: `${kind}(0.55)`, opacity: 0.4 },
            { transform: `${kind}(1)`, opacity: 1 },
        ], { duration: 400 });
    }

    /** weightFor(bold, restWeight) idiom (TEXT-01, D-06) — bold on renders
     *  700; bold off renders the surface's own pre-existing hardcoded
     *  weight (or "400"/unset if none existed) — matches the
     *  pbiVarianceWaterfall/pbiNowVsThen/pbiKpiSparklineCard precedent. */
    private weightFor(bold: boolean | undefined, restWeight: string): string {
        return bold ? "700" : restWeight;
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
        this.cornerSignature?.destroy();
        this.cornerSignature = null;
        while (this.svgContainer.firstChild) {
            this.svgContainer.removeChild(this.svgContainer.firstChild);
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
