import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
    assertTemplateMetadata,
    assertThemePackageMetadata,
    THEME_SETTING_TYPES,
} from '@bopli/theme-protocol';
import { parse as parseSfc } from '@vue/compiler-sfc';
import semver from 'semver';
import { CONTENT_FIELD_TYPES, RESERVED_ENTRY_FIELDS } from './constants.js';
import { assertNoSymlinks, validateImports } from './source-validation.js';
import { readStarterRecipe } from './starter-recipe.js';
import type {
    JsonObject,
    TemplateField,
    TemplateKind,
    ThemeDefinition,
    ThemeSetting,
    ThemeSettingType,
    ThemeTemplate,
    ThemeTemplates,
} from './types.js';
import { assertObject, headline, isFileSystemError, snakeCase } from './utilities.js';
import { ThemeValidationError } from './validation-error.js';

const TEMPLATE_DIRECTORIES: Array<[string, TemplateKind]> = [
    ['pages', 'page'],
    ['entries', 'entry'],
];

const LEGACY_TEMPLATE_DIRECTORIES = ['blogs', 'posts'];

export async function inspectTheme(root: string): Promise<ThemeDefinition> {
    try {
        return await inspectThemeDefinition(root);
    } catch (error) {
        if (error instanceof ThemeValidationError) throw error;
        throw new ThemeValidationError({
            code: 'BOPLI_E000',
            file: '.',
            message: error instanceof Error ? error.message : String(error),
            remediation: 'Review the theme authoring rules and correct the reported value.',
            cause: error,
        });
    }
}

async function inspectThemeDefinition(root: string): Promise<ThemeDefinition> {
    await assertNoSymlinks(root);
    const packageDefinition = await readPackage(root);
    const bopli = packageDefinition.bopli;
    assertObject(bopli, 'package.json bopli metadata must be a JSON object.');
    assertThemePackageMetadata(bopli);
    if (
        !/^[A-Za-z0-9_-]{1,80}$/.test(String(bopli.handle ?? '')) ||
        typeof bopli.name !== 'string'
    ) {
        throw new Error('package.json bopli metadata must contain a valid handle and name.');
    }
    if (
        typeof packageDefinition.version !== 'string' ||
        !semver.valid(packageDefinition.version) ||
        typeof bopli.requires !== 'string' ||
        !semver.validRange(bopli.requires)
    ) {
        throw new Error('The theme version and Bopli constraint must be valid semver values.');
    }

    await assertNoLegacyTemplateDirectories(root);
    const templates = await discoverTemplates(root);
    assertTemplateDefaults(templates);
    await validateImports(root);
    const starter = await readStarterRecipe(root, templates);
    const author = themeAuthor(packageDefinition);
    const previewSource = await themePreviewSource(root, bopli.preview);

    return {
        root,
        handle: String(bopli.handle),
        name: bopli.name,
        version: packageDefinition.version,
        constraint: bopli.requires,
        description:
            typeof packageDefinition.description === 'string'
                ? packageDefinition.description
                : null,
        author,
        colorModes: bopli.colorModes ?? [],
        previewSource,
        settings: themeSettings(bopli.settings),
        templates,
        starter,
    };
}

async function themePreviewSource(root: string, value: unknown): Promise<string | null> {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error('The configured theme preview must be a non-empty file path.');
    }

    const source = resolve(root, value);
    const relativeSource = relative(root, source);
    if (
        relativeSource.startsWith('..') ||
        isAbsolute(relativeSource) ||
        !(await stat(source)).isFile()
    ) {
        throw new Error('The configured theme preview must be a file inside the theme root.');
    }

    return relativeSource.split(sep).join('/');
}

async function readPackage(root: string): Promise<JsonObject> {
    const value = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as unknown;
    assertObject(value, 'package.json must contain a JSON object.');

    return value;
}

async function discoverTemplates(root: string): Promise<ThemeTemplates> {
    const templates: ThemeTemplates = {};

    for (const [directory, kind] of TEMPLATE_DIRECTORIES) {
        const templateRoot = join(root, 'resources/js/templates', directory);
        let entries;
        try {
            entries = await readdir(templateRoot, { withFileTypes: true });
        } catch (error) {
            if (isFileSystemError(error, 'ENOENT')) continue;
            throw error;
        }

        for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
            if (isIgnorableTemplateEntry(entry.name)) continue;
            if (!entry.isFile() || extname(entry.name) !== '.vue') {
                throw new ThemeValidationError({
                    code: 'BOPLI_E004',
                    file: `resources/js/templates/${directory}/${entry.name}`,
                    message: `Template directory [${directory}] contains unsupported entry [${entry.name}].`,
                    remediation:
                        'Keep only top-level .vue templates in this directory; move helpers into resources/js/components.',
                });
            }

            const handle = snakeCase(entry.name.slice(0, -4));
            if (templates[handle])
                throw new Error(`Template handle [${handle}] is declared more than once.`);
            templates[handle] = await inspectTemplate(
                templateRoot,
                directory,
                entry.name,
                kind,
                handle,
            );
        }
    }

    if (Object.keys(templates).length === 0) {
        throw new Error('The theme does not declare any templates.');
    }

    return templates;
}

async function assertNoLegacyTemplateDirectories(root: string): Promise<void> {
    for (const directory of LEGACY_TEMPLATE_DIRECTORIES) {
        const path = join(root, 'resources/js/templates', directory);

        try {
            if ((await stat(path)).isDirectory()) {
                throw new Error(
                    `Legacy template directory [${directory}] is not supported. Put native Blog templates in [pages] or [entries] and declare their kind in the <bopli> block.`,
                );
            }
        } catch (error) {
            if (isFileSystemError(error, 'ENOENT')) continue;
            throw error;
        }
    }
}

async function inspectTemplate(
    templateRoot: string,
    directory: string,
    filename: string,
    inferredKind: TemplateKind,
    handle: string,
): Promise<ThemeTemplate> {
    const sourceFile = `resources/js/templates/${directory}/${filename}`;
    const contents = await readFile(join(templateRoot, filename), 'utf8');
    const parsedMetadata = parseMetadata(contents, sourceFile);
    const metadata = parsedMetadata.value;
    const kind = templateKind(metadata.kind, inferredKind, directory, filename);
    const fields =
        metadata.fields === undefined
            ? undefined
            : templateFields(metadata.fields, directory, filename);
    if (metadata.slots !== undefined) {
        throw new Error(`Template [${directory}/${filename}] may not declare slots.`);
    }

    if (kind === 'entry' && (!fields || Object.keys(fields).length === 0)) {
        throw new ThemeValidationError({
            code: 'BOPLI_E012',
            file: sourceFile,
            line: parsedMetadata.line,
            message: 'Entry templates must declare at least one field.',
            remediation: 'Add a non-empty fields object to the template <bopli> block.',
        });
    }
    if (kind === 'entry') {
        const reservedField = Object.keys(fields ?? {}).find((field) =>
            RESERVED_ENTRY_FIELDS.has(field),
        );
        if (reservedField) {
            throw new ThemeValidationError({
                code: 'BOPLI_E013',
                file: sourceFile,
                line: parsedMetadata.line,
                message: `Entry template redeclares reserved field [${reservedField}].`,
                remediation:
                    'Rename the field to a theme-owned projection key that does not collide with Bopli metadata.',
            });
        }
    }
    if (kind === 'page' && fields) {
        throw new Error(`Page template [${directory}/${filename}] may not declare fields.`);
    }
    if ((kind === 'blog_index' || kind === 'blog_post') && fields) {
        throw new Error(`Native Blog template [${directory}/${filename}] may not declare fields.`);
    }
    assertTemplateMetadata(metadata, `Template [${directory}/${filename}] metadata`);

    return {
        name: typeof metadata.name === 'string' ? metadata.name : headline(handle),
        kind,
        default: metadata.default === true,
        ...(kind === 'entry' ? { fields: fields ?? {} } : {}),
        source: `/resources/js/templates/${directory}/${filename}`,
    };
}

function templateKind(
    value: unknown,
    inferredKind: TemplateKind,
    directory: string,
    filename: string,
): TemplateKind {
    if (value === undefined) return inferredKind;

    const allowedKinds: Record<string, TemplateKind[]> = {
        pages: ['page', 'blog_index'],
        entries: ['entry', 'blog_post'],
    };
    const allowed = allowedKinds[directory] ?? [];
    if (typeof value !== 'string' || !allowed.includes(value as TemplateKind)) {
        throw new Error(
            `Template [${directory}/${filename}] declares invalid kind [${String(value)}].`,
        );
    }

    return value as TemplateKind;
}

function parseMetadata(contents: string, file: string): { value: JsonObject; line: number } {
    const parsed = parseSfc(contents, { filename: file });
    const parseError = parsed.errors[0];
    if (parseError) {
        throw new ThemeValidationError({
            code: 'BOPLI_E010',
            file,
            message: `Vue could not parse this single-file component: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
            remediation: 'Fix the reported Vue syntax before validating the template again.',
            cause: parseError,
        });
    }
    const block = parsed.descriptor.customBlocks.find((candidate) => candidate.type === 'bopli');
    if (!block) return { value: {}, line: 1 };

    try {
        const metadata = JSON.parse(block.content) as unknown;
        assertObject(metadata, 'Template metadata must be a JSON object.');
        return { value: metadata, line: block.loc.start.line };
    } catch (cause) {
        throw new ThemeValidationError({
            code: 'BOPLI_E010',
            file,
            line: block.loc.start.line,
            message: 'The <bopli> block contains invalid JSON.',
            remediation: 'Use one JSON object with quoted keys and no trailing commas.',
            cause,
        });
    }
}

function isIgnorableTemplateEntry(name: string): boolean {
    return name.startsWith('.') || name === 'Thumbs.db' || name.endsWith('.swp');
}

function templateFields(
    value: unknown,
    directory: string,
    filename: string,
): Record<string, TemplateField> {
    assertObject(value, `Template [${directory}/${filename}] fields must be a JSON object.`);

    return Object.fromEntries(
        Object.entries(value).map(([handle, definition]) => {
            assertObject(
                definition,
                `Template [${directory}/${filename}] field [${handle}] must be a JSON object.`,
            );
            const unknownKey = Object.keys(definition).find(
                (key) => !['name', 'type', 'required'].includes(key),
            );
            if (unknownKey) {
                throw new Error(
                    `Template [${directory}/${filename}] field [${handle}] contains unsupported key [${unknownKey}].`,
                );
            }
            if (
                typeof definition.name !== 'string' ||
                definition.name.length === 0 ||
                definition.name.length > 255
            ) {
                throw new Error(
                    `Template [${directory}/${filename}] field [${handle}] must declare a name.`,
                );
            }
            if (typeof definition.type !== 'string' || !CONTENT_FIELD_TYPES.has(definition.type)) {
                throw new Error(
                    `Template [${directory}/${filename}] field [${handle}] has an unsupported type.`,
                );
            }
            if (definition.required !== undefined && typeof definition.required !== 'boolean') {
                throw new Error(
                    `Template [${directory}/${filename}] field [${handle}] has an invalid required flag.`,
                );
            }

            return [handle, definition as TemplateField];
        }),
    );
}

function assertTemplateDefaults(templates: ThemeTemplates): void {
    const groups: Array<[string, ThemeTemplate[], boolean]> = [
        ['Page', byKind(templates, 'page'), true],
        ['Entry', byKind(templates, 'entry'), true],
        ['Blog index', byKind(templates, 'blog_index'), false],
        ['Blog post', byKind(templates, 'blog_post'), false],
    ];
    if ((groups[2]?.[1].length === 0) !== (groups[3]?.[1].length === 0)) {
        throw new Error('A theme must provide Blog index and Blog post templates as a pair.');
    }

    for (const [label, candidates, required] of groups) {
        if (required && candidates.length === 0) {
            throw new Error(`A theme must provide at least one ${label} template.`);
        }
        if (candidates.length === 1 && candidates[0]) candidates[0].default = true;
        if (
            candidates.length > 1 &&
            candidates.filter((template) => template.default).length !== 1
        ) {
            throw new Error(`${label} templates must mark exactly one template as default.`);
        }
    }
}

function byKind(templates: ThemeTemplates, kind: TemplateKind): ThemeTemplate[] {
    return Object.values(templates).filter((template) => template.kind === kind);
}

function themeAuthor(packageDefinition: JsonObject): string | null {
    if (typeof packageDefinition.author === 'string') return packageDefinition.author;
    if (
        !packageDefinition.author ||
        typeof packageDefinition.author !== 'object' ||
        Array.isArray(packageDefinition.author)
    )
        return null;

    return 'name' in packageDefinition.author && typeof packageDefinition.author.name === 'string'
        ? packageDefinition.author.name
        : null;
}

function themeSettings(value: unknown): Record<string, ThemeSetting> {
    if (value === undefined) return {};
    assertObject(value, 'Theme settings must be a JSON object.');
    if (Object.keys(value).length > 20) throw new Error('A theme may declare at most 20 settings.');

    return Object.fromEntries(
        Object.entries(value).map(([handle, definition]) => {
            if (!/^[A-Za-z0-9_-]{1,80}$/.test(handle))
                throw new Error(`Theme setting [${handle}] has an invalid handle.`);
            assertObject(definition, `Theme setting [${handle}] must be a JSON object.`);
            const type = definition.type;
            if (typeof type !== 'string' || !THEME_SETTING_TYPES.has(type)) {
                throw new Error(`Theme setting [${handle}] has an unsupported type.`);
            }
            if (
                typeof definition.name !== 'string' ||
                definition.name.length === 0 ||
                definition.name.length > 255
            ) {
                throw new Error(`Theme setting [${handle}] must declare a name.`);
            }
            if (
                definition.description !== undefined &&
                typeof definition.description !== 'string'
            ) {
                throw new Error(`Theme setting [${handle}] has an invalid description.`);
            }
            validateSettingDefault(
                handle,
                type as ThemeSettingType,
                definition.default,
                definition.options,
            );

            return [handle, definition as ThemeSetting];
        }),
    );
}

function validateSettingDefault(
    handle: string,
    type: ThemeSettingType,
    value: unknown,
    options: unknown,
): void {
    if (type === 'boolean' && typeof value !== 'boolean')
        throw new Error(`Theme setting [${handle}] requires a boolean default.`);
    if (type === 'image' && value !== null)
        throw new Error(`Theme setting [${handle}] requires a null image default.`);
    if (type === 'color' && (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value))) {
        throw new Error(`Theme setting [${handle}] requires a six-digit hex color default.`);
    }
    if (type === 'text' && (typeof value !== 'string' || value.length > 500)) {
        throw new Error(
            `Theme setting [${handle}] requires a text default no longer than 500 characters.`,
        );
    }
    if (type !== 'select') return;
    if (
        !Array.isArray(options) ||
        options.length === 0 ||
        options.length > 20 ||
        options.some((option) => typeof option !== 'string')
    ) {
        throw new Error(`Theme setting [${handle}] requires string options.`);
    }
    if (typeof value !== 'string' || !options.includes(value)) {
        throw new Error(`Theme setting [${handle}] default must be one of its options.`);
    }
}
