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

export interface ThemeDescriptor {
    schemaVersion: 1;
    runtimeApiVersion: 1;
    handle: string;
    name: string;
    description: string | null;
    author: string | null;
    version: string;
    bopli: string;
    preview: string | null;
    /**
     * @maxItems 3
     */
    colorModes: ('light' | 'dark')[];
    settings: ThemeSettings;
    templates: {
        [k: string]: Template;
    };
    starter?: StarterRecipe;
    runtime: {
        entry: string;
        ssrEntry: string;
        /**
         * @maxItems 10
         */
        styles: string[];
    };
    /**
     * @minItems 1
     * @maxItems 500
     */
    files: [File, ...File[]];
}
export interface ThemeSettings {
    [k: string]: ThemeSetting;
}
/**
 * This interface was referenced by `ThemeDescriptor`'s JSON-Schema
 * via the `definition` "template".
 */
export interface Template {
    name: string;
    kind: 'page' | 'entry' | 'blog_index' | 'blog_post';
    default: boolean;
    fields?: TemplateFields;
}
export interface TemplateFields {
    [k: string]: TemplateField;
}
export interface TemplateField {
    name: string;
    type:
        | 'short_text'
        | 'long_text'
        | 'rich_text'
        | 'number'
        | 'boolean'
        | 'date_time'
        | 'select'
        | 'slug'
        | 'image'
        | 'json'
        | 'relationship';
    required?: boolean;
}
export interface StarterRecipe {
    version: 1;
    /**
     * @maxItems 50
     */
    contentModels: ContentModel[];
    /**
     * @maxItems 200
     */
    entries: Entry[];
    /**
     * @maxItems 50
     */
    pages: Page[];
    blog?: {
        enabled: boolean;
    };
}
/**
 * This interface was referenced by `StarterRecipe`'s JSON-Schema
 * via the `definition` "contentModel".
 */
export interface ContentModel {
    handle: string;
    name: string;
    singularName: string;
    description?: string | null;
    /**
     * @minItems 1
     * @maxItems 50
     */
    fields: [ContentField, ...ContentField[]];
    publicRoute?: PublicRoute | null;
}
/**
 * This interface was referenced by `StarterRecipe`'s JSON-Schema
 * via the `definition` "contentField".
 */
export interface ContentField {
    key: string;
    label: string;
    type:
        | 'short_text'
        | 'long_text'
        | 'rich_text'
        | 'number'
        | 'boolean'
        | 'date_time'
        | 'select'
        | 'slug'
        | 'image'
        | 'json'
        | 'relationship';
    required?: boolean;
    filterable?: boolean;
    sortable?: boolean;
    helpText?: string;
    configuration?: {
        [k: string]: unknown;
    };
}
/**
 * This interface was referenced by `StarterRecipe`'s JSON-Schema
 * via the `definition` "publicRoute".
 */
export interface PublicRoute {
    template: string;
    path: string;
    fieldMap: {
        [k: string]: string;
    };
    seoDescriptionField?: string | null;
}
/**
 * This interface was referenced by `StarterRecipe`'s JSON-Schema
 * via the `definition` "entry".
 */
export interface Entry {
    model: string;
    title: string;
    slug: string;
    status: 'draft' | 'published';
    data: {
        [k: string]: unknown;
    };
}
/**
 * This interface was referenced by `StarterRecipe`'s JSON-Schema
 * via the `definition` "page".
 */
export interface Page {
    title: string;
    path: string;
    template: string;
    status: 'draft' | 'published';
    data: {
        [k: string]: unknown;
    };
    seoTitle?: string | null;
    seoDescription?: string | null;
}
/**
 * This interface was referenced by `ThemeDescriptor`'s JSON-Schema
 * via the `definition` "file".
 */
export interface File {
    path: string;
    size: number;
    sha256: string;
}
