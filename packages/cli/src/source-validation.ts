import { lstat, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { ALLOWED_PACKAGES, IMPORT_PATTERN } from './constants.js';
import type { ThemeDefinition } from './types.js';
import { isFileSystemError } from './utilities.js';

export async function assertNoSymlinks(root: string): Promise<void> {
    for (const entry of await readdir(root, { withFileTypes: true })) {
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') continue;
        const path = join(root, entry.name);
        if ((await lstat(path)).isSymbolicLink()) {
            throw new Error('Theme sources may not contain symbolic links.');
        }
        if (entry.isDirectory()) await assertNoSymlinks(path);
    }
}

export async function validateImports(root: string): Promise<void> {
    const files = await sourceFiles(join(root, 'resources'));
    const canonicalRoot = resolve(root);

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
            if (!specifier) continue;
            if (ALLOWED_PACKAGES.has(specifier)) continue;
            if (!specifier.startsWith('.')) {
                throw new Error(`Import [${specifier}] is not allowed in [${relative(root, file)}].`);
            }

            const target = resolve(dirname(file), specifier);
            const relativeTarget = relative(canonicalRoot, target);
            if (
                relativeTarget === '..' ||
                relativeTarget.startsWith(`..${sep}`) ||
                isAbsolute(relativeTarget)
            ) {
                throw new Error(`Import [${specifier}] escapes the theme root in [${relative(root, file)}].`);
            }
        }
    }
}

export function importBoundaryPlugin(theme: ThemeDefinition): Plugin {
    const canonicalRoot = resolve(theme.root);

    return {
        name: 'bopli-theme-import-boundary',
        enforce: 'pre',
        resolveId(source, importer) {
            if (!importer) return null;

            const cleanImporter = importer.split('?', 1)[0] as string;
            const importerRelative = relative(canonicalRoot, cleanImporter);
            if (
                importerRelative === '..' ||
                importerRelative.startsWith(`..${sep}`) ||
                isAbsolute(importerRelative)
            ) {
                return null;
            }

            const cleanSource = source.split(/[?#]/, 1)[0] as string;
            if (!cleanSource.startsWith('.') && !cleanSource.startsWith('/')) return null;

            const target = cleanSource.startsWith('/')
                ? resolve(canonicalRoot, `.${cleanSource}`)
                : resolve(dirname(cleanImporter), cleanSource);
            const targetRelative = relative(canonicalRoot, target);
            if (
                targetRelative === '..' ||
                targetRelative.startsWith(`..${sep}`) ||
                isAbsolute(targetRelative)
            ) {
                throw new Error(`Resolved import [${source}] escapes the theme root in [${importerRelative}].`);
            }

            return null;
        },
    };
}

async function sourceFiles(root: string): Promise<string[]> {
    const files: string[] = [];
    let entries;

    try {
        entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
        if (isFileSystemError(error, 'ENOENT')) return files;
        throw error;
    }

    for (const entry of entries) {
        const path = join(root, entry.name);
        if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
        else if (['.vue', '.js', '.ts', '.css'].includes(extname(entry.name))) files.push(path);
    }

    return files;
}
