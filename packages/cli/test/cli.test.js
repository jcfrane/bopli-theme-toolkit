import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspectTheme } from '../src/cli.js';

const TOOLKIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('validates the starter theme contract', async () => {
    const theme = await inspectTheme(join(TOOLKIT_ROOT, 'starter-theme'));

    assert.equal(theme.handle, 'starter-theme');
    assert.deepEqual(Object.keys(theme.templates), ['home']);
});

test('rejects imports that escape the theme repository', async () => {
    await withStarterTheme(async (root) => {
        await appendToHome(root, "\n<script setup>\nimport secret from '../../../../outside.js';\n</script>\n");

        await assert.rejects(inspectTheme(root), /escapes the theme root/);
    });
});

test('rejects Vite glob and environment access', async () => {
    await withStarterTheme(async (root) => {
        await appendToHome(root, '\n<script setup>\nconst files = import.meta.glob("../../**/*");\n</script>\n');

        await assert.rejects(inspectTheme(root), /environment access is not allowed/);
    });
});

async function withStarterTheme(callback) {
    const temporary = await mkdtemp(join(tmpdir(), 'bopli-theme-cli-'));
    const root = join(temporary, 'theme');

    try {
        await cp(join(TOOLKIT_ROOT, 'starter-theme'), root, { recursive: true });
        await callback(root);
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
}

async function appendToHome(root, addition) {
    const path = join(root, 'resources/js/templates/pages/Home.vue');
    const contents = await readFile(path, 'utf8');
    await writeFile(path, contents + addition);
}
