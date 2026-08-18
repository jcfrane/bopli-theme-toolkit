/* Generated from the protocol-v1 JSON Schema. Do not edit by hand. */

export type ThemeSetting = {
    [k: string]: unknown;
} & {
    name: string;
    type: 'text' | 'boolean' | 'select' | 'color' | 'image';
    description?: string;
    default: unknown;
    /**
     * @minItems 1
     * @maxItems 20
     */
    options?: [string, ...string[]];
};

export interface ThemePackageMetadata {
    handle: string;
    name: string;
    requires: string;
    preview?: string;
    /**
     * @maxItems 3
     */
    colorModes?: ('light' | 'dark')[];
    settings?: ThemeSettings;
}
export interface ThemeSettings {
    [k: string]: ThemeSetting;
}
