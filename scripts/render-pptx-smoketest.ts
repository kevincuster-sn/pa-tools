/* eslint-disable */
// Render a PPTX using the export pipeline with the default seed.
// Three modes are produced for comparison:
//   /tmp/capability-map-smoketest.pptx       — all 33 categories active (worst case)
//   /tmp/capability-map-typical.pptx         — ~15 active (typical)
//   /tmp/capability-map-mode-c-forced.pptx   — forced 2-slide via fabricated load
//
// Run: pnpm tsx scripts/render-pptx-smoketest.ts

import { writeFileSync } from 'node:fs';
import { exportCapabilityMapPptx } from '../renderer/lib/export/export-pptx';
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

function buildData(catSlice: typeof solCats, customerName: string) {
  return {
    customerName,
    generatedAt: new Date(),
    overallAdoption: { licensed: 50, adopted: 32, pct: 64 },
    enabledCategoryCount: catSlice.length,
    totalCategoryCount: solCats.length,
    activeCategories: catSlice.map((c) => ({
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
}

async function main() {
  const worstCase = buildData(solCats, 'Acme Corporation');
  const typical = buildData(solCats.slice(0, 15), 'Acme Corporation');

  // Mode C: duplicate the heaviest categories to force overflow.
  const heavies = solCats
    .slice()
    .sort((a, b) => b.capabilities.length - a.capabilities.length)
    .slice(0, 12);
  const mockMany = [...solCats, ...heavies, ...heavies, ...heavies].map((c, i) => ({
    ...c,
    id: `${c.id}-${i}`,
  }));
  const forcedTwoSlide = buildData(mockMany as any, 'Acme Corporation');

  for (const [name, data] of [
    ['/tmp/capability-map-smoketest.pptx', worstCase],
    ['/tmp/capability-map-typical.pptx', typical],
    ['/tmp/capability-map-mode-c-forced.pptx', forcedTwoSlide],
  ] as const) {
    const bytes = await exportCapabilityMapPptx(data as any);
    writeFileSync(name, Buffer.from(bytes));
    console.log(
      `Wrote ${name}  (${bytes.byteLength} bytes,  ${data.activeCategories.length} active categories)`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
