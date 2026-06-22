import PptxGenJS from 'pptxgenjs';
import { STATUSES } from '../capability-status';
import { EXPORT_FONT_FAMILY_PPTX, EXPORT_PALETTE, STATUS_COLORS } from './brand';
import type { RoadmapExportCard, RoadmapExportData } from './roadmap-data';

// pptxgenjs uses inches. LAYOUT_WIDE is 13.333" × 7.5".
const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const MARGIN = 0.1;

const HEADER_H = 0.45;
const ACCENT_H = 0.035;
const LEGEND_H = 0.18;
const FOOTER_H = 0.15;
const SECTION_GAP = 0.04;

const COL_HEADER_H = 0.26;
const LANE_LABEL_W = 1.4;
const CELL_PAD = 0.05;
const PILL_H = 0.14;
const PILL_GAP = 0.025;
const MIN_CELL_H = 0.4;
const COL_GAP = 0.03;

const C = EXPORT_PALETTE;
const FONT = EXPORT_FONT_FAMILY_PPTX;

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

// ---- public entry point ---------------------------------------------------

export async function exportRoadmapPptx(data: RoadmapExportData): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = `${data.customerName} - ${data.boardName}`;
  pptx.company = 'ServiceNow';

  if (data.columns.length === 0) {
    const slide = pptx.addSlide();
    slide.background = { color: pp(C.bg) };
    drawHeader(slide, data);
    slide.addText('No columns defined. Add columns in the app to populate this roadmap.', {
      x: MARGIN,
      y: HEADER_H + ACCENT_H + SECTION_GAP + LEGEND_H + SECTION_GAP,
      w: SLIDE_W - MARGIN * 2,
      h: 0.5,
      fontFace: FONT,
      fontSize: 11,
      italic: true,
      color: pp(C.fgSubtle),
      valign: 'middle',
    });
    return (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
  }

  const hasSwimlanes = data.swimlanes.length > 0;
  const laneW = hasSwimlanes ? LANE_LABEL_W : 0;
  const colAreaW = SLIDE_W - MARGIN * 2 - laneW;

  // How many columns per slide?
  const minColW = 0.8;
  const colsPerSlide = Math.max(1, Math.floor((colAreaW + COL_GAP) / (minColW + COL_GAP)));

  const colPages: (typeof data.columns)[] = [];
  for (let i = 0; i < data.columns.length; i += colsPerSlide) {
    colPages.push(data.columns.slice(i, i + colsPerSlide));
  }

  colPages.forEach((pageCols, pageIdx) => {
    const slide = pptx.addSlide();
    slide.background = { color: pp(C.bg) };

    const slideLabel = colPages.length > 1 ? `Slide ${pageIdx + 1} of ${colPages.length}` : null;
    drawHeader(slide, data, slideLabel);
    drawLegend(slide, MARGIN, HEADER_H + ACCENT_H + SECTION_GAP, SLIDE_W - MARGIN * 2, LEGEND_H);

    const contentTop = HEADER_H + ACCENT_H + SECTION_GAP + LEGEND_H + SECTION_GAP;
    const contentBottom = SLIDE_H - MARGIN - FOOTER_H;
    drawFooter(slide, data, slideLabel, contentBottom);

    const availH = contentBottom - contentTop;
    const colW = (colAreaW - COL_GAP * (pageCols.length - 1)) / pageCols.length;
    const gridX = MARGIN + laneW;
    let gridY = contentTop;

    // Column headers
    pageCols.forEach((col, ci) => {
      const x = gridX + ci * (colW + COL_GAP);
      slide.addShape('roundRect', {
        x,
        y: gridY,
        w: colW,
        h: COL_HEADER_H,
        fill: { color: pp(C.fg) },
        line: { type: 'none' },
        rectRadius: 0.03,
      });
      const title = truncateToFit(col.title, colW - 0.12, 9, true);
      slide.addText(title, {
        x: x + 0.06,
        y: gridY,
        w: colW - 0.12,
        h: COL_HEADER_H,
        fontFace: FONT,
        fontSize: 9,
        bold: true,
        color: 'FFFFFF',
        valign: 'middle',
        wrap: false,
      });
    });

    gridY += COL_HEADER_H + 0.03;

    if (hasSwimlanes) {
      data.swimlanes.forEach((lane) => {
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
        const clampedH = Math.min(rowH, contentBottom - gridY - 0.05);
        if (clampedH <= 0) return;

        // Lane label
        slide.addShape('rect', {
          x: MARGIN,
          y: gridY,
          w: laneW,
          h: clampedH,
          fill: { color: pp(C.bgSunken) },
          line: { color: pp(C.border), width: 0.4 },
        });
        const laneTitle = truncateToFit(lane.title, laneW - 0.12, 8, true);
        slide.addText(laneTitle, {
          x: MARGIN + 0.06,
          y: gridY,
          w: laneW - 0.12,
          h: clampedH,
          fontFace: FONT,
          fontSize: 8,
          bold: true,
          color: pp(C.fg),
          valign: 'middle',
          wrap: false,
        });

        // Cells
        pageCols.forEach((col, ci) => {
          const x = gridX + ci * (colW + COL_GAP);
          const cell = data.cells.find((c) => c.columnId === col.id && c.swimlaneId === lane.id);
          drawCell(slide, cell?.cards ?? [], { x, y: gridY, w: colW, h: clampedH });
        });

        gridY += clampedH + 0.03;
      });
    } else {
      const maxCards = Math.max(
        1,
        ...pageCols.map((col) => {
          const cell = data.cells.find((c) => c.columnId === col.id && c.swimlaneId === null);
          return cell?.cards.length ?? 0;
        }),
      );
      const rowH = Math.max(
        MIN_CELL_H,
        CELL_PAD * 2 + maxCards * PILL_H + Math.max(0, maxCards - 1) * PILL_GAP,
      );
      const clampedH = Math.min(rowH, availH - COL_HEADER_H - 0.03);

      pageCols.forEach((col, ci) => {
        const x = gridX + ci * (colW + COL_GAP);
        const cell = data.cells.find((c) => c.columnId === col.id && c.swimlaneId === null);
        drawCell(slide, cell?.cards ?? [], { x, y: gridY, w: colW, h: clampedH });
      });
    }
  });

  return (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
}

// ---- cell drawing ----------------------------------------------------------

function drawCell(slide: Slide, cards: RoadmapExportCard[], r: Rect): void {
  slide.addShape('rect', {
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    fill: { color: pp(C.bgElevated) },
    line: { color: pp(C.border), width: 0.4 },
  });

  let pillY = r.y + CELL_PAD;
  for (const card of cards) {
    if (pillY + PILL_H > r.y + r.h - CELL_PAD) break;
    drawCapabilityPill(slide, card, {
      x: r.x + CELL_PAD,
      y: pillY,
      w: r.w - CELL_PAD * 2,
      h: PILL_H,
    });
    pillY += PILL_H + PILL_GAP;
  }
}

function drawCapabilityPill(slide: Slide, card: RoadmapExportCard, r: Rect): void {
  const color = STATUS_COLORS[card.status];
  const barW = Math.min(0.05, r.h * 0.3);

  slide.addShape('roundRect', {
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    fill: { color: pp(C.bg) },
    line: { color: pp(C.border), width: 0.25 },
    rectRadius: 0.02,
  });
  slide.addShape('rect', {
    x: r.x,
    y: r.y,
    w: barW,
    h: r.h,
    fill: { color: pp(color) },
    line: { type: 'none' },
  });

  const fontSize = pillFontSize(r.h);
  const textBoxW = r.w - barW - 0.08;
  const text = truncateToFit(card.name, textBoxW - 0.02, fontSize);
  slide.addText(text, {
    x: r.x + barW + 0.04,
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

// ---- header / legend / footer ----------------------------------------------

function drawHeader(slide: Slide, data: RoadmapExportData, slideLabel?: string | null): void {
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: HEADER_H,
    fill: { color: pp(C.fg) },
    line: { type: 'none' },
  });
  slide.addShape('rect', {
    x: 0,
    y: HEADER_H,
    w: SLIDE_W,
    h: ACCENT_H,
    fill: { color: pp(C.accent) },
    line: { type: 'none' },
  });

  const custBlockW = SLIDE_W * 0.45 - MARGIN;
  const custName = truncateToFit(data.customerName, custBlockW - 0.05, 15, true);
  slide.addText(custName, {
    x: MARGIN,
    y: 0.02,
    w: custBlockW,
    h: 0.24,
    fontFace: FONT,
    fontSize: 15,
    bold: true,
    color: 'FFFFFF',
    valign: 'middle',
    wrap: false,
  });
  slide.addText(formatDate(data.generatedAt), {
    x: MARGIN,
    y: 0.24,
    w: custBlockW,
    h: 0.18,
    fontFace: FONT,
    fontSize: 8,
    color: 'DCE8F0',
    valign: 'middle',
    wrap: false,
  });

  const subtitle = `Adoption Roadmap · ${data.boardName}`;
  slide.addText(subtitle, {
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
}

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

function drawFooter(
  slide: Slide,
  data: RoadmapExportData,
  slideLabel: string | null,
  y: number,
): void {
  const stamp = `Generated ${formatDate(data.generatedAt)}`;
  slide.addText(stamp, {
    x: MARGIN,
    y,
    w: SLIDE_W * 0.6,
    h: FOOTER_H,
    fontFace: FONT,
    fontSize: 7,
    color: pp(C.fgSubtle),
    valign: 'middle',
    wrap: false,
  });
  if (slideLabel) {
    slide.addText(slideLabel, {
      x: SLIDE_W * 0.6,
      y,
      w: SLIDE_W * 0.4 - MARGIN,
      h: FOOTER_H,
      fontFace: FONT,
      fontSize: 7,
      color: pp(C.fgSubtle),
      align: 'right',
      valign: 'middle',
      wrap: false,
    });
  }
}

// ---- utilities -------------------------------------------------------------

function formatDate(d: Date): string {
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

function estimateTextWidth(text: string, fontSize: number, bold = false): number {
  const advance = bold ? 0.56 : 0.5;
  return (text.length * fontSize * advance) / 72;
}

function truncateToFit(text: string, maxWidth: number, fontSize: number, bold = false): string {
  if (estimateTextWidth(text, fontSize, bold) <= maxWidth) return text;
  if (text.length === 0) return text;
  const avgChar = estimateTextWidth(text, fontSize, bold) / text.length;
  const ellipsisW = estimateTextWidth('…', fontSize, bold);
  const usable = Math.max(0, maxWidth - ellipsisW);
  const maxChars = Math.max(1, Math.floor(usable / avgChar));
  return text.slice(0, maxChars).trimEnd() + '…';
}

function pillFontSize(pillH: number): number {
  const fs = 4 + (pillH - 0.08) * 28;
  return Math.max(4.5, Math.min(11, fs));
}
