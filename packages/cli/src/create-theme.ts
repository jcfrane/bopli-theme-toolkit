import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { headline, isFileSystemError } from './utilities.js';

export type CreatedTheme = {
    handle: string;
    root: string;
};

export async function createTheme(
    handle: string,
    directory = handle,
    workingDirectory = process.cwd(),
): Promise<CreatedTheme> {
    if (!/^[a-z0-9](?:[a-z0-9_-]{0,78}[a-z0-9])?$/.test(handle)) {
        throw new Error(
            'A generated theme handle must use 1–80 lowercase letters, numbers, hyphens, or underscores.',
        );
    }

    const root = resolve(workingDirectory, directory);
    await assertTargetDoesNotExist(root);
    const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const scaffoldRoot = resolve(packageRoot, 'scaffold');

    await mkdir(dirname(root), { recursive: true });
    try {
        await cp(scaffoldRoot, root, { recursive: true, errorOnExist: true, force: false });
        await rename(resolve(root, 'gitignore'), resolve(root, '.gitignore'));
        await personalizePackage(root, packageRoot, handle);
        await personalizeWorkflow(root, packageRoot);
    } catch (error) {
        await rm(root, { recursive: true, force: true });
        throw error;
    }

    return { handle, root };
}

async function assertTargetDoesNotExist(root: string): Promise<void> {
    try {
        await stat(root);
    } catch (error) {
        if (isFileSystemError(error, 'ENOENT')) return;
        throw error;
    }

    throw new Error(`The target directory [${root}] already exists.`);
}

async function personalizePackage(
    root: string,
    packageRoot: string,
    handle: string,
): Promise<void> {
    const cliPackage = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8')) as {
        version: string;
        dependencies: Record<string, string>;
    };
    const path = resolve(root, 'package.json');
    const definition = JSON.parse(await readFile(path, 'utf8')) as {
        name: string;
        bopli: { handle: string; name: string };
        devDependencies: Record<string, string>;
    };

    definition.name = `@bopli-theme/${handle}`;
    definition.bopli.handle = handle;
    definition.bopli.name = headline(handle);
    definition.devDependencies['@bopli/theme-cli'] = cliPackage.version;
    definition.devDependencies['@bopli/theme-sdk'] =
        cliPackage.dependencies['@bopli/theme-sdk'] ?? '';

    await writeFile(path, `${JSON.stringify(definition, null, 4)}\n`);
}

async function personalizeWorkflow(root: string, packageRoot: string): Promise<void> {
    const cliPackage = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8')) as {
        version: string;
    };
    const path = resolve(root, '.github/workflows/release.yml');
    const workflow = await readFile(path, 'utf8');

    await writeFile(path, workflow.replaceAll('__TOOLKIT_VERSION__', cliPackage.version));
}
