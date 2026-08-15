import type { Plugin, ViteDevServer } from 'vite';
import { PUBLIC_DEV_ENTRY } from './constants.js';
import { previewFixtureFor } from './preview-fixtures.js';
import type { ThemeDefinition } from './types.js';

const PUBLIC_PREVIEW_ENTRY = '/__bopli/preview.js';
const RESOLVED_PREVIEW_ENTRY = '\0bopli:theme-preview';

export function previewHarnessPlugin(theme: ThemeDefinition): Plugin {
    return {
        name: 'bopli-theme-preview-harness',
        resolveId(id) {
            return id === PUBLIC_PREVIEW_ENTRY ? RESOLVED_PREVIEW_ENTRY : null;
        },
        load(id) {
            return id === RESOLVED_PREVIEW_ENTRY ? previewHarnessSource(theme) : null;
        },
        configureServer(server: ViteDevServer) {
            server.middlewares.use(async (request, response, next) => {
                const path = new URL(request.url ?? '/', 'http://localhost').pathname;
                if (path !== '/') {
                    next();
                    return;
                }

                try {
                    const html = await server.transformIndexHtml(path, previewHarnessHtml(theme));
                    response.statusCode = 200;
                    response.setHeader('Content-Type', 'text/html; charset=utf-8');
                    response.setHeader('Cache-Control', 'no-store');
                    response.end(html);
                } catch (error) {
                    next(error as Error);
                }
            });
        },
    };
}

export function previewHarnessSource(theme: ThemeDefinition): string {
    const fixture = serialize(previewFixtureFor(theme));

    return `
import { mount } from ${JSON.stringify(PUBLIC_DEV_ENTRY)};

const fixture = ${fixture};
const toolbar = document.querySelector('[data-bopli-toolbar]');
const templateSelect = document.querySelector('[data-bopli-template]');
const settingControls = document.querySelector('[data-bopli-settings]');
const settingsPanel = document.querySelector('[data-bopli-settings-panel]');
const settingsToggle = document.querySelector('[data-bopli-settings-toggle]');
const settingsClose = document.querySelector('[data-bopli-settings-close]');
const toolbarMinimize = document.querySelector('[data-bopli-toolbar-minimize]');
const locationLabel = document.querySelector('[data-bopli-location]');
const mountPoint = document.querySelector('[data-bopli-theme-mount]');
const errorBox = document.querySelector('[data-bopli-error]');
let settings = structuredClone(fixture.settings);
let session;

for (const template of fixture.templates) {
    const option = document.createElement('option');
    option.value = template.handle;
    option.textContent = template.name + ' · ' + template.kind.replace('_', ' ');
    templateSelect.append(option);
}

for (const [handle, definition] of Object.entries(fixture.settingDefinitions)) {
    const label = document.createElement('label');
    const title = document.createElement('span');
    title.textContent = definition.name;
    const input = settingInput(handle, definition, settings[handle]);
    input.dataset.setting = handle;
    input.addEventListener('input', updateSetting);
    label.append(title, input);
    settingControls.append(label);
}

if (Object.keys(fixture.settingDefinitions).length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'This theme has no configurable settings.';
    settingControls.append(empty);
}

const content = {
    async query(query, options = {}) {
        if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        let data = [...(fixture.content[query.source] ?? [])];
        if (query.model) data = data.filter((item) => item.__model === query.model);
        for (const [field, expected] of Object.entries(query.filter ?? {})) {
            data = data.filter((item) => item[field] === expected || item.fields?.[field] === expected);
        }
        if (query.sort) {
            const descending = query.sort.startsWith('-');
            const field = query.sort.replace(/^-/, '').replaceAll('_', '');
            data.sort((left, right) => {
                const leftValue = sortableValue(left, field);
                const rightValue = sortableValue(right, field);
                return leftValue.localeCompare(rightValue) * (descending ? -1 : 1);
            });
        }
        const perPage = Math.max(1, Math.min(Number(query.limit ?? 10), 100));
        const currentPage = Math.max(1, Number(query.page ?? 1));
        const total = data.length;
        const lastPage = Math.max(1, Math.ceil(total / perPage));
        data = data
            .slice((currentPage - 1) * perPage, currentPage * perPage)
            .map(publicValue);
        return {
            data,
            meta: { currentPage, lastPage, perPage, total },
            links: {
                previous: currentPage > 1 ? previewPageUrl(currentPage - 1) : null,
                next: currentPage < lastPage ? previewPageUrl(currentPage + 1) : null,
            },
        };
    },
};

const navigation = {
    visit(url) {
        history.pushState({}, '', url);
        selectTemplateForLocation();
    },
};

function render() {
    const selected = fixture.templates.find((template) => template.handle === templateSelect.value);
    if (!selected) return;
    const props = { ...structuredClone(selected.props), settings: structuredClone(settings) };
    errorBox.hidden = true;
    try {
        if (session) session.update({ template: selected.handle, props });
        else session = mount({ element: mountPoint, template: selected.handle, props, navigation, content });
    } catch (error) {
        errorBox.textContent = error instanceof Error ? error.message : String(error);
        errorBox.hidden = false;
        throw error;
    }
}

function settingInput(handle, definition, value) {
    let input;
    if (definition.type === 'select') {
        input = document.createElement('select');
        for (const optionValue of definition.options ?? []) {
            const option = document.createElement('option');
            option.value = optionValue;
            option.textContent = optionValue;
            input.append(option);
        }
        input.value = String(value ?? '');
        return input;
    }
    input = document.createElement('input');
    input.type = definition.type === 'boolean' ? 'checkbox' : definition.type === 'color' ? 'color' : 'text';
    if (definition.type === 'image') input.placeholder = 'Image URL (optional)';
    if (input.type === 'checkbox') input.checked = Boolean(value);
    else if (definition.type === 'image') input.value = value?.url ?? '';
    else input.value = String(value ?? '');
    input.name = handle;
    return input;
}

function updateSetting(event) {
    const input = event.currentTarget;
    const handle = input.dataset.setting;
    const definition = fixture.settingDefinitions[handle];
    if (definition.type === 'boolean') settings[handle] = input.checked;
    else if (definition.type === 'image') {
        settings[handle] = input.value ? { url: input.value, alt: null, width: null, height: null } : null;
    } else settings[handle] = input.value;
    render();
}

function selectTemplateForLocation() {
    locationLabel.textContent = location.pathname + location.search + location.hash;
    const matching = fixture.templates.find((template) =>
        template.props.page?.path === location.pathname ||
        template.props.entry?.url === location.pathname ||
        template.props.post?.url === location.pathname ||
        template.props.blog?.path === location.pathname
    );
    if (matching) templateSelect.value = matching.handle;
    render();
}

function sortableValue(item, normalizedField) {
    const entry = Object.entries(item).find(([key]) => key.toLowerCase() === normalizedField);
    return String(entry?.[1] ?? '');
}

function publicValue(item) {
    return Object.fromEntries(Object.entries(item).filter(([key]) => !key.startsWith('__')));
}

function previewPageUrl(page) {
    const url = new URL(location.href);
    url.searchParams.set('page', String(page));
    return url.pathname + url.search;
}

function setSettingsOpen(open) {
    settingsPanel.hidden = !open;
    settingsToggle.setAttribute('aria-expanded', String(open));
}

function setToolbarMinimized(minimized) {
    toolbar.dataset.minimized = String(minimized);
    toolbarMinimize.textContent = minimized ? 'Preview' : 'Minimize';
    toolbarMinimize.setAttribute(
        'aria-label',
        minimized ? 'Restore Bopli preview toolbar' : 'Minimize Bopli preview toolbar',
    );
    if (minimized) setSettingsOpen(false);
}

templateSelect.addEventListener('change', render);
settingsToggle.addEventListener('click', () => {
    setSettingsOpen(settingsPanel.hidden);
});
settingsClose.addEventListener('click', () => setSettingsOpen(false));
toolbarMinimize.addEventListener('click', () => {
    setToolbarMinimized(toolbar.dataset.minimized !== 'true');
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setSettingsOpen(false);
});
window.addEventListener('popstate', selectTemplateForLocation);
locationLabel.textContent = location.pathname + location.search + location.hash;
render();
`;
}

export function previewHarnessHtml(theme: ThemeDefinition): string {
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(theme.name)} · Bopli theme preview</title>
    <style>
        #bopli-preview-toolbar, #bopli-preview-settings { box-sizing: border-box; font: 13px/1.35 system-ui,sans-serif; }
        #bopli-preview-toolbar *, #bopli-preview-settings * { box-sizing: border-box; }
        #bopli-preview-toolbar { position: fixed; z-index: 2147483647; right: 0; bottom: 0; left: 0; min-height: 3rem; display: flex; align-items: center; gap: .65rem; padding: .45rem .6rem; color: #e2e8f0; background: #111827; border-top: 1px solid #334155; box-shadow: 0 -.35rem 1rem rgba(15,23,42,.2); }
        #bopli-preview-toolbar strong { flex: 0 0 auto; color: #fff; font-size: .8rem; white-space: nowrap; }
        #bopli-preview-toolbar [data-bopli-theme-name] { max-width: 12rem; overflow: hidden; color: #94a3b8; text-overflow: ellipsis; white-space: nowrap; }
        #bopli-preview-toolbar label { min-width: 10rem; max-width: 24rem; flex: 1 1 18rem; margin: 0; }
        #bopli-preview-toolbar select { width: 100%; height: 2rem; margin: 0; padding: 0 2rem 0 .55rem; color: #111827; background: #fff; border: 1px solid #64748b; border-radius: .3rem; font: inherit; }
        #bopli-preview-toolbar code { max-width: 14rem; overflow: hidden; color: #94a3b8; font: 12px/1.2 ui-monospace,SFMono-Regular,monospace; text-overflow: ellipsis; white-space: nowrap; }
        #bopli-preview-toolbar button, #bopli-preview-settings button { min-height: 2rem; margin: 0; padding: .35rem .65rem; color: inherit; background: #1f2937; border: 1px solid #475569; border-radius: .3rem; font: 600 12px/1 system-ui,sans-serif; cursor: pointer; white-space: nowrap; }
        #bopli-preview-toolbar button:hover, #bopli-preview-toolbar button:focus-visible { background: #334155; }
        #bopli-preview-toolbar [data-bopli-settings-toggle][aria-expanded=true] { color: #111827; background: #f8fafc; }
        #bopli-preview-toolbar [data-bopli-setting-count] { display: inline-grid; min-width: 1.1rem; height: 1.1rem; margin-left: .25rem; place-items: center; color: #111827; background: #e2e8f0; border-radius: 999px; font-size: 10px; }
        #bopli-preview-toolbar[data-minimized=true] { left: auto; min-height: auto; padding: .35rem; border-left: 1px solid #334155; border-radius: .45rem 0 0 0; }
        #bopli-preview-toolbar[data-minimized=true] > :not([data-bopli-toolbar-minimize]) { display: none; }
        #bopli-preview-settings { position: fixed; z-index: 2147483647; right: 0; bottom: 3rem; width: min(27rem, 100vw); max-height: min(38rem, calc(100vh - 4rem)); overflow: auto; padding: 1rem; color: #0f172a; background: #fff; border: 1px solid #cbd5e1; border-width: 1px 0 0 1px; border-radius: .65rem 0 0 0; box-shadow: -.5rem -.5rem 1.5rem rgba(15,23,42,.18); }
        #bopli-preview-settings[hidden] { display: none; }
        #bopli-preview-settings header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: .75rem; }
        #bopli-preview-settings header strong { font-size: .95rem; }
        #bopli-preview-settings header button { color: #334155; background: #f8fafc; border-color: #cbd5e1; }
        #bopli-preview-settings p { margin: .5rem 0; color: #64748b; }
        #bopli-preview-settings label { display: grid; gap: .3rem; margin-top: .7rem; font-weight: 600; }
        #bopli-preview-settings input:not([type=checkbox]), #bopli-preview-settings select { width: 100%; min-height: 2.25rem; margin: 0; padding: .35rem .5rem; color: #0f172a; background: #fff; border: 1px solid #94a3b8; border-radius: .35rem; font: inherit; }
        #bopli-preview-settings [type=checkbox] { justify-self: start; width: 1rem; height: 1rem; margin: 0; }
        #bopli-preview-error { position: fixed; z-index: 2147483646; left: 1rem; bottom: 3.75rem; max-width: calc(100vw - 2rem); padding: .75rem 1rem; color: #7f1d1d; background: #fee2e2; border: 1px solid #fca5a5; border-radius: .5rem; font: 14px/1.4 system-ui,sans-serif; }
        [data-bopli-theme-mount] { min-height: 100vh; }
        .bopli-preview-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
        @media (max-width: 46rem) {
            #bopli-preview-toolbar { gap: .4rem; }
            #bopli-preview-toolbar [data-bopli-theme-name], #bopli-preview-toolbar code { display: none; }
            #bopli-preview-toolbar strong { font-size: 0; }
            #bopli-preview-toolbar strong::after { content: 'Bopli'; font-size: .8rem; }
            #bopli-preview-toolbar label { min-width: 7rem; }
        }
    </style>
</head>
<body>
    <section id="bopli-preview-settings" data-bopli-settings-panel aria-label="Theme settings" hidden>
        <header>
            <strong>Theme settings</strong>
            <button type="button" data-bopli-settings-close>Close</button>
        </header>
        <div data-bopli-settings></div>
    </section>
    <div id="bopli-preview-toolbar" data-bopli-toolbar data-minimized="false" role="toolbar" aria-label="Bopli standalone preview">
        <strong>Bopli preview</strong>
        <span data-bopli-theme-name>${escapeHtml(theme.name)}</span>
        <label>
            <span class="bopli-preview-visually-hidden">Template</span>
            <select data-bopli-template title="Preview template"></select>
        </label>
        <code data-bopli-location>/</code>
        <button type="button" data-bopli-settings-toggle aria-expanded="false" aria-controls="bopli-preview-settings">
            Settings <span data-bopli-setting-count>${Object.keys(theme.settings).length}</span>
        </button>
        <button type="button" data-bopli-toolbar-minimize aria-label="Minimize Bopli preview toolbar">Minimize</button>
    </div>
    <div id="bopli-preview-error" data-bopli-error hidden></div>
    <div data-bopli-theme-mount></div>
    <script type="module" src="${PUBLIC_PREVIEW_ENTRY}"></script>
</body>
</html>`;
}

function serialize(value: unknown): string {
    return JSON.stringify(value)
        .replaceAll('<', '\\u003C')
        .replaceAll('\u2028', '\\u2028')
        .replaceAll('\u2029', '\\u2029');
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
