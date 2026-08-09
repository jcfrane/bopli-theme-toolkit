import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { STARTER_RECIPE_VERSION } from './constants.js';
import {
    validateStarterModel,
    type StarterModel,
} from './starter-content-model.js';
import { validateStarterEntry, validateStarterPage } from './starter-content.js';
import type { JsonObject, StarterRecipe, ThemeTemplates } from './types.js';
import {
    assertObject,
    assertOnlyKeys,
    boundedArray,
    isFileSystemError,
} from './utilities.js';

export async function readStarterRecipe(
    root: string,
    templates: ThemeTemplates,
): Promise<StarterRecipe | null> {
    const path = join(root, 'resources/bopli/starter.json');
    let contents: string;

    try {
        contents = await readFile(path, 'utf8');
    } catch (error) {
        if (isFileSystemError(error, 'ENOENT')) return null;
        throw error;
    }

    let recipe: unknown;
    try {
        recipe = JSON.parse(contents) as unknown;
    } catch {
        throw new Error('The starter-content recipe contains invalid JSON.');
    }

    validateStarterRecipe(recipe, templates);

    return recipe;
}

function validateStarterRecipe(
    recipe: unknown,
    templates: ThemeTemplates,
): asserts recipe is StarterRecipe {
    assertObject(recipe, 'The starter-content recipe must be a JSON object.');
    assertOnlyKeys(
        recipe,
        ['version', 'contentModels', 'entries', 'pages', 'blog'],
        'starter-content recipe',
    );
    if (recipe.version !== STARTER_RECIPE_VERSION) {
        throw new Error(`The starter-content recipe version must be ${STARTER_RECIPE_VERSION}.`);
    }

    const contentModels = boundedArray(recipe.contentModels, 'contentModels', 50);
    const entries = boundedArray(recipe.entries, 'entries', 200);
    const pages = boundedArray(recipe.pages, 'pages', 50);
    const models = new Map<string, StarterModel>();

    contentModels.forEach((model, index) => validateStarterModel(model, index, templates, models));
    entries.forEach((entry, index) => validateStarterEntry(entry, index, models));
    pages.forEach((page, index) => validateStarterPage(page, index, templates, models));
    validateBlog(recipe.blog);

    recipe.contentModels = contentModels as JsonObject[];
    recipe.entries = entries as JsonObject[];
    recipe.pages = pages as JsonObject[];
}

function validateBlog(value: unknown): void {
    if (value === undefined) return;

    assertObject(value, 'Starter blog settings must be a JSON object.');
    assertOnlyKeys(value, ['enabled'], 'starter blog settings');
    if (typeof value.enabled !== 'boolean') {
        throw new Error('Starter blog settings must declare a boolean enabled value.');
    }
}
