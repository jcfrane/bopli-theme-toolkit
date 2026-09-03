import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildTheme } from './build-theme.js';
import { addPageTemplate } from './add-template.js';
import { createTheme } from './create-theme.js';
import { inspectTheme } from './inspect-theme.js';
import { packageTheme } from './package-theme.js';
import {
    developmentDescriptorFor,
    developmentRegistrationArguments,
    serveTheme,
} from './serve-theme.js';
import { generateThemeTypes } from './type-generation.js';
import type { CliOptions } from './types.js';

export {
    inspectTheme,
    packageTheme,
    developmentDescriptorFor,
    developmentRegistrationArguments,
    generateThemeTypes,
    createTheme,
    addPageTemplate,
};
export { ThemeValidationError } from './validation-error.js';

export async function run(argv: string[]): Promise<void> {
    const { positionals, values } = parseArgs({
        args: argv,
        allowPositionals: true,
        strict: true,
        options: {
            dir: { type: 'string' },
            'out-dir': { type: 'string' },
            port: { type: 'string' },
            standalone: { type: 'boolean' },
            app: { type: 'string' },
            'docker-service': { type: 'string' },
        },
    });
    const command = positionals[0];
    const options = Object.fromEntries(
        Object.entries(values).filter(
            (entry): entry is [string, string | boolean] => entry[1] !== undefined,
        ),
    ) as CliOptions;

    if (command === 'create') {
        const handle = positionals[1];
        if (!handle || positionals.length !== 2) {
            throw new Error('Usage: bopli-theme create <handle> [--dir theme-directory]');
        }
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

    if (command === 'add') {
        const kind = positionals[1];
        const handle = positionals[2];
        const sourceArgument = positionals[3] ?? '.';

        if (kind !== 'page' || !handle || positionals.length > 4) {
            throw new Error('Usage: bopli-theme add page <handle> [theme-path]');
        }

        const added = await addPageTemplate(handle, sourceArgument);
        process.stdout.write(`Added Page template [${added.handle}].\n  ${added.source}\n`);
        return;
    }

    if (
        command !== 'validate' &&
        command !== 'types' &&
        command !== 'build' &&
        command !== 'package' &&
        command !== 'dev'
    ) {
        throw new Error(
            'Usage: bopli-theme <create|add|validate|types|build|package|dev> [theme-path] [--out-dir dist] [--port 5174] [--standalone] [--app ../bopli-app] [--docker-service php]',
        );
    }
    if (positionals.length > 2) {
        throw new Error('Only one theme path may be provided.');
    }

    const sourceArgument = positionals[1] ?? '.';
    const sourceRoot = await realpath(resolve(sourceArgument));

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
