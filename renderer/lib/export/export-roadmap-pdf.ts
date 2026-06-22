import { jsPDF } from 'jspdf';
import { STATUSES } from '../capability-status';
import { EXPORT_FONT_FAMILY, EXPORT_PALETTE, STATUS_COLORS } from './brand';
import { INTER_BOLD_TTF_B64, INTER_REGULAR_TTF_B64 } from './fonts/inter.gen';
import type { RoadmapExportCard, RoadmapExportData } from './roadmap-data';

// US Letter landscape: 792 × 612 pt
const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN = 12;

const HEADER_H = 26;
const ACCENT_H = 2;
const LEGEND_H = 14;
const FOOTER_H = 10;
const SECTION_GAP = 4;

// Grid layout constants
const COL_HEADER_H = 16;
const LANE_LABEL_W = 100; // width of the swimlane label column (0 when no swimlanes)
const CELL_PAD = 4;
const PILL_H = 10;
const PILL_GAP = 2;
const MIN_CELL_H = 28; // minimum cell height (empty cell)
const COL_GAP = 2;

const C = EXPORT_PALETTE;
const FONT = EXPORT_FONT_FAMILY;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---- public entry point ---------------------------------------------------

export function exportRoadmapPdf(data: RoadmapExportData): Uint8Array {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  registerInterFont(doc);
  doc.setFont(FONT, 'normal');

  if (data.columns.length === 0) {
    renderEmptyBoard(doc, data);
  } else {
    renderBoard(doc, data);
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

// ---- font registration ----------------------------------------------------

function registerInterFont(doc: jsPDF): void {
  doc.addFileToVFS('Inter-Regular.ttf', INTER_REGULAR_TTF_B64);
  doc.addFileToVFS('Inter-Bold.ttf', INTER_BOLD_TTF_B64);
  doc.addFont('Inter-Regular.ttf', 'Inter', 'normal');
  doc.addFont('Inter-Bold.ttf', 'Inter', 'bold');
}

// ---- board rendering -------------------------------------------------------

function chromaBottom(doc: jsPDF, data: RoadmapExportData): number {
  drawHeader(doc, data);
  let cursor = HEADER_H + ACCENT_H + SECTION_GAP;
  drawLegend(doc, MARGIN, cursor, PAGE_W - MARGIN * 2, LEGEND_H);
  cursor += LEGEND_H + SECTION_GAP;
  return cursor;
}

function renderEmptyBoard(doc: jsPDF, data: RoadmapExportData): void {
  const top = chromaBottom(doc, data);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...rgb(C.fgSubtle));
  doc.text(
    'No columns defined. Add columns in the app to populate this roadmap.',
    MARGIN,
    top + 20,
  );
  drawFooter(doc, data, null);
}

function renderBoard(doc: jsPDF, data: RoadmapExportData): void {
  const contentTop = chromaBottom(doc, data);
  const contentBottom = PAGE_H - MARGIN - FOOTER_H - SECTION_GAP;
  const availH = contentBottom - contentTop;
  const availW = PAGE_W - MARGIN * 2;

  const hasSwimlanes = data.swimlanes.length > 0;
  const laneW = hasSwimlanes ? LANE_LABEL_W : 0;
  const colAreaW = availW - laneW;

  // How many columns fit on one page?
  const minColW = 80;
  const colsPerPage = Math.max(1, Math.floor((colAreaW + COL_GAP) / (minColW + COL_GAP)));

  // Split columns into pages
  const colPages: (typeof data.columns)[] = [];
  for (let i = 0; i < data.columns.length; i += colsPerPage) {
    colPages.push(data.columns.slice(i, i + colsPerPage));
  }

  colPages.forEach((pageCols, pageIdx) => {
    if (pageIdx > 0) {
      doc.addPage('letter', 'landscape');
      chromaBottom(doc, data);
    }

    const pageLabel = colPages.length > 1 ? `Page ${pageIdx + 1} of ${colPages.length}` : null;
    drawFooter(doc, data, pageLabel);

    const colW = (colAreaW - COL_GAP * (pageCols.length - 1)) / pageCols.length;
    const gridX = MARGIN + laneW;
    let gridY = contentTop;

    // Column header row
    pageCols.forEach((col, ci) => {
      const x = gridX + ci * (colW + COL_GAP);
      setFill(doc, C.fg);
      doc.roundedRect(x, gridY, colW, COL_HEADER_H, 2, 2, 'F');
      doc.setFont(FONT, 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      const title = truncateToWidth(doc, col.title, colW - 8);
      drawTextVCentered(doc, title, x + 4, gridY + COL_HEADER_H / 2, 8, 'bold');
    });

    gridY += COL_HEADER_H + 2;

    if (hasSwimlanes) {
      // Render one row per swimlane
      data.swimlanes.forEach((lane) => {
        // Compute row height = max card count in any cell of this row
        const maxCards = Math.max(
          1,
          ...pageCols.map((col) => {
            const cell = data.cells.find((c) => c.columnId === col.id && c.swimlaneId === lane.id);
            return cell?.cards.length ?? 0;
          }),
        );
        const rowH = Math.max(
          MIN_CELL_H,
          CELL_PAD * 2 + maxCards * PILL_H + Math.max(0, maxCards - 1) * PILL_GAP,
        );

        // Swimlane label
        setFill(doc, C.bgSunken);
        setStroke(doc, C.border);
        doc.setLineWidth(0.3);
        doc.rect(MARGIN, gridY, laneW, rowH, 'FD');
        doc.setFont(FONT, 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...rgb(C.fg));
        const laneTitle = truncateToWidth(doc, lane.title, laneW - 6);
        drawTextVCentered(doc, laneTitle, MARGIN + 4, gridY + rowH / 2, 7.5, 'bold');

        // Cells
        pageCols.forEach((col, ci) => {
          const x = gridX + ci * (colW + COL_GAP);
          const cell = data.cells.find((c) => c.columnId === col.id && c.swimlaneId === lane.id);
          drawCell(doc, cell?.cards ?? [], { x, y: gridY, w: colW, h: rowH });
        });

        gridY += rowH + 2;

        // Stop if we've run off the page
        if (gridY > contentBottom) return;
      });
    } else {
      // No swimlanes: single row, height = max cards in any cell
      const maxCards = Math.max(
        1,
        ...pageCols.map((col) => {
          const cell = data.cells.find((c) => c.columnId === col.id && c.swimlaneId === null);
          return cell?.cards.length ?? 0;
        }),
      );
      const rowH = Math.max(
        MIN_CELL_H,
        availH - COL_HEADER_H - 2,
        CELL_PAD * 2 + maxCards * PILL_H + Math.max(0, maxCards - 1) * PILL_GAP,
      );
      const clampedH = Math.min(rowH, availH - COL_HEADER_H - 2);

      pageCols.forEach((col, ci) => {
        const x = gridX + ci * (colW + COL_GAP);
        const cell = data.cells.find((c) => c.columnId === col.id && c.swimlaneId === null);
        drawCell(doc, cell?.cards ?? [], { x, y: gridY, w: colW, h: clampedH });
      });
    }
  });
}

// ---- cell drawing ----------------------------------------------------------

function drawCell(doc: jsPDF, cards: RoadmapExportCard[], r: Rect): void {
  setFill(doc, C.bgElevated);
  setStroke(doc, C.border);
  doc.setLineWidth(0.3);
  doc.rect(r.x, r.y, r.w, r.h, 'FD');

  if (cards.length === 0) return;

  const listX = r.x + CELL_PAD;
  const listW = r.w - CELL_PAD * 2;
  let pillY = r.y + CELL_PAD;

  for (const card of cards) {
    if (pillY + PILL_H > r.y + r.h - CELL_PAD) break; // would overflow
    drawCapabilityPill(doc, card, { x: listX, y: pillY, w: listW, h: PILL_H });
    pillY += PILL_H + PILL_GAP;
  }
}

function drawCapabilityPill(doc: jsPDF, card: RoadmapExportCard, r: Rect): void {
  const color = STATUS_COLORS[card.status];
  const barW = Math.min(2.5, r.h * 0.32);

  setFill(doc, C.bg);
  setStroke(doc, C.border);
  doc.setLineWidth(0.25);
  doc.roundedRect(r.x, r.y, r.w, r.h, 1.2, 1.2, 'FD');

  setFill(doc, color);
  doc.rect(r.x, r.y, barW, r.h, 'F');

  const fontSize = r.h <= 8 ? 5.5 : r.h <= 9 ? 6 : r.h <= 10 ? 6.5 : 7;
  doc.setFont(FONT, 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(...rgb(C.fg));
  const padding = barW + 2.5;
  const text = truncateToWidth(doc, card.name, r.w - padding - 2);
  drawTextVCentered(doc, text, r.x + padding, r.y + r.h / 2, fontSize);
}

// ---- header / legend / footer ----------------------------------------------

function drawHeader(doc: jsPDF, data: RoadmapExportData): void {
  setFill(doc, C.fg);
  doc.rect(0, 0, PAGE_W, HEADER_H, 'F');
  setFill(doc, C.accent);
  doc.rect(0, HEADER_H, PAGE_W, ACCENT_H, 'F');

  doc.setFont(FONT, 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  drawTextVCentered(doc, data.customerName, MARGIN, HEADER_H / 2, 13, 'bold');

  doc.setFont(FONT, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(220, 232, 240);
  const subtitle = `Adoption Roadmap · ${data.boardName}`;
  const subW = doc.getTextWidth(subtitle);
  drawTextVCentered(doc, subtitle, (PAGE_W - subW) / 2, HEADER_H / 2, 8);
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

function drawFooter(doc: jsPDF, data: RoadmapExportData, pageLabel: string | null): void {
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...rgb(C.fgSubtle));
  const stamp = `Generated ${data.generatedAt.toLocaleString()}`;
  drawTextVCentered(doc, stamp, MARGIN, PAGE_H - MARGIN - FOOTER_H / 2, 7);
  if (pageLabel) {
    const w = doc.getTextWidth(pageLabel);
    drawTextVCentered(doc, pageLabel, PAGE_W - MARGIN - w, PAGE_H - MARGIN - FOOTER_H / 2, 7);
  }
}

// ---- utilities -------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
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
  let lo = 0,
    hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (doc.getTextWidth(text.slice(0, mid) + ellipsis) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}

function drawTextVCentered(
  doc: jsPDF,
  text: string,
  x: number,
  cy: number,
  fontSize: number,
  style: 'normal' | 'bold' = 'normal',
): void {
  if (style) doc.setFont(FONT, style);
  doc.setFontSize(fontSize);
  doc.text(text, x, cy + fontSize * 0.35);
}
