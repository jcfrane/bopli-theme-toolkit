import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type {
    BopliBlogIndexProps,
    BopliBlogPostProps,
    BopliContentQuery,
    BopliEntryProps,
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

    page.settings.accent_color.toUpperCase();
    entry.settings.show_theme_toggle.valueOf();
    blogIndex.settings.accent_color.toUpperCase();
    blogPost.settings.show_theme_toggle.valueOf();
    queriedEntry.summary.toUpperCase();
    queriedEntry.fields.summary.toUpperCase();
    blogQuery.source;

    // @ts-expect-error Generated entry fields must reject misspelled properties.
    entry.entry.summmary;
    // @ts-expect-error Queried entries must reject misspelled projected fields.
    queriedEntry.summmary;
    // @ts-expect-error Content sources are a closed server-owned contract.
    const misspelledSource: BopliContentQuery = { source: 'blog.post' };
    // @ts-expect-error Sort fields are restricted per content source.
    const misspelledSort: BopliContentQuery = { source: 'blog.posts', sort: '-publshed_at' };
}

const declarations = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/index.d.ts');

test('exports the protocol-v1 Blog, settings, and content-query contracts', async () => {
    const source = await readFile(declarations, 'utf8');

    for (const contract of ['BopliBlogPostSummary', 'BopliBlogIndexProps', 'BopliBlogPostProps']) {
        assert.match(source, new RegExp(`export type ${contract}\\b`));
    }

    assert.match(source, /export type BopliThemeSettings\b/);
    assert.match(source, /export type BopliThemeServerRenderPayload\b/);
    assert.match(source, /export type BopliThemeServerModule\b/);
    assert.match(source, /render\(payload: BopliThemeServerRenderPayload\): Promise<string>/);
    assert.match(source, /settings: TSettings/);
    assert.match(source, /export type BopliContentClient\b/);
    assert.match(source, /export type BopliQueriedEntry\b/);
    assert.match(source, /content: BopliContentClient/);
    assert.match(source, /useBopliQuery/);
    assert.match(source, /readingTimeMinutes: number/);
    assert.match(source, /previous: BopliBlogPostSummary \| null/);
    assert.match(source, /next: BopliBlogPostSummary \| null/);
    assert.match(source, /owner: \{/);
    assert.match(source, /profileImage: BopliImage \| null/);
});
