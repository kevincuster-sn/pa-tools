// Headless verification that the same packPamap used by `file:save-as`
// produces a real zip archive that external tools can read.
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { packPamap, unpackPamap } = require('../dist-electron/shared/pamap.js');
const { emptyDocument } = require('../dist-electron/shared/file-format.js');

const doc = emptyDocument();
doc.customer.name = 'Demo Customer';
doc.capabilityMap.enabledCategoryIds = ['itsm'];
doc.capabilityMap.capabilities = [
  { capabilityId: 'incident-management', status: 'in-use' },
];

const bytes = await packPamap(doc, {
  appVersion: '0.0.1',
  fileId: '11111111-2222-3333-4444-555555555555',
});

const out = '/tmp/Demo.pamap';
await writeFile(out, bytes);
console.log(`Wrote ${bytes.length} bytes → ${out}`);

const reread = await unpackPamap(bytes);
console.log('Reparsed manifest:', reread.manifest);
console.log('Reparsed customer.name:', reread.document.customer.name);
