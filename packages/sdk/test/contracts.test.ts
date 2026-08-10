import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const declarations = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/index.d.ts');

test('exports the protocol-v1 Blog, settings, and content-query contracts', async () => {
    const source = await readFile(declarations, 'utf8');

    for (const contract of ['BopliBlogPostSummary', 'BopliBlogIndexProps', 'BopliBlogPostProps']) {
        assert.match(source, new RegExp(`export type ${contract}\\b`));
    }

    assert.match(source, /export type BopliThemeSettings\b/);
    assert.match(source, /settings: BopliThemeSettings/);
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
