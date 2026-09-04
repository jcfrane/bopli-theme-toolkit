import { realpathSync } from 'node:fs';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { builtinModules, createRequire } from 'node:module';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { babelParse, parse as parseSfc } from '@vue/compiler-sfc';
import type { Plugin } from 'vite';
import { PLATFORM_IMPORTS } from './constants.js';
import type { JsonObject, ThemeDefinition } from './types.js';
import { isFileSystemError } from './utilities.js';
import { ThemeValidationError } from './validation-error.js';

const PRIVILEGED_GLOBALS = new Set([
    'process',
    'global',
    'Buffer',
    'require',
    '__dirname',
    '__filename',
]);

const NODE_BUILTINS = new Set(
    builtinModules.flatMap((specifier) => [specifier, `node:${specifier}`]),
);

type SourceLocation = {
    start: { line: number };
};

type AstNode = {
    type: string;
    loc?: SourceLocation | null;
    [key: string]: unknown;
};

type ImportReference = {
    specifier: string;
    line: number;
};

type ModuleAnalysis = {
    imports: ImportReference[];
    nonLiteralDynamicImportLine?: number;
    privilegedGlobal?: { name: string; line: number };
    viteApi?: { name: string; line: number };
};

type SourceModule = {
    code: string;
    lineOffset: number;
    language: string;
};

/** Reject symbolic links in authored theme source while leaving installed dependencies alone. */
export async function assertNoSymlinks(root: string): Promise<void> {
    await assertNoSymlinksWithin(root, root);
}

async function assertNoSymlinksWithin(themeRoot: string, current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist')
            continue;
        const path = join(current, entry.name);
        if ((await lstat(path)).isSymbolicLink()) {
            throw new ThemeValidationError({
                code: 'BOPLI_E001',
                file: normalizePath(relative(themeRoot, path)),
                message: 'Theme sources may not contain symbolic links.',
                remediation:
                    'Replace the link with a regular file or directory owned by the theme.',
            });
        }
        if (entry.isDirectory()) await assertNoSymlinksWithin(themeRoot, path);
    }
}

/** Validate authored imports and privileged APIs using parsed JavaScript and Vue script blocks. */
export async function validateImports(root: string): Promise<void> {
    const files = await sourceFiles(join(root, 'resources'));
    const canonicalRoot = resolve(root);
    const dependencies = await declaredDependencies(root);

    for (const file of files) {
        const displayFile = normalizePath(relative(root, file));
        const contents = await readFile(file, 'utf8');
        const modules = sourceModules(contents, file, displayFile);

        for (const sourceModule of modules) {
            const analysis = analyzeModule(sourceModule.code, displayFile, sourceModule.language);
            const absoluteLine = (line: number): number => line + sourceModule.lineOffset;
            const authoringImport = analysis.imports.find(
                (reference) => reference.specifier === '@bopli/theme-sdk/authoring',
            );

            if (
                authoringImport &&
                displayFile.endsWith('.vue') &&
                !displayFile.startsWith('resources/js/templates/') &&
                !sourceModule.code.includes('defineFooter')
            ) {
                throw new ThemeValidationError({
                    code: 'BOPLI_E020',
                    file: displayFile,
                    line: absoluteLine(authoringImport.line),
                    message:
                        'A non-template Vue component may import authoring helpers only for defineFooter().',
                    remediation:
                        'Remove the runtime authoring import or add the component’s single top-level footer declaration.',
                });
            }

            if (analysis.viteApi) {
                throw new ThemeValidationError({
                    code: 'BOPLI_E022',
                    file: displayFile,
                    line: absoluteLine(analysis.viteApi.line),
                    message: `Vite glob and environment access is not allowed in theme source (${analysis.viteApi.name}).`,
                    remediation:
                        'Import explicit theme-owned files and pass public configuration through theme settings.',
                });
            }
            if (analysis.nonLiteralDynamicImportLine) {
                throw new ThemeValidationError({
                    code: 'BOPLI_E022',
                    file: displayFile,
                    line: absoluteLine(analysis.nonLiteralDynamicImportLine),
                    message: 'Dynamic imports must use a string literal.',
                    remediation:
                        'Replace the computed import with an explicit map of literal import() calls.',
                });
            }
            if (analysis.privilegedGlobal) {
                throw new ThemeValidationError({
                    code: 'BOPLI_E023',
                    file: displayFile,
                    line: absoluteLine(analysis.privilegedGlobal.line),
                    message: `Privileged server global [${analysis.privilegedGlobal.name}] is not allowed in theme source.`,
                    remediation:
                        'Use browser APIs or data supplied through the public theme runtime contract.',
                });
            }

            for (const imported of analysis.imports) {
                await validateImportReference(
                    canonicalRoot,
                    file,
                    displayFile,
                    imported.specifier,
                    absoluteLine(imported.line),
                    dependencies,
                );
            }
        }
    }
}

/** Enforce theme-root resolution and scan bundled dependency modules for privileged globals. */
export function importBoundaryPlugin(theme: ThemeDefinition): Plugin {
    const canonicalRoot = realpathSync(resolve(theme.root));
    const dependencyRoot = join(canonicalRoot, 'node_modules');

    return {
        name: 'bopli-theme-import-boundary',
        enforce: 'pre',
        async resolveId(source, importer) {
            if (!importer) return null;

            const cleanImporter = cleanModuleId(importer);
            if (cleanImporter.startsWith('\0')) return null;
            if (!isWithin(canonicalRoot, cleanImporter)) return null;

            const cleanSource = source.split(/[?#]/, 1)[0] as string;
            if (cleanSource.startsWith('\0') || PLATFORM_IMPORTS.has(cleanSource)) return null;

            if (cleanSource.startsWith('.') || cleanSource.startsWith('/')) {
                const target = cleanSource.startsWith('/')
                    ? resolve(canonicalRoot, `.${cleanSource}`)
                    : resolve(dirname(cleanImporter), cleanSource);
                if (!isWithin(canonicalRoot, target)) {
                    throw new ThemeValidationError({
                        code: 'BOPLI_E021',
                        file: normalizePath(relative(canonicalRoot, cleanImporter)),
                        message: `Resolved import [${source}] escapes the theme root.`,
                        remediation: 'Move the imported file into the theme repository.',
                    });
                }

                return null;
            }

            if (isNodeBuiltin(cleanSource)) {
                throw nodeBuiltinError(canonicalRoot, cleanImporter, cleanSource);
            }

            const resolved = await this.resolve(source, importer, { skipSelf: true });
            if (!resolved) return null;
            const resolvedId = cleanModuleId(resolved.id);
            if (isNodeBuiltin(resolvedId)) {
                throw nodeBuiltinError(canonicalRoot, cleanImporter, resolvedId);
            }
            if (!resolvedId.startsWith('\0') && !isWithin(dependencyRoot, resolvedId)) {
                throw new ThemeValidationError({
                    code: 'BOPLI_E020',
                    file: normalizePath(relative(canonicalRoot, cleanImporter)),
                    message: `Package import [${source}] did not resolve inside the theme's node_modules.`,
                    remediation: `Declare [${packageName(source)}] directly in package.json and install dependencies in the theme repository.`,
                });
            }

            return null;
        },
        transform(code, id) {
            const cleanId = cleanModuleId(id);
            if (!isWithin(dependencyRoot, cleanId) || !isJavaScriptFile(cleanId)) return null;

            const displayFile = normalizePath(relative(canonicalRoot, cleanId));
            const analysis = analyzeModule(code, displayFile, extname(cleanId).slice(1), true);
            if (analysis.privilegedGlobal) {
                throw new ThemeValidationError({
                    code: 'BOPLI_E023',
                    file: displayFile,
                    line: analysis.privilegedGlobal.line,
                    message: `Dependency source uses privileged server global [${analysis.privilegedGlobal.name}].`,
                    remediation:
                        'Choose a browser-safe dependency whose bundled sources do not access Node globals.',
                });
            }

            return null;
        },
    };
}

/** Assert that an emitted bundle module retains no privileged globals or Node imports. */
export async function assertCompiledModuleIsSafe(root: string, file: string): Promise<void> {
    const contents = await readFile(file, 'utf8');
    const displayFile = normalizePath(relative(root, file));
    const analysis = analyzeModule(contents, displayFile, 'js');
    if (analysis.privilegedGlobal) {
        throw new ThemeValidationError({
            code: 'BOPLI_E023',
            file: displayFile,
            line: analysis.privilegedGlobal.line,
            message: `Compiled bundle retains privileged global [${analysis.privilegedGlobal.name}].`,
            remediation:
                'Replace the dependency with a browser-safe package that does not access Node globals.',
        });
    }
    const builtin = analysis.imports.find((reference) => isNodeBuiltin(reference.specifier));
    if (!builtin) return;

    throw new ThemeValidationError({
        code: 'BOPLI_E024',
        file: displayFile,
        line: builtin.line,
        message: `Server bundle retains Node built-in import [${builtin.specifier}].`,
        remediation:
            'Replace the dependency with a browser-safe package that bundles without Node built-ins.',
    });
}

async function validateImportReference(
    root: string,
    importer: string,
    displayFile: string,
    specifier: string,
    line: number,
    dependencies: Set<string>,
): Promise<void> {
    if (
        specifier === '@bopli/theme-sdk/authoring' &&
        !/^resources\/js\/.+\.vue$/.test(displayFile)
    ) {
        throw new ThemeValidationError({
            code: 'BOPLI_E020',
            file: displayFile,
            line,
            message: 'Theme authoring helpers may be imported only by Vue components.',
            remediation:
                'Move the compile-time declaration into a Vue setup block under resources/js.',
        });
    }
    if (PLATFORM_IMPORTS.has(specifier)) return;

    if (specifier.startsWith('.')) {
        const target = resolve(dirname(importer), specifier);
        if (!isWithin(root, target)) {
            throw new ThemeValidationError({
                code: 'BOPLI_E021',
                file: displayFile,
                line,
                message: `Import [${specifier}] escapes the theme root.`,
                remediation: 'Move the imported file into the theme repository.',
            });
        }
        return;
    }

    const dependency = packageName(specifier);
    if (isNodeBuiltin(specifier) || !dependency || !dependencies.has(dependency)) {
        throw new ThemeValidationError({
            code: 'BOPLI_E020',
            file: displayFile,
            line,
            message: `Package import [${specifier}] is not an installed direct theme dependency.`,
            remediation: `Add [${dependency || specifier}] to package.json and install it in the theme repository.`,
        });
    }

    try {
        const dependencyPath = join(root, 'node_modules', ...dependency.split('/'));
        await lstat(dependencyPath);
        const resolvedFile = createRequire(join(root, 'package.json')).resolve(specifier);
        const canonicalDependencyRoot = await realpath(join(root, 'node_modules'));
        const canonicalResolvedFile = await realpath(resolvedFile);
        if (!isWithin(canonicalDependencyRoot, canonicalResolvedFile)) {
            throw new Error('outside node_modules');
        }
    } catch (cause) {
        throw new ThemeValidationError({
            code: 'BOPLI_E020',
            file: displayFile,
            line,
            message: `Package import [${specifier}] does not resolve from the theme's node_modules.`,
            remediation: `Install [${dependency}] in the theme repository and commit the updated lockfile.`,
            cause,
        });
    }
}

function sourceModules(contents: string, file: string, displayFile: string): SourceModule[] {
    if (extname(file) !== '.vue') {
        return [{ code: contents, lineOffset: 0, language: extname(file).slice(1) }];
    }

    const parsed = parseSfc(contents, { filename: displayFile });
    const error = parsed.errors[0];
    if (error) {
        throw new ThemeValidationError({
            code: 'BOPLI_E010',
            file: displayFile,
            line: compilerErrorLine(error),
            message: `Vue could not parse this single-file component: ${compilerErrorMessage(error)}`,
            remediation: 'Fix the reported Vue syntax before validating the theme again.',
            cause: error,
        });
    }

    return [parsed.descriptor.script, parsed.descriptor.scriptSetup]
        .filter((block) => block !== null)
        .map((block) => ({
            code: block.content,
            lineOffset: block.loc.start.line - 1,
            language: block.lang ?? 'js',
        }));
}

function analyzeModule(
    code: string,
    file: string,
    language: string,
    allowGuardedProcess = false,
): ModuleAnalysis {
    let program: ReturnType<typeof babelParse>;
    try {
        program = babelParse(code, {
            sourceType: 'module',
            plugins: parserPlugins(language),
        });
    } catch (cause) {
        const line = parserErrorLine(cause);
        throw new ThemeValidationError({
            code: 'BOPLI_E010',
            file,
            ...(line ? { line } : {}),
            message: `JavaScript parser error: ${cause instanceof Error ? cause.message : String(cause)}`,
            remediation: 'Fix the script syntax before validating the theme again.',
            cause,
        });
    }

    const analysis: ModuleAnalysis = { imports: [] };
    walkAst(program as unknown as AstNode, null, null, [], (node, parent, key, ancestors) => {
        const line = node.loc?.start.line ?? 1;

        if (
            (node.type === 'ImportDeclaration' ||
                node.type === 'ExportNamedDeclaration' ||
                node.type === 'ExportAllDeclaration') &&
            isAstNode(node.source) &&
            typeof node.source.value === 'string'
        ) {
            analysis.imports.push({ specifier: node.source.value, line });
        }

        if (node.type === 'ImportExpression') {
            if (isAstNode(node.source) && typeof node.source.value === 'string') {
                analysis.imports.push({ specifier: node.source.value, line });
            } else {
                analysis.nonLiteralDynamicImportLine ??= line;
            }
        }

        if (
            node.type === 'CallExpression' &&
            isAstNode(node.callee) &&
            node.callee.type === 'Import'
        ) {
            const firstArgument = Array.isArray(node.arguments) ? node.arguments[0] : undefined;
            if (isAstNode(firstArgument) && typeof firstArgument.value === 'string') {
                analysis.imports.push({ specifier: firstArgument.value, line });
            } else {
                analysis.nonLiteralDynamicImportLine ??= line;
            }
        }

        if (
            node.type === 'MemberExpression' &&
            isAstNode(node.object) &&
            node.object.type === 'MetaProperty' &&
            isImportMeta(node.object) &&
            isAstNode(node.property) &&
            typeof node.property.name === 'string' &&
            (node.property.name === 'glob' || node.property.name === 'env')
        ) {
            analysis.viteApi ??= {
                name: `import.meta.${node.property.name}`,
                line,
            };
        }

        if (
            !analysis.privilegedGlobal &&
            node.type === 'Identifier' &&
            typeof node.name === 'string' &&
            PRIVILEGED_GLOBALS.has(node.name) &&
            !isNonReferenceIdentifier(parent, key) &&
            !(allowGuardedProcess && isGuardedPrivilegedReference(node, parent, ancestors))
        ) {
            analysis.privilegedGlobal = { name: node.name, line };
        }
    });

    return analysis;
}

function walkAst(
    node: AstNode,
    parent: AstNode | null,
    key: string | null,
    ancestors: AstNode[],
    visitor: (
        node: AstNode,
        parent: AstNode | null,
        key: string | null,
        ancestors: AstNode[],
    ) => void,
): void {
    visitor(node, parent, key, ancestors);
    const nextAncestors = [...ancestors, node];
    for (const [childKey, value] of Object.entries(node)) {
        if (childKey === 'loc' || childKey === 'tokens' || childKey === 'comments') continue;
        if (Array.isArray(value)) {
            for (const child of value) {
                if (isAstNode(child)) walkAst(child, node, childKey, nextAncestors, visitor);
            }
        } else if (isAstNode(value)) {
            walkAst(value, node, childKey, nextAncestors, visitor);
        }
    }
}

function isGuardedPrivilegedReference(
    node: AstNode,
    parent: AstNode | null,
    ancestors: AstNode[],
): boolean {
    if (parent?.type === 'UnaryExpression' && parent.operator === 'typeof') return true;
    if (node.name === 'process' && isNodeEnvReference(node, ancestors)) return true;
    if (typeof node.name !== 'string') return false;
    const name = node.name;

    return ancestors.some(
        (ancestor) =>
            ((ancestor.type === 'LogicalExpression' &&
                ancestor.operator === '&&' &&
                isAstNode(ancestor.left) &&
                isAstNode(ancestor.right) &&
                containsTypeofIdentifier(ancestor.left, name) &&
                containsNode(ancestor.right, node)) ||
                (ancestor.type === 'ConditionalExpression' &&
                    isAstNode(ancestor.test) &&
                    containsTypeofIdentifier(ancestor.test, name))),
    );
}

function isNodeEnvReference(processNode: AstNode, ancestors: AstNode[]): boolean {
    return ancestors.some(
        (ancestor) =>
            ancestor.type === 'MemberExpression' &&
            ancestor.computed !== true &&
            isAstNode(ancestor.object) &&
            ancestor.object.type === 'MemberExpression' &&
            ancestor.object.computed !== true &&
            isAstNode(ancestor.object.object) &&
            ancestor.object.object === processNode &&
            isAstNode(ancestor.object.property) &&
            ancestor.object.property.name === 'env' &&
            isAstNode(ancestor.property) &&
            ancestor.property.name === 'NODE_ENV',
    );
}

function containsTypeofIdentifier(node: AstNode, name: string): boolean {
    if (
        node.type === 'UnaryExpression' &&
        node.operator === 'typeof' &&
        isAstNode(node.argument) &&
        node.argument.type === 'Identifier' &&
        node.argument.name === name
    ) {
        return true;
    }
    return childNodes(node).some((child) => containsTypeofIdentifier(child, name));
}

function containsNode(root: AstNode, candidate: AstNode): boolean {
    return root === candidate || childNodes(root).some((child) => containsNode(child, candidate));
}

function childNodes(node: AstNode): AstNode[] {
    return Object.entries(node).flatMap(([key, value]) => {
        if (key === 'loc' || key === 'tokens' || key === 'comments') return [];
        if (Array.isArray(value)) return value.filter(isAstNode);
        return isAstNode(value) ? [value] : [];
    });
}

function isNonReferenceIdentifier(parent: AstNode | null, key: string | null): boolean {
    if (!parent || !key) return false;
    if (
        (parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') &&
        key === 'property' &&
        parent.computed !== true
    ) {
        return true;
    }
    if (
        (parent.type === 'ObjectProperty' ||
            parent.type === 'ObjectMethod' ||
            parent.type === 'ClassMethod' ||
            parent.type === 'ClassProperty') &&
        key === 'key' &&
        parent.computed !== true &&
        parent.shorthand !== true
    ) {
        return true;
    }
    return parent.type.startsWith('Import') || parent.type.startsWith('Export');
}

function isImportMeta(node: AstNode): boolean {
    return (
        isAstNode(node.meta) &&
        node.meta.name === 'import' &&
        isAstNode(node.property) &&
        node.property.name === 'meta'
    );
}

function parserPlugins(
    language: string,
): NonNullable<NonNullable<Parameters<typeof babelParse>[1]>['plugins']> {
    const plugins: NonNullable<NonNullable<Parameters<typeof babelParse>[1]>['plugins']> = [];
    if (language === 'ts' || language === 'tsx') plugins.push('typescript');
    if (language === 'jsx' || language === 'tsx') plugins.push('jsx');
    return plugins;
}

async function declaredDependencies(root: string): Promise<Set<string>> {
    const packageDefinition = JSON.parse(
        await readFile(join(root, 'package.json'), 'utf8'),
    ) as JsonObject;
    const groups = [
        packageDefinition.dependencies,
        packageDefinition.devDependencies,
        packageDefinition.peerDependencies,
    ];
    return new Set(
        groups.flatMap((group) =>
            group && typeof group === 'object' && !Array.isArray(group) ? Object.keys(group) : [],
        ),
    );
}

function packageName(specifier: string): string | null {
    if (specifier.startsWith('@')) {
        const [scope, name] = specifier.split('/');
        return scope && name ? `${scope}/${name}` : null;
    }
    return specifier.split('/')[0] || null;
}

function isNodeBuiltin(specifier: string): boolean {
    return NODE_BUILTINS.has(specifier) || NODE_BUILTINS.has(specifier.replace(/^node:/, ''));
}

function nodeBuiltinError(root: string, importer: string, specifier: string): ThemeValidationError {
    return new ThemeValidationError({
        code: 'BOPLI_E024',
        file: normalizePath(relative(root, importer)),
        message: `Node built-in import [${specifier}] is not allowed in a theme bundle.`,
        remediation:
            'Replace the dependency with a browser-safe package that has no Node built-in imports.',
    });
}

function isWithin(root: string, candidate: string): boolean {
    const result = relative(root, candidate);
    return (
        result === '' || (!result.startsWith(`..${sep}`) && result !== '..' && !isAbsolute(result))
    );
}

function cleanModuleId(id: string): string {
    return id.split(/[?#]/, 1)[0] as string;
}

function isJavaScriptFile(file: string): boolean {
    return ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx'].includes(extname(file));
}

function normalizePath(path: string): string {
    return path.split(sep).join('/');
}

function isAstNode(value: unknown): value is AstNode {
    return Boolean(
        value && typeof value === 'object' && 'type' in value && typeof value.type === 'string',
    );
}

function parserErrorLine(error: unknown): number | undefined {
    if (!error || typeof error !== 'object' || !('loc' in error)) return undefined;
    const location = error.loc;
    if (!location || typeof location !== 'object' || !('line' in location)) return undefined;
    return typeof location.line === 'number' ? location.line : undefined;
}

function compilerErrorLine(error: unknown): number | undefined {
    if (!error || typeof error !== 'object' || !('loc' in error)) return undefined;
    const location = error.loc;
    if (!location || typeof location !== 'object' || !('start' in location)) return undefined;
    const start = location.start;
    if (!start || typeof start !== 'object' || !('line' in start)) return undefined;
    return typeof start.line === 'number' ? start.line : undefined;
}

function compilerErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function sourceFiles(root: string): Promise<string[]> {
    const files: string[] = [];
    let entries;

    try {
        entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
        if (isFileSystemError(error, 'ENOENT')) return files;
        throw error;
    }

    for (const entry of entries) {
        const path = join(root, entry.name);
        if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
        else if (entry.isFile() && (entry.name.endsWith('.vue') || isJavaScriptFile(entry.name))) {
            files.push(path);
        }
    }

    return files;
}
