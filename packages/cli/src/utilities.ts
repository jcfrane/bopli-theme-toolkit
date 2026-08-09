import { createHash } from 'node:crypto';
import type { CliOptions, JsonObject } from './types.js';

export function parseOptions(args: string[]): CliOptions {
    const options: CliOptions = {};

    for (let index = 0; index < args.length; index++) {
        const argument = args[index];
        if (!argument?.startsWith('--')) continue;

        const [rawName, inlineValue] = argument.slice(2).split('=', 2);
        if (!rawName) continue;

        if (inlineValue !== undefined) {
            options[rawName] = inlineValue;
        } else if (args[index + 1] && !args[index + 1]?.startsWith('--')) {
            options[rawName] = args[++index] as string;
        } else {
            options[rawName] = true;
        }
    }

    return options;
}

export function snakeCase(value: string): string {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[-\s]+/g, '_')
        .toLowerCase();
}

export function headline(value: string): string {
    return value
        .split(/[_-]/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export function sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

export function isFileSystemError(error: unknown, code: string): boolean {
    return error instanceof Error && 'code' in error && error.code === code;
}

export function assertObject(value: unknown, message: string): asserts value is JsonObject {
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(message);
}

export function assertOnlyKeys(value: JsonObject, allowed: string[], label: string): void {
    const unknown = Object.keys(value).find((key) => !allowed.includes(key));
    if (unknown) throw new Error(`The ${label} contains unsupported key [${unknown}].`);
}

export function assertHandle(value: unknown, label: string): asserts value is string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) {
        throw new Error(`${label} must be a valid handle.`);
    }
}

export function assertString(
    value: unknown,
    label: string,
    maximum: number,
): asserts value is string {
    if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
        throw new Error(`${label} must be a non-empty string.`);
    }
}

export function assertPublicationStatus(
    value: unknown,
    label: string,
): asserts value is 'draft' | 'published' {
    if (value !== 'draft' && value !== 'published') {
        throw new Error(`${label} must be draft or published.`);
    }
}

export function boundedArray(
    value: unknown,
    label: string,
    maximum: number,
    optional = false,
): unknown[] {
    if (value === undefined && optional) return [];
    if (!Array.isArray(value) || value.length > maximum) {
        throw new Error(`Starter ${label} must be an array with at most ${maximum} items.`);
    }

    return value;
}
