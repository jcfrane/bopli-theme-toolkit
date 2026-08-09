import { CONTENT_FIELD_TYPES } from './constants.js';
import type {
    JsonObject,
    ThemeTemplate,
    ThemeTemplates,
} from './types.js';
import {
    assertHandle,
    assertObject,
    assertOnlyKeys,
    assertString,
    boundedArray,
} from './utilities.js';

export type StarterModel = JsonObject & {
    handle: string;
    fieldMap: Map<string, JsonObject>;
};

export function validateStarterModel(
    value: unknown,
    index: number,
    templates: ThemeTemplates,
    models: Map<string, StarterModel>,
): void {
    assertObject(value, `Starter contentModels[${index}] must be a JSON object.`);
    assertOnlyKeys(
        value,
        ['handle', 'name', 'singularName', 'description', 'fields', 'publicRoute'],
        `starter contentModels[${index}]`,
    );
    assertHandle(value.handle, `Starter contentModels[${index}].handle`);
    const modelHandle = value.handle;
    assertString(value.name, `Starter contentModels[${index}].name`, 255);
    assertString(value.singularName, `Starter contentModels[${index}].singularName`, 255);
    if (models.has(modelHandle)) {
        throw new Error(`Starter Content Model handle [${modelHandle}] is duplicated.`);
    }

    const fields = boundedArray(value.fields, `contentModels[${index}].fields`, 50);
    if (fields.length === 0) {
        throw new Error(`Starter Content Model [${modelHandle}] must declare fields.`);
    }

    const fieldMap = new Map<string, JsonObject>();
    fields.forEach((field, fieldIndex) => validateStarterField(field, fieldIndex, modelHandle, fieldMap));
    if (value.publicRoute !== undefined) {
        validateStarterRoute(modelHandle, value.publicRoute, fieldMap, templates);
    }
    models.set(modelHandle, { ...value, handle: modelHandle, fieldMap });
}

function validateStarterField(
    value: unknown,
    index: number,
    modelHandle: string,
    fields: Map<string, JsonObject>,
): void {
    assertObject(value, `Starter Content Model [${modelHandle}] field ${index} must be a JSON object.`);
    assertOnlyKeys(
        value,
        ['key', 'label', 'type', 'required', 'filterable', 'sortable', 'helpText', 'configuration'],
        `starter field [${modelHandle}.${index}]`,
    );
    assertHandle(value.key, `Starter field key for [${modelHandle}]`);
    assertString(value.label, `Starter field label for [${modelHandle}.${value.key}]`, 255);
    if (typeof value.type !== 'string' || !CONTENT_FIELD_TYPES.has(value.type)) {
        throw new Error(`Starter field [${modelHandle}.${value.key}] has an unsupported type.`);
    }
    if (fields.has(value.key)) {
        throw new Error(`Starter field [${modelHandle}.${value.key}] is duplicated.`);
    }
    for (const flag of ['required', 'filterable', 'sortable']) {
        if (value[flag] !== undefined && typeof value[flag] !== 'boolean') {
            throw new Error(`Starter field [${modelHandle}.${value.key}].${flag} must be boolean.`);
        }
    }
    fields.set(value.key, value);
}

function validateStarterRoute(
    modelHandle: string,
    value: unknown,
    fields: Map<string, JsonObject>,
    templates: ThemeTemplates,
): void {
    assertObject(value, `Starter Content Model [${modelHandle}] publicRoute must be a JSON object.`);
    assertOnlyKeys(
        value,
        ['template', 'path', 'fieldMap', 'seoDescriptionField'],
        `starter route [${modelHandle}]`,
    );
    assertHandle(value.template, `Starter route [${modelHandle}] template`);
    const template = templates[value.template];
    if (!template || template.kind !== 'entry') {
        throw new Error(`Starter route [${modelHandle}] must reference an Entry template.`);
    }
    if (
        typeof value.path !== 'string' ||
        !/^\/(?:[A-Za-z0-9._~-]+\/)*\{slug\}$/.test(value.path)
    ) {
        throw new Error(`Starter route [${modelHandle}] must use a terminal {slug} path.`);
    }

    assertObject(value.fieldMap, `Starter route [${modelHandle}] fieldMap must be a JSON object.`);
    validateRouteFieldMap(modelHandle, value.fieldMap, fields, template);
    validateSeoField(modelHandle, value.seoDescriptionField, fields);
}

function validateRouteFieldMap(
    modelHandle: string,
    fieldMap: JsonObject,
    fields: Map<string, JsonObject>,
    template: ThemeTemplate,
): void {
    const contracts = template.fields ?? {};

    for (const [output, source] of Object.entries(fieldMap)) {
        assertHandle(source, `Starter route [${modelHandle}] source field`);
        const contract = contracts[output];
        const field = fields.get(source);
        if (!contract) {
            throw new Error(`Starter route [${modelHandle}] maps an undeclared template field [${output}].`);
        }
        if (!field) {
            throw new Error(`Starter route [${modelHandle}] maps an unknown Content Model field [${source}].`);
        }
        if (contract.type !== field.type) {
            throw new Error(`Starter route [${modelHandle}] field [${output}] has an incompatible type.`);
        }
    }

    for (const [output, contract] of Object.entries(contracts)) {
        if (contract.required === true && !fieldMap[output]) {
            throw new Error(`Starter route [${modelHandle}] must map required template field [${output}].`);
        }
    }
}

function validateSeoField(
    modelHandle: string,
    value: unknown,
    fields: Map<string, JsonObject>,
): void {
    if (value === undefined || value === null) return;

    assertHandle(value, `Starter route [${modelHandle}] SEO field`);
    if (!fields.has(value)) {
        throw new Error(`Starter route [${modelHandle}] references an unknown SEO description field.`);
    }
}
