import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';
import { buildTheme } from './build-theme.js';
import type { ThemeDefinition } from './types.js';

const ARCHIVE_MTIME = new Date(2000, 0, 1, 0, 0, 0);

export interface PackagedThemeRelease {
    archive: string;
    releaseHash: string;
}

/** Builds one theme and writes an upload-ready deterministic ZIP beside the theme source. */
export async function packageTheme(
    theme: ThemeDefinition,
    output: string,
): Promise<PackagedThemeRelease> {
    const releaseHash = await buildTheme(theme, output);
    const archive = join(theme.root, `${theme.handle}-${theme.version}-${releaseHash}.zip`);

    await writeReleaseArchive(output, archive);

    return { archive, releaseHash };
}

/** Writes path-sorted dist files at the archive root with stable ZIP metadata. */
async function writeReleaseArchive(output: string, archive: string): Promise<void> {
    const outputRoot = resolve(output);
    const archivePath = resolve(archive);
    const archiveRelativeToOutput = relative(outputRoot, archivePath);
    if (archiveRelativeToOutput === '' || (!archiveRelativeToOutput.startsWith('..') && !isAbsolute(archiveRelativeToOutput))) {
        throw new Error('The packaged release ZIP must be written outside its dist directory.');
    }

    const files = await releaseFiles(outputRoot);
    if (!files.includes('theme.json')) {
        throw new Error('The compiled release does not contain theme.json.');
    }

    await mkdir(dirname(archivePath), { recursive: true });
    const temporary = `${archivePath}.${process.pid}.tmp`;
    await rm(temporary, { force: true });
    const zip = new ZipFile();

    try {
        for (const path of files) {
            zip.addBuffer(await readFile(join(outputRoot, path)), path, {
                mtime: ARCHIVE_MTIME,
                mode: 0o100644,
                compress: true,
                compressionLevel: 9,
                forceDosTimestamp: true,
            });
        }

        const completed = pipeline(zip.outputStream, createWriteStream(temporary, { flags: 'wx' }));
        zip.end();
        await completed;
        await rm(archivePath, { force: true });
        await rename(temporary, archivePath);
    } catch (error) {
        await rm(temporary, { force: true });
        throw error;
    }
}

/** Returns all regular compiled files with normalized, locale-independent path ordering. */
async function releaseFiles(root: string, current = root): Promise<string[]> {
    const files: string[] = [];

    for (const entry of await readdir(current, { withFileTypes: true })) {
        const path = join(current, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await releaseFiles(root, path)));
        } else if (entry.isFile()) {
            files.push(relative(root, path).split(sep).join('/'));
        } else {
            throw new Error(`Compiled release entry [${relative(root, path)}] must be a regular file.`);
        }
    }

    return files.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
}
