import vue from '@vitejs/plugin-vue';
import {
    copyFile,
    mkdir,
    readFile,
    readdir,
    rm,
    stat,
    writeFile,
} from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { build } from 'vite';
import { SDK_PATH, VUE_PATH } from './constants.js';
import { descriptorFor } from './descriptor.js';
import { runtimePlugin, runtimeSource } from './runtime.js';
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

    const preview = await copyPreview(theme, output);
    const inventory = await fileInventory(output);
    const entry = inventory.find((file) => /^assets\/theme-.*\.js$/.test(file.path))?.path;
    const styles = inventory
        .filter((file) => file.path.endsWith('.css'))
        .map((file) => `./${file.path}`);
    if (!entry) throw new Error('Vite did not emit a theme entry module.');

    const releaseHash = sha256(
        inventory.map((file) => `${file.path}:${file.sha256}`).join('\n'),
    ).slice(0, 24);
    const descriptor = descriptorFor(
        theme,
        `./${entry}`,
        styles,
        inventory,
        preview ? `./${preview}` : null,
    );
    await writeFile(join(output, 'theme.json'), `${JSON.stringify(descriptor, null, 2)}\n`);
    await writeFile(join(theme.root, '.bopli-release-hash'), `${releaseHash}\n`);

    return releaseHash;
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
