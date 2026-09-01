import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    createTheme,
    developmentDescriptorFor,
    developmentRegistrationArguments,
    generateThemeTypes,
    inspectTheme,
    packageTheme,
    ThemeValidationError,
} from '../dist/cli.js';
import { buildTheme, developmentServerArtifact } from '../dist/build-theme.js';
import { previewFixtureFor } from '../dist/preview-fixtures.js';
import { previewHarnessHtml, previewHarnessSource } from '../dist/preview-harness.js';

const TOOLKIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('validates the starter theme contract', async () => {
    const theme = await inspectTheme(join(TOOLKIT_ROOT, 'starter-theme'));

    assert.equal(theme.handle, 'starter-theme');
    assert.deepEqual(Object.keys(theme.templates), ['home', 'page', 'entry']);
    assert.equal(theme.templates.page?.default, true);
    assert.equal(theme.templates.entry?.default, true);
    assert.equal(theme.starter?.version, 1);
    assert.deepEqual(theme.settings, {
        accent_color: { name: 'Accent color', type: 'color', default: '#e95420' },
    });
    assert.equal((theme.starter?.pages[0] as { path?: string })?.path, '/');
});

test('derives standalone props and query fixtures for every declared template', async () => {
    await withStarterTheme(async (root) => {
        const packagePath = join(root, 'package.json');
        const packageDefinition = JSON.parse(await readFile(packagePath, 'utf8')) as {
            bopli: Record<string, unknown>;
        };
        packageDefinition.bopli.settings = {
            accent: { name: 'Accent', type: 'color', default: '#336699' },
            visible: { name: 'Visible', type: 'boolean', default: true },
        };
        await writeFile(packagePath, JSON.stringify(packageDefinition));

        const theme = await inspectTheme(root);
        const fixture = previewFixtureFor(theme);
        const source = previewHarnessSource(theme);
        const html = previewHarnessHtml(theme);

        assert.deepEqual(
            fixture.templates.map((template) => template.handle),
            Object.keys(theme.templates),
        );
        assert.deepEqual(fixture.settings, { accent: '#336699', visible: true });
        const home = fixture.templates.find((template) => template.handle === 'home');
        assert.equal((home?.props.page as { title?: string }).title, 'Home');
        assert.equal(
            (
                fixture.templates.find((template) => template.handle === 'entry')?.props.entry as {
                    body?: string;
                }
            ).body,
            "This entry was created from the theme's starter content.",
        );
        assert.equal(fixture.content['content.entries']?.length, 1);
        assert.match(source, /history\.pushState/);
        assert.match(source, /data-bopli-template/);
        assert.match(source, /fixture\.content\[query\.source\]/);
        assert.match(source, /setToolbarMinimized/);
        assert.match(source, /setSettingsOpen/);
        assert.match(html, /data-bopli-toolbar/);
        assert.match(html, /data-bopli-settings-panel[^>]+hidden/);
        assert.match(html, /data-bopli-toolbar-minimize/);
        assert.doesNotMatch(html, /bopli-preview-controls/);
    });
});

test('creates a pinned standalone-ready theme that validates and builds without edits', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'bopli-theme-create-'));
    const root = join(temporary, 'my-theme');

    try {
        const created = await createTheme('my-theme', root);
        const definition = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
            name: string;
            bopli: { handle: string; name: string };
            scripts: Record<string, string>;
            devDependencies: Record<string, string>;
        };
        const workflow = await readFile(join(root, '.github/workflows/release.yml'), 'utf8');
        const gitignore = await readFile(join(root, '.gitignore'), 'utf8');
        const eslintConfig = await readFile(join(root, 'eslint.config.js'), 'utf8');
        const tsconfig = JSON.parse(await readFile(join(root, 'tsconfig.json'), 'utf8')) as {
            include: string[];
        };

        assert.equal(created.root, root);
        assert.equal(definition.name, '@bopli-theme/my-theme');
        assert.deepEqual(definition.bopli, {
            ...definition.bopli,
            handle: 'my-theme',
            name: 'My Theme',
        });
        assert.equal(definition.scripts.dev, 'bopli-theme dev .');
        assert.equal(definition.scripts['dev:app'], 'bopli-theme dev . --app ../bopli-app');
        assert.equal(definition.scripts.lint, 'eslint . --max-warnings=0');
        assert.match(definition.scripts.build, /npm run check/);
        assert.match(definition.scripts.check, /npm test/);
        assert.equal(definition.devDependencies['@bopli/theme-cli'], '0.9.0');
        assert.equal(definition.devDependencies['@bopli/theme-sdk'], '0.6.0');
        assert.doesNotMatch(JSON.stringify(definition), /file:/);
        assert.match(eslintConfig, /eslint-plugin-vue/);
        assert(tsconfig.include.includes('tests/**/*.ts'));
        assert.match(workflow, /@theme-cli-v0\.9\.0/);
        assert.doesNotMatch(workflow, /toolkit-version/);
        assert.doesNotMatch(workflow, /__TOOLKIT_VERSION__/);
        assert.match(gitignore, /node_modules\//);
        await assert.rejects(createTheme('my-theme', root), /already exists/);

        await mkdir(join(root, 'node_modules/@bopli'), { recursive: true });
        await symlink(
            join(TOOLKIT_ROOT, 'packages/sdk'),
            join(root, 'node_modules/@bopli/theme-sdk'),
            'dir',
        );
        const theme = await inspectTheme(root);
        const fixture = previewFixtureFor(theme);
        const output = join(root, 'dist');
        await generateThemeTypes(theme);
        await buildTheme(theme, output);
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
        const content = {
            async query() {
                return {
                    data: [],
                    meta: { currentPage: 1, lastPage: 1, perPage: 10, total: 0 },
                    links: { previous: null, next: null },
                };
            },
        };

        for (const template of fixture.templates) {
            assert.equal(
                typeof (await serverModule.render({
                    template: template.handle,
                    props: template.props,
                    content,
                })),
                'string',
            );
        }
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
});

test('keeps the bundled scaffold source aligned with the checked starter theme', async () => {
    const paths = [
        'tsconfig.json',
        'resources/bopli/starter.json',
        'resources/js/templates/pages/Home.vue',
        'resources/js/templates/pages/Page.vue',
        'resources/js/templates/entries/Entry.vue',
    ];

    for (const path of paths) {
        assert.equal(
            await readFile(join(TOOLKIT_ROOT, 'packages/cli/scaffold', path), 'utf8'),
            await readFile(join(TOOLKIT_ROOT, 'starter-theme', path), 'utf8'),
            `Expected scaffold file [${path}] to match starter-theme.`,
        );
    }
    assert.equal(
        await readFile(join(TOOLKIT_ROOT, 'packages/cli/scaffold/gitignore'), 'utf8'),
        await readFile(join(TOOLKIT_ROOT, 'starter-theme/.gitignore'), 'utf8'),
    );
});

test('generates settings, field, and pre-bound template prop types from theme metadata', async () => {
    await withStarterTheme(async (root) => {
        const packagePath = join(root, 'package.json');
        const packageDefinition = JSON.parse(await readFile(packagePath, 'utf8')) as {
            bopli: Record<string, unknown>;
        };
        packageDefinition.bopli.settings = {
            accent_color: { name: 'Accent', type: 'color', default: '#112233' },
            layout: {
                name: 'Layout',
                type: 'select',
                default: 'grid',
                options: ['grid', 'list'],
            },
            portrait: { name: 'Portrait', type: 'image', default: null },
            enabled: { name: 'Enabled', type: 'boolean', default: true },
        };
        await writeFile(packagePath, JSON.stringify(packageDefinition));
        await writeTemplate(root, 'entries', 'Entry.vue', {
            name: 'Entry',
            default: true,
            fields: {
                body: { name: 'Body', type: 'long_text', required: true },
                titleCopy: { name: 'Title copy', type: 'short_text' },
                score: { name: 'Score', type: 'number' },
                image: { name: 'Image', type: 'image' },
                related: { name: 'Related', type: 'relationship' },
            },
        });

        const output = await generateThemeTypes(await inspectTheme(root));
        const declarations = await readFile(output, 'utf8');

        assert.match(declarations, /accent_color: string;/);
        assert.match(declarations, /layout: "grid" \| "list";/);
        assert.match(declarations, /portrait: BopliImage \| null;/);
        assert.match(declarations, /enabled: boolean;/);
        assert.match(
            declarations,
            /export type HomeProps = BopliPageProps<Record<string, unknown>, ThemeSettings>;/,
        );
        assert.match(declarations, /body: string;/);
        assert.match(declarations, /titleCopy\?: string \| null;/);
        assert.match(declarations, /score\?: number \| null;/);
        assert.match(declarations, /image\?: BopliImage \| null;/);
        assert.match(declarations, /related\?: BopliRelatedEntry\[\] \| null;/);
        assert.match(
            declarations,
            /export type EntryProps = BopliEntryProps<EntryEntry, ThemeSettings>;/,
        );
    });
});

test('keeps tagged releases manual-first and produces an upload-ready Actions ZIP', async () => {
    const workflow = await readFile(
        join(TOOLKIT_ROOT, '.github/workflows/release-theme.yml'),
        'utf8',
    );

    assert.match(workflow, /uses: actions\/upload-artifact@[a-f0-9]{40}/);
    assert.match(workflow, /repository: \$\{\{ job\.workflow_repository \}\}/);
    assert.match(workflow, /ref: \$\{\{ job\.workflow_sha \}\}/);
    assert.match(workflow, /path: dist\/\*\.zip/);
    assert.doesNotMatch(workflow, /toolkit-version|ln --symbolic/);
    assert.match(workflow, /name: \$\{\{ steps\.release\.outputs\.artifact \}\}/);
    assert.doesNotMatch(workflow, /R2_|THEME_ASSET_BASE_URL|aws s3|bopli:theme:install/);
});

test('packages a deterministic upload-ready ZIP with compiled files at its root', async () => {
    await withStarterTheme(async (root) => {
        await mkdir(join(root, 'node_modules/@bopli'), { recursive: true });
        await symlink(
            join(TOOLKIT_ROOT, 'packages/sdk'),
            join(root, 'node_modules/@bopli/theme-sdk'),
            'dir',
        );
        await mkdir(join(root, 'resources/images'), { recursive: true });
        await writeFile(
            join(root, 'resources/images/marker.svg'),
            '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><circle cx="4" cy="4" r="4"/></svg>',
        );
        const pageTemplate = join(root, 'resources/js/templates/pages/Page.vue');
        await writeFile(
            pageTemplate,
            `${await readFile(pageTemplate, 'utf8')}\n<style>.asset-marker { background-image: url('../../../images/marker.svg'); }</style>\n`,
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
        assert.equal(first.archive, join(output, basename(first.archive)));
        assert.deepEqual(zipEntryNames(firstBytes), expectedEntries);
        assert.match(descriptor.runtime.ssrEntry, /^\.\/assets\/theme-ssr-.*\.js$/);
        assert(descriptor.files.some((file) => `./${file.path}` === descriptor.runtime.ssrEntry));
        const imageAsset = descriptor.files.find((file) => file.path.endsWith('.svg'));
        assert(imageAsset, 'Expected the imported image to remain a separate release artifact.');
        const stylesheet = await readFile(
            join(root, 'dist', descriptor.runtime.styles[0].replace(/^\.\//, '')),
            'utf8',
        );
        assert.match(stylesheet, /marker-[^)]+\.svg/);
        assert.doesNotMatch(stylesheet, /data:image\/svg\+xml/);
        assert.equal(
            (await readFile(join(output, '.bopli-release-hash'), 'utf8')).trim(),
            first.releaseHash,
        );
        await assert.rejects(access(join(root, '.bopli-release-hash')));
        await assert.rejects(access(join(root, '.bopli-build-entry.ts')));
        await assert.rejects(access(join(root, '.bopli-build-ssr-entry.ts')));

        const browserSource = await readFile(
            join(output, descriptor.runtime.entry.replace(/^\.\//, '')),
            'utf8',
        );
        assert.doesNotMatch(browserSource, /from["']vue(?:\/[^"']*)?["']/);
        const browserModule = (await import(
            `data:text/javascript;charset=utf-8,${encodeURIComponent(browserSource)}`
        )) as { runtimeApiVersion: number; mount: unknown };
        assert.equal(browserModule.runtimeApiVersion, 1);
        assert.equal(typeof browserModule.mount, 'function');

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
                "import type { HomeProps } from '../../.bopli/types';",
                "import { useBopliQuery } from '@bopli/theme-sdk';\nimport type { HomeProps } from '../../.bopli/types';\nuseBopliQuery({ source: 'pages' });",
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
        await rm(join(root, 'resources/js/templates/entries'), {
            recursive: true,
            force: true,
        });

        await assert.rejects(inspectTheme(root), /at least one Entry template/);
    });
});

test('uses package.json as the complete theme source manifest', async () => {
    await withStarterTheme(async (root) => {
        const path = join(root, 'package.json');
        const packageDefinition = JSON.parse(await readFile(path, 'utf8')) as Record<
            string,
            unknown
        >;
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
        assert.equal(
            descriptor.files.find((file) => file.path === '__bopli/theme-ssr.js')?.sha256,
            artifact.file.sha256,
        );
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
            layout: {
                name: 'Layout',
                type: 'select',
                default: 'grid',
                options: ['list'],
            },
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

        await assert.rejects(inspectTheme(root), (error: unknown) => {
            assert(error instanceof ThemeValidationError);
            assert.equal(error.code, 'BOPLI_E013');
            assert.equal(error.file, 'resources/js/templates/entries/Entry.vue');
            assert.match(error.message, /resources\/js\/templates\/entries\/Entry\.vue/);
            return true;
        });
    });
});

test('reports a coded location when an Entry template omits fields', async () => {
    await withStarterTheme(async (root) => {
        await writeTemplate(root, 'entries', 'Entry.vue', { name: 'Entry' });

        await assert.rejects(inspectTheme(root), (error: unknown) => {
            assert(error instanceof ThemeValidationError);
            assert.equal(error.code, 'BOPLI_E012');
            assert.equal(error.file, 'resources/js/templates/entries/Entry.vue');
            assert.equal(error.line, 1);
            return true;
        });
    });
});

test('rejects invalid Entry field metadata before type generation', async () => {
    await withStarterTheme(async (root) => {
        await writeTemplate(root, 'entries', 'Entry.vue', {
            name: 'Entry',
            fields: { body: { name: 'Body', type: 'markdown' } },
        });

        await assert.rejects(inspectTheme(root), /field \[body\] has an unsupported type/);
    });
});

test('rejects imports that escape the theme repository', async () => {
    await withStarterTheme(async (root) => {
        await appendToHome(
            root,
            "\n<script setup>\nimport secret from '../../../../../outside.js';\n</script>\n",
        );

        await assert.rejects(inspectTheme(root), (error: unknown) => {
            assert(error instanceof ThemeValidationError);
            assert.equal(error.code, 'BOPLI_E021');
            assert.equal(error.file, 'resources/js/templates/pages/Home.vue');
            assert.match(error.message, /escapes the theme root/);
            return true;
        });
    });
});

test('builds a declared pure ESM package from the theme node_modules', async () => {
    await withStarterTheme(async (root) => {
        await installTestPackage(
            root,
            'tiny-esm',
            'export const answer = process.env.NODE_ENV === "production" ? 42 : 1;',
        );
        await appendToHome(
            root,
            "\n<script setup>\nimport { answer } from 'tiny-esm';\nvoid answer;\n</script>\n",
        );

        const theme = await inspectTheme(root);
        await buildTheme(theme, join(root, 'dist'));
    });
});

test('rejects unguarded privileged globals in dependency source', async () => {
    await withStarterTheme(async (root) => {
        await installTestPackage(
            root,
            'environment-reader',
            'export const secret = process.env.SECRET;',
        );
        await appendToHome(
            root,
            "\n<script setup>\nimport { secret } from 'environment-reader';\nvoid secret;\n</script>\n",
        );

        const theme = await inspectTheme(root);
        await assert.rejects(buildTheme(theme, join(root, 'dist')), (error: unknown) => {
            assert(error instanceof ThemeValidationError);
            assert.equal(error.code, 'BOPLI_E023');
            assert.match(error.file, /node_modules\/environment-reader\/index\.js/);
            return true;
        });
    });
});

test('rejects a package import that is not a direct installed dependency', async () => {
    await withStarterTheme(async (root) => {
        await appendToHome(
            root,
            "\n<script setup>\nimport value from 'uninstalled-package';\nvoid value;\n</script>\n",
        );

        await assert.rejects(inspectTheme(root), (error: unknown) => {
            assert(error instanceof ThemeValidationError);
            assert.equal(error.code, 'BOPLI_E020');
            assert.equal(error.file, 'resources/js/templates/pages/Home.vue');
            assert.match(error.message, /uninstalled-package/);
            return true;
        });
    });
});

test('rejects a dependency that leaves a Node built-in in the bundle', async () => {
    await withStarterTheme(async (root) => {
        await installTestPackage(
            root,
            'node-reader',
            "import { readFile } from 'node:fs';\nexport { readFile };",
        );
        await appendToHome(
            root,
            "\n<script setup>\nimport { readFile } from 'node-reader';\nvoid readFile;\n</script>\n",
        );

        const theme = await inspectTheme(root);
        await assert.rejects(buildTheme(theme, join(root, 'dist')), (error: unknown) => {
            assert(error instanceof ThemeValidationError);
            assert.equal(error.code, 'BOPLI_E024');
            assert.match(error.message, /node:fs/);
            return true;
        });
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

        await assert.rejects(inspectTheme(root), (error: unknown) => {
            assert(error instanceof ThemeValidationError);
            assert.equal(error.code, 'BOPLI_E023');
            assert.equal(error.file, 'resources/js/templates/pages/Home.vue');
            assert(error.line);
            return true;
        });
    });
});

test('ignores privileged words in Vue templates, styles, strings, and comments', async () => {
    await withStarterTheme(async (root) => {
        const path = join(root, 'resources/js/templates/pages/Home.vue');
        const contents = await readFile(path, 'utf8');
        await writeFile(
            path,
            contents
                .replace('<main>', '<main><p>Our process is simple and uses a global audience.</p>')
                .replace(
                    'defineProps<HomeProps>();',
                    "defineProps<HomeProps>();\nconst copy = 'process global Buffer require';\n// process.env is prose\nvoid copy;",
                )
                .replace('main {', '/* process and :global(.example) are CSS text */\nmain {'),
        );

        await inspectTheme(root);
    });
});

test('reads the real bopli block and ignores one inside an HTML comment', async () => {
    await withStarterTheme(async (root) => {
        const path = join(root, 'resources/js/templates/pages/Home.vue');
        const contents = await readFile(path, 'utf8');
        await writeFile(
            path,
            `<!-- <bopli lang="json">{"name":"Commented"}</bopli> -->\n${contents}`,
        );

        const theme = await inspectTheme(root);
        assert.equal(theme.templates.home?.name, 'Home');
    });
});

test('ignores template junk files but names unsupported directories', async () => {
    await withStarterTheme(async (root) => {
        const templateRoot = join(root, 'resources/js/templates/pages');
        await writeFile(join(templateRoot, '.DS_Store'), 'metadata');
        await writeFile(join(templateRoot, 'Home.vue.swp'), 'swap');

        await inspectTheme(root);

        await mkdir(join(templateRoot, 'partials'));
        await assert.rejects(inspectTheme(root), (error: unknown) => {
            assert(error instanceof ThemeValidationError);
            assert.equal(error.code, 'BOPLI_E004');
            assert.match(error.message, /partials/);
            assert.equal(error.file, 'resources/js/templates/pages/partials');
            return true;
        });
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

    assert.deepEqual(
        developmentRegistrationArguments(
            'http://host.docker.internal:5174/theme.json',
            'http://localhost:5174',
            'app-php',
        ).slice(0, 5),
        ['compose', 'exec', '-T', 'app-php', 'php'],
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
    const script = addition.match(/<script setup>\s*([\s\S]*?)\s*<\/script>/)?.[1] ?? addition;
    await writeFile(path, contents.replace('</script>', `${script}\n</script>`));
}

async function installTestPackage(root: string, name: string, source: string): Promise<void> {
    await mkdir(join(root, 'node_modules/@bopli'), { recursive: true });
    await symlink(
        join(TOOLKIT_ROOT, 'packages/sdk'),
        join(root, 'node_modules/@bopli/theme-sdk'),
        'dir',
    );
    const packagePath = join(root, 'node_modules', ...name.split('/'));
    await mkdir(packagePath, { recursive: true });
    await writeFile(
        join(packagePath, 'package.json'),
        JSON.stringify({
            name,
            version: '1.0.0',
            type: 'module',
            exports: './index.js',
        }),
    );
    await writeFile(join(packagePath, 'index.js'), source);

    const themePackagePath = join(root, 'package.json');
    const themePackage = JSON.parse(await readFile(themePackagePath, 'utf8')) as {
        dependencies?: Record<string, string>;
    };
    themePackage.dependencies = { ...themePackage.dependencies, [name]: '1.0.0' };
    await writeFile(themePackagePath, JSON.stringify(themePackage));
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
    for (
        let offset = archive.length - 22;
        offset >= Math.max(0, archive.length - 65_557);
        offset--
    ) {
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
