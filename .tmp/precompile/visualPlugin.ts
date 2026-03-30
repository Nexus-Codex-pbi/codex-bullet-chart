import { Visual } from "../../src/visual";
import powerbiVisualsApi from "powerbi-visuals-api";
import IVisualPlugin = powerbiVisualsApi.visuals.plugins.IVisualPlugin;
import VisualConstructorOptions = powerbiVisualsApi.extensibility.visual.VisualConstructorOptions;
import DialogConstructorOptions = powerbiVisualsApi.extensibility.visual.DialogConstructorOptions;
var powerbiKey: any = "powerbi";
var powerbi: any = window[powerbiKey];
var pbiBulletChartA1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6: IVisualPlugin = {
    name: 'pbiBulletChartA1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6',
    displayName: 'Bullet Chart',
    class: 'Visual',
    apiVersion: '5.9.0',
    create: (options?: VisualConstructorOptions) => {
        if (Visual) {
            return new Visual(options);
        }
        throw 'Visual instance not found';
    },
    createModalDialog: (dialogId: string, options: DialogConstructorOptions, initialState: object) => {
        const dialogRegistry = (<any>globalThis).dialogRegistry;
        if (dialogId in dialogRegistry) {
            new dialogRegistry[dialogId](options, initialState);
        }
    },
    custom: true
};
if (typeof powerbi !== "undefined") {
    powerbi.visuals = powerbi.visuals || {};
    powerbi.visuals.plugins = powerbi.visuals.plugins || {};
    powerbi.visuals.plugins["pbiBulletChartA1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6"] = pbiBulletChartA1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6;
}
export default pbiBulletChartA1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6;