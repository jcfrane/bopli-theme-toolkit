import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    assertThemeDescriptor,
    assertThemePackageMetadata,
    CONTENT_FIELD_TYPES,
    PROTOCOL_VERSION,
    RESERVED_ENTRY_FIELDS,
} from '../src/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('exports protocol-v1 vocabularies from the schema', () => {
    assert.equal(PROTOCOL_VERSION, 1);
    assert(CONTENT_FIELD_TYPES.has('relationship'));
    assert(RESERVED_ENTRY_FIELDS.has('canonicalPath'));
});

test('accepts the valid descriptor fixture', async () => {
    const descriptor = JSON.parse(
        await readFile(resolve(root, 'fixtures/valid/minimal-theme.json'), 'utf8'),
    ) as unknown;

    assert.doesNotThrow(() => assertThemeDescriptor(descriptor));
});

test('accepts the real descriptor built by the starter theme', async () => {
    const descriptor = JSON.parse(
        await readFile(resolve(root, 'fixtures/valid/starter-theme.json'), 'utf8'),
    ) as unknown;

    assert.doesNotThrow(() => assertThemeDescriptor(descriptor));
});

test('rejects package metadata with an unknown setting type', async () => {
    const metadata = JSON.parse(
        await readFile(resolve(root, 'fixtures/invalid/unknown-setting-type.json'), 'utf8'),
    ) as unknown;

    assert.throws(() => assertThemePackageMetadata(metadata), /must be equal to one of the allowed values/);
});
