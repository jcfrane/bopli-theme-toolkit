import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { babelParse } from '@vue/compiler-sfc';
import { RESERVED_ENTRY_FIELDS } from './constants.js';
import type {
    ContentFieldType,
    JsonObject,
    TemplateField,
    TemplateKind,
    ThemeTemplate,
} from './types.js';
import { headline } from './utilities.js';
import {
    ThemeValidationError,
    type ThemeValidationErrorCode,
} from './validation-error.js';

const AUTHORING_IMPORT = '@bopli/theme-sdk/authoring';
const TEMPLATE_HELPERS: Record<string, TemplateKind> = {
    definePageTemplate: 'page',
    defineEntryTemplate: 'entry',
    defineBlogIndexTemplate: 'blog_index',
    defineBlogPostTemplate: 'blog_post',
};
const FIELD_HELPERS: Record<string, string> = {
    text: 'short_text',
    longText: 'long_text',
    richText: 'rich_text',
    number: 'number',
    boolean: 'boolean',
    dateTime: 'date_time',
    select: 'select',
    slug: 'slug',
    image: 'image',
    json: 'json',
    relationship: 'relationship',
    list: 'list',
};
const PAGE_FIELD_TYPES = new Set([
    'short_text',
    'long_text',
    'rich_text',
    'number',
    'boolean',
    'date_time',
    'select',
    'image',
    'list',
]);
const LIST_CHILD_TYPES = new Set([
    'short_text',
    'long_text',
    'number',
    'boolean',
    'date_time',
    'select',
]);

type AstNode = {
    type: string;
    loc?: { start: { line: number } } | null;
    [key: string]: unknown;
};

type AuthoringImports = {
    field: string;
    templates: Map<string, TemplateKind>;
};

/** Reads one restricted TypeScript companion and returns its serializable template contract. */
export async function readTemplateAuthoring(
    templateRoot: string,
    directory: string,
    filename: string,
    inferredKind: TemplateKind,
    handle: string,
): Promise<ThemeTemplate> {
    const basename = filename.slice(0, -4);
    const companion = `${basename}.bopli.ts`;
    const sourceFile = `resources/js/templates/${directory}/${companion}`;
    let source: string;

    try {
        source = await readFile(join(templateRoot, companion), 'utf8');
    } catch (cause) {
        throw validationError(
            sourceFile,
            `Template [${directory}/${filename}] is missing its typed authoring companion.`,
            `Add [${companion}] with a default definePageTemplate, defineEntryTemplate, or native Blog definition.`,
            cause,
        );
    }

    const program = parseProgram(source, sourceFile);
    const body = nodeList(program.program, 'body');
    const imports = readAuthoringImports(body, sourceFile);
    const declaration = body.find((node) => node.type === 'ExportDefaultDeclaration');
    if (!declaration || !isNode(declaration.declaration)) {
        throw validationError(
            sourceFile,
            'Template companions must default-export one typed template definition.',
            'Export one definePageTemplate, defineEntryTemplate, defineBlogIndexTemplate, or defineBlogPostTemplate call.',
        );
    }

    const call = declaration.declaration;
    if (call.type !== 'CallExpression' || !isNode(call.callee) || call.callee.type !== 'Identifier') {
        throw invalidExpression(sourceFile, call);
    }
    const kind = imports.templates.get(String(call.callee.name));
    if (!kind) {
        throw invalidExpression(sourceFile, call);
    }
    assertKindMatchesDirectory(kind, inferredKind, directory, filename, sourceFile, call);

    const definitionNode = nodeList(call, 'arguments')[0];
    if (!definitionNode || definitionNode.type !== 'ObjectExpression') {
        throw invalidExpression(sourceFile, call);
    }
    const definition = objectEntries(definitionNode, sourceFile);
    assertOnlyKeys(definition, ['name', 'default', 'fields'], sourceFile, definitionNode);
    const fields = definition.fields
        ? readFields(definition.fields, imports.field, sourceFile, kind, false)
        : undefined;

    if (kind === 'entry' && (!fields || Object.keys(fields).length === 0)) {
        throw validationError(
            sourceFile,
            'Entry templates must declare at least one field.',
            'Add a non-empty fields object to defineEntryTemplate().',
            undefined,
            definitionNode,
            'BOPLI_E012',
        );
    }
    const reserved = kind === 'entry'
        ? Object.keys(fields ?? {}).find((field) => RESERVED_ENTRY_FIELDS.has(field))
        : undefined;
    if (reserved) {
        throw validationError(
            sourceFile,
            `Entry template redeclares reserved field [${reserved}].`,
            'Rename the field to a theme-owned projection key that does not collide with Bopli metadata.',
            undefined,
            definitionNode,
            'BOPLI_E013',
        );
    }
    if ((kind === 'blog_index' || kind === 'blog_post') && fields) {
        throw validationError(
            sourceFile,
            'Native Blog template definitions may not declare fields.',
            'Remove fields from the native Blog companion.',
            undefined,
            definitionNode,
        );
    }

    return {
        name: definition.name ? stringLiteral(definition.name, sourceFile) : headline(handle),
        kind,
        default: definition.default ? booleanLiteral(definition.default, sourceFile) : false,
        ...(fields ? { fields } : {}),
        source: `/resources/js/templates/${directory}/${filename}`,
    };
}

function parseProgram(source: string, file: string): AstNode {
    try {
        return babelParse(source, {
            sourceType: 'module',
            plugins: ['typescript'],
        }) as unknown as AstNode;
    } catch (cause) {
        throw validationError(
            file,
            `TypeScript parser error: ${cause instanceof Error ? cause.message : String(cause)}`,
            'Fix the companion syntax and keep it to the documented authoring DSL.',
            cause,
        );
    }
}

function readAuthoringImports(body: AstNode[], file: string): AuthoringImports {
    const templates = new Map<string, TemplateKind>();
    let fieldName = 'field';

    for (const statement of body) {
        if (statement.type === 'ExportDefaultDeclaration') continue;
        if (statement.type !== 'ImportDeclaration' || !isNode(statement.source)) {
            throw validationError(
                file,
                'Template companions may contain only one authoring import and one default export.',
                `Import helpers from [${AUTHORING_IMPORT}] and remove executable statements.`,
                undefined,
                statement,
            );
        }
        if (statement.source.value !== AUTHORING_IMPORT) {
            throw validationError(
                file,
                `Template companions may import only [${AUTHORING_IMPORT}].`,
                'Move runtime imports into the paired Vue template.',
                undefined,
                statement,
            );
        }
        for (const specifier of nodeList(statement, 'specifiers')) {
            if (specifier.type !== 'ImportSpecifier' || !isNode(specifier.imported) || !isNode(specifier.local)) {
                throw invalidExpression(file, specifier);
            }
            const imported = String(specifier.imported.name);
            const local = String(specifier.local.name);
            if (imported === 'field') fieldName = local;
            const kind = TEMPLATE_HELPERS[imported];
            if (kind) templates.set(local, kind);
        }
    }

    return { field: fieldName, templates };
}

function readFields(
    expression: AstNode,
    fieldName: string,
    file: string,
    kind: TemplateKind,
    nested: boolean,
): Record<string, TemplateField> {
    if (expression.type !== 'ObjectExpression') throw invalidExpression(file, expression);
    const entries = objectEntries(expression, file);
    if (Object.keys(entries).length > (nested ? 10 : 30)) {
        throw validationError(
            file,
            `A ${nested ? 'list' : 'template'} may declare at most ${nested ? 10 : 30} fields.`,
            'Remove fields or split the content into a separate model.',
            undefined,
            expression,
        );
    }

    return Object.fromEntries(
        Object.entries(entries).map(([handle, value]) => [
            handle,
            readField(handle, value, fieldName, file, kind, nested),
        ]),
    );
}

function readField(
    handle: string,
    expression: AstNode,
    fieldName: string,
    file: string,
    kind: TemplateKind,
    nested: boolean,
): TemplateField {
    if (
        expression.type !== 'CallExpression' ||
        !isNode(expression.callee) ||
        expression.callee.type !== 'MemberExpression' ||
        !isNode(expression.callee.object) ||
        expression.callee.object.type !== 'Identifier' ||
        expression.callee.object.name !== fieldName ||
        !isNode(expression.callee.property)
    ) {
        throw invalidExpression(file, expression);
    }
    const helper = String(expression.callee.property.name);
    const type = FIELD_HELPERS[helper];
    if (!type) throw invalidExpression(file, expression);
    if (kind === 'page' && !PAGE_FIELD_TYPES.has(type)) {
        throw validationError(
            file,
            `Page field [${handle}] uses unsupported helper [field.${helper}].`,
            'Use text, longText, richText, number, boolean, dateTime, select, image, or list.',
            undefined,
            expression,
        );
    }
    if (nested && !LIST_CHILD_TYPES.has(type)) {
        throw validationError(
            file,
            `List child [${handle}] uses unsupported helper [field.${helper}].`,
            'List rows may contain text, longText, number, boolean, dateTime, or select fields.',
            undefined,
            expression,
        );
    }

    const args = nodeList(expression, 'arguments');
    const fieldDefinition: TemplateField = {
        name: headline(handle),
        type: type as ContentFieldType,
    };
    if (type === 'list') {
        if (!args[0]) throw invalidExpression(file, expression);
        fieldDefinition.fields = readFields(args[0], fieldName, file, kind, true);
        applyFieldOptions(fieldDefinition, args[1], file);
        const min = fieldDefinition.minItems ?? 0;
        const max = fieldDefinition.maxItems ?? 20;
        if (min > max) {
            throw validationError(
                file,
                `List field [${handle}] minItems may not exceed maxItems.`,
                'Adjust the list bounds so zero through fifty rows are permitted.',
                undefined,
                expression,
            );
        }
        fieldDefinition.minItems = min;
        fieldDefinition.maxItems = max;
        return fieldDefinition;
    }

    applyFieldOptions(fieldDefinition, args[0], file);
    if (type === 'select' && (!fieldDefinition.options || fieldDefinition.options.length === 0)) {
        throw validationError(
            file,
            `Select field [${handle}] must declare options.`,
            'Pass an options array to field.select().',
            undefined,
            expression,
        );
    }
    return fieldDefinition;
}

function applyFieldOptions(
    field: TemplateField,
    expression: AstNode | undefined,
    file: string,
): void {
    if (!expression) return;
    if (expression.type !== 'ObjectExpression') throw invalidExpression(file, expression);
    const options = objectEntries(expression, file);
    assertOnlyKeys(
        options,
        ['label', 'helpText', 'required', 'options', 'minItems', 'maxItems'],
        file,
        expression,
    );
    if (options.label) field.name = stringLiteral(options.label, file);
    if (options.helpText) field.helpText = stringLiteral(options.helpText, file);
    if (options.required) field.required = booleanLiteral(options.required, file);
    if (options.minItems) field.minItems = boundedInteger(options.minItems, file);
    if (options.maxItems) field.maxItems = boundedInteger(options.maxItems, file, 1);
    if (options.options) {
        if (options.options.type !== 'ArrayExpression') throw invalidExpression(file, options.options);
        field.options = nodeList(options.options, 'elements').map((item) => stringLiteral(item, file));
    }
}

function objectEntries(expression: AstNode, file: string): Record<string, AstNode> {
    const entries: Record<string, AstNode> = {};
    for (const property of nodeList(expression, 'properties')) {
        if (property.type !== 'ObjectProperty' || property.computed === true || !isNode(property.value)) {
            throw invalidExpression(file, property);
        }
        const key = propertyName(property.key, file);
        if (entries[key]) {
            throw validationError(
                file,
                `Authoring key [${key}] is duplicated.`,
                'Keep one declaration for each stable key.',
                undefined,
                property,
            );
        }
        entries[key] = property.value;
    }
    return entries;
}

function propertyName(value: unknown, file: string): string {
    if (!isNode(value)) throw invalidExpression(file, undefined);
    if (value.type === 'Identifier' && typeof value.name === 'string') return value.name;
    if (value.type === 'StringLiteral' && typeof value.value === 'string') return value.value;
    throw invalidExpression(file, value);
}

function assertOnlyKeys(
    entries: Record<string, AstNode>,
    allowed: string[],
    file: string,
    node: AstNode,
): void {
    const unknown = Object.keys(entries).find((key) => !allowed.includes(key));
    if (!unknown) return;
    throw validationError(
        file,
        `Authoring definition contains unsupported option [${unknown}].`,
        'Use editor autocomplete to select a supported option.',
        undefined,
        node,
    );
}

function assertKindMatchesDirectory(
    kind: TemplateKind,
    inferredKind: TemplateKind,
    directory: string,
    filename: string,
    file: string,
    node: AstNode,
): void {
    const valid = kind === inferredKind || (directory === 'pages' && kind === 'blog_index') || (directory === 'entries' && kind === 'blog_post');
    if (valid) return;
    throw validationError(
        file,
        `Template [${directory}/${filename}] uses an authoring helper for invalid kind [${kind}].`,
        'Use the helper matching the template directory and public surface.',
        undefined,
        node,
    );
}

function stringLiteral(node: AstNode, file: string): string {
    if (node.type === 'StringLiteral' && typeof node.value === 'string') return node.value;
    throw invalidExpression(file, node);
}

function booleanLiteral(node: AstNode, file: string): boolean {
    if (node.type === 'BooleanLiteral' && typeof node.value === 'boolean') return node.value;
    throw invalidExpression(file, node);
}

function boundedInteger(node: AstNode, file: string, minimum = 0): number {
    if (
        node.type === 'NumericLiteral' &&
        typeof node.value === 'number' &&
        Number.isInteger(node.value) &&
        node.value >= minimum &&
        node.value <= 50
    ) {
        return node.value;
    }
    throw invalidExpression(file, node);
}

function nodeList(node: unknown, key: string): AstNode[] {
    if (!isNode(node)) return [];
    const value = node[key];
    return Array.isArray(value) ? value.filter(isNode) : [];
}

function isNode(value: unknown): value is AstNode {
    return typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string';
}

function invalidExpression(file: string, node: AstNode | undefined): ThemeValidationError {
    return validationError(
        file,
        'Template companion contains an unsupported TypeScript expression.',
        'Use only imported authoring helpers, object literals, array literals, and primitive option values.',
        undefined,
        node,
    );
}

function validationError(
    file: string,
    message: string,
    remediation: string,
    cause?: unknown,
    node?: AstNode,
    code: ThemeValidationErrorCode = 'BOPLI_E010',
): ThemeValidationError {
    return new ThemeValidationError({
        code,
        file,
        ...(node?.loc?.start.line ? { line: node.loc.start.line } : {}),
        message,
        remediation,
        ...(cause === undefined ? {} : { cause }),
    });
}
