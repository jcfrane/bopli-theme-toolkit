import vue from '@vitejs/plugin-vue';
import { spawn } from 'node:child_process';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import { PUBLIC_DEV_ENTRY, SDK_PATH, VUE_PATH } from './constants.js';
import { descriptorFor } from './descriptor.js';
import { runtimePlugin } from './runtime.js';
import { importBoundaryPlugin } from './source-validation.js';
import type { CliOptions, ThemeDefinition } from './types.js';

export async function serveTheme(theme: ThemeDefinition, options: CliOptions): Promise<void> {
    const port = Number(options.port ?? 5174);
    const descriptor = descriptorFor(
        theme,
        `.${PUBLIC_DEV_ENTRY}`,
        [],
        [{ path: PUBLIC_DEV_ENTRY.slice(1), size: 1, sha256: '0'.repeat(64) }],
        null,
    );
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
            cors: { origin: /^http:\/\/([a-z0-9-]+\.)?(admin\.)?localhost(?::\d+)?$/ },
        },
    });
    await server.listen();

    const publicOrigin = `http://localhost:${port}`;
    const containerUrl = `http://host.docker.internal:${port}/theme.json`;
    if (typeof options.app === 'string') {
        await registerDevelopmentRelease(
            theme,
            options.app,
            containerUrl,
            publicOrigin,
            server.close.bind(server),
        );
    }

    process.stdout.write(`Serving [${theme.handle}] at ${publicOrigin}. Press Ctrl+C to stop.\n`);
}

async function registerDevelopmentRelease(
    theme: ThemeDefinition,
    appOption: string,
    containerUrl: string,
    publicOrigin: string,
    closeServer: () => Promise<void>,
): Promise<void> {
    const appPath = await realpath(resolve(appOption));
    const descriptorDirectory = join(appPath, 'storage/framework/theme-dev');
    await mkdir(descriptorDirectory, { recursive: true });

    const descriptor = descriptorFor(
        theme,
        `.${PUBLIC_DEV_ENTRY}`,
        [],
        [{ path: PUBLIC_DEV_ENTRY.slice(1), size: 1, sha256: '0'.repeat(64) }],
        null,
    );
    await writeFile(
        join(descriptorDirectory, `${theme.handle}.json`),
        `${JSON.stringify(descriptor, null, 2)}\n`,
    );

    const registration = spawn(
        'docker',
        developmentRegistrationArguments(containerUrl, publicOrigin),
        { cwd: appPath, stdio: 'inherit' },
    );
    const exitCode = await new Promise<number | null>((resolveExit, rejectExit) => {
        registration.once('error', rejectExit);
        registration.once('close', resolveExit);
    });
    if (exitCode !== 0) {
        await closeServer();
        throw new Error('The local Bopli application could not register the development release.');
    }
}

export function developmentRegistrationArguments(
    containerUrl: string,
    publicOrigin: string,
): string[] {
    return [
        'compose',
        'exec',
        '-T',
        'php',
        'php',
        'artisan',
        'bopli:theme:install',
        containerUrl,
        '--development',
        '--stage-if-incompatible',
        `--public-origin=${publicOrigin}`,
    ];
}
