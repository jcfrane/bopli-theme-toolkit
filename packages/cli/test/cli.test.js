import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { developmentRegistrationArguments, inspectTheme } from '../src/cli.js';

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

test('discovers one native Blog template pair and makes both defaults', async () => {
    await withStarterTheme(async (root) => {
        await writeTemplate(root, 'blogs', 'Journal.vue', { name: 'Journal' });
        await writeTemplate(root, 'posts', 'Article.vue', { name: 'Article' });

        const theme = await inspectTheme(root);

        assert.deepEqual(theme.templates.journal, {
            name: 'Journal',
            kind: 'blog_index',
            default: true,
            source: '/resources/js/templates/blogs/Journal.vue',
        });
        assert.equal(theme.templates.article.kind, 'blog_post');
        assert.equal(theme.templates.article.default, true);
    });
});

test('requires native Blog index and post templates as a pair', async () => {
    await withStarterTheme(async (root) => {
        await writeTemplate(root, 'blogs', 'Blog.vue', { name: 'Blog' });

        await assert.rejects(inspectTheme(root), /as a pair/);
    });
});

test('requires exactly one default when a Blog template kind has variants', async () => {
    await withStarterTheme(async (root) => {
        await writeTemplate(root, 'blogs', 'Blog.vue', { name: 'Blog' });
        await writeTemplate(root, 'blogs', 'Journal.vue', { name: 'Journal' });
        await writeTemplate(root, 'posts', 'Post.vue', { name: 'Post' });

        await assert.rejects(inspectTheme(root), /Blog index templates must mark exactly one/);
    });
});

test('allows the local watch release to be staged during an incompatible protocol transition', () => {
    assert.deepEqual(
        developmentRegistrationArguments(
            'http://host.docker.internal:5174/theme.json',
            'http://localhost:5174',
        ),
        [
            'compose', 'exec', '-T', 'php', 'php', 'artisan', 'bopli:theme:install',
            'http://host.docker.internal:5174/theme.json', '--development', '--stage-if-incompatible',
            '--public-origin=http://localhost:5174',
        ],
    );
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

async function writeTemplate(root, directory, filename, metadata) {
    const templateRoot = join(root, 'resources/js/templates', directory);
    await mkdir(templateRoot, { recursive: true });
    await writeFile(
        join(templateRoot, filename),
        `<bopli lang="json">\n${JSON.stringify(metadata)}\n</bopli>\n<template><main /></template>\n`,
    );
}
