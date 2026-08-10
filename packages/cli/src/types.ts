export type JsonObject = Record<string, unknown>;

export type TemplateKind = 'page' | 'entry' | 'blog_index' | 'blog_post';

export type TemplateField = {
    name: string;
    type: string;
    required?: boolean;
};

export type ThemeTemplate = {
    name: string;
    kind: TemplateKind;
    default: boolean;
    source: string;
    fields?: Record<string, TemplateField>;
};

export type ThemeSettingType = 'text' | 'boolean' | 'select' | 'color' | 'image';

export type ThemeSetting = {
    name: string;
    type: ThemeSettingType;
    description?: string;
    default: string | boolean | null;
    options?: string[];
};

export type ThemeTemplates = Record<string, ThemeTemplate>;

export type StarterRecipe = JsonObject & {
    version: number;
    contentModels: JsonObject[];
    entries: JsonObject[];
    pages: JsonObject[];
    blog?: { enabled: boolean };
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

export type ThemeDescriptor = {
    schemaVersion: number;
    runtimeApiVersion: number;
    handle: string;
    name: string;
    description: string | null;
    author: string | null;
    version: string;
    bopli: string;
    preview: string | null;
    colorModes: string[];
    settings: Record<string, ThemeSetting>;
    templates: Record<string, PublicThemeTemplate>;
    starter?: StarterRecipe;
    runtime: { entry: string; styles: string[] };
    files: ThemeFile[];
};

export type CliOptions = Record<string, string | boolean>;
