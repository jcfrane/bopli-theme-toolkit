import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const protocolRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const toolkitRoot = resolve(protocolRoot, '../..');
const target = resolve(protocolRoot, 'fixtures/valid/starter-theme.json');

await mkdir(dirname(target), { recursive: true });
await copyFile(resolve(toolkitRoot, 'starter-theme/dist/theme.json'), target);
