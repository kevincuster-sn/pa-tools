// Extractor for the ServiceNow Capability Map slide deck.
//
//   pnpm extract:map [path/to/file.pptx]
//     Commits the seed: writes renderer/data/capability-map.seed.json.
//
//   pnpm extract:map --diff [path/to/file.pptx]
//     Dry run: writes renderer/data/capability-map.seed.next.json plus a
//     dated markdown diff report under seed-sources/. The current committed
//     seed is left untouched. Use this when a new pptx arrives to review
//     what would change before promoting it.
//
// Slug generation is deterministic: the same input name produces the same
// id every run. For names that drift between releases (typo fixes, marketing
// rewrites), seed-sources/id-overrides.json maps `name → canonical-id` so
// the id stays stable and customer state in existing .pamap files keeps
// referring to the right capability.

import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import type {
  AiNativePillar,
  Capability,
  CapabilityMapSeed,
  Category,
  SeedCategory,
} from '../renderer/data/types';

// Internal flat capability shape used during extraction; the foreign key is
// dropped when we nest the capabilities under their parent category for the
// final seed output.
interface FlatCapability extends Capability {
  categoryId: string;
}

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
const SEED_OUTPUT = resolve(process.cwd(), 'renderer/data/capability-map.seed.json');
const SEED_NEXT_OUTPUT = resolve(process.cwd(), 'renderer/data/capability-map.seed.next.json');
const ID_OVERRIDES_PATH = resolve(process.cwd(), 'seed-sources/id-overrides.json');
const SEED_SOURCES_DIR = resolve(process.cwd(), 'seed-sources');

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

interface SlugContext {
  taken: Set<string>;
  overrides: Map<string, string>;
  warnings: string[];
}

function uniqueSlug(name: string, ctx: SlugContext): string {
  const override = ctx.overrides.get(name);
  if (override) {
    if (ctx.taken.has(override)) {
      // The override would collide with an id we already assigned. That
      // means the overrides file is wrong; record a warning and fall back
      // to suffixing so the run still completes.
      ctx.warnings.push(
        `id-override "${name}" → "${override}" collides with an already-assigned id; suffixing.`,
      );
    } else {
      ctx.taken.add(override);
      return override;
    }
  }
  const base = slugify(name) || 'item';
  if (!ctx.taken.has(base)) {
    ctx.taken.add(base);
    return base;
  }
  let n = 2;
  while (ctx.taken.has(`${base}-${n}`)) n++;
  const out = `${base}-${n}`;
  ctx.taken.add(out);
  return out;
}

async function loadIdOverrides(): Promise<Map<string, string>> {
  try {
    await access(ID_OVERRIDES_PATH);
  } catch {
    return new Map();
  }
  const raw = await readFile(ID_OVERRIDES_PATH, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Failed to parse ${ID_OVERRIDES_PATH}: ${(e as Error).message}`, { cause: e });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${ID_OVERRIDES_PATH} must be a JSON object of name → id`);
  }
  const map = new Map<string, string>();
  for (const [name, id] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof id !== 'string' || !id) {
      throw new Error(`id-overrides: value for "${name}" must be a non-empty string`);
    }
    map.set(name, id);
  }
  return map;
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
  warnings: string[];
}

function extract(
  shapes: Shape[],
  sourceSlide: string,
  overrides: Map<string, string>,
): ExtractionResult {
  const pillars = detectPillars(shapes);

  const ctx: SlugContext = {
    taken: new Set<string>(),
    overrides,
    warnings: [],
  };

  // 1. Solution categories
  const categoryEntries: CategoryEntry[] = [];

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
    const id = uniqueSlug(s.text, ctx);
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
    const id = uniqueSlug(p.name, ctx);
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
  const bandCategoryId = uniqueSlug('AI Control Tower Band', ctx);
  const bandCategory: Category = {
    id: bandCategoryId,
    name: 'AI Control Tower',
    layer: 'ai-native',
    displayOrder: categoryEntries.length,
  };
  categoryEntries.push({ ...bandCategory, centerX: 0, centerY: AI_CONTROL_TOWER_BAND_Y });

  // 4. Solution capabilities — cluster 15243E shapes to nearest solution category.
  const capabilities: FlatCapability[] = [];
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
    const id = uniqueSlug(s.text, ctx);
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
    const id = uniqueSlug(s.text, ctx);
    capabilities.push({ id, name: s.text, categoryId: cat.id });
  }

  // 6. AI Control Tower band items
  const bandShapes = shapes
    .filter((s) => s.text && inAiControlTowerBand(s.y) && s.text !== 'AI Control Tower')
    .filter((s) => !isAiControlTowerBandHeader(s.text, s.y))
    .sort((a, b) => a.x - b.x);
  for (const s of bandShapes) {
    const id = uniqueSlug(s.text, ctx);
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

  const capabilitiesByCategory = new Map<string, Capability[]>();
  for (const cap of capabilities) {
    const { categoryId, ...rest } = cap;
    const list = capabilitiesByCategory.get(categoryId);
    if (list) list.push(rest);
    else capabilitiesByCategory.set(categoryId, [rest]);
  }

  const nestedCategories: SeedCategory[] = categoryEntries.map(
    ({ centerX: _x, centerY: _y, ...rest }) => ({
      ...rest,
      capabilities: capabilitiesByCategory.get(rest.id) ?? [],
    }),
  );

  const seed: CapabilityMapSeed = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    sourceSlide,
    categories: nestedCategories,
  };

  return { seed, orphans, duplicates, warnings: ctx.warnings };
}

// --- diff ---

interface CategoryDiff {
  added: Array<{ id: string; name: string }>;
  removed: Array<{ id: string; name: string; affectedCapabilities: number }>;
  renamed: Array<{ id: string; oldName: string; newName: string }>;
}

interface CapabilityDiff {
  added: Array<{ id: string; name: string; categoryName: string }>;
  removed: Array<{ id: string; name: string; categoryName: string }>;
  renamed: Array<{ id: string; oldName: string; newName: string }>;
  moved: Array<{
    id: string;
    name: string;
    oldCategoryName: string;
    newCategoryName: string;
  }>;
}

interface SeedDiff {
  categories: CategoryDiff;
  capabilities: CapabilityDiff;
}

function flattenCapabilities(s: CapabilityMapSeed): Array<Capability & { categoryId: string }> {
  const out: Array<Capability & { categoryId: string }> = [];
  for (const cat of s.categories) {
    for (const cap of cat.capabilities) {
      out.push({ ...cap, categoryId: cat.id });
    }
  }
  return out;
}

function computeDiff(oldSeed: CapabilityMapSeed, newSeed: CapabilityMapSeed): SeedDiff {
  const oldCats = new Map(oldSeed.categories.map((c) => [c.id, c]));
  const newCats = new Map(newSeed.categories.map((c) => [c.id, c]));
  const oldCapsFlat = flattenCapabilities(oldSeed);
  const newCapsFlat = flattenCapabilities(newSeed);
  const oldCaps = new Map(oldCapsFlat.map((c) => [c.id, c]));
  const newCaps = new Map(newCapsFlat.map((c) => [c.id, c]));

  const categoryDiff: CategoryDiff = { added: [], removed: [], renamed: [] };

  for (const [id, cat] of newCats) {
    if (!oldCats.has(id)) {
      categoryDiff.added.push({ id, name: cat.name });
    }
  }
  for (const [id, cat] of oldCats) {
    if (!newCats.has(id)) {
      const affected = oldCapsFlat.filter((c) => c.categoryId === id).length;
      categoryDiff.removed.push({ id, name: cat.name, affectedCapabilities: affected });
    }
  }
  for (const [id, newCat] of newCats) {
    const oldCat = oldCats.get(id);
    if (oldCat && oldCat.name !== newCat.name) {
      categoryDiff.renamed.push({ id, oldName: oldCat.name, newName: newCat.name });
    }
  }

  const capabilityDiff: CapabilityDiff = { added: [], removed: [], renamed: [], moved: [] };

  const nameOfCat = (id: string, side: 'old' | 'new'): string => {
    const cat = side === 'old' ? oldCats.get(id) : newCats.get(id);
    return cat?.name ?? `(unknown: ${id})`;
  };

  for (const [id, cap] of newCaps) {
    if (!oldCaps.has(id)) {
      capabilityDiff.added.push({
        id,
        name: cap.name,
        categoryName: nameOfCat(cap.categoryId, 'new'),
      });
    }
  }
  for (const [id, cap] of oldCaps) {
    if (!newCaps.has(id)) {
      capabilityDiff.removed.push({
        id,
        name: cap.name,
        categoryName: nameOfCat(cap.categoryId, 'old'),
      });
    }
  }
  for (const [id, newCap] of newCaps) {
    const oldCap = oldCaps.get(id);
    if (!oldCap) continue;
    if (oldCap.name !== newCap.name) {
      capabilityDiff.renamed.push({ id, oldName: oldCap.name, newName: newCap.name });
    }
    if (oldCap.categoryId !== newCap.categoryId) {
      capabilityDiff.moved.push({
        id,
        name: newCap.name,
        oldCategoryName: nameOfCat(oldCap.categoryId, 'old'),
        newCategoryName: nameOfCat(newCap.categoryId, 'new'),
      });
    }
  }

  // Deterministic ordering
  const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id);
  categoryDiff.added.sort(byId);
  categoryDiff.removed.sort(byId);
  categoryDiff.renamed.sort(byId);
  capabilityDiff.added.sort(byId);
  capabilityDiff.removed.sort(byId);
  capabilityDiff.renamed.sort(byId);
  capabilityDiff.moved.sort(byId);

  return { categories: categoryDiff, capabilities: capabilityDiff };
}

function renderDiffMarkdown(
  diff: SeedDiff,
  meta: { oldSource: string; newSource: string; generatedAt: string },
): string {
  const lines: string[] = [];
  lines.push(`# Capability Map Diff — ${meta.generatedAt.slice(0, 10)}`);
  lines.push('');
  lines.push(`- Old seed source: \`${meta.oldSource}\``);
  lines.push(`- New seed source: \`${meta.newSource}\``);
  lines.push('');

  const c = diff.categories;
  const k = diff.capabilities;
  const total =
    c.added.length +
    c.removed.length +
    c.renamed.length +
    k.added.length +
    k.removed.length +
    k.renamed.length +
    k.moved.length;
  lines.push(`**Summary:** ${total} change${total === 1 ? '' : 's'}`);
  lines.push('');
  lines.push(
    `- Categories: +${c.added.length} added, -${c.removed.length} removed, ~${c.renamed.length} renamed`,
  );
  lines.push(
    `- Capabilities: +${k.added.length} added, -${k.removed.length} removed, ~${k.renamed.length} renamed, ↔${k.moved.length} moved`,
  );
  lines.push('');

  lines.push('## Categories');
  lines.push('');
  lines.push('### Added');
  if (c.added.length === 0) lines.push('_(none)_');
  for (const x of c.added) lines.push(`- \`${x.id}\` — ${x.name}`);
  lines.push('');
  lines.push('### Removed');
  if (c.removed.length === 0) lines.push('_(none)_');
  for (const x of c.removed) {
    lines.push(
      `- \`${x.id}\` — ${x.name} _(${x.affectedCapabilities} capabilit${x.affectedCapabilities === 1 ? 'y' : 'ies'} affected)_`,
    );
  }
  lines.push('');
  lines.push('### Renamed');
  if (c.renamed.length === 0) lines.push('_(none)_');
  for (const x of c.renamed) lines.push(`- \`${x.id}\` — "${x.oldName}" → "${x.newName}"`);
  lines.push('');

  lines.push('## Capabilities');
  lines.push('');
  lines.push('### Added');
  if (k.added.length === 0) lines.push('_(none)_');
  for (const x of k.added) lines.push(`- \`${x.id}\` — ${x.name} _(in ${x.categoryName})_`);
  lines.push('');
  lines.push('### Removed');
  if (k.removed.length === 0) lines.push('_(none)_');
  for (const x of k.removed) lines.push(`- \`${x.id}\` — ${x.name} _(was in ${x.categoryName})_`);
  lines.push('');
  lines.push('### Renamed');
  if (k.renamed.length === 0) lines.push('_(none)_');
  for (const x of k.renamed) lines.push(`- \`${x.id}\` — "${x.oldName}" → "${x.newName}"`);
  lines.push('');
  lines.push('### Moved');
  if (k.moved.length === 0) lines.push('_(none)_');
  for (const x of k.moved) {
    lines.push(`- \`${x.id}\` — ${x.name} _(${x.oldCategoryName} → ${x.newCategoryName})_`);
  }
  lines.push('');

  if (
    c.renamed.length === 0 &&
    (c.added.length > 0 || c.removed.length > 0 || k.added.length > 0 || k.removed.length > 0)
  ) {
    lines.push('---');
    lines.push('');
    lines.push(
      '> ℹ️  If any of the items above are actually renames (same thing, new wording), add an entry to `seed-sources/id-overrides.json` mapping the **new name** to the **canonical id**, then re-run `pnpm extract:map --diff`.',
    );
    lines.push('');
  }

  return lines.join('\n');
}

// --- main ---

interface CliArgs {
  diff: boolean;
  input: string;
}

function parseArgs(argv: string[]): CliArgs {
  let diff = false;
  let input: string | undefined;
  for (const arg of argv) {
    if (arg === '--diff') diff = true;
    else if (arg.startsWith('--')) throw new Error(`Unknown flag: ${arg}`);
    else if (input !== undefined) throw new Error(`Unexpected positional arg: ${arg}`);
    else input = arg;
  }
  return { diff, input: input ? resolve(input) : DEFAULT_INPUT };
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Reading: ${args.input}`);
  if (args.diff) console.log('Mode: --diff (will not overwrite committed seed)');

  const overrides = await loadIdOverrides();
  if (overrides.size > 0) {
    console.log(`Loaded ${overrides.size} id-override${overrides.size === 1 ? '' : 's'}.`);
  }

  const shapes = await loadShapes(args.input);
  console.log(`Parsed ${shapes.length} shapes from slide1.xml`);

  const result = extract(shapes, basename(args.input), overrides);

  const cats = result.seed.categories;
  const solutionCount = cats.filter((c) => c.layer === 'solution').length;
  const platformCount = cats.filter((c) => c.layer === 'platform').length;
  const aiNativeCount = cats.filter((c) => c.layer === 'ai-native').length;

  console.log('');
  console.log('=== Extraction report ===');
  console.log(`Categories: ${cats.length} total`);
  console.log(`  solution:    ${solutionCount}`);
  console.log(`  platform:    ${platformCount}`);
  console.log(`  ai-native:   ${aiNativeCount}`);
  const capabilityCount = result.seed.categories.reduce((n, c) => n + c.capabilities.length, 0);
  console.log(`Capabilities: ${capabilityCount}`);
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
  if (result.warnings.length > 0) {
    console.log('');
    console.log('Warnings:');
    for (const w of result.warnings) console.log(`  • ${w}`);
  }

  if (args.diff) {
    let oldSeed: CapabilityMapSeed | null = null;
    try {
      const raw = await readFile(SEED_OUTPUT, 'utf8');
      oldSeed = JSON.parse(raw) as CapabilityMapSeed;
    } catch {
      console.log('');
      console.log(`No existing seed at ${SEED_OUTPUT} — diff will treat everything as added.`);
    }

    const diff = oldSeed
      ? computeDiff(oldSeed, result.seed)
      : computeDiff(
          {
            schemaVersion: 2,
            generatedAt: '',
            sourceSlide: '(none)',
            categories: [],
          },
          result.seed,
        );

    await writeFile(SEED_NEXT_OUTPUT, JSON.stringify(result.seed, null, 2) + '\n', 'utf8');

    const markdown = renderDiffMarkdown(diff, {
      oldSource: oldSeed?.sourceSlide ?? '(none)',
      newSource: basename(args.input),
      generatedAt: result.seed.generatedAt,
    });
    const reportPath = resolve(SEED_SOURCES_DIR, `diff-report-${todayStamp()}.md`);
    await writeFile(reportPath, markdown, 'utf8');

    console.log('');
    console.log('=== Diff ===');
    console.log(markdown);
    console.log('');
    console.log(`Next seed: ${SEED_NEXT_OUTPUT}`);
    console.log(`Diff report: ${reportPath}`);
    console.log('');
    console.log(
      'Review the diff. Add renames to seed-sources/id-overrides.json if needed, then run `pnpm extract:map` (without --diff) to commit.',
    );
  } else {
    await writeFile(SEED_OUTPUT, JSON.stringify(result.seed, null, 2) + '\n', 'utf8');
    console.log('');
    console.log(`Seed: ${SEED_OUTPUT}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
