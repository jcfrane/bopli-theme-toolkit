import type { StarterModel } from './starter-content-model.js';
import type { ThemeTemplate, ThemeTemplates } from './types.js';
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
    models: Map<string, StarterModel>,
): void {
    assertObject(value, `Starter pages[${index}] must be a JSON object.`);
    assertOnlyKeys(
        value,
        ['title', 'path', 'template', 'status', 'data', 'seoTitle', 'seoDescription', 'bindings'],
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
    validateBindings(value.title, value.bindings, template, models);
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

function validateBindings(
    pageTitle: string,
    value: unknown,
    template: ThemeTemplate,
    models: Map<string, StarterModel>,
): void {
    const bindings = boundedArray(value, `page [${pageTitle}].bindings`, 20, true);
    const slots = new Set<string>();

    for (const binding of bindings) {
        const slot = validateStarterBinding(pageTitle, binding, template, models);
        if (slots.has(slot)) {
            throw new Error(`Starter page [${pageTitle}] binds slot [${slot}] more than once.`);
        }
        slots.add(slot);
    }
}

function validateStarterBinding(
    pageTitle: string,
    value: unknown,
    template: ThemeTemplate,
    models: Map<string, StarterModel>,
): string {
    assertObject(value, `A starter binding on [${pageTitle}] must be a JSON object.`);
    assertOnlyKeys(
        value,
        ['slot', 'source', 'model', 'mode', 'filters', 'fieldMap', 'sortField', 'sortDirection', 'limit'],
        `starter binding on [${pageTitle}]`,
    );
    assertHandle(value.slot, `Starter binding slot on [${pageTitle}]`);
    const slot = value.slot;
    if (!template.slots?.[slot]) {
        throw new Error(`Starter page [${pageTitle}] binds undeclared slot [${slot}].`);
    }
    if (value.source !== 'content_model' && value.source !== 'blog_posts') {
        throw new Error(`Starter binding [${pageTitle}.${slot}] has an unsupported source.`);
    }
    if (value.source === 'content_model') validateBindingModel(pageTitle, slot, value.model, models);
    if (value.mode !== undefined && value.mode !== 'automatic' && value.mode !== 'manual') {
        throw new Error(`Starter binding [${pageTitle}.${slot}] has an invalid mode.`);
    }
    if (
        value.sortDirection !== undefined &&
        value.sortDirection !== 'asc' &&
        value.sortDirection !== 'desc'
    ) {
        throw new Error(`Starter binding [${pageTitle}.${slot}] has an invalid sort direction.`);
    }
    if (
        value.limit !== undefined &&
        (!Number.isInteger(value.limit) || (value.limit as number) < 1 || (value.limit as number) > 50)
    ) {
        throw new Error(`Starter binding [${pageTitle}.${slot}] has an invalid limit.`);
    }

    return slot;
}

function validateBindingModel(
    pageTitle: string,
    slot: string,
    value: unknown,
    models: Map<string, StarterModel>,
): void {
    assertHandle(value, `Starter binding [${pageTitle}.${slot}] model`);
    if (!models.has(value)) {
        throw new Error(`Starter binding [${pageTitle}.${slot}] references an unknown Content Model.`);
    }
}
