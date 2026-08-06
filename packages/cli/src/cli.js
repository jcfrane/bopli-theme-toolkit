import vue from '@vitejs/plugin-vue';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
    copyFile,
    lstat,
    mkdir,
    readFile,
    readdir,
    realpath,
    rm,
    stat,
    writeFile,
} from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import { build, createServer } from 'vite';

const RUNTIME_API_VERSION = 1;
const VIRTUAL_ENTRY = 'virtual:bopli-theme-entry';
const RESOLVED_VIRTUAL_ENTRY = '\0bopli:theme-entry';
const PUBLIC_DEV_ENTRY = '/__bopli/theme-entry.js';
const SDK_PATH = fileURLToPath(import.meta.resolve('@bopli/theme-sdk'));
const VUE_PATH = resolve(dirname(fileURLToPath(import.meta.resolve('vue'))), 'dist/vue.runtime.esm-bundler.js');
const ALLOWED_PACKAGES = new Set(['vue', '@bopli/theme-sdk']);
const IMPORT_PATTERN = /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

export async function run(argv) {
    const command = argv[0];
    const sourceArgument = argv[1] && !argv[1].startsWith('--') ? argv[1] : '.';
    const sourceRoot = await realpath(resolve(sourceArgument));
    const options = parseOptions(argv.slice(sourceArgument === '.' ? 1 : 2));

    if (!['validate', 'build', 'dev'].includes(command)) {
        throw new Error('Usage: bopli-theme <validate|build|dev> [theme-path] [--out-dir dist] [--port 5174] [--app ../bopli-app]');
    }

    const theme = await inspectTheme(sourceRoot);

    if (command === 'validate') {
        process.stdout.write(`Theme [${theme.handle}] ${theme.version} is valid with ${Object.keys(theme.templates).length} templates.\n`);
        return;
    }

    if (command === 'build') {
        const output = resolve(sourceRoot, options['out-dir'] ?? 'dist');
        const releaseHash = await buildTheme(theme, output);
        process.stdout.write(`Built [${theme.handle}] ${theme.version} to [${output}] with release hash [${releaseHash}].\n`);
        return;
    }

    await serveTheme(theme, options);
}

function parseOptions(args) {
    const options = {};

    for (let index = 0; index < args.length; index++) {
        const argument = args[index];
        if (!argument.startsWith('--')) {
            continue;
        }

        const [rawName, inlineValue] = argument.slice(2).split('=', 2);
        if (inlineValue !== undefined) {
            options[rawName] = inlineValue;
        } else if (args[index + 1] && !args[index + 1].startsWith('--')) {
            options[rawName] = args[++index];
        } else {
            options[rawName] = true;
        }
    }

    return options;
}

export async function inspectTheme(root) {
    await assertNoSymlinks(root);
    const composerPath = join(root, 'composer.json');
    const composer = JSON.parse(await readFile(composerPath, 'utf8'));
    const bopli = composer?.extra?.bopli;

    if (composer.type !== 'bopli-theme' || typeof composer.version !== 'string' || !bopli) {
        throw new Error('composer.json must declare a bopli-theme type, version, and extra.bopli metadata.');
    }
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(bopli.handle ?? '') || typeof bopli.name !== 'string') {
        throw new Error('extra.bopli must contain a valid handle and name.');
    }
    if (!semver.valid(composer.version) || !semver.validRange(bopli.constraint)) {
        throw new Error('The theme version and Bopli constraint must be valid semver values.');
    }

    const templates = {};
    for (const [directory, kind] of [['pages', 'page'], ['entries', 'entry']]) {
        const templateRoot = join(root, 'resources/js/templates', directory);
        let entries = [];
        try {
            entries = await readdir(templateRoot, { withFileTypes: true });
        } catch (error) {
            if (error?.code !== 'ENOENT') throw error;
        }

        for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
            if (!entry.isFile() || extname(entry.name) !== '.vue') {
                throw new Error(`Template directory [${directory}] may contain only top-level Vue files.`);
            }
            const handle = snakeCase(entry.name.slice(0, -4));
            if (templates[handle]) {
                throw new Error(`Template handle [${handle}] is declared more than once.`);
            }

            const file = join(templateRoot, entry.name);
            const contents = await readFile(file, 'utf8');
            const metadata = parseMetadata(contents, `${directory}/${entry.name}`);
            if (kind === 'entry' && (!metadata.fields || Object.keys(metadata.fields).length === 0)) {
                throw new Error(`Entry template [${directory}/${entry.name}] must declare fields.`);
            }
            if (kind === 'page' && metadata.fields) {
                throw new Error(`Page template [${directory}/${entry.name}] may not declare fields.`);
            }
            if (kind === 'entry' && metadata.slots) {
                throw new Error(`Entry template [${directory}/${entry.name}] may not declare slots.`);
            }

            templates[handle] = {
                name: metadata.name ?? headline(handle),
                kind,
                ...(kind === 'page' ? { slots: metadata.slots ?? {} } : { fields: metadata.fields }),
                source: `/resources/js/templates/${directory}/${entry.name}`,
            };
        }
    }

    if (Object.keys(templates).length === 0) {
        throw new Error('The theme does not declare any page or entry templates.');
    }

    await validateImports(root);

    const author = typeof bopli.author === 'string'
        ? bopli.author
        : Array.isArray(composer.authors) && typeof composer.authors[0]?.name === 'string'
            ? composer.authors[0].name
            : null;

    return {
        root,
        handle: bopli.handle,
        name: bopli.name,
        version: composer.version,
        constraint: bopli.constraint,
        description: composer.description ?? null,
        author,
        colorModes: Array.isArray(bopli.colorModes) ? bopli.colorModes : [],
        previewSource: typeof bopli.preview === 'string' ? bopli.preview : null,
        templates,
    };
}

function parseMetadata(contents, file) {
    const match = contents.match(/<bopli\b[^>]*>([\s\S]*?)<\/bopli>/);
    if (!match) return {};

    try {
        const metadata = JSON.parse(match[1]);
        if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') throw new Error();
        return metadata;
    } catch {
        throw new Error(`Template [${file}] contains invalid JSON in its <bopli> block.`);
    }
}

async function validateImports(root) {
    const files = await sourceFiles(join(root, 'resources'));
    const canonicalRoot = await realpath(root);

    for (const file of files) {
        const contents = await readFile(file, 'utf8');
        if (/import\.meta\.(?:glob|env)\b/.test(contents)) {
            throw new Error(`Vite glob and environment access is not allowed in [${relative(root, file)}].`);
        }
        if (/import\(\s*(?!["'])/.test(contents)) {
            throw new Error(`Non-literal dynamic import is not allowed in [${relative(root, file)}].`);
        }

        for (const match of contents.matchAll(IMPORT_PATTERN)) {
            const specifier = match[1] ?? match[2];
            if (ALLOWED_PACKAGES.has(specifier)) continue;
            if (!specifier.startsWith('.')) {
                throw new Error(`Import [${specifier}] is not allowed in [${relative(root, file)}].`);
            }

            const target = resolve(dirname(file), specifier);
            const relativeTarget = relative(canonicalRoot, target);
            if (relativeTarget === '..' || relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)) {
                throw new Error(`Import [${specifier}] escapes the theme root in [${relative(root, file)}].`);
            }
        }
    }
}

function importBoundaryPlugin(theme) {
    const canonicalRoot = resolve(theme.root);

    return {
        name: 'bopli-theme-import-boundary',
        enforce: 'pre',
        resolveId(source, importer) {
            if (!importer) return null;

            const cleanImporter = importer.split('?', 1)[0];
            const importerRelative = relative(canonicalRoot, cleanImporter);
            if (importerRelative === '..' || importerRelative.startsWith(`..${sep}`) || isAbsolute(importerRelative)) {
                return null;
            }

            const cleanSource = source.split(/[?#]/, 1)[0];
            if (!cleanSource.startsWith('.') && !cleanSource.startsWith('/')) return null;

            const target = cleanSource.startsWith('/')
                ? resolve(canonicalRoot, `.${cleanSource}`)
                : resolve(dirname(cleanImporter), cleanSource);
            const targetRelative = relative(canonicalRoot, target);
            if (targetRelative === '..' || targetRelative.startsWith(`..${sep}`) || isAbsolute(targetRelative)) {
                throw new Error(`Resolved import [${source}] escapes the theme root in [${importerRelative}].`);
            }

            return null;
        },
    };
}

async function sourceFiles(root) {
    const files = [];
    let entries = [];
    try {
        entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
        if (error?.code === 'ENOENT') return files;
        throw error;
    }

    for (const entry of entries) {
        const path = join(root, entry.name);
        if (entry.isDirectory()) files.push(...await sourceFiles(path));
        else if (['.vue', '.js', '.ts', '.css'].includes(extname(entry.name))) files.push(path);
    }
    return files;
}

async function assertNoSymlinks(root) {
    for (const entry of await readdir(root, { withFileTypes: true })) {
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') continue;
        const path = join(root, entry.name);
        if ((await lstat(path)).isSymbolicLink()) throw new Error('Theme sources may not contain symbolic links.');
        if (entry.isDirectory()) await assertNoSymlinks(path);
    }
}

function runtimePlugin(theme, devDescriptor) {
    return {
        name: 'bopli-theme-runtime',
        resolveId(id) {
            if (id === VIRTUAL_ENTRY || id === PUBLIC_DEV_ENTRY) return RESOLVED_VIRTUAL_ENTRY;
            if (id === '@bopli/theme-sdk') return SDK_PATH;
        },
        load(id) {
            if (id === RESOLVED_VIRTUAL_ENTRY) return runtimeSource(theme);
        },
        configureServer(server) {
            if (!devDescriptor) return;
            server.middlewares.use('/theme.json', (_request, response) => {
                response.setHeader('Content-Type', 'application/json');
                response.setHeader('Cache-Control', 'no-store');
                response.end(JSON.stringify(devDescriptor));
            });
        },
    };
}

function runtimeSource(theme) {
    const imports = [];
    const registrations = [];
    let index = 0;
    for (const [handle, template] of Object.entries(theme.templates)) {
        const identifier = `Template${index++}`;
        imports.push(`import ${identifier} from ${JSON.stringify(template.source)};`);
        registrations.push(`${JSON.stringify(handle)}: ${identifier}`);
    }

    return `
import { createApp, defineComponent, h, shallowReactive } from 'vue';
import { BOPLI_NAVIGATION_KEY } from '@bopli/theme-sdk';
${imports.join('\n')}
const templates = { ${registrations.join(', ')} };
export const runtimeApiVersion = ${RUNTIME_API_VERSION};
export function mount({ element, template, props, navigation }) {
    if (!templates[template]) throw new Error('Unknown theme template: ' + template);
    const state = shallowReactive({ template, props });
    const Root = defineComponent({
        name: 'BopliThemeRoot',
        setup: () => () => h(templates[state.template], state.props),
    });
    const app = createApp(Root);
    app.provide(BOPLI_NAVIGATION_KEY, navigation);
    app.mount(element);
    const handleClick = (event) => {
        const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
        if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
            || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search && url.hash)) return;
        event.preventDefault();
        navigation.visit(url.pathname + url.search + url.hash);
    };
    element.addEventListener('click', handleClick);
    return {
        update(next) {
            if (!templates[next.template]) throw new Error('Unknown theme template: ' + next.template);
            state.template = next.template;
            state.props = next.props;
        },
        unmount() {
            element.removeEventListener('click', handleClick);
            app.unmount();
        },
    };
}
`;
}

async function buildTheme(theme, output) {
    await rm(output, { recursive: true, force: true });
    const buildEntry = join(theme.root, '.bopli-build-entry.js');
    await writeFile(buildEntry, runtimeSource(theme));

    try {
        await build({
            root: theme.root,
            configFile: false,
            plugins: [importBoundaryPlugin(theme), runtimePlugin(theme), vue()],
            resolve: { alias: { '@bopli/theme-sdk': SDK_PATH, vue: VUE_PATH } },
            build: {
                outDir: output,
                emptyOutDir: true,
                cssCodeSplit: false,
                minify: 'oxc',
                lib: { entry: buildEntry, formats: ['es'], fileName: 'theme' },
                rollupOptions: {
                    output: {
                        entryFileNames: 'assets/theme-[hash].js',
                        chunkFileNames: 'assets/chunk-[hash].js',
                        assetFileNames: 'assets/[name]-[hash][extname]',
                    },
                },
            },
        });
    } finally {
        await rm(buildEntry, { force: true });
    }

    let preview = null;
    if (theme.previewSource) {
        const source = resolve(theme.root, theme.previewSource);
        const relativeSource = relative(theme.root, source);
        if (relativeSource.startsWith('..') || isAbsolute(relativeSource) || !(await stat(source)).isFile()) {
            throw new Error('The configured theme preview must be a file inside the theme root.');
        }
        preview = `preview/${source.split(sep).pop()}`;
        await mkdir(join(output, 'preview'), { recursive: true });
        await copyFile(source, join(output, preview));
    }

    const inventory = await fileInventory(output);
    const entry = inventory.find((file) => /^assets\/theme-.*\.js$/.test(file.path))?.path;
    const styles = inventory.filter((file) => file.path.endsWith('.css')).map((file) => `./${file.path}`);
    if (!entry) throw new Error('Vite did not emit a theme entry module.');

    const releaseHash = sha256(inventory.map((file) => `${file.path}:${file.sha256}`).join('\n')).slice(0, 24);
    const descriptor = descriptorFor(theme, `./${entry}`, styles, inventory, preview ? `./${preview}` : null);
    await writeFile(join(output, 'theme.json'), `${JSON.stringify(descriptor, null, 2)}\n`);
    await writeFile(join(theme.root, '.bopli-release-hash'), `${releaseHash}\n`);

    return releaseHash;
}

async function fileInventory(root, current = root) {
    const files = [];
    for (const entry of await readdir(current, { withFileTypes: true })) {
        const path = join(current, entry.name);
        if (entry.isDirectory()) files.push(...await fileInventory(root, path));
        else if (entry.name !== 'theme.json') {
            const contents = await readFile(path);
            files.push({
                path: relative(root, path).split(sep).join('/'),
                size: contents.byteLength,
                sha256: sha256(contents),
            });
        }
    }
    return files.sort((left, right) => left.path.localeCompare(right.path));
}

function descriptorFor(theme, entry, styles, files, preview) {
    const templates = Object.fromEntries(Object.entries(theme.templates).map(([handle, template]) => {
        const { source: _source, ...publicTemplate } = template;
        return [handle, publicTemplate];
    }));

    return {
        schemaVersion: 3,
        runtimeApiVersion: RUNTIME_API_VERSION,
        handle: theme.handle,
        name: theme.name,
        description: theme.description,
        author: theme.author,
        version: theme.version,
        bopli: theme.constraint,
        preview,
        colorModes: theme.colorModes,
        templates,
        runtime: { entry, styles },
        files,
    };
}

async function serveTheme(theme, options) {
    const port = Number(options.port ?? 5174);
    const descriptor = descriptorFor(theme, `.${PUBLIC_DEV_ENTRY}`, [], [{
        path: PUBLIC_DEV_ENTRY.slice(1),
        size: 1,
        sha256: '0'.repeat(64),
    }], null);
    const server = await createServer({
        root: theme.root,
        configFile: false,
        plugins: [importBoundaryPlugin(theme), runtimePlugin(theme, descriptor), vue()],
        resolve: { alias: { '@bopli/theme-sdk': SDK_PATH, vue: VUE_PATH } },
        optimizeDeps: { exclude: ['vue'] },
        server: {
            host: '0.0.0.0',
            port,
            strictPort: true,
            allowedHosts: ['localhost', 'host.docker.internal'],
            cors: {
                origin: /^http:\/\/([a-z0-9-]+\.)?(admin\.)?localhost(?::\d+)?$/,
            },
        },
    });
    await server.listen();

    const publicOrigin = `http://localhost:${port}`;
    const containerUrl = `http://host.docker.internal:${port}/theme.json`;
    if (typeof options.app === 'string') {
        const appPath = await realpath(resolve(options.app));
        const descriptorDirectory = join(appPath, 'storage/framework/theme-dev');
        await mkdir(descriptorDirectory, { recursive: true });
        await writeFile(
            join(descriptorDirectory, `${theme.handle}.json`),
            `${JSON.stringify(descriptor, null, 2)}\n`,
        );
        const registration = spawn('docker', [
            'compose', 'exec', '-T', 'php', 'php', 'artisan', 'bopli:theme:install', containerUrl,
            '--development', `--public-origin=${publicOrigin}`,
        ], { cwd: appPath, stdio: 'inherit' });
        const exitCode = await new Promise((resolveExit, rejectExit) => {
            registration.once('error', rejectExit);
            registration.once('close', resolveExit);
        });
        if (exitCode !== 0) {
            await server.close();
            throw new Error('The local Bopli application could not register the development release.');
        }
    }

    process.stdout.write(`Serving [${theme.handle}] at ${publicOrigin}. Press Ctrl+C to stop.\n`);
}

function snakeCase(value) {
    return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[-\s]+/g, '_').toLowerCase();
}

function headline(value) {
    return value.split(/[_-]/).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}
