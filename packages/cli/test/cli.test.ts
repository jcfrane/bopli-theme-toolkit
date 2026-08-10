import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    developmentDescriptorFor,
    developmentRegistrationArguments,
    inspectTheme,
} from '../dist/cli.js';

const TOOLKIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('validates the starter theme contract', async () => {
    const theme = await inspectTheme(join(TOOLKIT_ROOT, 'starter-theme'));

    assert.equal(theme.handle, 'starter-theme');
    assert.deepEqual(Object.keys(theme.templates), ['home', 'page', 'entry']);
    assert.equal(theme.templates.page?.default, true);
    assert.equal(theme.templates.entry?.default, true);
    assert.equal(theme.starter?.version, 1);
    assert.deepEqual(theme.settings, {});
    assert.equal((theme.starter?.pages[0] as { path?: string })?.path, '/');
});

test('requires Page and Entry templates with exactly one default each', async () => {
    await withStarterTheme(async (root) => {
        await writeTemplate(root, 'pages', 'Landing.vue', {
            name: 'Landing',
            default: true,
        });

        await assert.rejects(inspectTheme(root), /Page templates must mark exactly one/);
    });

    await withStarterTheme(async (root) => {
        await rm(join(root, 'resources/js/templates/entries'), { recursive: true, force: true });

        await assert.rejects(inspectTheme(root), /at least one Entry template/);
    });
});

test('uses package.json as the complete theme source manifest', async () => {
    await withStarterTheme(async (root) => {
        const path = join(root, 'package.json');
        const packageDefinition = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
        packageDefinition.version = '0.2.0';
        packageDefinition.author = { name: 'Theme Author' };
        packageDefinition.bopli = {
            handle: 'package-theme',
            name: 'Package Theme',
            requires: '^0.1',
            settings: {
                accent: { name: 'Accent', type: 'color', default: '#112233' },
            },
        };
        await writeFile(path, JSON.stringify(packageDefinition));

        const theme = await inspectTheme(root);

        assert.equal(theme.handle, 'package-theme');
        assert.equal(theme.version, '0.2.0');
        assert.equal(theme.author, 'Theme Author');
        assert.equal(theme.settings.accent?.default, '#112233');
    });
});

test('serves a declared preview from the local theme watch release', async () => {
    await withStarterTheme(async (root) => {
        await mkdir(join(root, 'resources/images'), { recursive: true });
        await writeFile(join(root, 'resources/images/preview.png'), 'preview');

        const path = join(root, 'package.json');
        const packageDefinition = JSON.parse(await readFile(path, 'utf8')) as {
            bopli: Record<string, unknown>;
        };
        packageDefinition.bopli.preview = 'resources/images/preview.png';
        await writeFile(path, JSON.stringify(packageDefinition));

        const descriptor = developmentDescriptorFor(await inspectTheme(root));

        assert.equal(descriptor.preview, './resources/images/preview.png');
        assert(descriptor.files.some((file) => file.path === 'resources/images/preview.png'));
    });
});

test('rejects obsolete Page slots and invalid theme setting defaults', async () => {
    await withStarterTheme(async (root) => {
        await writeTemplate(root, 'pages', 'Home.vue', {
            name: 'Home',
            slots: { posts: { name: 'Posts' } },
        });

        await assert.rejects(inspectTheme(root), /may not declare slots/);
    });

    await withStarterTheme(async (root) => {
        const path = join(root, 'package.json');
        const packageDefinition = JSON.parse(await readFile(path, 'utf8')) as {
            bopli: Record<string, unknown>;
        };
        packageDefinition.bopli.settings = {
            layout: { name: 'Layout', type: 'select', default: 'grid', options: ['list'] },
        };
        await writeFile(path, JSON.stringify(packageDefinition));

        await assert.rejects(inspectTheme(root), /default must be one of its options/);
    });
});

test('rejects starter content that references an unknown template', async () => {
    await withStarterTheme(async (root) => {
        const path = join(root, 'resources/bopli/starter.json');
        const starter = JSON.parse(await readFile(path, 'utf8')) as {
            pages: Array<{ template: string }>;
        };
        const firstPage = starter.pages[0];
        assert(firstPage);
        firstPage.template = 'missing';
        await writeFile(path, JSON.stringify(starter));

        await assert.rejects(inspectTheme(root), /must reference a Page template/);
    });
});

test('rejects Entry contracts that shadow Bopli metadata', async () => {
    await withStarterTheme(async (root) => {
        await writeTemplate(root, 'entries', 'Entry.vue', {
            name: 'Entry',
            fields: { url: { name: 'External URL', type: 'short_text' } },
        });

        await assert.rejects(inspectTheme(root), /redeclares reserved field \[url\]/);
    });
});

test('rejects imports that escape the theme repository', async () => {
    await withStarterTheme(async (root) => {
        await appendToHome(
            root,
            "\n<script setup>\nimport secret from '../../../../../outside.js';\n</script>\n",
        );

        await assert.rejects(inspectTheme(root), /escapes the theme root/);
    });
});

test('rejects Vite glob and environment access', async () => {
    await withStarterTheme(async (root) => {
        await appendToHome(
            root,
            '\n<script setup>\nconst files = import.meta.glob("../../**/*");\n</script>\n',
        );

        await assert.rejects(inspectTheme(root), /environment access is not allowed/);
    });
});

test('discovers one native Blog template pair and makes both defaults', async () => {
    await withStarterTheme(async (root) => {
        await writeTemplate(root, 'pages', 'Journal.vue', {
            name: 'Journal',
            kind: 'blog_index',
        });
        await writeTemplate(root, 'entries', 'Article.vue', {
            name: 'Article',
            kind: 'blog_post',
        });

        const theme = await inspectTheme(root);

        assert.deepEqual(theme.templates.journal, {
            name: 'Journal',
            kind: 'blog_index',
            default: true,
            source: '/resources/js/templates/pages/Journal.vue',
        });
        assert.equal(theme.templates.article?.kind, 'blog_post');
        assert.equal(theme.templates.article?.default, true);
    });
});

test('requires native Blog index and post templates as a pair', async () => {
    await withStarterTheme(async (root) => {
        await writeTemplate(root, 'pages', 'Blog.vue', {
            name: 'Blog',
            kind: 'blog_index',
        });

        await assert.rejects(inspectTheme(root), /as a pair/);
    });
});

test('requires exactly one default when a Blog template kind has variants', async () => {
    await withStarterTheme(async (root) => {
        await writeTemplate(root, 'pages', 'Blog.vue', {
            name: 'Blog',
            kind: 'blog_index',
        });
        await writeTemplate(root, 'pages', 'Journal.vue', {
            name: 'Journal',
            kind: 'blog_index',
        });
        await writeTemplate(root, 'entries', 'Post.vue', {
            name: 'Post',
            kind: 'blog_post',
        });

        await assert.rejects(inspectTheme(root), /Blog index templates must mark exactly one/);
    });
});

test('rejects native template kinds in the wrong source directory', async () => {
    await withStarterTheme(async (root) => {
        await writeTemplate(root, 'pages', 'Post.vue', {
            name: 'Post',
            kind: 'blog_post',
        });

        await assert.rejects(inspectTheme(root), /declares invalid kind \[blog_post\]/);
    });
});

test('rejects legacy Blog and Post template directories', async () => {
    await withStarterTheme(async (root) => {
        await writeTemplate(root, 'blogs', 'Blog.vue', { name: 'Blog' });

        await assert.rejects(inspectTheme(root), /Legacy template directory \[blogs\]/);
    });
});

test('allows the local watch release to be staged during an incompatible protocol transition', () => {
    assert.deepEqual(
        developmentRegistrationArguments(
            'http://host.docker.internal:5174/theme.json',
            'http://localhost:5174',
        ),
        [
            'compose',
            'exec',
            '-T',
            'php',
            'php',
            'artisan',
            'bopli:theme:install',
            'http://host.docker.internal:5174/theme.json',
            '--development',
            '--stage-if-incompatible',
            '--public-origin=http://localhost:5174',
        ],
    );
});

async function withStarterTheme(callback: (root: string) => Promise<void>): Promise<void> {
    const temporary = await mkdtemp(join(tmpdir(), 'bopli-theme-cli-'));
    const root = join(temporary, 'theme');

    try {
        await cp(join(TOOLKIT_ROOT, 'starter-theme'), root, { recursive: true });
        await callback(root);
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
}

async function appendToHome(root: string, addition: string): Promise<void> {
    const path = join(root, 'resources/js/templates/pages/Home.vue');
    const contents = await readFile(path, 'utf8');
    await writeFile(path, contents + addition);
}

async function writeTemplate(
    root: string,
    directory: string,
    filename: string,
    metadata: Record<string, unknown>,
): Promise<void> {
    const templateRoot = join(root, 'resources/js/templates', directory);
    await mkdir(templateRoot, { recursive: true });
    await writeFile(
        join(templateRoot, filename),
        `<bopli lang="json">\n${JSON.stringify(metadata)}\n</bopli>\n<template><main /></template>\n`,
    );
}
