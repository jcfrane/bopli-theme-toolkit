import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    developmentDescriptorFor,
    developmentRegistrationArguments,
    inspectTheme,
    packageTheme,
} from '../dist/cli.js';
import { developmentServerArtifact } from '../dist/build-theme.js';

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

test('packages a deterministic upload-ready ZIP with compiled files at its root', async () => {
    await withStarterTheme(async (root) => {
        await mkdir(join(root, 'node_modules/@bopli'), { recursive: true });
        await symlink(
            join(TOOLKIT_ROOT, 'packages/sdk'),
            join(root, 'node_modules/@bopli/theme-sdk'),
            'dir',
        );
        const theme = await inspectTheme(root);
        const output = join(root, 'dist');
        const first = await packageTheme(theme, output);
        const firstBytes = await readFile(first.archive);
        const descriptor = JSON.parse(await readFile(join(output, 'theme.json'), 'utf8')) as {
            files: Array<{ path: string }>;
            runtime: { entry: string; ssrEntry: string; styles: string[] };
        };
        const expectedEntries = ['theme.json', ...descriptor.files.map((file) => file.path)].sort(
            comparePaths,
        );

        assert.equal(
            basename(first.archive),
            `${theme.handle}-${theme.version}-${first.releaseHash}.zip`,
        );
        assert.deepEqual(zipEntryNames(firstBytes), expectedEntries);
        assert.match(descriptor.runtime.ssrEntry, /^\.\/assets\/theme-ssr-.*\.js$/);
        assert(
            descriptor.files.some(
                (file) => `./${file.path}` === descriptor.runtime.ssrEntry,
            ),
        );
        assert.equal(
            (await readFile(join(root, '.bopli-release-hash'), 'utf8')).trim(),
            first.releaseHash,
        );

        const serverSource = await readFile(
            join(output, descriptor.runtime.ssrEntry.replace(/^\.\//, '')),
            'utf8',
        );
        assert.doesNotMatch(serverSource, /(?:createRequire|from["']node:)/);
        const serverModule = (await import(
            `data:text/javascript;charset=utf-8,${encodeURIComponent(serverSource)}`
        )) as {
            runtimeApiVersion: number;
            render(payload: {
                template: string;
                props: Record<string, unknown>;
                content: { query(): Promise<unknown> };
            }): Promise<string>;
        };
        const content = {
            async query() {
                return {
                    data: [],
                    meta: { currentPage: 1, lastPage: 1, perPage: 10, total: 0 },
                    links: { previous: null, next: null },
                };
            },
        };
        assert.equal(serverModule.runtimeApiVersion, 1);
        assert.match(
            await serverModule.render({
                template: 'home',
                props: {
                    site: { name: 'Starter', tagline: 'Rendered on the server' },
                    page: { title: 'SSR home', fields: { body: 'Complete HTML' } },
                    settings: {},
                },
                content,
            }),
            /<h1[^>]*>SSR home<\/h1>/,
        );
        assert.match(
            await serverModule.render({
                template: 'page',
                props: {
                    site: { name: 'Starter' },
                    page: { title: 'SSR page', fields: {} },
                    settings: {},
                },
                content,
            }),
            /<h1[^>]*>SSR page<\/h1>/,
        );
        assert.match(
            await serverModule.render({
                template: 'entry',
                props: {
                    site: { name: 'Starter' },
                    entry: { title: 'SSR entry', body: 'Entry body' },
                    settings: {},
                },
                content,
            }),
            /<h1[^>]*>SSR entry<\/h1>/,
        );
        await assert.rejects(
            serverModule.render({ template: 'missing', props: {}, content }),
            /Unknown theme template/,
        );

        const second = await packageTheme(theme, output);
        assert.equal(second.archive, first.archive);
        assert.deepEqual(await readFile(second.archive), firstBytes);
    });
});

test('awaits SDK content queries while server-rendering a template', async () => {
    await withStarterTheme(async (root) => {
        await mkdir(join(root, 'node_modules/@bopli'), { recursive: true });
        await symlink(
            join(TOOLKIT_ROOT, 'packages/sdk'),
            join(root, 'node_modules/@bopli/theme-sdk'),
            'dir',
        );
        const homePath = join(root, 'resources/js/templates/pages/Home.vue');
        const home = await readFile(homePath, 'utf8');
        await writeFile(
            homePath,
            home.replace(
                "import type { StarterPageProps } from '../../types';",
                "import { useBopliQuery } from '@bopli/theme-sdk';\nimport type { StarterPageProps } from '../../types';\nuseBopliQuery({ source: 'pages' });",
            ),
        );
        const output = join(root, 'dist');
        await packageTheme(await inspectTheme(root), output);
        const descriptor = JSON.parse(await readFile(join(output, 'theme.json'), 'utf8')) as {
            runtime: { ssrEntry: string };
        };
        const serverSource = await readFile(
            join(output, descriptor.runtime.ssrEntry.replace(/^\.\//, '')),
            'utf8',
        );
        const serverModule = (await import(
            `data:text/javascript;charset=utf-8,${encodeURIComponent(serverSource)}`
        )) as {
            render(payload: Record<string, unknown>): Promise<string>;
        };
        let calls = 0;
        const html = await serverModule.render({
            template: 'home',
            props: {
                site: { name: 'Starter', tagline: 'Prefetched' },
                page: { title: 'Query SSR', fields: {} },
                settings: {},
            },
            content: {
                async query() {
                    calls += 1;
                    return {
                        data: [],
                        meta: { currentPage: 1, lastPage: 1, perPage: 10, total: 0 },
                        links: { previous: null, next: null },
                    };
                },
            },
        });

        assert.equal(calls, 1);
        assert.match(html, /Query SSR/);
    });
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
        await mkdir(join(root, 'node_modules/@bopli'), { recursive: true });
        await symlink(
            join(TOOLKIT_ROOT, 'packages/sdk'),
            join(root, 'node_modules/@bopli/theme-sdk'),
            'dir',
        );
        await mkdir(join(root, 'resources/images'), { recursive: true });
        await writeFile(join(root, 'resources/images/preview.png'), 'preview');

        const path = join(root, 'package.json');
        const packageDefinition = JSON.parse(await readFile(path, 'utf8')) as {
            bopli: Record<string, unknown>;
        };
        packageDefinition.bopli.preview = 'resources/images/preview.png';
        await writeFile(path, JSON.stringify(packageDefinition));

        const theme = await inspectTheme(root);
        const artifact = await developmentServerArtifact(theme);
        const descriptor = developmentDescriptorFor(theme, artifact.file);

        assert.equal(descriptor.preview, './resources/images/preview.png');
        assert.equal(descriptor.runtime.entry, './__bopli/theme-entry.js');
        assert.equal(descriptor.runtime.ssrEntry, './__bopli/theme-ssr.js');
        assert.equal(Buffer.byteLength(artifact.contents), artifact.file.size);
        assert.equal(descriptor.files.find((file) => file.path === '__bopli/theme-ssr.js')?.sha256, artifact.file.sha256);
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

test('allows the bounded Shiki imports used by syntax-highlighting themes', async () => {
    await withStarterTheme(async (root) => {
        await appendToHome(
            root,
            [
                '',
                '<script setup>',
                "import { createHighlighterCore } from 'shiki/core';",
                "import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';",
                "import githubDark from '@shikijs/themes/github-dark';",
                "const language = () => import('@shikijs/langs/typescript');",
                'void createHighlighterCore;',
                'void createJavaScriptRegexEngine;',
                'void githubDark;',
                'void language;',
                '</script>',
                '',
            ].join('\n'),
        );

        await inspectTheme(root);
    });
});

test('continues to reject Shiki imports outside the bounded allowlist', async () => {
    await withStarterTheme(async (root) => {
        await appendToHome(
            root,
            "\n<script setup>\nconst language = () => import('@shikijs/langs/wasm');\nvoid language;\n</script>\n",
        );

        await assert.rejects(inspectTheme(root), /Import \[@shikijs\/langs\/wasm\] is not allowed/);
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

test('rejects privileged server globals in theme source', async () => {
    await withStarterTheme(async (root) => {
        await appendToHome(
            root,
            '\n<script setup>\nconst secret = process.env.SECRET;\nvoid secret;\n</script>\n',
        );

        await assert.rejects(inspectTheme(root), /Server globals and privileged module schemes/);
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

function comparePaths(left: string, right: string): number {
    return Buffer.from(left).compare(Buffer.from(right));
}

function zipEntryNames(archive: Buffer): string[] {
    let end = -1;
    for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 65_557); offset--) {
        if (archive.readUInt32LE(offset) === 0x06054b50) {
            end = offset;
            break;
        }
    }

    assert.notEqual(end, -1, 'ZIP end-of-central-directory record is missing.');
    const entries = archive.readUInt16LE(end + 10);
    let offset = archive.readUInt32LE(end + 16);
    const names: string[] = [];

    for (let index = 0; index < entries; index++) {
        assert.equal(archive.readUInt32LE(offset), 0x02014b50);
        const nameLength = archive.readUInt16LE(offset + 28);
        const extraLength = archive.readUInt16LE(offset + 30);
        const commentLength = archive.readUInt16LE(offset + 32);
        names.push(archive.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'));
        offset += 46 + nameLength + extraLength + commentLength;
    }

    return names;
}
