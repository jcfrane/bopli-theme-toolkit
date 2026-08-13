import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildTheme } from './build-theme.js';
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
};

export async function run(argv: string[]): Promise<void> {
    const command = argv[0];
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
            'Usage: bopli-theme <validate|types|build|package|dev> [theme-path] [--out-dir dist] [--port 5174] [--app ../bopli-app]',
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
