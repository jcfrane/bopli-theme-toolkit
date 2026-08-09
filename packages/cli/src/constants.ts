import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUNTIME_API_VERSION = 1;
export const PROTOCOL_VERSION = 1;
export const STARTER_RECIPE_VERSION = 1;

export const CONTENT_FIELD_TYPES = new Set([
    'short_text',
    'long_text',
    'rich_text',
    'number',
    'boolean',
    'date_time',
    'select',
    'slug',
    'image',
    'json',
    'relationship',
]);

export const RESERVED_ENTRY_FIELDS = new Set([
    'title',
    'slug',
    'url',
    'publishedAt',
    'terms',
    'canonicalPath',
    'seoTitle',
    'seoDescription',
    'previous',
    'next',
]);

export const VIRTUAL_ENTRY = 'virtual:bopli-theme-entry';
export const RESOLVED_VIRTUAL_ENTRY = '\0bopli:theme-entry';
export const PUBLIC_DEV_ENTRY = '/__bopli/theme-entry.js';
export const SDK_PATH = fileURLToPath(import.meta.resolve('@bopli/theme-sdk'));
export const VUE_PATH = resolve(
    dirname(fileURLToPath(import.meta.resolve('vue'))),
    'dist/vue.runtime.esm-bundler.js',
);
export const ALLOWED_PACKAGES = new Set(['vue', '@bopli/theme-sdk']);
export const IMPORT_PATTERN =
    /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
