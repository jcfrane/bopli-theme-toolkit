import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildTheme } from './build-theme.js';
import { createTheme } from './create-theme.js';
import { inspectTheme } from './inspect-theme.js';
import { packageTheme } from './package-theme.js';
import {
    developmentDescriptorFor,
    developmentRegistrationArguments,
    serveTheme,
} from './serve-theme.js';
import { generateThemeTypes } from './type-generation.js';
import { parseOptions } from './utilities.js';

export {
    inspectTheme,
    packageTheme,
    developmentDescriptorFor,
    developmentRegistrationArguments,
    generateThemeTypes,
    createTheme,
};

export async function run(argv: string[]): Promise<void> {
    const command = argv[0];

    if (command === 'create') {
        const handle = argv[1];
        if (!handle || handle.startsWith('--')) {
            throw new Error('Usage: bopli-theme create <handle> [--dir theme-directory]');
        }
        const options = parseOptions(argv.slice(2));
        const directory = options.dir;
        if (directory !== undefined && typeof directory !== 'string') {
            throw new Error('The --dir option must specify a directory.');
        }
        const created = await createTheme(handle, directory ?? handle);
        process.stdout.write(
            `Created theme [${created.handle}] at [${created.root}].\n\nNext steps:\n  cd ${created.root}\n  npm install\n  npm run dev\n`,
        );
        return;
    }

    const sourceArgument = argv[1] && !argv[1].startsWith('--') ? argv[1] : '.';
    const sourceRoot = await realpath(resolve(sourceArgument));
    const options = parseOptions(argv.slice(sourceArgument === '.' ? 1 : 2));

    if (
        command !== 'validate' &&
        command !== 'types' &&
        command !== 'build' &&
        command !== 'package' &&
        command !== 'dev'
    ) {
        throw new Error(
            'Usage: bopli-theme <create|validate|types|build|package|dev> [theme-path] [--out-dir dist] [--port 5174] [--standalone] [--app ../bopli-app] [--docker-service php]',
        );
    }

    const theme = await inspectTheme(sourceRoot);

    if (command === 'validate') {
        process.stdout.write(
            `Theme [${theme.handle}] ${theme.version} is valid with ${Object.keys(theme.templates).length} templates.\n`,
        );
        return;
    }

    const generatedTypes = await generateThemeTypes(theme);
    if (command === 'types') {
        process.stdout.write(`Generated theme types at [${generatedTypes}].\n`);
        return;
    }

    if (command === 'build' || command === 'package') {
        const outputOption = options['out-dir'];
        const output = resolve(
            sourceRoot,
            typeof outputOption === 'string' ? outputOption : 'dist',
        );

        if (command === 'package') {
            const packaged = await packageTheme(theme, output);
            process.stdout.write(
                `Packaged [${theme.handle}] ${theme.version} to [${packaged.archive}] with release hash [${packaged.releaseHash}].\n`,
            );
            return;
        }

        const releaseHash = await buildTheme(theme, output);
        process.stdout.write(
            `Built [${theme.handle}] ${theme.version} to [${output}] with release hash [${releaseHash}].\n`,
        );
        return;
    }

    await serveTheme(theme, options);
}
