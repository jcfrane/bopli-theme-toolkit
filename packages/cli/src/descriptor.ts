import { PROTOCOL_VERSION, RUNTIME_API_VERSION } from './constants.js';
import type {
    PublicThemeTemplate,
    ThemeDefinition,
    ThemeDescriptor,
    ThemeFile,
} from './types.js';

export function descriptorFor(
    theme: ThemeDefinition,
    entry: string,
    ssrEntry: string,
    styles: string[],
    files: ThemeFile[],
    preview: string | null,
): ThemeDescriptor {
    const templates = Object.fromEntries(
        Object.entries(theme.templates).map(([handle, template]) => {
            const { source: _source, ...publicTemplate } = template;
            return [handle, publicTemplate as PublicThemeTemplate];
        }),
    );

    return {
        schemaVersion: PROTOCOL_VERSION,
        runtimeApiVersion: RUNTIME_API_VERSION,
        handle: theme.handle,
        name: theme.name,
        description: theme.description,
        author: theme.author,
        version: theme.version,
        bopli: theme.constraint,
        preview,
        colorModes: theme.colorModes,
        settings: theme.settings,
        templates,
        ...(theme.starter ? { starter: theme.starter } : {}),
        runtime: { entry, ssrEntry, styles },
        files,
    };
}
