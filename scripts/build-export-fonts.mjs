#!/usr/bin/env node
// Regenerate renderer/lib/export/fonts/inter.gen.ts from the bundled Inter TTFs.
// Run after replacing the .ttf files in that directory.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fontsDir = path.resolve(here, '..', 'renderer', 'lib', 'export', 'fonts');

const regB64 = readFileSync(path.join(fontsDir, 'Inter-Regular.ttf')).toString('base64');
const boldB64 = readFileSync(path.join(fontsDir, 'Inter-Bold.ttf')).toString('base64');

const out = `// Auto-generated from Inter TTFs.
// Inter is licensed under SIL Open Font License 1.1.
// To regenerate: pnpm tsx scripts/build-export-fonts.mjs

/* eslint-disable */
export const INTER_REGULAR_TTF_B64 =
  "${regB64}";

export const INTER_BOLD_TTF_B64 =
  "${boldB64}";
`;

writeFileSync(path.join(fontsDir, 'inter.gen.ts'), out);
console.log('Wrote', path.join(fontsDir, 'inter.gen.ts'));
