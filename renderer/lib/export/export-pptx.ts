import PptxGenJS from 'pptxgenjs';
import { STATUSES } from '../capability-status';
import { EXPORT_FONT_FAMILY_PPTX, EXPORT_PALETTE, STATUS_COLORS } from './brand';
import type { ExportAiPillar, ExportCapability, ExportCategory, ExportData } from './data';

// pptxgenjs uses inches. LAYOUT_WIDE is 13.333" × 7.5".
const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const MARGIN = 0.1;

// Vertical chrome heights (inches). Tuned so the grid gets as much room as
// possible — the user wants everything on a single slide whenever it fits.
const HEADER_H = 0.45;
const ACCENT_H = 0.035;
const LEGEND_H = 0.18;
const AI_LABEL_H = 0.2; // section label that floats above the AI band
const AI_BAND_H = 1.3;
const SECTION_GAP = 0.04;

// Card / pill sizing. PILL_H_MAX is intentionally generous so the fit search
// can grow pills into available space when only a handful of categories are
// active. PILL_H_MIN keeps the worst-case dense layout readable.
const PILL_H_MAX = 0.34;
const PILL_H_MIN = 0.1;
const PILL_STEP = 0.005;
const PILL_GAP = 0.02;
const CARD_HEADER_H = 0.2;
const CARD_PADDING = 0.03;
const CARD_GAP = 0.05;
const MIN_COLS = 4;
const MAX_COLS = 8;

const C = EXPORT_PALETTE;
const FONT = EXPORT_FONT_FAMILY_PPTX;

// pptxgenjs hex colors are RRGGBB without the leading '#'.
function pp(hex: string): string {
  return hex.replace('#', '').toUpperCase();
}

type Slide = ReturnType<PptxGenJS['addSlide']>;

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

  const gridW = SLIDE_W - MARGIN * 2;
  // Height available for the category grid when the AI band is on the same slide.
  const gridWithAiH =
    SLIDE_H -
    MARGIN -
    HEADER_H -
    ACCENT_H -
    SECTION_GAP -
    LEGEND_H -
    SECTION_GAP -
    AI_LABEL_H -
    AI_BAND_H -
    MARGIN;
  // Height available for the category grid when it has the slide to itself.
  const gridAloneH =
    SLIDE_H - MARGIN - HEADER_H - ACCENT_H - SECTION_GAP - LEGEND_H - SECTION_GAP - MARGIN;

  // Mode A: try to fit everything on one slide.
  const fitWithAi = findFit(data.activeCategories, gridW, gridWithAiH);
  if (fitWithAi) {
    const slide = pptx.addSlide();
    slide.background = { color: pp(C.bg) };
    renderSlide(slide, data, {
      categories: data.activeCategories,
      fit: fitWithAi,
      includeLegend: true,
      includeAiBand: true,
      slideLabel: null,
    });
    return (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
  }

  // Mode B: categories fit on slide 1 alone — give AI band its own slide.
  const fitAlone = findFit(data.activeCategories, gridW, gridAloneH);
  if (fitAlone) {
    const slide1 = pptx.addSlide();
    slide1.background = { color: pp(C.bg) };
    renderSlide(slide1, data, {
      categories: data.activeCategories,
      fit: fitAlone,
      includeLegend: true,
      includeAiBand: false,
      slideLabel: 'Slide 1 of 2',
    });

    const slide2 = pptx.addSlide();
    slide2.background = { color: pp(C.bg) };
    renderAiOnlySlide(slide2, data, 'Slide 2 of 2');
    return (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
  }

  // Mode C: even categories alone don't fit — split them and put AI on slide 2.
  renderTwoSlide(pptx, data, gridW);
  return (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
}

// -------- masonry layout --------------------------------------------------

interface PlacedCard {
  cat: ExportCategory;
  height: number;
}

interface ColumnLayout {
  cards: PlacedCard[];
  height: number;
}

interface GridFit {
  cols: number;
  cardW: number;
  pillH: number;
  columns: ColumnLayout[];
  maxColHeight: number;
}

function categoryCardHeight(cat: ExportCategory, pillH: number): number {
  const capCount = Math.max(cat.capabilities.length, 1);
  return CARD_HEADER_H + CARD_PADDING * 2 + capCount * pillH + Math.max(0, capCount - 1) * PILL_GAP;
}

function distribute(
  categories: ExportCategory[],
  cols: number,
  pillH: number,
  framW: number,
): GridFit {
  const cardW = (framW - CARD_GAP * (cols - 1)) / cols;
  const columns: ColumnLayout[] = Array.from({ length: cols }, () => ({ cards: [], height: 0 }));

  for (const cat of categories) {
    const h = categoryCardHeight(cat, pillH);
    let bestIdx = 0;
    let bestProjected = columns[0]!.height + (columns[0]!.cards.length > 0 ? CARD_GAP : 0) + h;
    for (let i = 1; i < cols; i++) {
      const projected = columns[i]!.height + (columns[i]!.cards.length > 0 ? CARD_GAP : 0) + h;
      if (projected < bestProjected) {
        bestProjected = projected;
        bestIdx = i;
      }
    }
    columns[bestIdx]!.cards.push({ cat, height: h });
    columns[bestIdx]!.height = bestProjected;
  }

  const maxColHeight = Math.max(...columns.map((c) => c.height), 0);
  return { cols, cardW, pillH, columns, maxColHeight };
}

function findFit(categories: ExportCategory[], framW: number, framH: number): GridFit | null {
  if (categories.length === 0) {
    return { cols: 1, cardW: framW, pillH: PILL_H_MAX, columns: [], maxColHeight: 0 };
  }
  for (let pillH = PILL_H_MAX; pillH >= PILL_H_MIN; pillH -= PILL_STEP) {
    for (let cols = MIN_COLS; cols <= MAX_COLS; cols++) {
      const f = distribute(categories, cols, pillH, framW);
      if (f.maxColHeight <= framH) return f;
    }
  }
  return null;
}

// -------- slide composition -----------------------------------------------

interface SlideOpts {
  categories: ExportCategory[];
  fit: GridFit;
  includeLegend: boolean;
  includeAiBand: boolean;
  slideLabel: string | null;
}

function renderSlide(slide: Slide, data: ExportData, opts: SlideOpts): void {
  const headerBottom = drawHeader(slide, data, opts.slideLabel);
  let cursor = headerBottom + SECTION_GAP;

  if (opts.includeLegend) {
    drawLegend(slide, MARGIN, cursor, SLIDE_W - MARGIN * 2, LEGEND_H);
    cursor += LEGEND_H + SECTION_GAP;
  }

  // When the AI band is on this slide, reserve room for it (band + its label).
  const aiSectionH = opts.includeAiBand ? AI_LABEL_H + AI_BAND_H : 0;
  const contentBottom = SLIDE_H - MARGIN;
  const aiTop = contentBottom - AI_BAND_H;
  // The label sits in its own band immediately above the AI band.
  const gridFrame: Rect = {
    x: MARGIN,
    y: cursor,
    w: SLIDE_W - MARGIN * 2,
    h: opts.includeAiBand ? aiTop - AI_LABEL_H - cursor : contentBottom - cursor,
  };

  drawCategoryGrid(slide, opts.categories, opts.fit, gridFrame);

  if (opts.includeAiBand) {
    drawAiNativeRow(slide, data, {
      x: MARGIN,
      y: aiTop,
      w: SLIDE_W - MARGIN * 2,
      h: AI_BAND_H,
    });
  }

  // Suppress unused-var warning when AI is omitted.
  void aiSectionH;
}

function renderAiOnlySlide(slide: Slide, data: ExportData, slideLabel: string): void {
  drawHeader(slide, data, slideLabel);
  // Center the AI band vertically in the remaining slide space.
  const contentTop = HEADER_H + ACCENT_H + SECTION_GAP + MARGIN;
  const contentBottom = SLIDE_H - MARGIN;
  const bandH = Math.min(AI_BAND_H * 2, contentBottom - contentTop - AI_LABEL_H);
  const bandTop = contentTop + (contentBottom - contentTop - AI_LABEL_H - bandH) / 2 + AI_LABEL_H;
  drawAiNativeRow(slide, data, {
    x: MARGIN,
    y: bandTop,
    w: SLIDE_W - MARGIN * 2,
    h: bandH,
  });
}

function renderTwoSlide(pptx: PptxGenJS, data: ExportData, framW: number): void {
  const splitIndex = findSplitIndex(data.activeCategories, framW);
  const first = data.activeCategories.slice(0, splitIndex);
  const second = data.activeCategories.slice(splitIndex);

  const slide1AvailH =
    SLIDE_H - MARGIN - HEADER_H - ACCENT_H - SECTION_GAP - LEGEND_H - SECTION_GAP - MARGIN;
  const slide2AvailH =
    SLIDE_H - MARGIN - HEADER_H - ACCENT_H - SECTION_GAP - AI_LABEL_H - AI_BAND_H - MARGIN;

  const fit1 =
    findFit(first, framW, slide1AvailH) ?? distribute(first, MAX_COLS, PILL_H_MIN, framW);
  const fit2 =
    findFit(second, framW, slide2AvailH) ?? distribute(second, MAX_COLS, PILL_H_MIN, framW);

  const slide1 = pptx.addSlide();
  slide1.background = { color: pp(C.bg) };
  renderSlide(slide1, data, {
    categories: first,
    fit: fit1,
    includeLegend: true,
    includeAiBand: false,
    slideLabel: 'Slide 1 of 2',
  });

  const slide2 = pptx.addSlide();
  slide2.background = { color: pp(C.bg) };
  renderSlide(slide2, data, {
    categories: second,
    fit: fit2,
    includeLegend: false,
    includeAiBand: true,
    slideLabel: 'Slide 2 of 2',
  });
}

function findSplitIndex(categories: ExportCategory[], framW: number): number {
  const slide1AvailH =
    SLIDE_H - MARGIN - HEADER_H - ACCENT_H - SECTION_GAP - LEGEND_H - SECTION_GAP - MARGIN;

  let lo = 1;
  let hi = categories.length;
  let best = Math.ceil(categories.length / 2);
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const slice = categories.slice(0, mid);
    const f = distribute(slice, MAX_COLS, PILL_H_MIN, framW);
    if (f.maxColHeight <= slide1AvailH) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return Math.max(1, best);
}

// -------- header ----------------------------------------------------------

function drawHeader(slide: Slide, data: ExportData, slideLabel: string | null): number {
  // Brand bar.
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: HEADER_H,
    fill: { color: pp(C.fg) },
    line: { type: 'none' },
  });
  // Accent stripe.
  slide.addShape('rect', {
    x: 0,
    y: HEADER_H,
    w: SLIDE_W,
    h: ACCENT_H,
    fill: { color: pp(C.accent) },
    line: { type: 'none' },
  });

  const generatedAt = formatGeneratedAt(data.generatedAt);

  const customerBlockW = SLIDE_W * 0.45 - MARGIN;
  const customerName = truncateToFit(data.customerName, customerBlockW - 0.05, 15, true);

  // Left block: customer name (top), generated date (bottom).
  slide.addText(customerName, {
    x: MARGIN,
    y: 0.02,
    w: customerBlockW,
    h: 0.24,
    fontFace: FONT,
    fontSize: 15,
    bold: true,
    color: 'FFFFFF',
    valign: 'middle',
    wrap: false,
  });
  slide.addText(`Generated ${generatedAt}`, {
    x: MARGIN,
    y: 0.24,
    w: SLIDE_W * 0.45,
    h: 0.18,
    fontFace: FONT,
    fontSize: 8,
    color: 'DCE8F0',
    valign: 'middle',
    wrap: false,
  });

  // Center block: subtitle (top), slide label (bottom, if present).
  slide.addText('ServiceNow Capability Map', {
    x: SLIDE_W * 0.3,
    y: 0.02,
    w: SLIDE_W * 0.4,
    h: 0.24,
    fontFace: FONT,
    fontSize: 10,
    color: 'DCE8F0',
    align: 'center',
    valign: 'middle',
    wrap: false,
  });
  if (slideLabel) {
    slide.addText(slideLabel, {
      x: SLIDE_W * 0.3,
      y: 0.24,
      w: SLIDE_W * 0.4,
      h: 0.18,
      fontFace: FONT,
      fontSize: 8,
      color: 'DCE8F0',
      align: 'center',
      valign: 'middle',
      wrap: false,
    });
  }

  // Right block: adoption % (top), licensed detail (bottom).
  const pct = `${data.overallAdoption.pct}%`;
  const adoptionDetail = `${data.overallAdoption.adopted}/${data.overallAdoption.licensed} licensed`;
  slide.addText(pct, {
    x: SLIDE_W - 2.4 - MARGIN,
    y: 0.02,
    w: 2.4,
    h: 0.24,
    fontFace: FONT,
    fontSize: 16,
    bold: true,
    color: 'FFFFFF',
    align: 'right',
    valign: 'middle',
    wrap: false,
  });
  slide.addText(adoptionDetail, {
    x: SLIDE_W - 2.4 - MARGIN,
    y: 0.24,
    w: 2.4,
    h: 0.18,
    fontFace: FONT,
    fontSize: 8,
    color: 'DCE8F0',
    align: 'right',
    valign: 'middle',
    wrap: false,
  });

  return HEADER_H + ACCENT_H;
}

function formatGeneratedAt(d: Date): string {
  // Short, locale-friendly: "May 22, 2026, 10:42 AM".
  try {
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return d.toISOString();
  }
}

// -------- legend ----------------------------------------------------------

function drawLegend(slide: Slide, x: number, y: number, _w: number, h: number): void {
  const centerY = y + h / 2;
  const chipSize = 0.12;
  const chipGap = 0.05;
  const itemGap = 0.16;

  let cx = x;
  for (const s of STATUSES) {
    slide.addShape('roundRect', {
      x: cx,
      y: centerY - chipSize / 2,
      w: chipSize,
      h: chipSize,
      fill: { color: pp(STATUS_COLORS[s.id]) },
      line: { type: 'none' },
      rectRadius: 0.02,
    });
    cx += chipSize + chipGap;

    const labelW = estimateTextWidth(s.label, 9) + 0.05;
    slide.addText(s.label, {
      x: cx,
      y,
      w: labelW,
      h,
      fontFace: FONT,
      fontSize: 9,
      color: pp(C.fgMuted),
      valign: 'middle',
      wrap: false,
    });
    cx += labelW + itemGap;
  }
}

// -------- category grid ---------------------------------------------------

function drawCategoryGrid(
  slide: Slide,
  categories: ExportCategory[],
  fit: GridFit,
  frame: Rect,
): void {
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
      wrap: false,
    });
    return;
  }

  fit.columns.forEach((col, colIdx) => {
    let cardY = frame.y;
    const colX = frame.x + colIdx * (fit.cardW + CARD_GAP);
    for (const placed of col.cards) {
      drawCategoryCard(slide, placed.cat, fit.pillH, {
        x: colX,
        y: cardY,
        w: fit.cardW,
        h: placed.height,
      });
      cardY += placed.height + CARD_GAP;
    }
  });
}

function drawCategoryCard(slide: Slide, cat: ExportCategory, pillH: number, r: Rect): void {
  // Card background + border.
  slide.addShape('roundRect', {
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    fill: { color: pp(C.bgElevated) },
    line: { color: pp(C.border), width: 0.5 },
    rectRadius: 0.04,
  });

  // Header strip.
  slide.addShape('rect', {
    x: r.x,
    y: r.y,
    w: r.w,
    h: CARD_HEADER_H,
    fill: { color: pp(C.fg) },
    line: { type: 'none' },
  });

  const adoptionText = cat.adoption.licensed > 0 ? `${cat.adoption.pct}%` : '';
  // Title font size grows a little when pills are taller (more breathing room).
  const titleFontSize = Math.min(11, Math.max(7.5, pillH * 32 + 1));
  const adoptionFontSize = Math.max(7, titleFontSize - 1);
  const adoptionW = adoptionText
    ? Math.max(0.34, estimateTextWidth(adoptionText, adoptionFontSize) + 0.08)
    : 0;
  const titleGap = 0.04; // gap reserved between title and adoption text
  const titleBoxX = r.x + 0.06;
  const titleBoxW = r.w - 0.06 - adoptionW - titleGap - 0.04;
  const title = truncateToFit(cat.name, titleBoxW - 0.02, titleFontSize, true);

  slide.addText(title, {
    x: titleBoxX,
    y: r.y,
    w: titleBoxW,
    h: CARD_HEADER_H,
    fontFace: FONT,
    fontSize: titleFontSize,
    bold: true,
    color: 'FFFFFF',
    valign: 'middle',
    wrap: false,
  });

  if (adoptionText) {
    slide.addText(adoptionText, {
      x: r.x + r.w - adoptionW - 0.04,
      y: r.y,
      w: adoptionW,
      h: CARD_HEADER_H,
      fontFace: FONT,
      fontSize: adoptionFontSize,
      color: 'FFFFFF',
      align: 'right',
      valign: 'middle',
      wrap: false,
    });
  }

  // Capabilities — every one, no count truncation.
  const listX = r.x + CARD_PADDING;
  const listY = r.y + CARD_HEADER_H + CARD_PADDING;
  const listW = r.w - CARD_PADDING * 2;
  drawCapabilityList(slide, cat.capabilities, pillH, { x: listX, y: listY, w: listW, h: 0 });
}

function drawCapabilityList(slide: Slide, caps: ExportCapability[], pillH: number, r: Rect): void {
  if (caps.length === 0) {
    slide.addText('No capabilities', {
      x: r.x,
      y: r.y,
      w: r.w,
      h: pillH,
      fontFace: FONT,
      fontSize: 7,
      italic: true,
      color: pp(C.fgSubtle),
      valign: 'middle',
      wrap: false,
    });
    return;
  }

  for (let i = 0; i < caps.length; i++) {
    const cap = caps[i]!;
    const y = r.y + i * (pillH + PILL_GAP);
    drawCapabilityPill(slide, cap, { x: r.x, y, w: r.w, h: pillH });
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
    line: { color: pp(C.border), width: 0.25 },
    rectRadius: 0.02,
  });

  // Status bar on the left edge.
  const barW = Math.min(0.05, r.h * 0.3);
  slide.addShape('rect', {
    x: r.x,
    y: r.y,
    w: barW,
    h: r.h,
    fill: { color: pp(color) },
    line: { type: 'none' },
  });

  // Pill text — font size scales with pill height so the layout grows
  // uniformly when there's space. truncateToFit keeps long names from
  // running off the pill, since pptxgenjs's fit:'shrink' is unreliable
  // for short single-line text.
  const fontSize = pillFontSize(r.h);
  const padding = barW + 0.04;
  const textBoxW = r.w - padding - 0.04;
  const text = truncateToFit(cap.name, textBoxW - 0.02, fontSize);

  slide.addText(text, {
    x: r.x + padding,
    y: r.y,
    w: textBoxW,
    h: r.h,
    fontFace: FONT,
    fontSize,
    color: pp(C.fg),
    valign: 'middle',
    wrap: false,
  });
}

// -------- AI Native row ---------------------------------------------------

function drawAiNativeRow(slide: Slide, data: ExportData, frame: Rect): void {
  // Labels above the band — placed inside their own AI_LABEL_H band so they
  // don't overlap the category grid above.
  const labelY = frame.y - AI_LABEL_H;
  slide.addText('AI-NATIVE PLATFORM', {
    x: frame.x,
    y: labelY,
    w: frame.w * 0.5,
    h: AI_LABEL_H,
    fontFace: FONT,
    fontSize: 8,
    bold: true,
    color: pp(C.fgSubtle),
    valign: 'middle',
    wrap: false,
  });
  slide.addText('Foundation — always relevant', {
    x: frame.x + frame.w * 0.5,
    y: labelY,
    w: frame.w * 0.5,
    h: AI_LABEL_H,
    fontFace: FONT,
    fontSize: 8,
    color: pp(C.fgSubtle),
    align: 'right',
    valign: 'middle',
    wrap: false,
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

  const pad = 0.07;
  const innerX = frame.x + pad;
  const innerY = frame.y + pad;
  const innerW = frame.w - pad * 2;
  const innerH = frame.h - pad * 2;

  const pillars = data.aiPillars;
  if (pillars.length === 0) return;

  const gap = 0.06;
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

  // Header — compact so the capability list has more room.
  slide.addText(p.label, {
    x: r.x + 0.05,
    y: r.y + 0.02,
    w: r.w - 0.1,
    h: 0.18,
    fontFace: FONT,
    fontSize: 9,
    bold: true,
    color: pp(C.fg),
    valign: 'middle',
    wrap: false,
  });

  const titleBottom = 0.2;
  let subBottom = titleBottom;
  if (p.fullName) {
    subBottom = 0.34;
    const subFullName = truncateToFit(p.fullName, r.w - 0.1 - 0.02, 6.5);
    slide.addText(subFullName, {
      x: r.x + 0.05,
      y: r.y + titleBottom,
      w: r.w - 0.1,
      h: subBottom - titleBottom,
      fontFace: FONT,
      fontSize: 6.5,
      color: pp(C.fgSubtle),
      valign: 'middle',
      wrap: false,
    });
  }

  // Capabilities — every one. Pill height scales to whatever fits.
  const listTopPad = 0.03;
  const listBottomPad = 0.04;
  const listY = r.y + subBottom + listTopPad;
  const listH = r.h - subBottom - listTopPad - listBottomPad;
  const listX = r.x + 0.04;
  const listW = r.w - 0.08;

  if (p.capabilities.length === 0) return;
  const cols = 2;
  const gap = 0.015;
  const colW = (listW - gap * (cols - 1)) / cols;
  const rows = Math.ceil(p.capabilities.length / cols);
  // Compute pillH so the entire list fits the available height. Floor at a
  // small value to keep the text barely-readable; below that the font shrink
  // logic takes over.
  const idealH = (listH - gap * (rows - 1)) / rows;
  const pillH = Math.min(0.18, Math.max(0.08, idealH));

  for (let i = 0; i < p.capabilities.length; i++) {
    const cap = p.capabilities[i]!;
    const c = i % cols;
    const row = Math.floor(i / cols);
    const x = listX + c * (colW + gap);
    const y = listY + row * (pillH + gap);
    drawCapabilityPill(slide, cap, { x, y, w: colW, h: pillH });
  }
}

// -------- helpers ---------------------------------------------------------

/**
 * Rough estimate of text width in inches. pptxgenjs doesn't expose a measure
 * API, so we approximate using the average advance of Inter at 1pt. Used for
 * sizing legend chips and reserving room for the adoption %.
 *
 * `bold` slightly inflates the multiplier since bold weights are wider.
 */
function estimateTextWidth(text: string, fontSize: number, bold = false): number {
  // Inter's average glyph advance is ~0.5 of the em (~0.55 for bold), in points.
  const advance = bold ? 0.56 : 0.5;
  return (text.length * fontSize * advance) / 72;
}

/**
 * Truncate `text` with an ellipsis so the rendered width stays under
 * `maxWidth`. `fit: 'shrink'` is unreliable for short single-line text in
 * pptxgenjs, so we do the truncation ourselves to guarantee no overflow.
 */
function truncateToFit(text: string, maxWidth: number, fontSize: number, bold = false): string {
  if (estimateTextWidth(text, fontSize, bold) <= maxWidth) return text;
  if (text.length === 0) return text;
  const avgChar = estimateTextWidth(text, fontSize, bold) / text.length;
  const ellipsisW = estimateTextWidth('…', fontSize, bold);
  const usable = Math.max(0, maxWidth - ellipsisW);
  const maxChars = Math.max(1, Math.floor(usable / avgChar));
  return text.slice(0, maxChars).trimEnd() + '…';
}

/**
 * Continuous-ish font size scaler based on pill height. Larger pills get
 * larger text so the layout grows uniformly into available space.
 */
function pillFontSize(pillH: number): number {
  // Linear ramp from ~5pt at minH to ~11pt at maxH, then clamp.
  const fs = 4 + (pillH - 0.08) * 28;
  return Math.max(4.5, Math.min(11, fs));
}
