import assert from 'node:assert/strict';
import test from 'node:test';
import { createRenderer, defineComponent, h, nextTick, ref, shallowRef } from 'vue';
import type {
    BopliBlogIndexProps,
    BopliBlogPostSummary,
    BopliBlogPostProps,
    BopliContentClient,
    BopliContentQuery,
    BopliContentResponse,
    BopliEntryProps,
    BopliThemeModule,
    BopliThemeFooter,
    BopliThemeMountPayload,
    BopliThemeServerModule,
    BopliThemeServerRenderPayload,
    BopliThemeSession,
    BopliPageProps,
    BopliPublicEntry,
    BopliQueriedEntry,
} from '../src/index.js';
import {
    BOPLI_COLOR_MODE_KEY,
    BOPLI_CONTENT_KEY,
    useBopliColorMode,
    useBopliQuery,
} from '../src/index.js';
import {
    defineEntryTemplate,
    defineFooter,
    definePageTemplate,
    field,
    setting,
} from '../src/authoring.js';

type ExampleSettings = {
    accent_color: string;
    show_theme_toggle: boolean;
};

type ExampleFields = {
    summary: string;
};

type ExampleEntry = BopliPublicEntry<ExampleFields> & {
    canonicalPath: string;
    seoTitle: string | null;
    seoDescription: string | null;
};

if (false) {
    const page = null as unknown as BopliPageProps<Record<never, never>, ExampleSettings>;
    const entry = null as unknown as BopliEntryProps<ExampleEntry, ExampleSettings>;
    const blogIndex = null as unknown as BopliBlogIndexProps<ExampleSettings>;
    const blogPost = null as unknown as BopliBlogPostProps<ExampleSettings>;
    const queriedEntry = null as unknown as BopliQueriedEntry<ExampleFields>;
    const blogQuery: BopliContentQuery = {
        source: 'blog.posts',
        sort: '-published_at',
    };
    const contentClient = null as unknown as BopliContentClient;
    const themeModule = null as unknown as BopliThemeModule;
    const serverModule = null as unknown as BopliThemeServerModule;
    const expectedThemeModule: {
        runtimeApiVersion: number;
        mount(payload: BopliThemeMountPayload): BopliThemeSession;
    } = themeModule;
    const expectedServerModule: {
        runtimeApiVersion: number;
        render(payload: BopliThemeServerRenderPayload): Promise<string>;
    } = serverModule;
    const reverseThemeModule: BopliThemeModule = expectedThemeModule;
    const reverseServerModule: BopliThemeServerModule = expectedServerModule;
    const summary = null as unknown as BopliBlogPostSummary;
    const pageTemplate = definePageTemplate({
        fields: {
            skills: field.list({ label: field.text({ required: true }) }),
        },
    });
    const entryTemplate = defineEntryTemplate({
        fields: { body: field.richText({ required: true }) },
    });
    const footerDefinition = defineFooter({
        settings: {
            show_social_links: setting.boolean({ name: 'Show social links', default: true }),
        },
        fields: {
            message: field.text({ required: true }),
            links: field.list({
                label: field.text({ required: true }),
                url: field.url({ required: true }),
            }),
        },
        defaults: { message: 'Powered by Boply', links: [] },
    });
    const footer = null as unknown as BopliThemeFooter<
        { show_social_links: boolean },
        { message: string; links: Array<{ label: string; url: string }> }
    >;

    page.settings.accent_color.toUpperCase();
    entry.settings.show_theme_toggle.valueOf();
    blogIndex.settings.accent_color.toUpperCase();
    blogPost.settings.show_theme_toggle.valueOf();
    queriedEntry.summary.toUpperCase();
    queriedEntry.fields.summary.toUpperCase();
    blogQuery.source;
    contentClient.query(blogQuery);
    reverseThemeModule.runtimeApiVersion;
    reverseServerModule.runtimeApiVersion;
    summary.readingTimeMinutes.toFixed();
    summary.coverImage?.url;
    pageTemplate.fields.skills.fields.label.type;
    entryTemplate.fields.body.required;
    footerDefinition.fields.links.fields.url.type;
    footer.settings.show_social_links.valueOf();
    footer.content.links[0]?.url.toUpperCase();

    definePageTemplate({
        fields: {
            // @ts-expect-error Page templates intentionally reject arbitrary JSON fields.
            metadata: field.json(),
        },
    });
    definePageTemplate({
        fields: {
            // @ts-expect-error URL fields are reserved for the footer contract.
            website: field.url(),
        },
    });
    definePageTemplate({
        fields: {
            // @ts-expect-error Ordered Page lists intentionally reject nested rich text.
            sections: field.list({ body: field.richText() }),
        },
    });

    // @ts-expect-error Generated entry fields must reject misspelled properties.
    entry.entry.summmary;
    // @ts-expect-error Queried entries must reject misspelled projected fields.
    queriedEntry.summmary;
    // @ts-expect-error Content sources are a closed server-owned contract.
    const misspelledSource: BopliContentQuery = { source: 'blog.post' };
    // @ts-expect-error Sort fields are restricted per content source.
    const misspelledSort: BopliContentQuery = { source: 'blog.posts', sort: '-publshed_at' };
}

test('exports type-level protocol-v1 SDK contracts', () => {
    assert.ok(true);
});

test('exposes the host-owned color mode state', () => {
    const mode = shallowRef('dark');
    const modes = ['light', 'dark'] as const;
    const setMode = (next: string): void => {
        if (modes.includes(next as (typeof modes)[number])) mode.value = next;
    };
    let colorMode: ReturnType<typeof useBopliColorMode> | undefined;
    const app = testRenderer.createApp(
        defineComponent({
            setup() {
                colorMode = useBopliColorMode();

                return () => h('div');
            },
        }),
    );
    app.provide(BOPLI_COLOR_MODE_KEY, { mode, modes, setMode });
    app.mount(testNode());

    assert(colorMode);
    assert.equal(colorMode.mode.value, 'dark');
    assert.deepEqual(colorMode.modes, ['light', 'dark']);
    colorMode.setMode('light');
    assert.equal(mode.value, 'light');
    app.unmount();
});

test('re-fetches a reactive query once and aborts the prior request', async () => {
    const query = ref<BopliContentQuery>({ source: 'blog.posts', page: 1 });
    const calls: Array<{
        query: BopliContentQuery;
        signal: AbortSignal | undefined;
        resolve: (response: BopliContentResponse<{ title: string }>) => void;
    }> = [];
    let state: ReturnType<typeof useBopliQuery<{ title: string }>> | undefined;
    const app = testRenderer.createApp(
        defineComponent({
            setup() {
                state = useBopliQuery<{ title: string }>(query);

                return () => h('div');
            },
        }),
    );
    app.provide(BOPLI_CONTENT_KEY, {
        query: (current, options) =>
            new Promise((resolve) => {
                calls.push({
                    query: current,
                    signal: options?.signal,
                    resolve: resolve as (response: BopliContentResponse<{ title: string }>) => void,
                });
            }),
    });
    app.mount(testNode());
    await nextTick();

    assert.equal(calls.length, 1);
    query.value = { source: 'blog.posts', page: 2 };
    await nextTick();

    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.signal?.aborted, true);
    assert.deepEqual(calls[1]?.query, { source: 'blog.posts', page: 2 });

    calls[1]?.resolve(contentResponse([{ title: 'Page two' }]));
    await nextTick();
    await Promise.resolve();

    assert(state);
    assert.deepEqual(state.data.value, [{ title: 'Page two' }]);
    assert.equal(state.loading.value, false);
    app.unmount();
});

test('keeps plain object queries single-shot', async () => {
    let calls = 0;
    const app = testRenderer.createApp(
        defineComponent({
            setup() {
                useBopliQuery({ source: 'pages' });

                return () => h('div');
            },
        }),
    );
    app.provide(BOPLI_CONTENT_KEY, {
        async query() {
            calls += 1;

            return contentResponse([]);
        },
    });
    app.mount(testNode());
    await nextTick();
    await Promise.resolve();
    await nextTick();

    assert.equal(calls, 1);
    app.unmount();
});

type TestNode = {
    children: TestNode[];
    parent: TestNode | null;
    text: string;
};

const testRenderer = createRenderer<TestNode, TestNode>({
    patchProp() {},
    insert(child, parent) {
        child.parent = parent;
        parent.children.push(child);
    },
    remove(child) {
        const index = child.parent?.children.indexOf(child) ?? -1;
        if (index >= 0) child.parent?.children.splice(index, 1);
    },
    createElement: testNode,
    createText: (text) => testNode(text),
    createComment: (text) => testNode(text),
    setText(node, text) {
        node.text = text;
    },
    setElementText(node, text) {
        node.text = text;
    },
    parentNode: (node) => node.parent,
    nextSibling: () => null,
});

function testNode(text = ''): TestNode {
    return { children: [], parent: null, text };
}

function contentResponse<T>(data: T[]): BopliContentResponse<T> {
    return {
        data,
        meta: { currentPage: 1, lastPage: 1, perPage: data.length, total: data.length },
        links: { previous: null, next: null },
    };
}
