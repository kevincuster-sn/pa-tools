/* eslint-disable */
// Render a PDF using the export pipeline with the default seed assuming all
// categories enabled. Writes /tmp/capability-map-smoketest.pdf.
//
// Run: pnpm tsx scripts/render-pdf-smoketest.ts

import { writeFileSync } from 'node:fs';
import { exportCapabilityMapPdf } from '../renderer/lib/export/export-pdf';
import seed from '../renderer/data/capability-map.seed.json';

type Seed = {
  categories: Array<{
    id: string;
    name: string;
    fullName?: string;
    layer: string;
    aiNativePillar?: string;
    displayOrder: number;
    capabilities: Array<{ id: string; name: string }>;
  }>;
};

const s = seed as Seed;

const solCats = s.categories
  .filter((c) => c.layer === 'solution')
  .sort((a, b) => a.displayOrder - b.displayOrder);

const pillarOrder = ['sense', 'decide', 'act', 'secure'] as const;
const statuses = ['in-use', 'implementing', 'planning', 'not-in-use', 'no-intent', 'not-licensed'];

const data = {
  customerName: 'Acme Corporation',
  generatedAt: new Date(),
  overallAdoption: { licensed: 50, adopted: 32, pct: 64 },
  enabledCategoryCount: solCats.length,
  totalCategoryCount: solCats.length,
  activeCategories: solCats.map((c) => ({
    id: c.id,
    name: c.name,
    fullName: c.fullName,
    capabilities: c.capabilities.map((cap, i) => ({
      id: cap.id,
      name: cap.name,
      status: statuses[i % statuses.length],
      notes: '',
    })),
    adoption: {
      licensed: c.capabilities.length,
      adopted: Math.floor(c.capabilities.length * 0.6),
      pct: 60,
    },
  })),
  aiControlTower: null,
  aiPillars: pillarOrder.map((p) => {
    const cat = s.categories.find((c) => c.layer === 'platform' && c.aiNativePillar === p);
    return {
      pillar: p,
      label: p.toUpperCase(),
      fullName: cat?.fullName,
      capabilities: (cat?.capabilities ?? []).map((cap, j) => ({
        id: cap.id,
        name: cap.name,
        status: ['in-use', 'implementing', 'planning'][j % 3],
        notes: '',
      })),
    };
  }),
};

console.log('Active categories:', data.activeCategories.length);
console.log('AI pillars:', data.aiPillars.length);

const bytes = exportCapabilityMapPdf(data as any);
const out = '/tmp/capability-map-smoketest.pdf';
writeFileSync(out, Buffer.from(bytes));
console.log('Wrote', out, '(', bytes.byteLength, 'bytes )');
