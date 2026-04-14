import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import "./../style/visual.less";
export declare class Visual implements IVisual {
    private target;
    private host;
    private eventService;
    private formattingSettings;
    private formattingSettingsService;
    private selectionManager;
    private tooltipService;
    private colorPalette;
    private localizationManager;
    private isHighContrast;
    private container;
    private svgContainer;
    private rowSelectionIds;
    constructor(options: VisualConstructorOptions);
    update(options: VisualUpdateOptions): void;
    private renderHorizontal;
    private renderVertical;
    private renderEmpty;
    private formatDisplayValue;
    destroy(): void;
    getFormattingModel(): powerbi.visuals.FormattingModel;
}
