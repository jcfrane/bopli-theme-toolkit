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
export const PLATFORM_IMPORTS = new Set([
    'vue',
    '@bopli/theme-sdk',
    '@bopli/theme-sdk/authoring',
]);
export const PRIVILEGED_GLOBAL_DEFINES = {
    process: 'undefined',
    global: 'undefined',
    Buffer: 'undefined',
    require: 'undefined',
    __dirname: 'undefined',
    __filename: 'undefined',
};
