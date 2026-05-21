import PptxGenJS from 'pptxgenjs';
import { STATUSES } from '../capability-status';
import { EXPORT_FONT_FAMILY_PPTX, EXPORT_PALETTE, STATUS_COLORS } from './brand';
import type { ExportAiPillar, ExportCapability, ExportCategory, ExportData } from './data';

// PptxGenJS uses inches as the unit. LAYOUT_WIDE is 13.333" × 7.5".
const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const MARGIN = 0.3;

// PptxGenJS hex colors are RRGGBB without the leading '#'.
function pp(hex: string): string {
  return hex.replace('#', '').toUpperCase();
}

const C = EXPORT_PALETTE;
const FONT = EXPORT_FONT_FAMILY_PPTX;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Build a PPTX and return its bytes. */
export async function exportCapabilityMapPptx(data: ExportData): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = `${data.customerName} - Capability Map`;
  pptx.company = 'ServiceNow';

  const slide = pptx.addSlide();
  slide.background = { color: pp(C.bg) };

  drawHeaderBar(slide, data);
  drawLegend(slide, { x: MARGIN, y: 0.95, w: SLIDE_W - MARGIN * 2, h: 0.25 });

  const aiBandH = 1.7;
  const aiTop = SLIDE_H - MARGIN - aiBandH;
  const gridTop = 1.3;
  const gridBottom = aiTop - 0.25;

  drawCategoryGrid(slide, data.activeCategories, {
    x: MARGIN,
    y: gridTop,
    w: SLIDE_W - MARGIN * 2,
    h: gridBottom - gridTop,
  });

  drawAiNativeRow(slide, data, {
    x: MARGIN,
    y: aiTop,
    w: SLIDE_W - MARGIN * 2,
    h: aiBandH,
  });

  drawFooter(slide, data);

  const out = (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
  return out;
}

// -------- header ----------------------------------------------------------

type Slide = ReturnType<PptxGenJS['addSlide']>;

function drawHeaderBar(slide: Slide, data: ExportData): void {
  // Brand bar.
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 0.82,
    fill: { color: pp(C.fg) },
    line: { type: 'none' },
  });
  // Accent stripe.
  slide.addShape('rect', {
    x: 0,
    y: 0.82,
    w: SLIDE_W,
    h: 0.045,
    fill: { color: pp(C.accent) },
    line: { type: 'none' },
  });

  slide.addText(data.customerName, {
    x: MARGIN,
    y: 0.08,
    w: SLIDE_W - MARGIN * 2 - 3,
    h: 0.45,
    fontFace: FONT,
    fontSize: 22,
    bold: true,
    color: 'FFFFFF',
    valign: 'middle',
  });

  slide.addText('ServiceNow Capability Map', {
    x: MARGIN,
    y: 0.48,
    w: SLIDE_W - MARGIN * 2 - 3,
    h: 0.3,
    fontFace: FONT,
    fontSize: 11,
    color: 'DCE8F0',
    valign: 'middle',
  });

  const pct = `${data.overallAdoption.pct}%`;
  slide.addText(pct, {
    x: SLIDE_W - 1.6 - MARGIN,
    y: 0.08,
    w: 1.6,
    h: 0.5,
    fontFace: FONT,
    fontSize: 26,
    bold: true,
    color: 'FFFFFF',
    align: 'right',
    valign: 'middle',
  });

  slide.addText(
    `Adoption  (${data.overallAdoption.adopted}/${data.overallAdoption.licensed} licensed)`,
    {
      x: SLIDE_W - 3 - MARGIN,
      y: 0.55,
      w: 3,
      h: 0.25,
      fontFace: FONT,
      fontSize: 9,
      color: 'DCE8F0',
      align: 'right',
      valign: 'middle',
    },
  );
}

function drawLegend(slide: Slide, r: Rect): void {
  let x = r.x;
  const chipSize = 0.11;
  const gap = 0.07;
  const itemGap = 0.18;

  for (const s of STATUSES) {
    slide.addShape('roundRect', {
      x,
      y: r.y + (r.h - chipSize) / 2,
      w: chipSize,
      h: chipSize,
      fill: { color: pp(STATUS_COLORS[s.id]) },
      line: { type: 'none' },
      rectRadius: 0.02,
    });
    x += chipSize + gap;
    const label = s.label;
    const labelW = Math.max(0.4, label.length * 0.07);
    slide.addText(label, {
      x,
      y: r.y,
      w: labelW,
      h: r.h,
      fontFace: FONT,
      fontSize: 9,
      color: pp(C.fgMuted),
      valign: 'middle',
    });
    x += labelW + itemGap;
  }
}

function drawFooter(slide: Slide, data: ExportData): void {
  const stamp = `Generated ${data.generatedAt.toLocaleString()}  ·  ${data.enabledCategoryCount} of ${data.totalCategoryCount} categories enabled`;
  slide.addText(stamp, {
    x: MARGIN,
    y: SLIDE_H - 0.3,
    w: SLIDE_W - MARGIN * 2,
    h: 0.22,
    fontFace: FONT,
    fontSize: 8,
    color: pp(C.fgSubtle),
    valign: 'middle',
  });
}

// -------- category grid ---------------------------------------------------

function pickColumns(count: number): number {
  if (count <= 4) return Math.max(count, 1);
  if (count <= 9) return 3;
  if (count <= 16) return 4;
  if (count <= 25) return 5;
  if (count <= 30) return 6;
  return 7;
}

function drawCategoryGrid(slide: Slide, categories: ExportCategory[], frame: Rect): void {
  if (categories.length === 0) {
    slide.addText('No active categories. Toggle categories on to include them in the export.', {
      x: frame.x,
      y: frame.y,
      w: frame.w,
      h: 0.4,
      fontFace: FONT,
      fontSize: 12,
      color: pp(C.fgSubtle),
      italic: true,
    });
    return;
  }

  const gap = 0.1;
  const cols = pickColumns(categories.length);
  const rows = Math.ceil(categories.length / cols);
  const cellW = (frame.w - gap * (cols - 1)) / cols;
  const cellH = (frame.h - gap * (rows - 1)) / rows;

  categories.forEach((cat, idx) => {
    const c = idx % cols;
    const r = Math.floor(idx / cols);
    const x = frame.x + c * (cellW + gap);
    const y = frame.y + r * (cellH + gap);
    drawCategoryCard(slide, cat, { x, y, w: cellW, h: cellH });
  });
}

function drawCategoryCard(slide: Slide, cat: ExportCategory, r: Rect): void {
  // Card background.
  slide.addShape('roundRect', {
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    fill: { color: pp(C.bgElevated) },
    line: { color: pp(C.border), width: 0.5 },
    rectRadius: 0.04,
  });

  // Header bar.
  const headerH = 0.28;
  slide.addShape('rect', {
    x: r.x,
    y: r.y,
    w: r.w,
    h: headerH,
    fill: { color: pp(C.fg) },
    line: { type: 'none' },
  });

  const adoptionText = cat.adoption.licensed > 0 ? `${cat.adoption.pct}%` : '';
  const adoptionW = adoptionText ? 0.42 : 0;

  slide.addText(cat.name, {
    x: r.x + 0.07,
    y: r.y,
    w: r.w - 0.14 - adoptionW,
    h: headerH,
    fontFace: FONT,
    fontSize: 9,
    bold: true,
    color: 'FFFFFF',
    valign: 'middle',
    isTextBox: true,
  });

  if (adoptionText) {
    slide.addText(adoptionText, {
      x: r.x + r.w - adoptionW - 0.05,
      y: r.y,
      w: adoptionW,
      h: headerH,
      fontFace: FONT,
      fontSize: 9,
      color: 'FFFFFF',
      align: 'right',
      valign: 'middle',
    });
  }

  // Capabilities.
  const listX = r.x + 0.07;
  const listY = r.y + headerH + 0.06;
  const listW = r.w - 0.14;
  const listH = r.h - headerH - 0.12;
  drawCapabilityList(slide, cat.capabilities, { x: listX, y: listY, w: listW, h: listH });
}

function drawCapabilityList(slide: Slide, caps: ExportCapability[], r: Rect): void {
  if (caps.length === 0) {
    slide.addText('No capabilities', {
      x: r.x,
      y: r.y,
      w: r.w,
      h: 0.2,
      fontFace: FONT,
      fontSize: 8,
      italic: true,
      color: pp(C.fgSubtle),
    });
    return;
  }

  const minH = 0.16;
  const maxH = 0.22;
  const gap = 0.03;
  const pillH = Math.min(maxH, Math.max(minH, (r.h - (caps.length - 1) * gap) / caps.length));
  const visibleCount = Math.min(caps.length, Math.max(1, Math.floor((r.h + gap) / (pillH + gap))));
  const truncated = visibleCount < caps.length;

  for (let i = 0; i < visibleCount; i++) {
    const cap = caps[i]!;
    const y = r.y + i * (pillH + gap);
    drawCapabilityPill(slide, cap, { x: r.x, y, w: r.w, h: pillH });
  }

  if (truncated) {
    slide.addText(`+${caps.length - visibleCount} more`, {
      x: r.x,
      y: r.y + visibleCount * (pillH + gap),
      w: r.w,
      h: 0.18,
      fontFace: FONT,
      fontSize: 7,
      italic: true,
      color: pp(C.fgSubtle),
    });
  }
}

function drawCapabilityPill(slide: Slide, cap: ExportCapability, r: Rect): void {
  const color = STATUS_COLORS[cap.status];

  // Pill body.
  slide.addShape('roundRect', {
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    fill: { color: pp(C.bg) },
    line: { color: pp(C.border), width: 0.3 },
    rectRadius: 0.02,
  });

  // Status bar on the left edge.
  const barW = 0.05;
  slide.addShape('rect', {
    x: r.x,
    y: r.y,
    w: barW,
    h: r.h,
    fill: { color: pp(color) },
    line: { type: 'none' },
  });

  slide.addText(cap.name, {
    x: r.x + barW + 0.04,
    y: r.y,
    w: r.w - barW - 0.08,
    h: r.h,
    fontFace: FONT,
    fontSize: r.h <= 0.17 ? 7 : 8,
    color: pp(C.fg),
    valign: 'middle',
    isTextBox: true,
  });
}

// -------- AI Native row ---------------------------------------------------

function drawAiNativeRow(slide: Slide, data: ExportData, frame: Rect): void {
  // Section label.
  slide.addText('AI-NATIVE PLATFORM', {
    x: frame.x,
    y: frame.y - 0.25,
    w: frame.w / 2,
    h: 0.22,
    fontFace: FONT,
    fontSize: 9,
    bold: true,
    color: pp(C.fgSubtle),
    valign: 'middle',
  });
  slide.addText('Foundation — always relevant', {
    x: frame.x + frame.w / 2,
    y: frame.y - 0.25,
    w: frame.w / 2,
    h: 0.22,
    fontFace: FONT,
    fontSize: 9,
    color: pp(C.fgSubtle),
    align: 'right',
    valign: 'middle',
  });

  // Section background.
  slide.addShape('roundRect', {
    x: frame.x,
    y: frame.y,
    w: frame.w,
    h: frame.h,
    fill: { color: pp(C.bgSunken) },
    line: { color: pp(C.border), width: 0.5 },
    rectRadius: 0.04,
  });

  const pad = 0.1;
  const innerX = frame.x + pad;
  const innerY = frame.y + pad;
  const innerW = frame.w - pad * 2;
  const innerH = frame.h - pad * 2;

  const pillars = data.aiPillars;
  if (pillars.length === 0) return;
  const gap = 0.1;
  const cols = pillars.length;
  const cellW = (innerW - gap * (cols - 1)) / cols;

  pillars.forEach((p, i) => {
    const x = innerX + i * (cellW + gap);
    drawAiPillarCard(slide, p, { x, y: innerY, w: cellW, h: innerH });
  });
}

function drawAiPillarCard(slide: Slide, p: ExportAiPillar, r: Rect): void {
  slide.addShape('roundRect', {
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    fill: { color: pp(C.bgElevated) },
    line: { color: pp(C.border), width: 0.4 },
    rectRadius: 0.04,
  });

  slide.addText(p.label, {
    x: r.x + 0.08,
    y: r.y + 0.04,
    w: r.w - 0.16,
    h: 0.22,
    fontFace: FONT,
    fontSize: 10,
    bold: true,
    color: pp(C.fg),
    valign: 'middle',
  });

  if (p.fullName) {
    slide.addText(p.fullName, {
      x: r.x + 0.08,
      y: r.y + 0.22,
      w: r.w - 0.16,
      h: 0.18,
      fontFace: FONT,
      fontSize: 7,
      color: pp(C.fgSubtle),
      valign: 'middle',
    });
  }

  const listY = r.y + 0.44;
  const listH = r.h - 0.44 - 0.06;
  const listX = r.x + 0.07;
  const listW = r.w - 0.14;

  if (p.capabilities.length === 0) return;
  const cols = 2;
  const gap = 0.04;
  const colW = (listW - gap * (cols - 1)) / cols;
  const rows = Math.ceil(p.capabilities.length / cols);
  const pillH = Math.min(0.2, Math.max(0.14, (listH - gap * (rows - 1)) / rows));

  const maxRows = Math.max(1, Math.floor((listH + gap) / (pillH + gap)));
  const visibleCount = Math.min(p.capabilities.length, maxRows * cols);

  for (let i = 0; i < visibleCount; i++) {
    const cap = p.capabilities[i]!;
    const c = i % cols;
    const row = Math.floor(i / cols);
    const x = listX + c * (colW + gap);
    const y = listY + row * (pillH + gap);
    drawCapabilityPill(slide, cap, { x, y, w: colW, h: pillH });
  }
}
