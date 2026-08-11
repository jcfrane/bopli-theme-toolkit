import vue from '@vitejs/plugin-vue';
import {
    copyFile,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
    stat,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { build } from 'vite';
import { SDK_PATH, SERVER_RENDERER_PATH, VUE_PATH } from './constants.js';
import { descriptorFor } from './descriptor.js';
import { runtimePlugin, runtimeSource, serverRuntimeSource } from './runtime.js';
import { importBoundaryPlugin } from './source-validation.js';
import type { ThemeDefinition, ThemeFile } from './types.js';
import { sha256 } from './utilities.js';

export async function buildTheme(theme: ThemeDefinition, output: string): Promise<string> {
    await rm(output, { recursive: true, force: true });
    const buildEntry = join(theme.root, '.bopli-build-entry.ts');
    await writeFile(buildEntry, runtimeSource(theme));

    try {
        await build({
            root: theme.root,
            configFile: false,
            plugins: [importBoundaryPlugin(theme), runtimePlugin(theme), vue()],
            resolve: { alias: [
                { find: /^@bopli\/theme-sdk$/, replacement: SDK_PATH },
                { find: /^@vue\/server-renderer$/, replacement: SERVER_RENDERER_PATH },
                { find: /^vue\/server-renderer$/, replacement: SERVER_RENDERER_PATH },
                { find: /^vue$/, replacement: VUE_PATH },
            ] },
            build: {
                outDir: output,
                emptyOutDir: true,
                assetsInlineLimit: 0,
                cssCodeSplit: false,
                minify: 'oxc',
                modulePreload: false,
                rollupOptions: {
                    input: buildEntry,
                    preserveEntrySignatures: 'strict',
                    output: {
                        format: 'es',
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
    await compileServerRuntime(theme, output, false);

    const preview = await copyPreview(theme, output);
    const inventory = await fileInventory(output);
    const entry = inventory.find((file) => /^assets\/theme-(?!ssr-).*\.js$/.test(file.path))?.path;
    const ssrEntry = inventory.find((file) => /^assets\/theme-ssr-.*\.js$/.test(file.path))?.path;
    const styles = inventory
        .filter((file) => file.path.endsWith('.css'))
        .map((file) => `./${file.path}`);
    if (!entry) throw new Error('Vite did not emit a theme entry module.');
    if (!ssrEntry) throw new Error('Vite did not emit a theme server entry module.');

    const releaseHash = sha256(
        inventory.map((file) => `${file.path}:${file.sha256}`).join('\n'),
    ).slice(0, 24);
    const descriptor = descriptorFor(
        theme,
        `./${entry}`,
        `./${ssrEntry}`,
        styles,
        inventory,
        preview ? `./${preview}` : null,
    );
    await writeFile(join(output, 'theme.json'), `${JSON.stringify(descriptor, null, 2)}\n`);
    await writeFile(join(theme.root, '.bopli-release-hash'), `${releaseHash}\n`);

    return releaseHash;
}

export async function developmentServerArtifact(theme: ThemeDefinition): Promise<{
    contents: string;
    file: ThemeFile;
}> {
    const output = await mkdtemp(join(tmpdir(), 'bopli-theme-ssr-'));

    try {
        await compileServerRuntime(theme, output, true);
        const inventory = await fileInventory(output);
        const file = inventory.find((candidate) => /^assets\/theme-ssr-.*\.js$/.test(candidate.path));
        if (!file) throw new Error('Vite did not emit a development theme server entry module.');

        return { contents: await readFile(join(output, file.path), 'utf8'), file };
    } finally {
        await rm(output, { recursive: true, force: true });
    }
}

async function compileServerRuntime(
    theme: ThemeDefinition,
    output: string,
    emptyOutDir: boolean,
): Promise<void> {
    const serverBuildEntry = join(theme.root, '.bopli-build-ssr-entry.ts');
    await writeFile(serverBuildEntry, serverRuntimeSource(theme));

    try {
        await build({
            root: theme.root,
            configFile: false,
            plugins: [importBoundaryPlugin(theme), vue()],
            resolve: { alias: [
                { find: /^@bopli\/theme-sdk$/, replacement: SDK_PATH },
                { find: /^@vue\/server-renderer$/, replacement: SERVER_RENDERER_PATH },
                { find: /^vue\/server-renderer$/, replacement: SERVER_RENDERER_PATH },
                { find: /^vue$/, replacement: VUE_PATH },
            ] },
            ssr: { noExternal: true },
            build: {
                ssr: serverBuildEntry,
                outDir: output,
                emptyOutDir,
                minify: 'oxc',
                rollupOptions: {
                    output: {
                        entryFileNames: 'assets/theme-ssr-[hash].js',
                        codeSplitting: false,
                    },
                },
            },
        });
    } finally {
        await rm(serverBuildEntry, { force: true });
    }
}

async function copyPreview(theme: ThemeDefinition, output: string): Promise<string | null> {
    if (!theme.previewSource) return null;

    const source = resolve(theme.root, theme.previewSource);
    const relativeSource = relative(theme.root, source);
    if (
        relativeSource.startsWith('..') ||
        isAbsolute(relativeSource) ||
        !(await stat(source)).isFile()
    ) {
        throw new Error('The configured theme preview must be a file inside the theme root.');
    }

    const filename = source.split(sep).pop();
    if (!filename) throw new Error('The configured theme preview has no filename.');
    const preview = `preview/${filename}`;
    await mkdir(join(output, 'preview'), { recursive: true });
    await copyFile(source, join(output, preview));

    return preview;
}

async function fileInventory(root: string, current = root): Promise<ThemeFile[]> {
    const files: ThemeFile[] = [];

    for (const entry of await readdir(current, { withFileTypes: true })) {
        const path = join(current, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await fileInventory(root, path)));
        } else if (entry.name !== 'theme.json') {
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
