import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { headline, isFileSystemError } from './utilities.js';

export type AddedTemplate = {
    handle: string;
    source: string;
    companion: string;
};

/** Adds a paired Vue Page template and typed authoring companion to an existing theme. */
export async function addPageTemplate(
    handle: string,
    themeRoot = process.cwd(),
): Promise<AddedTemplate> {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(handle)) {
        throw new Error(
            'A Page template handle must use 1–80 lowercase letters, numbers, or hyphens.',
        );
    }

    const name = handle
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
    const root = resolve(themeRoot);
    const directory = join(root, 'resources/js/templates/pages');
    const source = join(directory, `${name}.vue`);
    const companion = join(directory, `${name}.bopli.ts`);

    await Promise.all([assertMissing(source), assertMissing(companion)]);
    await mkdir(directory, { recursive: true });
    await writeFile(source, pageSource(name));
    await writeFile(companion, pageCompanion(headline(handle)));

    return { handle, source, companion };
}

/** Ensures scaffolding never overwrites an existing developer-owned file. */
async function assertMissing(path: string): Promise<void> {
    try {
        await stat(path);
    } catch (error) {
        if (isFileSystemError(error, 'ENOENT')) return;
        throw error;
    }

    throw new Error(`The template file [${path}] already exists.`);
}

/** Produces the minimal runtime Vue template paired with generated props. */
function pageSource(name: string): string {
    return `<script setup lang="ts">
import type { ${name}Props } from '../../.bopli/types';

defineProps<${name}Props>();
</script>

<template>
  <main>
    <h1>{{ page.title }}</h1>
    <p v-if="page.fields.body">{{ page.fields.body }}</p>
  </main>
</template>
`;
}

/** Produces the discoverable typed companion developers customize with autocomplete. */
function pageCompanion(name: string): string {
    return `import { definePageTemplate, field } from '@bopli/theme-sdk/authoring';

export default definePageTemplate({
  name: ${JSON.stringify(name)},
  fields: {
    body: field.longText(),
  },
});
`;
}
