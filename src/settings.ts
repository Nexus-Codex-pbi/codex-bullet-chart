"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

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
        value: { value: "#130064" }
    });

    targetColor = new formattingSettings.ColorPicker({
        name: "targetColor",
        displayName: "Target Color",
        value: { value: "#e60e22" }
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
        value: { value: "#5e5d5a" }
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
        value: { value: "#fde8ea" }
    });

    acceptableColor = new formattingSettings.ColorPicker({
        name: "acceptableColor",
        displayName: "Acceptable Color",
        value: { value: "#fef3d6" }
    });

    goodColor = new formattingSettings.ColorPicker({
        name: "goodColor",
        displayName: "Good Color",
        value: { value: "#e0f5ef" }
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
        value: { value: "#333333" }
    });

    name: string = "labelSettings";
    displayName: string = "Labels";
    slices: Array<FormattingSettingsSlice> = [
        this.show,
        this.fontSize,
        this.color
    ];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    bulletSettings = new BulletCardSettings();
    qualitativeRanges = new QualitativeRangesSettings();
    labelSettings = new LabelCardSettings();

    cards = [this.bulletSettings, this.qualitativeRanges, this.labelSettings];
}
