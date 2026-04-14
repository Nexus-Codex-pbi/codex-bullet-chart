import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;
declare class BulletCardSettings extends FormattingSettingsCard {
    orientation: formattingSettings.ItemDropdown;
    barColor: formattingSettings.ColorPicker;
    targetColor: formattingSettings.ColorPicker;
    targetWidth: formattingSettings.NumUpDown;
    barHeight: formattingSettings.NumUpDown;
    rowHeight: formattingSettings.NumUpDown;
    showValue: formattingSettings.ToggleSwitch;
    valueFormat: formattingSettings.ItemDropdown;
    valueColor: formattingSettings.ColorPicker;
    valueFontSize: formattingSettings.NumUpDown;
    name: string;
    displayName: string;
    slices: Array<FormattingSettingsSlice>;
}
declare class QualitativeRangesSettings extends FormattingSettingsCard {
    enabled: formattingSettings.ToggleSwitch;
    poorThreshold: formattingSettings.NumUpDown;
    acceptableThreshold: formattingSettings.NumUpDown;
    poorColor: formattingSettings.ColorPicker;
    acceptableColor: formattingSettings.ColorPicker;
    goodColor: formattingSettings.ColorPicker;
    name: string;
    displayName: string;
    slices: Array<FormattingSettingsSlice>;
}
declare class BackgroundBarSettings extends FormattingSettingsCard {
    transparent: formattingSettings.ToggleSwitch;
    color: formattingSettings.ColorPicker;
    name: string;
    displayName: string;
    slices: Array<FormattingSettingsSlice>;
}
declare class LabelCardSettings extends FormattingSettingsCard {
    show: formattingSettings.ToggleSwitch;
    fontSize: formattingSettings.NumUpDown;
    color: formattingSettings.ColorPicker;
    name: string;
    displayName: string;
    slices: Array<FormattingSettingsSlice>;
}
declare class AxisCardSettings extends FormattingSettingsCard {
    show: formattingSettings.ToggleSwitch;
    tickCount: formattingSettings.NumUpDown;
    fontSize: formattingSettings.NumUpDown;
    color: formattingSettings.ColorPicker;
    axisLabel: formattingSettings.TextInput;
    labelFontSize: formattingSettings.NumUpDown;
    gridlines: formattingSettings.ToggleSwitch;
    gridlineColor: formattingSettings.ColorPicker;
    gridlineWidth: formattingSettings.NumUpDown;
    showAxisTitles: formattingSettings.ToggleSwitch;
    xAxisTitle: formattingSettings.TextInput;
    yAxisTitle: formattingSettings.TextInput;
    name: string;
    displayName: string;
    slices: Array<FormattingSettingsSlice>;
}
export declare class VisualFormattingSettingsModel extends FormattingSettingsModel {
    bulletSettings: BulletCardSettings;
    qualitativeRanges: QualitativeRangesSettings;
    backgroundBar: BackgroundBarSettings;
    labelSettings: LabelCardSettings;
    axisSettings: AxisCardSettings;
    cards: (BulletCardSettings | QualitativeRangesSettings | BackgroundBarSettings | LabelCardSettings | AxisCardSettings)[];
}
export {};
