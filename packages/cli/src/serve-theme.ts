import vue from '@vitejs/plugin-vue';
import { spawn } from 'node:child_process';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import { developmentServerArtifact } from './build-theme.js';
import { PUBLIC_DEV_ENTRY, PUBLIC_DEV_SSR_ENTRY, SDK_PATH, VUE_PATH } from './constants.js';
import { descriptorFor } from './descriptor.js';
import { runtimePlugin } from './runtime.js';
import { importBoundaryPlugin } from './source-validation.js';
import type { CliOptions, ThemeDefinition, ThemeDescriptor, ThemeFile } from './types.js';

export async function serveTheme(theme: ThemeDefinition, options: CliOptions): Promise<void> {
    const port = Number(options.port ?? 5174);
    const serverArtifact = await developmentServerArtifact(theme);
    const descriptor = developmentDescriptorFor(theme, serverArtifact.file);
    const server = await createServer({
        root: theme.root,
        configFile: false,
        plugins: [
            importBoundaryPlugin(theme),
            runtimePlugin(theme, descriptor),
            developmentServerArtifactPlugin(serverArtifact.contents),
            vue(),
        ],
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
            descriptor,
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
    descriptor: ThemeDescriptor,
    closeServer: () => Promise<void>,
): Promise<void> {
    const appPath = await realpath(resolve(appOption));
    const descriptorDirectory = join(appPath, 'storage/framework/theme-dev');
    await mkdir(descriptorDirectory, { recursive: true });

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

export function developmentDescriptorFor(
    theme: ThemeDefinition,
    serverFile: ThemeFile = {
        path: PUBLIC_DEV_SSR_ENTRY.slice(1),
        size: 1,
        sha256: '0'.repeat(64),
    },
): ReturnType<typeof descriptorFor> {
    const preview = theme.previewSource ? `./${theme.previewSource}` : null;
    const files = [
        { path: PUBLIC_DEV_ENTRY.slice(1), size: 1, sha256: '0'.repeat(64) },
        { ...serverFile, path: PUBLIC_DEV_SSR_ENTRY.slice(1) },
        ...(theme.previewSource
            ? [{ path: theme.previewSource, size: 1, sha256: '0'.repeat(64) }]
            : []),
    ];

    return descriptorFor(theme, `.${PUBLIC_DEV_ENTRY}`, `.${PUBLIC_DEV_SSR_ENTRY}`, [], files, preview);
}

function developmentServerArtifactPlugin(contents: string) {
    return {
        name: 'bopli-theme-development-ssr-artifact',
        configureServer(server: { middlewares: { use(path: string, handler: (_request: unknown, response: { setHeader(name: string, value: string): void; end(body: string): void }) => void): void } }) {
            server.middlewares.use(PUBLIC_DEV_SSR_ENTRY, (_request, response) => {
                response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
                response.setHeader('Cache-Control', 'no-store');
                response.end(contents);
            });
        },
    };
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
