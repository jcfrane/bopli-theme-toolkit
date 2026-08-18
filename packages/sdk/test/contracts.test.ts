import assert from 'node:assert/strict';
import test from 'node:test';
import type {
    BopliBlogIndexProps,
    BopliBlogPostSummary,
    BopliBlogPostProps,
    BopliContentClient,
    BopliContentQuery,
    BopliEntryProps,
    BopliThemeModule,
    BopliThemeMountPayload,
    BopliThemeServerModule,
    BopliThemeServerRenderPayload,
    BopliThemeSession,
    BopliPageProps,
    BopliPublicEntry,
    BopliQueriedEntry,
} from '../src/index.js';

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
