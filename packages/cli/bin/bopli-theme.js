#!/usr/bin/env node

import { run } from '../dist/cli.js';
import { formatCliError } from '../dist/validation-error.js';

run(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${formatCliError(error)}\n`);
    process.exitCode = 1;
});
