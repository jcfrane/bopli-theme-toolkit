import type {
    StarterRecipe as ProtocolStarterRecipe,
    ThemeDescriptor,
    ThemeSetting as ProtocolThemeSetting,
} from '@bopli/theme-protocol';

export type JsonObject = Record<string, unknown>;

export type TemplateKind = ThemeDescriptor['templates'][string]['kind'];

export type ContentFieldType = NonNullable<
    ThemeDescriptor['templates'][string]['fields']
>[string]['type'];

export type TemplateField = {
    name: string;
    type: ContentFieldType;
    required?: boolean;
};

export type ThemeTemplate = {
    name: string;
    kind: TemplateKind;
    default: boolean;
    source: string;
    fields?: Record<string, TemplateField>;
};

export type ThemeSettingType = ProtocolThemeSetting['type'];

export type ThemeSetting = {
    name: string;
    type: ThemeSettingType;
    description?: string;
    default: string | boolean | null;
    options?: string[];
};

export type ThemeTemplates = Record<string, ThemeTemplate>;

export type StarterRecipe = ProtocolStarterRecipe &
    JsonObject & {
        contentModels: Array<ProtocolStarterRecipe['contentModels'][number] & JsonObject>;
        entries: Array<ProtocolStarterRecipe['entries'][number] & JsonObject>;
        pages: Array<ProtocolStarterRecipe['pages'][number] & JsonObject>;
    };

export type ThemeDefinition = {
    root: string;
    handle: string;
    name: string;
    version: string;
    constraint: string;
    description: string | null;
    author: string | null;
    colorModes: string[];
    previewSource: string | null;
    settings: Record<string, ThemeSetting>;
    templates: ThemeTemplates;
    starter: StarterRecipe | null;
};

export type ThemeFile = {
    path: string;
    size: number;
    sha256: string;
};

export type PublicThemeTemplate = Omit<ThemeTemplate, 'source'>;

export type { ThemeDescriptor } from '@bopli/theme-protocol';

export type CliOptions = Record<string, string | boolean>;
