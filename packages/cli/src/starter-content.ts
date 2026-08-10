import type { StarterModel } from './starter-content-model.js';
import type { ThemeTemplates } from './types.js';
import {
    assertHandle,
    assertObject,
    assertOnlyKeys,
    assertPublicationStatus,
    assertString,
    boundedArray,
} from './utilities.js';

export function validateStarterEntry(
    value: unknown,
    index: number,
    models: Map<string, StarterModel>,
): void {
    assertObject(value, `Starter entries[${index}] must be a JSON object.`);
    assertOnlyKeys(value, ['model', 'title', 'slug', 'status', 'data'], `starter entries[${index}]`);
    assertHandle(value.model, `Starter entries[${index}].model`);
    const model = models.get(value.model);
    if (!model) throw new Error(`Starter entry [${index}] references an unknown Content Model.`);
    assertString(value.title, `Starter entries[${index}].title`, 255);
    assertHandle(value.slug, `Starter entries[${index}].slug`);
    assertPublicationStatus(value.status, `Starter entries[${index}].status`);
    assertObject(value.data, `Starter entries[${index}].data must be a JSON object.`);
    for (const key of Object.keys(value.data)) {
        if (!model.fieldMap.has(key)) {
            throw new Error(`Starter entry [${value.slug}] contains unknown field [${key}].`);
        }
    }
}

export function validateStarterPage(
    value: unknown,
    index: number,
    templates: ThemeTemplates,
): void {
    assertObject(value, `Starter pages[${index}] must be a JSON object.`);
    assertOnlyKeys(
        value,
        ['title', 'path', 'template', 'status', 'data', 'seoTitle', 'seoDescription'],
        `starter pages[${index}]`,
    );
    assertString(value.title, `Starter pages[${index}].title`, 255);
    validatePagePath(value.path, value.title);
    assertHandle(value.template, `Starter page [${value.title}] template`);
    const template = templates[value.template];
    if (!template || template.kind !== 'page') {
        throw new Error(`Starter page [${value.title}] must reference a Page template.`);
    }
    assertPublicationStatus(value.status, `Starter page [${value.title}].status`);
    assertObject(value.data, `Starter page [${value.title}].data must be a JSON object.`);
}

function validatePagePath(value: unknown, title: string): asserts value is string {
    if (
        typeof value !== 'string' ||
        !/^\/(?:[A-Za-z0-9._~-]+\/?)*$/.test(value) ||
        value === '/blog' ||
        value.startsWith('/blog/')
    ) {
        throw new Error(`Starter page [${title}] contains an invalid or reserved path.`);
    }
}
