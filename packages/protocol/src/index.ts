import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';

import type { StarterRecipe } from './generated/starter.js';
import type { TemplateMetadata } from './generated/template-metadata.js';
import type {
    Template,
    TemplateField,
    ThemeDescriptor,
    ThemeSetting,
} from './generated/theme.js';
import type { ThemePackageMetadata } from './generated/package-bopli.js';

type JsonObject = Record<string, unknown>;
type SchemaName = 'package-bopli' | 'template-metadata' | 'starter' | 'theme';

const schemaNames = [
    'definitions',
    'package-bopli',
    'template-metadata',
    'starter',
    'theme',
] as const;

const schemas = Object.fromEntries(
    schemaNames.map((name) => [name, readSchema(name)]),
) as Record<(typeof schemaNames)[number], JsonObject>;

const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const schema of Object.values(schemas)) {
    ajv.addSchema(schema);
}

const validators: Record<SchemaName, ValidateFunction> = {
    'package-bopli': requiredValidator('package-bopli'),
    'template-metadata': requiredValidator('template-metadata'),
    starter: requiredValidator('starter'),
    theme: requiredValidator('theme'),
};

const definitions = schemas.definitions.$defs as Record<string, JsonObject>;

export const PROTOCOL_VERSION = constantNumber('protocolVersion');
export const RUNTIME_API_VERSION = constantNumber('runtimeApiVersion');
export const STARTER_RECIPE_VERSION = constantNumber('starterRecipeVersion');
export const CONTENT_FIELD_TYPES = new Set(enumStrings('contentFieldType'));
export const THEME_SETTING_TYPES = new Set(enumStrings('settingType'));
export const TEMPLATE_KINDS = new Set(enumStrings('templateKind'));
export const RESERVED_ENTRY_FIELDS = new Set(enumStrings('reservedEntryField'));

export type {
    StarterRecipe,
    Template,
    TemplateField,
    TemplateMetadata,
    ThemeDescriptor,
    ThemePackageMetadata,
    ThemeSetting,
};

export function assertThemePackageMetadata(value: unknown): asserts value is ThemePackageMetadata {
    assertValid('package-bopli', value, 'package.json bopli metadata');
}

export function assertTemplateMetadata(value: unknown, label = 'template metadata'): asserts value is TemplateMetadata {
    assertValid('template-metadata', value, label);
}

export function assertStarterRecipe(value: unknown): asserts value is StarterRecipe {
    assertValid('starter', value, 'starter-content recipe');
}

export function assertThemeDescriptor(value: unknown): asserts value is ThemeDescriptor {
    assertValid('theme', value, 'theme descriptor');
}

export function protocolSchema(name: (typeof schemaNames)[number]): JsonObject {
    return structuredClone(schemas[name]);
}

function assertValid(name: SchemaName, value: unknown, label: string): void {
    const validator = validators[name];
    if (validator(value)) {
        return;
    }

    throw new Error(`${label} is invalid: ${formatError(validator.errors?.[0])}`);
}

function formatError(error: ErrorObject | undefined): string {
    if (!error) {
        return 'it does not match protocol v1.';
    }

    const location = error.instancePath === '' ? '' : error.instancePath.replaceAll('/', '.').slice(1);
    return `${location === '' ? 'root' : location} ${error.message ?? 'is invalid'}.`;
}

function requiredValidator(name: SchemaName): ValidateFunction {
    const id = `https://boply.org/schemas/theme/v1/${name}.schema.json`;
    const validator = ajv.getSchema(id);
    if (!validator) {
        throw new Error(`Protocol schema [${name}] could not be compiled.`);
    }

    return validator;
}

function readSchema(name: (typeof schemaNames)[number]): JsonObject {
    const path = new URL(`../schemas/v1/${name}.schema.json`, import.meta.url);
    return JSON.parse(readFileSync(path, 'utf8')) as JsonObject;
}

function constantNumber(name: string): number {
    const value = definitions[name]?.const;
    if (typeof value !== 'number') {
        throw new Error(`Protocol definition [${name}] must contain a numeric const.`);
    }

    return value;
}

function enumStrings(name: string): string[] {
    const value = definitions[name]?.enum;
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        throw new Error(`Protocol definition [${name}] must contain a string enum.`);
    }

    return value as string[];
}
