export type FieldOptions = {
    label?: string;
    helpText?: string;
    required?: boolean;
};

export type SelectFieldOptions<TOption extends string> = FieldOptions & {
    options: readonly TOption[];
};

export type ListFieldOptions = FieldOptions & {
    minItems?: number;
    maxItems?: number;
};

export type ScalarFieldType =
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

export type ScalarFieldDefinition<TType extends ScalarFieldType = ScalarFieldType> =
    FieldOptions & {
        type: TType;
        options?: readonly string[];
    };

export type ListChildFieldDefinition = ScalarFieldDefinition<
    Exclude<ScalarFieldType, 'rich_text' | 'image' | 'json' | 'relationship' | 'slug'>
>;

export type ListFieldDefinition = FieldOptions & {
    type: 'list';
    fields: Record<string, ListChildFieldDefinition>;
    minItems?: number;
    maxItems?: number;
};

export type PageFieldDefinition =
    | ScalarFieldDefinition<
          Exclude<ScalarFieldType, 'json' | 'relationship' | 'slug'>
      >
    | ListFieldDefinition;

export type EntryFieldDefinition = ScalarFieldDefinition;

export type PageTemplateDefinition = {
    name?: string;
    default?: boolean;
    fields?: Record<string, PageFieldDefinition>;
};

export type EntryTemplateDefinition = {
    name?: string;
    default?: boolean;
    fields: Record<string, EntryFieldDefinition>;
};

export type NativeBlogTemplateDefinition = {
    name?: string;
    default?: boolean;
};

function scalar<TType extends ScalarFieldType>(
    type: TType,
    options: FieldOptions = {},
): ScalarFieldDefinition<TType> {
    return { ...options, type };
}

export const field = {
    text: (options?: FieldOptions) => scalar('short_text', options),
    longText: (options?: FieldOptions) => scalar('long_text', options),
    richText: (options?: FieldOptions) => scalar('rich_text', options),
    number: (options?: FieldOptions) => scalar('number', options),
    boolean: (options?: FieldOptions) => scalar('boolean', options),
    dateTime: (options?: FieldOptions) => scalar('date_time', options),
    select: <TOption extends string>(
        options: SelectFieldOptions<TOption>,
    ): ScalarFieldDefinition<'select'> => ({ ...options, type: 'select' }),
    slug: (options?: FieldOptions) => scalar('slug', options),
    image: (options?: FieldOptions) => scalar('image', options),
    json: (options?: FieldOptions) => scalar('json', options),
    relationship: (options?: FieldOptions) => scalar('relationship', options),
    list: <TFields extends Record<string, ListChildFieldDefinition>>(
        fields: TFields,
        options: ListFieldOptions = {},
    ): ListFieldDefinition => ({ ...options, type: 'list', fields }),
};

export function definePageTemplate<const TDefinition extends PageTemplateDefinition>(
    definition: TDefinition,
): TDefinition {
    return definition;
}

export function defineEntryTemplate<const TDefinition extends EntryTemplateDefinition>(
    definition: TDefinition,
): TDefinition {
    return definition;
}

export function defineBlogIndexTemplate<
    const TDefinition extends NativeBlogTemplateDefinition,
>(definition: TDefinition): TDefinition {
    return definition;
}

export function defineBlogPostTemplate<
    const TDefinition extends NativeBlogTemplateDefinition,
>(definition: TDefinition): TDefinition {
    return definition;
}
