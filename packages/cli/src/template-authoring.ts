import { babelParse, parse as parseSfc } from '@vue/compiler-sfc';
import { RESERVED_ENTRY_FIELDS } from './constants.js';
import type {
    ContentFieldType,
    JsonObject,
    TemplateField,
    TemplateKind,
    ThemeTemplate,
    ThemeFooter,
    ThemeSetting,
} from './types.js';
import { headline } from './utilities.js';
import { ThemeValidationError, type ThemeValidationErrorCode } from './validation-error.js';

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
    url: 'url',
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
const FOOTER_FIELD_TYPES = new Set([
    'short_text',
    'long_text',
    'rich_text',
    'boolean',
    'select',
    'image',
    'url',
    'list',
]);
const FOOTER_LIST_CHILD_TYPES = new Set([
    'short_text',
    'long_text',
    'boolean',
    'select',
    'url',
]);
const SETTING_HELPERS = new Set(['text', 'boolean', 'select', 'color', 'image']);

type AuthoringFieldContext = TemplateKind | 'footer';

type AstNode = {
    type: string;
    start?: number | null;
    end?: number | null;
    loc?: { start: { line: number } } | null;
    [key: string]: unknown;
};

type AuthoringImports = {
    declaration: AstNode;
    field: string | null;
    importDeclaration: AstNode;
    templates: Map<string, TemplateKind>;
};

type ParsedAuthoring = {
    declaration: AstNode;
    importDeclaration: AstNode;
    scriptOffset: number;
    template: ThemeTemplate;
};

type ParsedFooterAuthoring = {
    declaration: AstNode;
    importDeclaration: AstNode;
    scriptOffset: number;
    footer: ThemeFooter;
};

/** Reads one compile-time declaration from a Vue template and returns its serializable contract. */
export function readTemplateAuthoring(
    source: string,
    directory: string,
    filename: string,
    inferredKind: TemplateKind,
    handle: string,
): ThemeTemplate {
    return parseTemplateAuthoring(source, directory, filename, inferredKind, handle).template;
}

/** Removes compile-time authoring syntax from a Vue template before Vue compiles it. */
export function stripTemplateAuthoring(
    source: string,
    directory: string,
    filename: string,
    inferredKind: TemplateKind,
    handle: string,
): string {
    const parsed = parseTemplateAuthoring(source, directory, filename, inferredKind, handle);
    const ranges = [parsed.importDeclaration, parsed.declaration]
        .map((node) => {
            if (typeof node.start !== 'number' || typeof node.end !== 'number') {
                throw new Error('The TypeScript parser did not provide authoring source offsets.');
            }

            return [parsed.scriptOffset + node.start, parsed.scriptOffset + node.end] as const;
        })
        .sort((left, right) => right[0] - left[0]);
    let stripped = source;

    for (const [start, end] of ranges) {
        const whitespace = stripped.slice(start, end).replace(/[^\r\n]/g, ' ');
        stripped = `${stripped.slice(0, start)}${whitespace}${stripped.slice(end)}`;
    }

    return stripped;
}

/** Reads one optional theme footer declaration from a Vue component. */
export function readFooterAuthoring(source: string, sourceFile: string): ThemeFooter {
    return parseFooterAuthoring(source, sourceFile).footer;
}

/** Removes the compile-time footer declaration before Vue compiles the component. */
export function stripFooterAuthoring(source: string, sourceFile: string): string {
    const parsed = parseFooterAuthoring(source, sourceFile);
    const ranges = [parsed.importDeclaration, parsed.declaration]
        .map((node) => {
            if (typeof node.start !== 'number' || typeof node.end !== 'number') {
                throw new Error('The TypeScript parser did not provide authoring source offsets.');
            }

            return [parsed.scriptOffset + node.start, parsed.scriptOffset + node.end] as const;
        })
        .sort((left, right) => right[0] - left[0]);
    let stripped = source;

    for (const [start, end] of ranges) {
        const whitespace = stripped.slice(start, end).replace(/[^\r\n]/g, ' ');
        stripped = `${stripped.slice(0, start)}${whitespace}${stripped.slice(end)}`;
    }

    return stripped;
}

function parseFooterAuthoring(source: string, sourceFile: string): ParsedFooterAuthoring {
    const parsedSfc = parseSfc(source, { filename: sourceFile });
    const parseError = parsedSfc.errors[0];
    if (parseError) {
        throw validationError(
            sourceFile,
            `Vue could not parse this single-file component: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
            'Fix the reported Vue syntax before validating the footer declaration.',
            parseError,
        );
    }
    const script = parsedSfc.descriptor.scriptSetup;
    if (!script || script.lang !== 'ts') {
        throw validationError(
            sourceFile,
            'A footer declaration must be inside <script setup lang="ts">.',
            'Move defineFooter() and its authoring import into a TypeScript setup block.',
        );
    }

    const program = parseProgram(script.content, sourceFile, script.loc.start.line - 1);
    const body = nodeList(program.program, 'body');
    const authoringImports = body.filter(
        (statement) =>
            statement.type === 'ImportDeclaration' &&
            isNode(statement.source) &&
            statement.source.value === AUTHORING_IMPORT,
    );
    if (authoringImports.length !== 1) {
        throw validationError(
            sourceFile,
            `Footer components must contain exactly one named import from [${AUTHORING_IMPORT}].`,
            'Import defineFooter and the field or setting builders used by the declaration.',
            undefined,
            authoringImports[1] ?? authoringImports[0],
        );
    }

    const importDeclaration = authoringImports[0] as AstNode;
    let footerHelper: string | null = null;
    let fieldName: string | null = null;
    let settingName: string | null = null;
    for (const specifier of nodeList(importDeclaration, 'specifiers')) {
        if (
            specifier.type !== 'ImportSpecifier' ||
            !isNode(specifier.imported) ||
            !isNode(specifier.local)
        ) {
            throw invalidExpression(sourceFile, specifier);
        }
        const imported = String(specifier.imported.name);
        const local = String(specifier.local.name);
        if (imported === 'defineFooter') footerHelper = local;
        else if (imported === 'field') fieldName = local;
        else if (imported === 'setting') settingName = local;
        else throw invalidExpression(sourceFile, specifier);
    }
    if (!footerHelper) {
        throw validationError(
            sourceFile,
            'A footer component must import defineFooter.',
            'Import and call defineFooter exactly once.',
            undefined,
            importDeclaration,
        );
    }

    const declarations = body.filter(
        (statement) =>
            statement.type === 'ExpressionStatement' &&
            isNode(statement.expression) &&
            statement.expression.type === 'CallExpression' &&
            isNode(statement.expression.callee) &&
            statement.expression.callee.type === 'Identifier' &&
            statement.expression.callee.name === footerHelper,
    );
    if (declarations.length !== 1) {
        throw validationError(
            sourceFile,
            'Footer components must contain exactly one top-level defineFooter call.',
            'Call defineFooter once as a standalone statement.',
            undefined,
            declarations[1] ?? declarations[0] ?? importDeclaration,
        );
    }

    const declaration = declarations[0] as AstNode;
    const importedNames = new Set(
        [footerHelper, fieldName, settingName].filter((value): value is string => value !== null),
    );
    const outsideUse = body
        .filter((statement) => statement !== importDeclaration && statement !== declaration)
        .find((statement) => containsReferencedIdentifier(statement, importedNames));
    if (outsideUse) {
        throw validationError(
            sourceFile,
            'Footer authoring helpers may be used only inside defineFooter().',
            'Keep runtime behavior in ordinary Vue code.',
            undefined,
            outsideUse,
        );
    }

    const call = declaration.expression;
    if (!isNode(call)) throw invalidExpression(sourceFile, declaration);
    const args = nodeList(call, 'arguments');
    const definitionNode = args[0];
    if (args.length !== 1 || !definitionNode || definitionNode.type !== 'ObjectExpression') {
        throw invalidExpression(sourceFile, call);
    }
    const definition = objectEntries(definitionNode, sourceFile);
    assertOnlyKeys(definition, ['settings', 'fields', 'defaults'], sourceFile, definitionNode);
    if (!definition.fields || !definition.defaults) throw invalidExpression(sourceFile, definitionNode);
    const settings = definition.settings
        ? readFooterSettings(definition.settings, settingName, sourceFile)
        : {};
    const fields = readFields(definition.fields, fieldName, sourceFile, 'footer', false);
    const defaults = literalObject(definition.defaults, sourceFile);
    assertFooterDefaults(defaults, fields, sourceFile, definition.defaults);

    return {
        declaration,
        importDeclaration,
        scriptOffset: script.loc.start.offset,
        footer: { source: `/${sourceFile}`, settings, fields, defaults },
    };
}

function parseTemplateAuthoring(
    source: string,
    directory: string,
    filename: string,
    inferredKind: TemplateKind,
    handle: string,
): ParsedAuthoring {
    const sourceFile = `resources/js/templates/${directory}/${filename}`;
    const parsedSfc = parseSfc(source, { filename: sourceFile });
    const parseError = parsedSfc.errors[0];
    if (parseError) {
        throw validationError(
            sourceFile,
            `Vue could not parse this single-file component: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
            'Fix the reported Vue syntax before validating the template declaration.',
            parseError,
        );
    }
    const script = parsedSfc.descriptor.scriptSetup;
    if (!script || script.lang !== 'ts') {
        throw validationError(
            sourceFile,
            'Templates must declare their authoring contract inside <script setup lang="ts">.',
            'Add one top-level definePageTemplate, defineEntryTemplate, or native Blog helper call to the TypeScript setup block.',
        );
    }

    const program = parseProgram(script.content, sourceFile, script.loc.start.line - 1);
    const body = nodeList(program.program, 'body');
    const imports = readAuthoringImports(body, sourceFile);
    const call = imports.declaration.expression;
    if (!isNode(call)) throw invalidExpression(sourceFile, imports.declaration);
    if (
        call.type !== 'CallExpression' ||
        !isNode(call.callee) ||
        call.callee.type !== 'Identifier'
    ) {
        throw invalidExpression(sourceFile, call);
    }
    const kind = imports.templates.get(String(call.callee.name));
    if (!kind) {
        throw invalidExpression(sourceFile, call);
    }
    assertKindMatchesDirectory(kind, inferredKind, directory, filename, sourceFile, call);

    const args = nodeList(call, 'arguments');
    const definitionNode = args[0];
    if (args.length !== 1 || !definitionNode || definitionNode.type !== 'ObjectExpression') {
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
    const reserved =
        kind === 'entry'
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
            'Remove fields from the native Blog declaration.',
            undefined,
            definitionNode,
        );
    }

    return {
        declaration: imports.declaration,
        importDeclaration: imports.importDeclaration,
        scriptOffset: script.loc.start.offset,
        template: {
            name: definition.name ? stringLiteral(definition.name, sourceFile) : headline(handle),
            kind,
            default: definition.default ? booleanLiteral(definition.default, sourceFile) : false,
            ...(fields ? { fields } : {}),
            source: `/resources/js/templates/${directory}/${filename}`,
        },
    };
}

function parseProgram(source: string, file: string, lineOffset: number): AstNode {
    try {
        const program = babelParse(source, {
            sourceType: 'module',
            plugins: ['typescript'],
        }) as unknown as AstNode;
        shiftNodeLines(program, lineOffset);

        return program;
    } catch (cause) {
        throw validationError(
            file,
            `TypeScript parser error: ${cause instanceof Error ? cause.message : String(cause)}`,
            'Fix the Vue setup syntax and keep the template declaration to the documented authoring DSL.',
            cause,
        );
    }
}

function readAuthoringImports(body: AstNode[], file: string): AuthoringImports {
    const templates = new Map<string, TemplateKind>();
    let fieldName: string | null = null;
    const authoringImports = body.filter(
        (statement) =>
            statement.type === 'ImportDeclaration' &&
            isNode(statement.source) &&
            statement.source.value === AUTHORING_IMPORT,
    );
    if (authoringImports.length !== 1) {
        throw validationError(
            file,
            `Templates must contain exactly one named import from [${AUTHORING_IMPORT}].`,
            'Import one matching template helper and field when the declaration defines fields.',
            undefined,
            authoringImports[1] ?? authoringImports[0],
        );
    }
    const importDeclaration = authoringImports[0] as AstNode;
    for (const specifier of nodeList(importDeclaration, 'specifiers')) {
        if (
            specifier.type !== 'ImportSpecifier' ||
            !isNode(specifier.imported) ||
            !isNode(specifier.local)
        ) {
            throw invalidExpression(file, specifier);
        }
        const imported = String(specifier.imported.name);
        const local = String(specifier.local.name);
        if (imported === 'field') {
            fieldName = local;
            continue;
        }
        const kind = TEMPLATE_HELPERS[imported];
        if (!kind) throw invalidExpression(file, specifier);
        templates.set(local, kind);
    }
    if (templates.size !== 1) {
        throw validationError(
            file,
            'A template must import exactly one template-definition helper.',
            'Import only the helper matching this template and optionally field.',
            undefined,
            importDeclaration,
        );
    }

    const declarations = body.filter(
        (statement) =>
            statement.type === 'ExpressionStatement' &&
            isNode(statement.expression) &&
            statement.expression.type === 'CallExpression' &&
            isNode(statement.expression.callee) &&
            statement.expression.callee.type === 'Identifier' &&
            templates.has(String(statement.expression.callee.name)),
    );
    if (declarations.length !== 1) {
        throw validationError(
            file,
            'Templates must contain exactly one top-level template-definition call.',
            'Call the imported template helper once as a standalone statement inside <script setup lang="ts">.',
            undefined,
            declarations[1] ?? declarations[0] ?? importDeclaration,
        );
    }
    const declaration = declarations[0] as AstNode;
    const importedNames = new Set([...templates.keys(), ...(fieldName ? [fieldName] : [])]);
    const outsideUse = body
        .filter((statement) => statement !== importDeclaration && statement !== declaration)
        .find((statement) => containsReferencedIdentifier(statement, importedNames));
    if (outsideUse) {
        throw validationError(
            file,
            'Authoring helpers may be used only inside the top-level template declaration.',
            'Move runtime behavior to ordinary Vue code and keep authoring helpers exclusive to the declaration.',
            undefined,
            outsideUse,
        );
    }

    return { declaration, field: fieldName, importDeclaration, templates };
}

function readFields(
    expression: AstNode,
    fieldName: string | null,
    file: string,
    kind: AuthoringFieldContext,
    nested: boolean,
): Record<string, TemplateField> {
    if (!fieldName) throw invalidExpression(file, expression);
    if (expression.type !== 'ObjectExpression') throw invalidExpression(file, expression);
    const entries = objectEntries(expression, file);
    if (Object.keys(entries).length > (nested ? 10 : 30)) {
        throw validationError(
            file,
            `A ${nested ? 'list' : kind === 'footer' ? 'footer' : 'template'} may declare at most ${nested ? 10 : 30} fields.`,
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
    kind: AuthoringFieldContext,
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
    if (kind === 'footer' && !FOOTER_FIELD_TYPES.has(type)) {
        throw validationError(
            file,
            `Footer field [${handle}] uses unsupported helper [field.${helper}].`,
            'Use text, longText, richText, boolean, select, image, url, or list.',
            undefined,
            expression,
        );
    }
    if (kind !== 'footer' && type === 'url') {
        throw validationError(
            file,
            `Template field [${handle}] uses footer-only helper [field.url].`,
            'Use field.url only inside defineFooter().',
            undefined,
            expression,
        );
    }
    const allowedListChildren = kind === 'footer' ? FOOTER_LIST_CHILD_TYPES : LIST_CHILD_TYPES;
    if (nested && !allowedListChildren.has(type)) {
        throw validationError(
            file,
            `List child [${handle}] uses unsupported helper [field.${helper}].`,
            kind === 'footer'
                ? 'Footer list rows may contain text, longText, boolean, select, or url fields.'
                : 'List rows may contain text, longText, number, boolean, dateTime, or select fields.',
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

function readFooterSettings(
    expression: AstNode,
    settingName: string | null,
    file: string,
): Record<string, ThemeSetting> {
    if (!settingName || expression.type !== 'ObjectExpression') {
        throw invalidExpression(file, expression);
    }
    const entries = objectEntries(expression, file);
    if (Object.keys(entries).length > 20) {
        throw validationError(
            file,
            'A footer may declare at most 20 settings.',
            'Remove footer settings or move site-wide presentation choices to package settings.',
            undefined,
            expression,
        );
    }

    return Object.fromEntries(
        Object.entries(entries).map(([handle, value]) => [
            handle,
            readFooterSetting(handle, value, settingName, file),
        ]),
    );
}

function readFooterSetting(
    handle: string,
    expression: AstNode,
    settingName: string,
    file: string,
): ThemeSetting {
    if (
        expression.type !== 'CallExpression' ||
        !isNode(expression.callee) ||
        expression.callee.type !== 'MemberExpression' ||
        !isNode(expression.callee.object) ||
        expression.callee.object.type !== 'Identifier' ||
        expression.callee.object.name !== settingName ||
        !isNode(expression.callee.property)
    ) {
        throw invalidExpression(file, expression);
    }
    const type = String(expression.callee.property.name);
    if (!SETTING_HELPERS.has(type)) throw invalidExpression(file, expression);
    const args = nodeList(expression, 'arguments');
    if (args.length !== 1 || !args[0] || args[0].type !== 'ObjectExpression') {
        throw invalidExpression(file, expression);
    }
    const options = objectEntries(args[0], file);
    assertOnlyKeys(options, ['name', 'description', 'default', 'options'], file, args[0]);
    if (!options.name || !options.default) throw invalidExpression(file, args[0]);
    const settingDefinition: ThemeSetting = {
        name: stringLiteral(options.name, file),
        type: type as ThemeSetting['type'],
        default: literalValue(options.default, file) as string | boolean | null,
    };
    if (options.description) {
        settingDefinition.description = stringLiteral(options.description, file);
    }
    if (options.options) {
        if (options.options.type !== 'ArrayExpression') throw invalidExpression(file, options.options);
        settingDefinition.options = nodeList(options.options, 'elements').map((item) =>
            stringLiteral(item, file),
        );
    }
    assertSettingDefault(handle, settingDefinition, file, expression);

    return settingDefinition;
}

function assertSettingDefault(
    handle: string,
    settingDefinition: ThemeSetting,
    file: string,
    node: AstNode,
): void {
    const value = settingDefinition.default;
    const valid =
        (settingDefinition.type === 'text' && typeof value === 'string') ||
        (settingDefinition.type === 'boolean' && typeof value === 'boolean') ||
        (settingDefinition.type === 'color' &&
            typeof value === 'string' &&
            /^#[0-9a-fA-F]{6}$/.test(value)) ||
        (settingDefinition.type === 'image' && value === null) ||
        (settingDefinition.type === 'select' &&
            typeof value === 'string' &&
            settingDefinition.options?.includes(value) === true);
    if (valid) return;

    throw validationError(
        file,
        `Footer setting [${handle}] has an invalid default.`,
        'Use a default matching the setting type and declared select options.',
        undefined,
        node,
    );
}

function assertFooterDefaults(
    defaults: Record<string, unknown>,
    fields: Record<string, TemplateField>,
    file: string,
    node: AstNode,
): void {
    const fieldHandles = Object.keys(fields);
    const defaultHandles = Object.keys(defaults);
    const missing = fieldHandles.find((handle) => !defaultHandles.includes(handle));
    const unknown = defaultHandles.find((handle) => !fieldHandles.includes(handle));
    if (missing || unknown) {
        throw validationError(
            file,
            missing
                ? `Footer field [${missing}] is missing a default.`
                : `Footer default [${unknown}] does not match a declared field.`,
            'Declare exactly one default for every footer field.',
            undefined,
            node,
        );
    }

    for (const [handle, field] of Object.entries(fields)) {
        assertFooterValue(defaults[handle], field, `Footer default [${handle}]`, file, node);
    }
}

function assertFooterValue(
    value: unknown,
    field: TemplateField,
    label: string,
    file: string,
    node: AstNode,
): void {
    const valid =
        (['short_text', 'long_text', 'select', 'url'].includes(field.type) &&
            typeof value === 'string') ||
        (field.type === 'rich_text' && value !== null && typeof value === 'object' && !Array.isArray(value)) ||
        (field.type === 'boolean' && typeof value === 'boolean') ||
        (field.type === 'image' && value === null) ||
        (field.type === 'list' && Array.isArray(value));
    if (!valid) {
        throw validationError(
            file,
            `${label} does not match [${field.type}].`,
            'Use a literal default matching the declared footer field type.',
            undefined,
            node,
        );
    }
    if (field.type === 'select' && !field.options?.includes(String(value))) {
        throw validationError(
            file,
            `${label} is not one of its select options.`,
            'Choose one of the declared options.',
            undefined,
            node,
        );
    }
    if (field.type === 'url' && !isSafeFooterUrl(String(value))) {
        throw validationError(
            file,
            `${label} contains an unsafe URL.`,
            'Use http://, https://, mailto:, or a root-relative path.',
            undefined,
            node,
        );
    }
    if (field.type !== 'list' || !Array.isArray(value)) return;
    const minimum = field.minItems ?? 0;
    const maximum = field.maxItems ?? 20;
    if (value.length < minimum || value.length > maximum) {
        throw validationError(
            file,
            `${label} must contain between ${minimum} and ${maximum} items.`,
            'Adjust the literal list default to match its declared bounds.',
            undefined,
            node,
        );
    }
    const children = field.fields ?? {};
    for (const [index, row] of value.entries()) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
            throw invalidExpression(file, node);
        }
        const record = row as Record<string, unknown>;
        const unknown = Object.keys(record).find((handle) => !children[handle]);
        if (unknown) {
            throw validationError(
                file,
                `${label} item ${index + 1} contains unknown field [${unknown}].`,
                'Use only fields declared for this footer list.',
                undefined,
                node,
            );
        }
        for (const [handle, child] of Object.entries(children)) {
            if (!(handle in record)) {
                if (child.required === true) {
                    throw validationError(
                        file,
                        `${label} item ${index + 1} is missing required field [${handle}].`,
                        'Provide every required list value in the default.',
                        undefined,
                        node,
                    );
                }
                continue;
            }
            assertFooterValue(record[handle], child, `${label}.${index}.${handle}`, file, node);
        }
    }
}

function isSafeFooterUrl(value: string): boolean {
    return value === '' || /^(https?:\/\/|mailto:|\/)/.test(value);
}

function literalObject(node: AstNode, file: string): Record<string, unknown> {
    const value = literalValue(node, file);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw invalidExpression(file, node);
    }

    return value as Record<string, unknown>;
}

function literalValue(node: AstNode, file: string): unknown {
    if (node.type === 'StringLiteral' || node.type === 'BooleanLiteral' || node.type === 'NumericLiteral') {
        return node.value;
    }
    if (node.type === 'NullLiteral') return null;
    if (node.type === 'ArrayExpression') {
        return nodeList(node, 'elements').map((item) => literalValue(item, file));
    }
    if (node.type === 'ObjectExpression') {
        return Object.fromEntries(
            Object.entries(objectEntries(node, file)).map(([key, value]) => [
                key,
                literalValue(value, file),
            ]),
        );
    }
    throw invalidExpression(file, node);
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
        if (options.options.type !== 'ArrayExpression')
            throw invalidExpression(file, options.options);
        field.options = nodeList(options.options, 'elements').map((item) =>
            stringLiteral(item, file),
        );
    }
}

function objectEntries(expression: AstNode, file: string): Record<string, AstNode> {
    const entries: Record<string, AstNode> = {};
    for (const property of nodeList(expression, 'properties')) {
        if (
            property.type !== 'ObjectProperty' ||
            property.computed === true ||
            !isNode(property.value)
        ) {
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
    const valid =
        kind === inferredKind ||
        (directory === 'pages' && kind === 'blog_index') ||
        (directory === 'entries' && kind === 'blog_post');
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

function shiftNodeLines(node: AstNode, offset: number): void {
    if (node.loc?.start.line) node.loc.start.line += offset;

    for (const [key, value] of Object.entries(node)) {
        if (key === 'loc') continue;
        if (Array.isArray(value)) {
            for (const child of value) {
                if (isNode(child)) shiftNodeLines(child, offset);
            }
        } else if (isNode(value)) {
            shiftNodeLines(value, offset);
        }
    }
}

function containsReferencedIdentifier(
    node: AstNode,
    names: Set<string>,
    parent: AstNode | null = null,
    parentKey: string | null = null,
): boolean {
    if (
        node.type === 'Identifier' &&
        typeof node.name === 'string' &&
        names.has(node.name) &&
        !isNonReferenceIdentifier(parent, parentKey)
    ) {
        return true;
    }

    for (const [key, value] of Object.entries(node)) {
        if (key === 'loc') continue;
        if (Array.isArray(value)) {
            if (
                value.some(
                    (child) =>
                        isNode(child) && containsReferencedIdentifier(child, names, node, key),
                )
            ) {
                return true;
            }
        } else if (isNode(value) && containsReferencedIdentifier(value, names, node, key)) {
            return true;
        }
    }

    return false;
}

function isNonReferenceIdentifier(parent: AstNode | null, key: string | null): boolean {
    if (!parent || !key) return false;

    return (
        ((parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') &&
            key === 'property' &&
            parent.computed !== true) ||
        ((parent.type === 'ObjectProperty' ||
            parent.type === 'ObjectMethod' ||
            parent.type === 'ClassMethod' ||
            parent.type === 'ClassProperty') &&
            key === 'key' &&
            parent.computed !== true)
    );
}

function isNode(value: unknown): value is AstNode {
    return (
        typeof value === 'object' &&
        value !== null &&
        'type' in value &&
        typeof value.type === 'string'
    );
}

function invalidExpression(file: string, node: AstNode | undefined): ThemeValidationError {
    return validationError(
        file,
        'Template declaration contains an unsupported TypeScript expression.',
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
