import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const declarations = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/index.d.ts');

test('exports the protocol-v1 native Blog SDK contracts', async () => {
    const source = await readFile(declarations, 'utf8');

    for (const contract of ['BopliBlogPostSummary', 'BopliBlogIndexProps', 'BopliBlogPostProps']) {
        assert.match(source, new RegExp(`export type ${contract}\\b`));
    }

    assert.match(source, /Array<BopliPublicEntry \| BopliBlogPostSummary>/);
    assert.match(source, /readingTimeMinutes: number/);
    assert.match(source, /previous: BopliBlogPostSummary \| null/);
    assert.match(source, /next: BopliBlogPostSummary \| null/);
});
