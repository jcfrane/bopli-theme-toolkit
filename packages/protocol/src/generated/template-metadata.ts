/* Generated from the protocol-v1 JSON Schema. Do not edit by hand. */

export type TemplateField = {
    [k: string]: unknown;
} & {
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
        | 'relationship'
        | 'list';
    required?: boolean;
    helpText?: string;
    /**
     * @minItems 1
     * @maxItems 50
     */
    options?: [string, ...string[]];
    minItems?: number;
    maxItems?: number;
    fields?: TemplateFields;
};

export interface TemplateMetadata {
    name?: string;
    kind?: 'page' | 'entry' | 'blog_index' | 'blog_post';
    default?: boolean;
    fields?: TemplateFields;
}
export interface TemplateFields {
    [k: string]: TemplateField;
}
