import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { stripFooterAuthoring, stripTemplateAuthoring } from './template-authoring.js';
import type { TemplateKind, ThemeDefinition } from './types.js';

type TemplateSource = {
    directory: string;
    filename: string;
    handle: string;
    inferredKind: TemplateKind;
};

/** Removes Bopli's compile-time authoring declarations before Vue compiles templates. */
export function templateAuthoringPlugin(theme: ThemeDefinition): Plugin {
    const templates = new Map<string, TemplateSource>();

    for (const [handle, template] of Object.entries(theme.templates)) {
        const match = template.source.match(
            /^\/resources\/js\/templates\/(pages|entries)\/([^/]+\.vue)$/,
        );
        if (!match?.[1] || !match[2]) continue;
        templates.set(resolve(theme.root, `.${template.source}`), {
            directory: match[1],
            filename: match[2],
            handle,
            inferredKind: match[1] === 'pages' ? 'page' : 'entry',
        });
    }
    const footerSource = theme.footer
        ? resolve(theme.root, `.${theme.footer.source}`)
        : null;

    return {
        name: 'bopli-template-authoring',
        enforce: 'pre',
        transform(code, id) {
            if (id.includes('?') || id.includes('#')) return null;
            const source = templates.get(id);
            if (!source && id !== footerSource) return null;

            if (id === footerSource && theme.footer) {
                return {
                    code: stripFooterAuthoring(code, theme.footer.source.slice(1)),
                    map: null,
                };
            }

            return {
                code: stripTemplateAuthoring(
                    code,
                    source!.directory,
                    source!.filename,
                    source!.inferredKind,
                    source!.handle,
                ),
                map: null,
            };
        },
    };
}
