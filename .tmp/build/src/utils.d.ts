/**
 * Shared utilities for OptiStock PBI Custom Visuals
 * Codex Brand tokens + formatting helpers
 */
export declare const CODEX_TOKENS: {
    primary: string;
    accent: string;
    black: string;
    white: string;
    warmGrey: string;
    success: string;
    successBg: string;
    warning: string;
    warningBg: string;
    danger: string;
    dangerBg: string;
    info: string;
    infoBg: string;
    neutral: string;
    neutralBg: string;
    fontFamily: string;
};
/** Clamp a number between min and max */
export declare function clamp(value: number, min: number, max: number): number;
/** Safely convert to number, returning null for NaN/undefined/null */
export declare function safeNumber(v: any): number | null;
/** Format a number with display units (auto/none/thousands/millions/billions) */
export declare function formatValue(value: number, units?: string, decimals?: number): string;
/** Interpolate a colour between two hex colours at position t (0-1) */
export declare function interpolateColor(color1: string, color2: string, t: number): string;
/** Three-stop colour interpolation: low -> mid -> high based on normalised position */
export declare function interpolateThreeColor(lowColor: string, midColor: string, highColor: string, t: number): string;
/** Determine zone colour from thresholds */
export declare function zoneColor(percentage: number, zones: {
    max: number;
    color: string;
}[]): string;
/** Choose readable text colour (dark or light) based on background luminance */
export declare function contrastText(bgHex: string): string;
