import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generated = ['package-bopli', 'template-metadata', 'starter', 'theme'];
const before = new Map(
    generated.map((name) => [name, readFileSync(resolve(root, `src/generated/${name}.ts`), 'utf8')]),
);

execFileSync(process.execPath, ['--import', 'tsx', resolve(root, 'scripts/generate.ts')], {
    cwd: resolve(root, '../..'),
    stdio: 'inherit',
});

for (const name of generated) {
    const after = readFileSync(resolve(root, `src/generated/${name}.ts`), 'utf8');
    if (after !== before.get(name)) {
        throw new Error(`Generated protocol type [${name}.ts] was stale. Commit the regenerated file.`);
    }
}
