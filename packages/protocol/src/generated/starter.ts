/* Generated from the protocol-v1 JSON Schema. Do not edit by hand. */

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
