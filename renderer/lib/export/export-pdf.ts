import { jsPDF } from 'jspdf';
import { STATUSES } from '../capability-status';
import { EXPORT_FONT_FAMILY, EXPORT_PALETTE, STATUS_COLORS } from './brand';
import type { ExportAiPillar, ExportCapability, ExportCategory, ExportData } from './data';
import { INTER_BOLD_TTF_B64, INTER_REGULAR_TTF_B64 } from './fonts/inter.gen';

// US Letter, landscape, in points (1pt = 1/72in). 11" × 8.5".
const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN = 12;

// Vertical chrome heights.
const HEADER_H = 26;
const ACCENT_H = 2;
const LEGEND_H = 14;
const FOOTER_H = 10;
const AI_BAND_H = 96;
const SECTION_GAP = 4;

const C = EXPORT_PALETTE;
const FONT = EXPORT_FONT_FAMILY;

// Pill size search range. We pick the largest pillH that lets every active
// category fit on one page; if even minPillH doesn't fit, we paginate.
const PILL_H_MAX = 11;
const PILL_H_MIN = 7;
const PILL_GAP = 1.5;
const CARD_HEADER_H = 12;
const CARD_PADDING = 3;
const CARD_GAP = 4;
const MIN_COLS = 4;
const MAX_COLS = 8;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Build a PDF and return its bytes. */
export function exportCapabilityMapPdf(data: ExportData): Uint8Array {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  registerInterFont(doc);
  doc.setFont(FONT, 'normal');

  // Reserve the AI-Native band at the bottom of the LAST page only.
  // We always place it on the final page so the foundation has a stable spot.
  const gridAvailH =
    PAGE_H -
    MARGIN -
    HEADER_H -
    ACCENT_H -
    SECTION_GAP -
    LEGEND_H -
    SECTION_GAP -
    AI_BAND_H -
    SECTION_GAP -
    FOOTER_H -
    MARGIN;
  const gridAvailW = PAGE_W - MARGIN * 2;

  // Try to fit every active category on one page above the AI band.
  const fit = findFit(doc, data.activeCategories, gridAvailW, gridAvailH);

  if (fit) {
    renderPage(doc, data, {
      categories: data.activeCategories,
      fit,
      includeLegend: true,
      includeAiBand: true,
      pageLabel: null,
    });
  } else {
    renderTwoPage(doc, data, gridAvailW);
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

// -------- font ------------------------------------------------------------

function registerInterFont(doc: jsPDF): void {
  doc.addFileToVFS('Inter-Regular.ttf', INTER_REGULAR_TTF_B64);
  doc.addFileToVFS('Inter-Bold.ttf', INTER_BOLD_TTF_B64);
  doc.addFont('Inter-Regular.ttf', 'Inter', 'normal');
  doc.addFont('Inter-Bold.ttf', 'Inter', 'bold');
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
    // Pick the column with smallest projected height after placement.
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

/** Find the largest pill height that fits all categories on one page. */
function findFit(
  _doc: jsPDF,
  categories: ExportCategory[],
  framW: number,
  framH: number,
): GridFit | null {
  if (categories.length === 0) {
    return { cols: 1, cardW: framW, pillH: PILL_H_MAX, columns: [], maxColHeight: 0 };
  }
  for (let pillH = PILL_H_MAX; pillH >= PILL_H_MIN; pillH -= 0.5) {
    for (let cols = MIN_COLS; cols <= MAX_COLS; cols++) {
      const f = distribute(categories, cols, pillH, framW);
      if (f.maxColHeight <= framH) return f;
    }
  }
  return null;
}

// -------- top-level page rendering ----------------------------------------

interface PageOpts {
  categories: ExportCategory[];
  fit: GridFit;
  includeLegend: boolean;
  includeAiBand: boolean;
  pageLabel: string | null;
}

function renderPage(doc: jsPDF, data: ExportData, opts: PageOpts): void {
  const headerBottom = drawHeader(doc, data, opts.pageLabel);
  let cursor = headerBottom + SECTION_GAP;

  if (opts.includeLegend) {
    drawLegend(doc, MARGIN, cursor, PAGE_W - MARGIN * 2, LEGEND_H);
    cursor += LEGEND_H + SECTION_GAP;
  }

  const aiTop = opts.includeAiBand
    ? PAGE_H - MARGIN - FOOTER_H - SECTION_GAP - AI_BAND_H
    : PAGE_H - MARGIN - FOOTER_H;

  const gridFrame: Rect = {
    x: MARGIN,
    y: cursor,
    w: PAGE_W - MARGIN * 2,
    h: aiTop - SECTION_GAP - cursor,
  };

  drawCategoryGrid(doc, opts.categories, opts.fit, gridFrame);

  if (opts.includeAiBand) {
    drawAiNativeRow(doc, data, {
      x: MARGIN,
      y: aiTop,
      w: PAGE_W - MARGIN * 2,
      h: AI_BAND_H,
    });
  }

  drawFooter(doc, data, opts.pageLabel);
}

function renderTwoPage(doc: jsPDF, data: ExportData, framW: number): void {
  // Two pages: split the active categories so each page fits at PILL_H_MIN.
  // Page 1: header + legend + first slice (no AI band).
  // Page 2: header + remaining slice + AI band + footer.

  const splitIndex = findSplitIndex(data.activeCategories, framW);
  const first = data.activeCategories.slice(0, splitIndex);
  const second = data.activeCategories.slice(splitIndex);

  const page1AvailH =
    PAGE_H -
    MARGIN -
    HEADER_H -
    ACCENT_H -
    SECTION_GAP -
    LEGEND_H -
    SECTION_GAP -
    FOOTER_H -
    MARGIN;
  const page2AvailH =
    PAGE_H -
    MARGIN -
    HEADER_H -
    ACCENT_H -
    SECTION_GAP -
    AI_BAND_H -
    SECTION_GAP -
    FOOTER_H -
    MARGIN;

  const fit1 =
    findFit(doc, first, framW, page1AvailH) ?? distribute(first, MAX_COLS, PILL_H_MIN, framW);
  const fit2 =
    findFit(doc, second, framW, page2AvailH) ?? distribute(second, MAX_COLS, PILL_H_MIN, framW);

  renderPage(doc, data, {
    categories: first,
    fit: fit1,
    includeLegend: true,
    includeAiBand: false,
    pageLabel: 'Page 1 of 2',
  });

  doc.addPage('letter', 'landscape');
  renderPage(doc, data, {
    categories: second,
    fit: fit2,
    includeLegend: false,
    includeAiBand: true,
    pageLabel: 'Page 2 of 2',
  });
}

/**
 * Bisect to find the largest first-page slice whose categories fit on a page
 * (without the AI band) at PILL_H_MIN, leaving the remainder for page 2.
 */
function findSplitIndex(categories: ExportCategory[], framW: number): number {
  const page1AvailH =
    PAGE_H -
    MARGIN -
    HEADER_H -
    ACCENT_H -
    SECTION_GAP -
    LEGEND_H -
    SECTION_GAP -
    FOOTER_H -
    MARGIN;

  // Find the largest k where categories[0..k] fits on page 1 at PILL_H_MIN.
  let lo = 1;
  let hi = categories.length;
  let best = Math.ceil(categories.length / 2);
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const slice = categories.slice(0, mid);
    const f = distribute(slice, MAX_COLS, PILL_H_MIN, framW);
    if (f.maxColHeight <= page1AvailH) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return Math.max(1, best);
}

// -------- header / legend / footer ----------------------------------------

function drawHeader(doc: jsPDF, data: ExportData, pageLabel: string | null): number {
  // Brand bar.
  setFill(doc, C.fg);
  doc.rect(0, 0, PAGE_W, HEADER_H, 'F');

  // Accent stripe.
  setFill(doc, C.accent);
  doc.rect(0, HEADER_H, PAGE_W, ACCENT_H, 'F');

  // Title: customer name, vertically centered.
  doc.setFont(FONT, 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  drawTextVCentered(doc, data.customerName, MARGIN, HEADER_H / 2, 13);

  // Subtitle in the middle.
  doc.setFont(FONT, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(220, 232, 240);
  const subtitleText = 'ServiceNow Capability Map';
  const subW = doc.getTextWidth(subtitleText);
  drawTextVCentered(doc, subtitleText, (PAGE_W - subW) / 2, HEADER_H / 2, 8);

  // Adoption (right side).
  const pct = `${data.overallAdoption.pct}%`;
  const adoptionDetail = `${data.overallAdoption.adopted}/${data.overallAdoption.licensed} licensed`;

  doc.setFont(FONT, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  const pctW = doc.getTextWidth(pct);

  doc.setFont(FONT, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(220, 232, 240);
  const detailW = doc.getTextWidth(adoptionDetail);

  const rightEdge = PAGE_W - MARGIN;
  drawTextVCentered(doc, pct, rightEdge - pctW, HEADER_H / 2, 14, 'bold');
  drawTextVCentered(
    doc,
    adoptionDetail,
    rightEdge - pctW - 6 - detailW,
    HEADER_H / 2,
    7.5,
    'normal',
  );

  if (pageLabel) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(220, 232, 240);
    const labelW = doc.getTextWidth(pageLabel);
    drawTextVCentered(doc, pageLabel, (PAGE_W + subW) / 2 + 8, HEADER_H / 2, 7);
    // Suppress unused warning — labelW kept for future right-aligned variant.
    void labelW;
  }

  return HEADER_H + ACCENT_H;
}

function drawLegend(doc: jsPDF, x: number, y: number, _w: number, h: number): void {
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7.5);

  const centerY = y + h / 2;
  const chipSize = 7;
  const chipGap = 4;
  const itemGap = 10;

  let cx = x;
  for (const s of STATUSES) {
    setFill(doc, STATUS_COLORS[s.id]);
    doc.roundedRect(cx, centerY - chipSize / 2, chipSize, chipSize, 1.2, 1.2, 'F');
    cx += chipSize + chipGap;
    doc.setTextColor(...rgb(C.fgMuted));
    drawTextVCentered(doc, s.label, cx, centerY, 7.5);
    cx += doc.getTextWidth(s.label) + itemGap;
  }
}

function drawFooter(doc: jsPDF, data: ExportData, pageLabel: string | null): void {
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...rgb(C.fgSubtle));
  const stamp = `Generated ${data.generatedAt.toLocaleString()}  ·  ${data.enabledCategoryCount} of ${data.totalCategoryCount} categories enabled`;
  drawTextVCentered(doc, stamp, MARGIN, PAGE_H - MARGIN - FOOTER_H / 2, 7);
  if (pageLabel) {
    const w = doc.getTextWidth(pageLabel);
    drawTextVCentered(doc, pageLabel, PAGE_W - MARGIN - w, PAGE_H - MARGIN - FOOTER_H / 2, 7);
  }
}

// -------- category grid ---------------------------------------------------

function drawCategoryGrid(
  doc: jsPDF,
  categories: ExportCategory[],
  fit: GridFit,
  frame: Rect,
): void {
  if (categories.length === 0) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...rgb(C.fgSubtle));
    doc.text(
      'No active categories. Toggle categories on to include them in the export.',
      frame.x,
      frame.y + 18,
    );
    return;
  }

  fit.columns.forEach((col, colIdx) => {
    let cardY = frame.y;
    const colX = frame.x + colIdx * (fit.cardW + CARD_GAP);
    for (const placed of col.cards) {
      drawCategoryCard(doc, placed.cat, fit.pillH, {
        x: colX,
        y: cardY,
        w: fit.cardW,
        h: placed.height,
      });
      cardY += placed.height + CARD_GAP;
    }
  });
}

function drawCategoryCard(doc: jsPDF, cat: ExportCategory, pillH: number, r: Rect): void {
  // Card background + border.
  setFill(doc, C.bgElevated);
  setStroke(doc, C.border);
  doc.setLineWidth(0.4);
  doc.roundedRect(r.x, r.y, r.w, r.h, 2.5, 2.5, 'FD');

  // Header strip.
  setFill(doc, C.fg);
  doc.roundedRect(r.x, r.y, r.w, CARD_HEADER_H, 2.5, 2.5, 'F');
  // Mask bottom corners of the rounded header so it looks like a top bar.
  setFill(doc, C.fg);
  doc.rect(r.x, r.y + CARD_HEADER_H - 2.5, r.w, 2.5, 'F');

  const adoptionText = cat.adoption.licensed > 0 ? `${cat.adoption.pct}%` : '';

  doc.setFont(FONT, 'normal');
  doc.setFontSize(7);
  let adoptionW = 0;
  if (adoptionText) {
    adoptionW = doc.getTextWidth(adoptionText) + 4;
  }

  doc.setFont(FONT, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  const titleMaxW = r.w - 8 - adoptionW;
  const title = truncateToWidth(doc, cat.name, titleMaxW);
  drawTextVCentered(doc, title, r.x + 4, r.y + CARD_HEADER_H / 2, 8, 'bold');

  if (adoptionText) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    drawTextVCentered(
      doc,
      adoptionText,
      r.x + r.w - 4 - doc.getTextWidth(adoptionText),
      r.y + CARD_HEADER_H / 2,
      7,
      'normal',
    );
  }

  // Capabilities — render every one, no truncation by count.
  const listX = r.x + CARD_PADDING;
  const listY = r.y + CARD_HEADER_H + CARD_PADDING;
  const listW = r.w - CARD_PADDING * 2;
  drawCapabilityList(doc, cat.capabilities, pillH, { x: listX, y: listY, w: listW, h: 0 });
}

function drawCapabilityList(doc: jsPDF, caps: ExportCapability[], pillH: number, r: Rect): void {
  if (caps.length === 0) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...rgb(C.fgSubtle));
    drawTextVCentered(doc, 'No capabilities', r.x + 1, r.y + pillH / 2, 6.5);
    return;
  }

  for (let i = 0; i < caps.length; i++) {
    const cap = caps[i]!;
    const y = r.y + i * (pillH + PILL_GAP);
    drawCapabilityPill(doc, cap, pillH, { x: r.x, y, w: r.w, h: pillH });
  }
}

function drawCapabilityPill(doc: jsPDF, cap: ExportCapability, _pillH: number, r: Rect): void {
  const color = STATUS_COLORS[cap.status];

  // Pill body — light fill on top of the elevated card.
  setFill(doc, C.bg);
  setStroke(doc, C.border);
  doc.setLineWidth(0.25);
  doc.roundedRect(r.x, r.y, r.w, r.h, 1.2, 1.2, 'FD');

  // Status bar on the left edge.
  const barW = Math.min(2.5, r.h * 0.32);
  setFill(doc, color);
  doc.rect(r.x, r.y, barW, r.h, 'F');

  // Capability name — choose a font size that fits the pill height.
  const fontSize = r.h <= 8 ? 5.5 : r.h <= 9 ? 6 : r.h <= 10 ? 6.5 : 7;
  doc.setFont(FONT, 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(...rgb(C.fg));

  const padding = barW + 2.5;
  const textMaxW = r.w - padding - 2;
  const text = truncateToWidth(doc, cap.name, textMaxW);
  drawTextVCentered(doc, text, r.x + padding, r.y + r.h / 2, fontSize);
}

// -------- AI Native row ---------------------------------------------------

function drawAiNativeRow(doc: jsPDF, data: ExportData, frame: Rect): void {
  // Section label sits just above the band.
  doc.setFont(FONT, 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...rgb(C.fgSubtle));
  doc.text('AI-NATIVE PLATFORM', frame.x, frame.y - 3);

  doc.setFont(FONT, 'normal');
  doc.setFontSize(7);
  const subtitle = 'Foundation — always relevant';
  const subW = doc.getTextWidth(subtitle);
  doc.text(subtitle, frame.x + frame.w - subW, frame.y - 3);

  // Section background.
  setFill(doc, C.bgSunken);
  setStroke(doc, C.border);
  doc.setLineWidth(0.4);
  doc.roundedRect(frame.x, frame.y, frame.w, frame.h, 2.5, 2.5, 'FD');

  const pad = 4;
  const innerX = frame.x + pad;
  const innerY = frame.y + pad;
  const innerW = frame.w - pad * 2;
  const innerH = frame.h - pad * 2;

  const pillars: ExportAiPillar[] = data.aiPillars;
  if (pillars.length === 0) return;

  const cols = pillars.length;
  const gap = 4;
  const cellW = (innerW - gap * (cols - 1)) / cols;

  pillars.forEach((p, i) => {
    const x = innerX + i * (cellW + gap);
    drawAiPillarCard(doc, p, { x, y: innerY, w: cellW, h: innerH });
  });
}

function drawAiPillarCard(doc: jsPDF, p: ExportAiPillar, r: Rect): void {
  setFill(doc, C.bgElevated);
  setStroke(doc, C.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(r.x, r.y, r.w, r.h, 2.5, 2.5, 'FD');

  // Header.
  doc.setFont(FONT, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...rgb(C.fg));
  drawTextVCentered(doc, p.label, r.x + 4, r.y + 8, 7.5, 'bold');

  if (p.fullName) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...rgb(C.fgSubtle));
    const sub = truncateToWidth(doc, p.fullName, r.w - 8);
    drawTextVCentered(doc, sub, r.x + 4, r.y + 16, 6);
  }

  // Capabilities in a 2-column packed list, no count truncation.
  const listY = r.y + 22;
  const listH = r.h - 22 - 3;
  const listX = r.x + 3;
  const listW = r.w - 6;

  if (p.capabilities.length === 0) return;
  const cols = 2;
  const gap = 1.5;
  const colW = (listW - gap * (cols - 1)) / cols;
  const rows = Math.ceil(p.capabilities.length / cols);
  const idealH = (listH - gap * (rows - 1)) / rows;
  const pillH = Math.min(10, Math.max(6, idealH));

  for (let i = 0; i < p.capabilities.length; i++) {
    const cap = p.capabilities[i]!;
    const c = i % cols;
    const row = Math.floor(i / cols);
    const x = listX + c * (colW + gap);
    const y = listY + row * (pillH + gap);
    drawCapabilityPill(doc, cap, pillH, { x, y, w: colW, h: pillH });
  }
}

// -------- helpers ---------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgb(hex: string): [number, number, number] {
  return hexToRgb(hex);
}

function setFill(doc: jsPDF, hex: string): void {
  const [r, g, b] = hexToRgb(hex);
  doc.setFillColor(r, g, b);
}

function setStroke(doc: jsPDF, hex: string): void {
  const [r, g, b] = hexToRgb(hex);
  doc.setDrawColor(r, g, b);
}

function truncateToWidth(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  const ellipsis = '…';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (doc.getTextWidth(text.slice(0, mid) + ellipsis) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}

/**
 * Draw text whose visual vertical center sits at `cy`.
 *
 * jsPDF's `text(x, y)` places the *baseline* at y. For Inter, the visual
 * mid-line of an x-height glyph sits roughly 35 % of the font size above
 * the baseline — i.e. baseline = cy + fontSize * 0.35.
 */
function drawTextVCentered(
  doc: jsPDF,
  text: string,
  x: number,
  cy: number,
  fontSize: number,
  style: 'normal' | 'bold' = 'normal',
): void {
  // jsPDF text() uses whatever font is currently set; callers should already
  // have invoked setFont. The style param is for callers who only set size.
  if (style) doc.setFont(FONT, style);
  doc.setFontSize(fontSize);
  doc.text(text, x, cy + fontSize * 0.35);
}
