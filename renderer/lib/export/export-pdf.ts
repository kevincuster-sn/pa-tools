import { jsPDF } from 'jspdf';
import { STATUSES } from '../capability-status';
import { EXPORT_FONT_FAMILY, EXPORT_PALETTE, STATUS_COLORS } from './brand';
import type { ExportAiPillar, ExportCapability, ExportCategory, ExportData } from './data';

// Page geometry — US Letter, landscape, in points (1pt = 1/72in).
const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN = 24;
const GUTTER = 8;

const COLORS = EXPORT_PALETTE;

/** Build a PDF and return its bytes. */
export function exportCapabilityMapPdf(data: ExportData): Uint8Array {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  doc.setFont(EXPORT_FONT_FAMILY, 'normal');

  const headerBottom = drawHeader(doc, data);
  const legendBottom = drawLegend(doc, headerBottom + 6);

  // Reserve a bottom band for the AI-Native pillars row.
  const aiRowHeight = 130;
  const aiTop = PAGE_H - MARGIN - aiRowHeight;

  const gridTop = legendBottom + 10;
  const gridBottom = aiTop - 14;
  const gridLeft = MARGIN;
  const gridRight = PAGE_W - MARGIN;

  drawCategoryGrid(doc, data.activeCategories, {
    x: gridLeft,
    y: gridTop,
    w: gridRight - gridLeft,
    h: gridBottom - gridTop,
  });

  drawAiNativeRow(doc, data, { x: MARGIN, y: aiTop, w: PAGE_W - MARGIN * 2, h: aiRowHeight });

  drawFooter(doc, data);

  return new Uint8Array(doc.output('arraybuffer'));
}

// -------- header / legend / footer ----------------------------------------

function drawHeader(doc: jsPDF, data: ExportData): number {
  // Brand bar background.
  setFill(doc, COLORS.fg);
  doc.rect(0, 0, PAGE_W, 56, 'F');

  // Brand accent stripe.
  setFill(doc, COLORS.accent);
  doc.rect(0, 56, PAGE_W, 3, 'F');

  // Title and subtitle.
  doc.setTextColor(255, 255, 255);
  doc.setFont(EXPORT_FONT_FAMILY, 'bold');
  doc.setFontSize(18);
  doc.text(data.customerName, MARGIN, 28);

  doc.setFont(EXPORT_FONT_FAMILY, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(220, 232, 240);
  doc.text('ServiceNow Capability Map', MARGIN, 44);

  // Adoption metric (right side).
  const pct = data.overallAdoption.pct;
  const pctStr = `${pct}%`;
  const adoptionLabel = `Adoption  (${data.overallAdoption.adopted}/${data.overallAdoption.licensed} licensed)`;
  doc.setFont(EXPORT_FONT_FAMILY, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(220, 232, 240);
  const adoptionLabelW = doc.getTextWidth(adoptionLabel);
  doc.text(adoptionLabel, PAGE_W - MARGIN - adoptionLabelW, 22);

  doc.setFont(EXPORT_FONT_FAMILY, 'bold');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  const pctW = doc.getTextWidth(pctStr);
  doc.text(pctStr, PAGE_W - MARGIN - pctW, 46);

  return 59;
}

function drawLegend(doc: jsPDF, y: number): number {
  doc.setFont(EXPORT_FONT_FAMILY, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...rgb(COLORS.fgMuted));

  let x = MARGIN;
  const chipSize = 7;
  const chipGap = 5;
  const itemGap = 12;

  for (const s of STATUSES) {
    setFill(doc, STATUS_COLORS[s.id]);
    doc.roundedRect(x, y - chipSize + 1, chipSize, chipSize, 1.5, 1.5, 'F');
    x += chipSize + chipGap;
    doc.setTextColor(...rgb(COLORS.fgMuted));
    doc.text(s.label, x, y + 5);
    x += doc.getTextWidth(s.label) + itemGap;
  }
  return y + 12;
}

function drawFooter(doc: jsPDF, data: ExportData): void {
  doc.setFont(EXPORT_FONT_FAMILY, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...rgb(COLORS.fgSubtle));
  const stamp = `Generated ${data.generatedAt.toLocaleString()}  ·  ${data.enabledCategoryCount} of ${data.totalCategoryCount} categories enabled`;
  doc.text(stamp, MARGIN, PAGE_H - 8);
}

// -------- category grid ----------------------------------------------------

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function pickColumns(count: number): number {
  if (count <= 4) return Math.max(count, 1);
  if (count <= 9) return 3;
  if (count <= 16) return 4;
  if (count <= 25) return 5;
  if (count <= 30) return 6;
  return 7;
}

function drawCategoryGrid(doc: jsPDF, categories: ExportCategory[], frame: Rect): void {
  if (categories.length === 0) {
    doc.setFont(EXPORT_FONT_FAMILY, 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...rgb(COLORS.fgSubtle));
    doc.text(
      'No active categories. Toggle categories on to include them in the export.',
      frame.x,
      frame.y + 20,
    );
    return;
  }

  const cols = pickColumns(categories.length);
  const rows = Math.ceil(categories.length / cols);
  const cellW = (frame.w - GUTTER * (cols - 1)) / cols;
  const cellH = (frame.h - GUTTER * (rows - 1)) / rows;

  categories.forEach((cat, idx) => {
    const c = idx % cols;
    const r = Math.floor(idx / cols);
    const x = frame.x + c * (cellW + GUTTER);
    const y = frame.y + r * (cellH + GUTTER);
    drawCategoryCard(doc, cat, { x, y, w: cellW, h: cellH });
  });
}

function drawCategoryCard(doc: jsPDF, cat: ExportCategory, r: Rect): void {
  // Card background + border.
  setFill(doc, COLORS.bgElevated);
  setStroke(doc, COLORS.border);
  doc.setLineWidth(0.5);
  doc.roundedRect(r.x, r.y, r.w, r.h, 3, 3, 'FD');

  // Header strip.
  const headerH = 16;
  setFill(doc, COLORS.fg);
  doc.roundedRect(r.x, r.y, r.w, headerH, 3, 3, 'F');
  // Mask bottom corners of the rounded header so it looks like a top bar.
  setFill(doc, COLORS.fg);
  doc.rect(r.x, r.y + headerH - 3, r.w, 3, 'F');

  doc.setFont(EXPORT_FONT_FAMILY, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  const adoptionText = cat.adoption.licensed > 0 ? `${cat.adoption.pct}%` : '';
  const adoptionW = adoptionText ? doc.getTextWidth(adoptionText) + 4 : 0;
  const titleMaxW = r.w - 8 - adoptionW;
  const title = truncateToWidth(doc, cat.name, titleMaxW);
  doc.text(title, r.x + 5, r.y + 11);
  if (adoptionText) {
    doc.setFont(EXPORT_FONT_FAMILY, 'normal');
    doc.setFontSize(8);
    doc.text(adoptionText, r.x + r.w - 5 - doc.getTextWidth(adoptionText), r.y + 11);
  }

  // Capabilities.
  const listX = r.x + 4;
  const listY = r.y + headerH + 4;
  const listW = r.w - 8;
  const listH = r.h - headerH - 8;
  drawCapabilityList(doc, cat.capabilities, { x: listX, y: listY, w: listW, h: listH });
}

function drawCapabilityList(doc: jsPDF, caps: ExportCapability[], r: Rect): void {
  if (caps.length === 0) {
    doc.setFont(EXPORT_FONT_FAMILY, 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...rgb(COLORS.fgSubtle));
    doc.text('No capabilities', r.x + 2, r.y + 8);
    return;
  }

  // Auto-fit pill height to vertical space.
  const minH = 9;
  const maxH = 12;
  const gap = 2;
  let pillH = Math.min(maxH, Math.max(minH, (r.h - (caps.length - 1) * gap) / caps.length));
  const visibleCount = Math.min(caps.length, Math.max(1, Math.floor((r.h + gap) / (pillH + gap))));
  const truncated = visibleCount < caps.length;

  for (let i = 0; i < visibleCount; i++) {
    const cap = caps[i]!;
    const y = r.y + i * (pillH + gap);
    drawCapabilityPill(doc, cap, { x: r.x, y, w: r.w, h: pillH });
  }

  if (truncated) {
    doc.setFont(EXPORT_FONT_FAMILY, 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(...rgb(COLORS.fgSubtle));
    doc.text(
      `+${caps.length - visibleCount} more`,
      r.x + 2,
      r.y + visibleCount * (pillH + gap) + 6,
    );
  }
}

function drawCapabilityPill(doc: jsPDF, cap: ExportCapability, r: Rect): void {
  const color = STATUS_COLORS[cap.status];

  // Pill body — very light fill on top of the elevated card.
  setFill(doc, COLORS.bg);
  setStroke(doc, COLORS.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(r.x, r.y, r.w, r.h, 1.5, 1.5, 'FD');

  // Status bar on the left edge.
  const barW = 3;
  setFill(doc, color);
  doc.rect(r.x, r.y, barW, r.h, 'F');

  // Capability name.
  const fontSize = r.h <= 9.5 ? 6.5 : 7.2;
  doc.setFont(EXPORT_FONT_FAMILY, 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(...rgb(COLORS.fg));
  const padding = barW + 3;
  const textMaxW = r.w - padding - 2;
  const text = truncateToWidth(doc, cap.name, textMaxW);
  // Vertical centering: jspdf text baseline is at y, so offset slightly.
  doc.text(text, r.x + padding, r.y + r.h - (r.h - fontSize * 0.75) / 2);
}

// -------- AI Native row ----------------------------------------------------

function drawAiNativeRow(doc: jsPDF, data: ExportData, frame: Rect): void {
  // Section label.
  doc.setFont(EXPORT_FONT_FAMILY, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...rgb(COLORS.fgSubtle));
  doc.text('AI-NATIVE PLATFORM', frame.x, frame.y - 4);

  doc.setFont(EXPORT_FONT_FAMILY, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...rgb(COLORS.fgSubtle));
  const subtitle = 'Foundation — always relevant';
  doc.text(subtitle, frame.x + frame.w - doc.getTextWidth(subtitle), frame.y - 4);

  // Section background.
  setFill(doc, COLORS.bgSunken);
  setStroke(doc, COLORS.border);
  doc.setLineWidth(0.5);
  doc.roundedRect(frame.x, frame.y, frame.w, frame.h, 3, 3, 'FD');

  const pad = 6;
  const innerX = frame.x + pad;
  const innerY = frame.y + pad;
  const innerW = frame.w - pad * 2;
  const innerH = frame.h - pad * 2;

  const pillars: ExportAiPillar[] = data.aiPillars;
  if (pillars.length === 0) return;

  const cols = pillars.length;
  const gap = 6;
  const cellW = (innerW - gap * (cols - 1)) / cols;

  pillars.forEach((p, i) => {
    const x = innerX + i * (cellW + gap);
    drawAiPillarCard(doc, p, { x, y: innerY, w: cellW, h: innerH });
  });
}

function drawAiPillarCard(doc: jsPDF, p: ExportAiPillar, r: Rect): void {
  setFill(doc, COLORS.bgElevated);
  setStroke(doc, COLORS.border);
  doc.setLineWidth(0.4);
  doc.roundedRect(r.x, r.y, r.w, r.h, 3, 3, 'FD');

  // Header.
  doc.setFont(EXPORT_FONT_FAMILY, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...rgb(COLORS.fg));
  doc.text(p.label, r.x + 5, r.y + 11);
  if (p.fullName) {
    doc.setFont(EXPORT_FONT_FAMILY, 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...rgb(COLORS.fgSubtle));
    const sub = truncateToWidth(doc, p.fullName, r.w - 10);
    doc.text(sub, r.x + 5, r.y + 18);
  }

  // Capabilities in a 2-column packed list.
  const listY = r.y + 22;
  const listH = r.h - 22 - 4;
  const listX = r.x + 4;
  const listW = r.w - 8;

  if (p.capabilities.length === 0) return;
  const cols = 2;
  const gap = 2;
  const colW = (listW - gap * (cols - 1)) / cols;
  const rows = Math.ceil(p.capabilities.length / cols);
  const pillH = Math.min(11, Math.max(8, (listH - gap * (rows - 1)) / rows));

  const maxRows = Math.max(1, Math.floor((listH + gap) / (pillH + gap)));
  const visibleCount = Math.min(p.capabilities.length, maxRows * cols);

  for (let i = 0; i < visibleCount; i++) {
    const cap = p.capabilities[i]!;
    const c = i % cols;
    const row = Math.floor(i / cols);
    const x = listX + c * (colW + gap);
    const y = listY + row * (pillH + gap);
    drawCapabilityPill(doc, cap, { x, y, w: colW, h: pillH });
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
