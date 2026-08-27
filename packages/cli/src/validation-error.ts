export type ThemeValidationErrorCode =
    | 'BOPLI_E000'
    | 'BOPLI_E001'
    | 'BOPLI_E004'
    | 'BOPLI_E010'
    | 'BOPLI_E012'
    | 'BOPLI_E013'
    | 'BOPLI_E020'
    | 'BOPLI_E021'
    | 'BOPLI_E022'
    | 'BOPLI_E023'
    | 'BOPLI_E024';

type ThemeValidationErrorOptions = {
    code: ThemeValidationErrorCode;
    message: string;
    file: string;
    line?: number;
    remediation: string;
    cause?: unknown;
};

/** A stable, location-aware failure raised while inspecting or compiling theme source. */
export class ThemeValidationError extends Error {
    public readonly code: ThemeValidationErrorCode;

    public readonly file: string;

    public readonly line?: number;

    public readonly remediation: string;

    /** Create a validation failure with a stable code and author-facing remediation. */
    public constructor(options: ThemeValidationErrorOptions) {
        const location = options.line ? `${options.file}:${options.line}` : options.file;
        super(
            `[${options.code}] ${location} — ${options.message}\nRemediation: ${options.remediation}`,
            {
                cause: options.cause,
            },
        );
        this.name = 'ThemeValidationError';
        this.code = options.code;
        this.file = options.file;
        this.line = options.line;
        this.remediation = options.remediation;
    }
}

/** Format known validation errors without hiding ordinary unexpected failures. */
export function formatCliError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Recover a validation error that a bundler wrapped in an aggregate build failure. */
export function validationErrorFrom(error: unknown): ThemeValidationError | null {
    return findValidationError(error, new Set());
}

function findValidationError(error: unknown, visited: Set<unknown>): ThemeValidationError | null {
    if (error instanceof ThemeValidationError && String(error.code).startsWith('BOPLI_')) {
        return error;
    }
    if (!error || typeof error !== 'object' || visited.has(error)) return null;
    visited.add(error);

    if ('errors' in error && Array.isArray(error.errors)) {
        for (const child of error.errors) {
            const validationError = findValidationError(child, visited);
            if (validationError) return validationError;
        }
    }
    if ('cause' in error) {
        const validationError = findValidationError(error.cause, visited);
        if (validationError) return validationError;
    }
    if (!('message' in error) || typeof error.message !== 'string') return null;

    const match = error.message.match(/\[(BOPLI_E\d{3})\] (.*?) — ([^\n]+)\nRemediation: ([^\n]+)/);
    if (!match?.[1] || !match[2] || !match[3] || !match[4]) return null;
    const location = match[2].match(/^(.*):(\d+)$/);

    return new ThemeValidationError({
        code: match[1] as ThemeValidationErrorCode,
        file: location?.[1] ?? match[2],
        ...(location?.[2] ? { line: Number(location[2]) } : {}),
        message: match[3],
        remediation: match[4],
        cause: error,
    });
}
