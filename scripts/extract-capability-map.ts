// One-time extractor for the ServiceNow Capability Map slide deck.
// Run via `pnpm tsx scripts/extract-capability-map.ts [path/to/file.pptx]`.
//
// This script is deterministic: given the same .pptx it always produces the
// same seed JSON with the same slug IDs. It is rerun only when ServiceNow
// publishes a new version of the slide. The output is meant to be reviewed
// by hand and cleaned up before being committed as the source of truth.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import type {
  AiNativePillar,
  Capability,
  CapabilityMapSeed,
  Category,
} from '../renderer/data/types';

// --- constants tuned to the May 2026 slide ---
const FILL_CAPABILITY = '15243E';
const FILL_PLATFORM = '233860';
const UPPER_REGION_MAX_Y = 4_500_000; // EMU; categories above this
const AI_CONTROL_TOWER_BAND_Y = 5_143_442;
const AI_CONTROL_TOWER_BAND_TOLERANCE = 50_000;
const ORPHAN_DISTANCE_EMU = 1_500_000;
const PILLAR_LABELS: Record<string, AiNativePillar> = {
  SENSE: 'sense',
  DECIDE: 'decide',
  ACT: 'act',
  SECURE: 'secure',
};

const DEFAULT_INPUT = resolve(process.cwd(), 'seed-sources/2026-May_Full_Capability_Map.pptx');
const DEFAULT_OUTPUT = resolve(process.cwd(), 'renderer/data/capability-map.seed.json');

interface Shape {
  text: string;
  x: number;
  y: number;
  cx: number;
  cy: number;
  cxCenter: number;
  cyCenter: number;
  fill: string | null;
}

// --- pptx parsing ---

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function collectText(txBody: unknown): string {
  if (!txBody || typeof txBody !== 'object') return '';
  const paragraphs = asArray((txBody as Record<string, unknown>)['a:p']);
  const parts: string[] = [];
  for (const p of paragraphs) {
    if (!p || typeof p !== 'object') continue;
    const runs = asArray((p as Record<string, unknown>)['a:r']);
    for (const r of runs) {
      if (!r || typeof r !== 'object') continue;
      const t = (r as Record<string, unknown>)['a:t'];
      if (typeof t === 'string') parts.push(t);
      else if (t && typeof t === 'object' && '#text' in (t as object)) {
        const inner = (t as Record<string, unknown>)['#text'];
        if (typeof inner === 'string') parts.push(inner);
      }
    }
  }
  return parts.join('').replace(/\s+/g, ' ').trim();
}

function readNum(attr: unknown): number | null {
  if (attr === undefined || attr === null) return null;
  const n = typeof attr === 'number' ? attr : parseInt(String(attr), 10);
  return Number.isFinite(n) ? n : null;
}

function extractShape(sp: Record<string, unknown>): Shape | null {
  const spPr = sp['p:spPr'] as Record<string, unknown> | undefined;
  if (!spPr) return null;
  const xfrm = spPr['a:xfrm'] as Record<string, unknown> | undefined;
  if (!xfrm) return null;
  const off = xfrm['a:off'] as Record<string, unknown> | undefined;
  const ext = xfrm['a:ext'] as Record<string, unknown> | undefined;
  if (!off || !ext) return null;
  const x = readNum(off['@_x']);
  const y = readNum(off['@_y']);
  const cx = readNum(ext['@_cx']);
  const cy = readNum(ext['@_cy']);
  if (x === null || y === null || cx === null || cy === null) return null;

  const fillNode = spPr['a:solidFill'] as Record<string, unknown> | undefined;
  let fill: string | null = null;
  if (fillNode) {
    const srgb = fillNode['a:srgbClr'] as Record<string, unknown> | undefined;
    if (srgb && typeof srgb['@_val'] === 'string') fill = (srgb['@_val'] as string).toUpperCase();
  }

  const text = collectText(sp['p:txBody']);

  return {
    text,
    x,
    y,
    cx,
    cy,
    cxCenter: x + cx / 2,
    cyCenter: y + cy / 2,
    fill,
  };
}

async function loadShapes(pptxPath: string): Promise<Shape[]> {
  const buf = await readFile(pptxPath);
  const zip = await JSZip.loadAsync(buf);
  const slide = zip.file('ppt/slides/slide1.xml');
  if (!slide) throw new Error('ppt/slides/slide1.xml not found in pptx');
  const xml = await slide.async('string');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    preserveOrder: false,
    allowBooleanAttributes: true,
    // Default trims whitespace from <a:t> text — that destroys multi-run
    // labels like "Health & " + "Safety".
    trimValues: false,
    parseTagValue: false,
    processEntities: true,
  });
  const doc = parser.parse(xml);

  const shapes: Shape[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const obj = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'p:sp') {
        const items = asArray(value);
        for (const sp of items) {
          if (sp && typeof sp === 'object') {
            const shape = extractShape(sp as Record<string, unknown>);
            if (shape) shapes.push(shape);
          }
        }
      } else if (typeof value === 'object') {
        visit(value);
      }
    }
  };
  visit(doc);
  return shapes;
}

// --- classification ---

interface Pillar {
  name: keyof typeof PILLAR_LABELS;
  pillar: AiNativePillar;
  xMin: number;
  xMax: number;
}

function isAuthorByline(text: string): boolean {
  return /author\s*:/i.test(text);
}

function isTitleShape(text: string): boolean {
  return text === 'Full Capability Map';
}

function isPillarLabel(text: string): boolean {
  return text in PILLAR_LABELS;
}

function isAiControlTowerBandHeader(text: string, y: number): boolean {
  return text === 'AI Control Tower' && y > UPPER_REGION_MAX_Y;
}

function inAiControlTowerBand(y: number): boolean {
  return Math.abs(y - AI_CONTROL_TOWER_BAND_Y) <= AI_CONTROL_TOWER_BAND_TOLERANCE;
}

function detectPillars(shapes: Shape[]): Pillar[] {
  const pillars: Pillar[] = [];
  for (const s of shapes) {
    if (isPillarLabel(s.text)) {
      pillars.push({
        name: s.text as keyof typeof PILLAR_LABELS,
        pillar: PILLAR_LABELS[s.text]!,
        xMin: s.x,
        xMax: s.x + s.cx,
      });
    }
  }
  pillars.sort((a, b) => a.xMin - b.xMin);
  if (pillars.length !== 4) {
    throw new Error(`Expected 4 pillar containers, found ${pillars.length}`);
  }
  return pillars;
}

function pillarForX(pillars: Pillar[], centerX: number): Pillar | null {
  for (const p of pillars) {
    if (centerX >= p.xMin && centerX <= p.xMax) return p;
  }
  // fallback: nearest by center distance
  let best: { p: Pillar; d: number } | null = null;
  for (const p of pillars) {
    const pc = (p.xMin + p.xMax) / 2;
    const d = Math.abs(pc - centerX);
    if (!best || d < best.d) best = { p, d };
  }
  return best?.p ?? null;
}

// --- slug generation ---

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[/]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueSlug(name: string, taken: Set<string>): string {
  const base = slugify(name) || 'item';
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  const out = `${base}-${n}`;
  taken.add(out);
  return out;
}

// --- extraction ---

interface CategoryEntry extends Category {
  centerX: number;
  centerY: number;
}

interface ExtractionResult {
  seed: CapabilityMapSeed;
  orphans: { name: string; distance: number; nearestCategory: string }[];
  duplicates: { name: string; ids: string[] }[];
}

function extract(shapes: Shape[], sourceSlide: string): ExtractionResult {
  const pillars = detectPillars(shapes);

  // 1. Solution categories
  const categoryEntries: CategoryEntry[] = [];
  const takenSlugs = new Set<string>();

  // Order categories deterministically by (y, x).
  const categoryShapes = shapes
    .filter((s) => s.text)
    .filter((s) => s.fill !== FILL_CAPABILITY && s.fill !== FILL_PLATFORM)
    .filter((s) => s.y < UPPER_REGION_MAX_Y)
    .filter((s) => !isTitleShape(s.text))
    .filter((s) => !isAuthorByline(s.text))
    .filter((s) => !isPillarLabel(s.text))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  for (const s of categoryShapes) {
    const id = uniqueSlug(s.text, takenSlugs);
    categoryEntries.push({
      id,
      name: s.text,
      layer: 'solution',
      displayOrder: categoryEntries.length,
      centerX: s.cxCenter,
      centerY: s.cyCenter,
    });
  }

  // 2. Four pillar categories
  const pillarCategoryById = new Map<AiNativePillar, Category>();
  for (const p of pillars) {
    const id = uniqueSlug(p.name, takenSlugs);
    const cat: Category = {
      id,
      name: p.name,
      layer: 'platform',
      aiNativePillar: p.pillar,
      displayOrder: categoryEntries.length,
    };
    pillarCategoryById.set(p.pillar, cat);
    categoryEntries.push({ ...cat, centerX: (p.xMin + p.xMax) / 2, centerY: 0 });
  }

  // 3. AI Control Tower band (special ai-native category)
  const bandCategoryId = uniqueSlug('AI Control Tower Band', takenSlugs);
  const bandCategory: Category = {
    id: bandCategoryId,
    name: 'AI Control Tower',
    layer: 'ai-native',
    displayOrder: categoryEntries.length,
  };
  categoryEntries.push({ ...bandCategory, centerX: 0, centerY: AI_CONTROL_TOWER_BAND_Y });

  // 4. Solution capabilities — cluster 15243E shapes to nearest solution category.
  const capabilities: Capability[] = [];
  const orphans: ExtractionResult['orphans'] = [];

  const solutionCategoryEntries = categoryEntries.filter((c) => c.layer === 'solution');

  const capabilityShapes = shapes
    .filter((s) => s.fill === FILL_CAPABILITY && s.text)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  for (const s of capabilityShapes) {
    let best: { entry: CategoryEntry; d: number } | null = null;
    for (const cat of solutionCategoryEntries) {
      const dx = cat.centerX - s.cxCenter;
      const dy = cat.centerY - s.cyCenter;
      const d = Math.hypot(dx, dy);
      if (!best || d < best.d) best = { entry: cat, d };
    }
    if (!best) continue;
    const id = uniqueSlug(s.text, takenSlugs);
    capabilities.push({ id, name: s.text, categoryId: best.entry.id });
    if (best.d > ORPHAN_DISTANCE_EMU) {
      orphans.push({
        name: s.text,
        distance: Math.round(best.d),
        nearestCategory: best.entry.name,
      });
    }
  }

  // 5. Platform capabilities — assign 233860 shapes to pillars by x-range.
  const platformShapes = shapes
    .filter((s) => s.fill === FILL_PLATFORM && s.text)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  for (const s of platformShapes) {
    const p = pillarForX(pillars, s.cxCenter);
    if (!p) continue;
    const cat = pillarCategoryById.get(p.pillar);
    if (!cat) continue;
    const id = uniqueSlug(s.text, takenSlugs);
    capabilities.push({ id, name: s.text, categoryId: cat.id });
  }

  // 6. AI Control Tower band items
  const bandShapes = shapes
    .filter((s) => s.text && inAiControlTowerBand(s.y) && s.text !== 'AI Control Tower')
    .filter((s) => !isAiControlTowerBandHeader(s.text, s.y))
    .sort((a, b) => a.x - b.x);
  for (const s of bandShapes) {
    const id = uniqueSlug(s.text, takenSlugs);
    capabilities.push({ id, name: s.text, categoryId: bandCategoryId });
  }

  // 7. Duplicate-name report
  const byName = new Map<string, string[]>();
  for (const c of capabilities) {
    const list = byName.get(c.name) ?? [];
    list.push(c.id);
    byName.set(c.name, list);
  }
  const duplicates: ExtractionResult['duplicates'] = [];
  for (const [name, ids] of byName) {
    if (ids.length > 1) duplicates.push({ name, ids });
  }

  const seed: CapabilityMapSeed = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceSlide,
    categories: categoryEntries.map(({ centerX: _x, centerY: _y, ...rest }) => rest),
    capabilities,
  };

  return { seed, orphans, duplicates };
}

// --- main ---

async function main(): Promise<void> {
  const inputArg = process.argv[2];
  const input = inputArg ? resolve(inputArg) : DEFAULT_INPUT;
  const output = DEFAULT_OUTPUT;

  console.log(`Reading: ${input}`);
  const shapes = await loadShapes(input);
  console.log(`Parsed ${shapes.length} shapes from slide1.xml`);

  const result = extract(shapes, basename(input));
  // Preserve a stable generatedAt by writing it last; deterministic JSON does
  // not require sorting since we already sort upstream.
  await writeFile(output, JSON.stringify(result.seed, null, 2) + '\n', 'utf8');

  const cats = result.seed.categories;
  const solutionCount = cats.filter((c) => c.layer === 'solution').length;
  const platformCount = cats.filter((c) => c.layer === 'platform').length;
  const aiNativeCount = cats.filter((c) => c.layer === 'ai-native').length;

  console.log('');
  console.log('=== Extraction report ===');
  console.log(`Output: ${output}`);
  console.log(`Categories: ${cats.length} total`);
  console.log(`  solution:    ${solutionCount}`);
  console.log(`  platform:    ${platformCount}`);
  console.log(`  ai-native:   ${aiNativeCount}`);
  console.log(`Capabilities: ${result.seed.capabilities.length}`);
  console.log('');
  console.log(
    `Orphans (>${ORPHAN_DISTANCE_EMU} EMU from nearest category): ${result.orphans.length}`,
  );
  for (const o of result.orphans) {
    console.log(`  • "${o.name}"  → nearest: ${o.nearestCategory} (d=${o.distance})`);
  }
  console.log('');
  console.log(`Duplicate names: ${result.duplicates.length}`);
  for (const d of result.duplicates) {
    console.log(`  • "${d.name}"  → ${d.ids.join(', ')}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
