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
    validatePageData(value.title, value.data, template.fields ?? {});
}

function validatePageData(
    title: string,
    data: Record<string, unknown>,
    fields: NonNullable<ThemeTemplates[string]['fields']>,
): void {
    for (const key of Object.keys(data)) {
        if (!fields[key]) {
            throw new Error(`Starter page [${title}] contains unknown field [${key}].`);
        }
    }
    for (const [key, field] of Object.entries(fields)) {
        const value = data[key];
        if (field.required === true && isEmpty(value)) {
            throw new Error(`Starter page [${title}] requires field [${key}].`);
        }
        if (value === undefined || value === null) continue;
        validatePageFieldValue(title, key, value, field);
    }
}

function validatePageFieldValue(
    title: string,
    key: string,
    value: unknown,
    field: NonNullable<ThemeTemplates[string]['fields']>[string],
): void {
    if (field.type === 'list') {
        if (!Array.isArray(value)) {
            throw new Error(`Starter page [${title}] field [${key}] must be a list.`);
        }
        const minimum = field.minItems ?? 0;
        const maximum = field.maxItems ?? 20;
        if (value.length < minimum || value.length > maximum) {
            throw new Error(
                `Starter page [${title}] field [${key}] must contain ${minimum}–${maximum} rows.`,
            );
        }
        value.forEach((row, index) => {
            assertObject(row, `Starter page [${title}] field [${key}.${index}] must be an object.`);
            validatePageData(`${title}] field [${key}.${index}`, row, field.fields ?? {});
        });
        return;
    }

    const valid =
        (['short_text', 'long_text', 'date_time', 'select'].includes(field.type) &&
            typeof value === 'string') ||
        (field.type === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
        (field.type === 'boolean' && typeof value === 'boolean') ||
        (field.type === 'rich_text' && typeof value === 'object' && !Array.isArray(value)) ||
        (field.type === 'image' && (value === null || typeof value === 'object'));
    if (!valid) {
        throw new Error(
            `Starter page [${title}] field [${key}] does not match [${field.type}].`,
        );
    }
    if (field.type === 'select' && !field.options?.includes(String(value))) {
        throw new Error(`Starter page [${title}] field [${key}] must use a declared option.`);
    }
}

function isEmpty(value: unknown): boolean {
    return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
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
