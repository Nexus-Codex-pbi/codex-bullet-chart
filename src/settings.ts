"use strict";

import powerbi from "powerbi-visuals-api";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

import { BackgroundSettings } from "../../_shared/formatting/backgroundSettings";

const ConstantOrRule = powerbi.VisualEnumerationInstanceKinds.ConstantOrRule;

class BulletCardSettings extends FormattingSettingsCard {
    orientation = new formattingSettings.ItemDropdown({
        name: "orientation",
        displayName: "Orientation",
        items: [
            { displayName: "Horizontal", value: "horizontal" },
            { displayName: "Vertical", value: "vertical" }
        ],
        value: { displayName: "Horizontal", value: "horizontal" }
    });

    barColor = new formattingSettings.ColorPicker({
        name: "barColor",
        displayName: "Bar Color",
        value: { value: "#130064" },
        instanceKind: ConstantOrRule
    });

    targetColor = new formattingSettings.ColorPicker({
        name: "targetColor",
        displayName: "Target Color",
        value: { value: "#e60e22" },
        instanceKind: ConstantOrRule
    });

    targetWidth = new formattingSettings.NumUpDown({
        name: "targetWidth",
        displayName: "Target Width (px)",
        description: "Width of the target marker line",
        value: 3
    });

    barHeight = new formattingSettings.NumUpDown({
        name: "barHeight",
        displayName: "Bar Height (px)",
        description: "Height of the actual value bar",
        value: 16
    });

    rowHeight = new formattingSettings.NumUpDown({
        name: "rowHeight",
        displayName: "Row Height (px)",
        description: "Total height per bullet row",
        value: 36
    });

    showValue = new formattingSettings.ToggleSwitch({
        name: "showValue",
        displayName: "Show Value",
        description: "Display numeric value at end of bar",
        value: true
    });

    valueFormat = new formattingSettings.ItemDropdown({
        name: "valueFormat",
        displayName: "Value Format",
        items: [
            { displayName: "Number", value: "number" },
            { displayName: "Percent", value: "percent" },
            { displayName: "Currency", value: "currency" }
        ],
        value: { displayName: "Number", value: "number" }
    });

    valueColor = new formattingSettings.ColorPicker({
        name: "valueColor",
        displayName: "Value Color",
        description: "Color of the value text displayed on/beside bars",
        value: { value: "#5e5d5a" },
        instanceKind: ConstantOrRule
    });

    valueFontSize = new formattingSettings.NumUpDown({
        name: "valueFontSize",
        displayName: "Value Font Size",
        description: "Font size for value labels (0 = match label size)",
        value: 0
    });

    name: string = "bulletSettings";
    displayName: string = "Bullet Settings";
    slices: Array<FormattingSettingsSlice> = [
        this.orientation,
        this.barColor,
        this.targetColor,
        this.targetWidth,
        this.barHeight,
        this.rowHeight,
        this.showValue,
        this.valueFormat,
        this.valueColor,
        this.valueFontSize
    ];
}

class QualitativeRangesSettings extends FormattingSettingsCard {
    enabled = new formattingSettings.ToggleSwitch({
        name: "enabled",
        displayName: "Enable Ranges",
        description: "Show qualitative colour bands behind bars",
        value: true
    });

    poorThreshold = new formattingSettings.NumUpDown({
        name: "poorThreshold",
        displayName: "Poor Threshold (%)",
        description: "Percentage of maximum for poor/acceptable boundary",
        value: 80
    });

    acceptableThreshold = new formattingSettings.NumUpDown({
        name: "acceptableThreshold",
        displayName: "Acceptable Threshold (%)",
        description: "Percentage of maximum for acceptable/good boundary",
        value: 90
    });

    poorColor = new formattingSettings.ColorPicker({
        name: "poorColor",
        displayName: "Poor Color",
        value: { value: "#fde8ea" },
        instanceKind: ConstantOrRule
    });

    acceptableColor = new formattingSettings.ColorPicker({
        name: "acceptableColor",
        displayName: "Acceptable Color",
        value: { value: "#fef3d6" },
        instanceKind: ConstantOrRule
    });

    goodColor = new formattingSettings.ColorPicker({
        name: "goodColor",
        displayName: "Good Color",
        value: { value: "#e0f5ef" },
        instanceKind: ConstantOrRule
    });

    name: string = "qualitativeRanges";
    displayName: string = "Qualitative Ranges";
    slices: Array<FormattingSettingsSlice> = [
        this.enabled,
        this.poorThreshold,
        this.acceptableThreshold,
        this.poorColor,
        this.acceptableColor,
        this.goodColor
    ];
}

class BackgroundBarSettings extends FormattingSettingsCard {
    // D-03/D-06 migration (superseded, not deleted): this was the suite's
    // ONLY pre-existing transparency control, and it shipped as a boolean
    // ToggleSwitch (wrong shape per the suite standard). It stays DECLARED
    // here (GUID-schema-lock — capabilities.json objects/properties can
    // never be removed once shipped) and is still READ at render time
    // (see visual.ts, both background-bar call sites) purely for the
    // old-report migration path: a saved report with `transparent: true`
    // and the new `transparency` slider still at its untouched default (0)
    // is mapped to transparency=100 at render. It is removed from `slices`
    // below so it no longer appears in the format pane — the new
    // `transparency` Slider is the only control a user can touch going
    // forward.
    transparent = new formattingSettings.ToggleSwitch({
        name: "transparent",
        displayName: "Transparent",
        description: "Hide the background bar entirely (matches report background)",
        value: false
    });

    color = new formattingSettings.ColorPicker({
        name: "color",
        displayName: "Color",
        description: "Background bar color when qualitative ranges are disabled",
        value: { value: "#f0eee6" },
        instanceKind: ConstantOrRule
    });

    transparency = new formattingSettings.Slider({
        name: "transparency",
        displayName: "Transparency",
        value: 0,
        options: {
            minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
            maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 100 }
        }
    });

    name: string = "backgroundBar";
    displayName: string = "Background Bar";
    slices: Array<FormattingSettingsSlice> = [
        this.color,
        this.transparency
    ];
}

class LabelCardSettings extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Labels",
        value: true
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Font Size",
        value: 12
    });

    color = new formattingSettings.ColorPicker({
        name: "color",
        displayName: "Label Color",
        value: { value: "#333333" },
        instanceKind: ConstantOrRule
    });

    name: string = "labelSettings";
    displayName: string = "Labels";
    slices: Array<FormattingSettingsSlice> = [
        this.show,
        this.fontSize,
        this.color
    ];
}

class AxisCardSettings extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Axis",
        description: "Display axis tick values along the scale",
        value: false
    });

    tickCount = new formattingSettings.NumUpDown({
        name: "tickCount",
        displayName: "Tick Count",
        description: "Number of axis ticks (2–10)",
        value: 5
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Font Size",
        value: 10
    });

    color = new formattingSettings.ColorPicker({
        name: "color",
        displayName: "Axis Color",
        value: { value: "#888888" },
        instanceKind: ConstantOrRule
    });

    axisLabel = new formattingSettings.TextInput({
        name: "axisLabel",
        displayName: "Axis Label",
        description: "Optional title displayed alongside the axis (e.g. Revenue, Units)",
        placeholder: "",
        value: ""
    });

    labelFontSize = new formattingSettings.NumUpDown({
        name: "labelFontSize",
        displayName: "Label Font Size",
        description: "Font size for the axis title label",
        value: 11
    });

    gridlines = new formattingSettings.ToggleSwitch({
        name: "gridlines",
        displayName: "Gridlines",
        description: "Show gridlines at each tick mark",
        value: false
    });

    gridlineColor = new formattingSettings.ColorPicker({
        name: "gridlineColor",
        displayName: "Gridline Color",
        value: { value: "#e0e0e0" },
        instanceKind: ConstantOrRule
    });

    gridlineWidth = new formattingSettings.NumUpDown({
        name: "gridlineWidth",
        displayName: "Gridline Width",
        description: "Thickness of gridlines in pixels",
        value: 1
    });

    showAxisTitles = new formattingSettings.ToggleSwitch({
        name: "showAxisTitles",
        displayName: "Show Axis Titles",
        description: "Display titles below X axis and beside Y axis",
        value: false
    });

    xAxisTitle = new formattingSettings.TextInput({
        name: "xAxisTitle",
        displayName: "X Axis Title",
        placeholder: "X axis title",
        value: ""
    });

    yAxisTitle = new formattingSettings.TextInput({
        name: "yAxisTitle",
        displayName: "Y Axis Title",
        placeholder: "Y axis title",
        value: ""
    });

    name: string = "axisSettings";
    displayName: string = "Axis";
    slices: Array<FormattingSettingsSlice> = [
        this.show,
        this.tickCount,
        this.fontSize,
        this.color,
        this.axisLabel,
        this.labelFontSize,
        this.gridlines,
        this.gridlineColor,
        this.gridlineWidth,
        this.showAxisTitles,
        this.xAxisTitle,
        this.yAxisTitle
    ];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    bulletSettings = new BulletCardSettings();
    qualitativeRanges = new QualitativeRangesSettings();
    backgroundBar = new BackgroundBarSettings();
    labelSettings = new LabelCardSettings();
    axisSettings = new AxisCardSettings();
    background = new BackgroundSettings();

    constructor() {
        super();
        // D-06 default-preservation override (per-visual instance only —
        // _shared/formatting/backgroundSettings.ts itself is untouched,
        // D-11): pbiBulletChart's PRE-EXISTING default was "no outer
        // background ever painted" — confirmed via direct inspection of
        // style/visual.less: `.bullet-chart-container` (the outer render
        // root appended to options.element) has no background-color rule
        // anywhere. The frozen shared Background card's own default
        // (opaque white, transparency 0) would regress every old saved
        // report to a suddenly-opaque white container. Overriding the
        // TRANSPARENCY default to 100 makes toRgba(...) resolve to alpha 0
        // regardless of colour — pixel-identical to "nothing painted".
        this.background.transparency.value = 100;
    }

    cards = [
        this.bulletSettings,
        this.qualitativeRanges,
        this.backgroundBar,
        this.labelSettings,
        this.axisSettings,
        this.background
    ];
}
