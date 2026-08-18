import { compileFromFile } from 'json-schema-to-typescript';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaRoot = resolve(root, 'schemas/v1');
const outputRoot = resolve(root, 'src/generated');
const names = ['package-bopli', 'template-metadata', 'starter', 'theme'];

await mkdir(outputRoot, { recursive: true });

for (const name of names) {
    const output = await compileFromFile(resolve(schemaRoot, `${name}.schema.json`), {
        bannerComment: '/* Generated from the protocol-v1 JSON Schema. Do not edit by hand. */',
        cwd: schemaRoot,
        maxItems: -1,
        style: { singleQuote: true, tabWidth: 4, trailingComma: 'all' },
        unreachableDefinitions: true,
    });
    await writeFile(resolve(outputRoot, `${name}.ts`), output);
}
