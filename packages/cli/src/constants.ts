import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export {
    CONTENT_FIELD_TYPES,
    PROTOCOL_VERSION,
    RESERVED_ENTRY_FIELDS,
    RUNTIME_API_VERSION,
    STARTER_RECIPE_VERSION,
} from '@bopli/theme-protocol';

export const VIRTUAL_ENTRY = 'virtual:bopli-theme-entry';
export const RESOLVED_VIRTUAL_ENTRY = '\0bopli:theme-entry';
export const PUBLIC_DEV_ENTRY = '/__bopli/theme-entry.js';
export const PUBLIC_DEV_SSR_ENTRY = '/__bopli/theme-ssr.js';
export const SDK_PATH = fileURLToPath(import.meta.resolve('@bopli/theme-sdk'));
export const SERVER_RENDERER_PATH = resolve(
    dirname(fileURLToPath(import.meta.resolve('@vue/server-renderer'))),
    'dist/server-renderer.esm-bundler.js',
);
export const VUE_PATH = resolve(
    dirname(fileURLToPath(import.meta.resolve('vue'))),
    'dist/vue.runtime.esm-bundler.js',
);
export const ALLOWED_PACKAGES = new Set([
    'vue',
    '@bopli/theme-sdk',
    'shiki/core',
    'shiki/engine/javascript',
    '@shikijs/themes/github-dark',
    '@shikijs/langs/bash',
    '@shikijs/langs/shellsession',
    '@shikijs/langs/powershell',
    '@shikijs/langs/bat',
    '@shikijs/langs/dockerfile',
    '@shikijs/langs/dotenv',
    '@shikijs/langs/ini',
    '@shikijs/langs/nginx',
    '@shikijs/langs/toml',
    '@shikijs/langs/yaml',
    '@shikijs/langs/html',
    '@shikijs/langs/css',
    '@shikijs/langs/scss',
    '@shikijs/langs/javascript',
    '@shikijs/langs/jsx',
    '@shikijs/langs/typescript',
    '@shikijs/langs/tsx',
    '@shikijs/langs/json',
    '@shikijs/langs/vue',
    '@shikijs/langs/svelte',
    '@shikijs/langs/astro',
    '@shikijs/langs/markdown',
    '@shikijs/langs/php',
    '@shikijs/langs/blade',
    '@shikijs/langs/python',
    '@shikijs/langs/ruby',
    '@shikijs/langs/java',
    '@shikijs/langs/kotlin',
    '@shikijs/langs/csharp',
    '@shikijs/langs/go',
    '@shikijs/langs/rust',
    '@shikijs/langs/sql',
    '@shikijs/langs/graphql',
    '@shikijs/langs/terraform',
    '@shikijs/langs/hcl',
    '@shikijs/langs/http',
    '@shikijs/langs/c',
    '@shikijs/langs/cpp',
    '@shikijs/langs/swift',
    '@shikijs/langs/dart',
    '@shikijs/langs/lua',
    '@shikijs/langs/diff',
]);
export const IMPORT_PATTERN =
    /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
