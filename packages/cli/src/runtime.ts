import type { Plugin, ViteDevServer } from 'vite';
import {
    PUBLIC_DEV_ENTRY,
    RESOLVED_VIRTUAL_ENTRY,
    RUNTIME_API_VERSION,
    SDK_PATH,
    VIRTUAL_ENTRY,
} from './constants.js';
import type { ThemeDefinition, ThemeDescriptor } from './types.js';

export function runtimePlugin(
    theme: ThemeDefinition,
    devDescriptor?: ThemeDescriptor,
): Plugin {
    return {
        name: 'bopli-theme-runtime',
        resolveId(id) {
            if (id === VIRTUAL_ENTRY || id === PUBLIC_DEV_ENTRY) return RESOLVED_VIRTUAL_ENTRY;
            if (id === '@bopli/theme-sdk') return SDK_PATH;
            return null;
        },
        load(id) {
            return id === RESOLVED_VIRTUAL_ENTRY ? runtimeSource(theme) : null;
        },
        configureServer(server: ViteDevServer) {
            if (!devDescriptor) return;
            server.middlewares.use('/theme.json', (_request, response) => {
                response.setHeader('Content-Type', 'application/json');
                response.setHeader('Cache-Control', 'no-store');
                response.end(JSON.stringify(devDescriptor));
            });
        },
    };
}

export function runtimeSource(theme: ThemeDefinition): string {
    const imports: string[] = [];
    const registrations: string[] = [];
    let index = 0;

    for (const [handle, template] of Object.entries(theme.templates)) {
        const identifier = `Template${index++}`;
        imports.push(`import ${identifier} from ${JSON.stringify(template.source)};`);
        registrations.push(`${JSON.stringify(handle)}: ${identifier}`);
    }

    return `
import { createApp, defineComponent, h, shallowReactive } from 'vue';
import { BOPLI_CONTENT_KEY, BOPLI_NAVIGATION_KEY } from '@bopli/theme-sdk';
${imports.join('\n')}
const templates = { ${registrations.join(', ')} };
export const runtimeApiVersion = ${RUNTIME_API_VERSION};
export function mount({ element, template, props, navigation, content }) {
    if (!templates[template]) throw new Error('Unknown theme template: ' + template);
    const state = shallowReactive({ template, props });
    const Root = defineComponent({
        name: 'BopliThemeRoot',
        setup: () => () => h(templates[state.template], state.props),
    });
    const app = createApp(Root);
    app.provide(BOPLI_NAVIGATION_KEY, navigation);
    app.provide(BOPLI_CONTENT_KEY, content);
    app.mount(element);
    const handleClick = (event) => {
        const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
        if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
            || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search && url.hash)) return;
        event.preventDefault();
        navigation.visit(url.pathname + url.search + url.hash);
    };
    element.addEventListener('click', handleClick);
    return {
        update(next) {
            if (!templates[next.template]) throw new Error('Unknown theme template: ' + next.template);
            state.template = next.template;
            state.props = next.props;
        },
        unmount() {
            element.removeEventListener('click', handleClick);
            app.unmount();
        },
    };
}
`;
}
