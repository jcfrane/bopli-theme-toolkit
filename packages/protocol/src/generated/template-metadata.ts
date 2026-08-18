/* Generated from the protocol-v1 JSON Schema. Do not edit by hand. */

export interface TemplateMetadata {
    name?: string;
    kind?: 'page' | 'entry' | 'blog_index' | 'blog_post';
    default?: boolean;
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
