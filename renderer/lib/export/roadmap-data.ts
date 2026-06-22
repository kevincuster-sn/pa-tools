import type { CapabilityStatus, Document } from '../../../shared/file-format';
import { buildCapabilityLookup } from '../adoption-roadmap';
import { getCapabilityStatus } from '../capability-status';

export interface RoadmapExportCard {
  name: string;
  status: CapabilityStatus;
  categoryName: string;
}

export interface RoadmapExportCell {
  columnId: string;
  swimlaneId: string | null;
  cards: RoadmapExportCard[];
}

export interface RoadmapExportData {
  boardName: string;
  customerName: string;
  generatedAt: Date;
  columns: Array<{ id: string; title: string }>;
  /** Empty when the board has no swimlanes. */
  swimlanes: Array<{ id: string; title: string }>;
  cells: RoadmapExportCell[];
}

/**
 * Build a format-agnostic snapshot of an adoption roadmap for export.
 * Status is resolved live from the document's capabilityMap at call time.
 */
export function buildRoadmapExportData(doc: Document, roadmapId: string): RoadmapExportData {
  const roadmap = doc.adoptionRoadmaps.find((r) => r.id === roadmapId);
  if (!roadmap) {
    return {
      boardName: 'Roadmap',
      customerName: doc.customer.name?.trim() || 'Untitled',
      generatedAt: new Date(),
      columns: [],
      swimlanes: [],
      cells: [],
    };
  }

  const capLookup = buildCapabilityLookup(doc.capabilityMap);
  const statusMap = doc.capabilityMap.capabilityStatus;

  const hasSwimlanes = roadmap.swimlanes.length > 0;

  // Build cells: one per column × swimlane combination.
  const cells: RoadmapExportCell[] = [];

  if (hasSwimlanes) {
    for (const col of roadmap.columns) {
      for (const lane of roadmap.swimlanes) {
        const cellCards = roadmap.cards
          .filter((c) => c.columnId === col.id && c.swimlaneId === lane.id)
          .map((c) => ({
            name: capLookup.get(c.capabilityId)?.name ?? c.capabilityId,
            status: getCapabilityStatus(statusMap, c.capabilityId),
            categoryName: capLookup.get(c.capabilityId)?.categoryName ?? '',
          }));
        cells.push({ columnId: col.id, swimlaneId: lane.id, cards: cellCards });
      }
    }
  } else {
    for (const col of roadmap.columns) {
      const cellCards = roadmap.cards
        .filter((c) => c.columnId === col.id && c.swimlaneId === null)
        .map((c) => ({
          name: capLookup.get(c.capabilityId)?.name ?? c.capabilityId,
          status: getCapabilityStatus(statusMap, c.capabilityId),
          categoryName: capLookup.get(c.capabilityId)?.categoryName ?? '',
        }));
      cells.push({ columnId: col.id, swimlaneId: null, cards: cellCards });
    }
  }

  return {
    boardName: roadmap.name,
    customerName: doc.customer.name?.trim() || 'Untitled',
    generatedAt: new Date(),
    columns: roadmap.columns.map((c) => ({ id: c.id, title: c.title })),
    swimlanes: roadmap.swimlanes.map((l) => ({ id: l.id, title: l.title })),
    cells,
  };
}

/** Sanitize a name for use in a default export filename. */
export function roadmapExportBaseName(customerName: string, boardName: string): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '').trim();
  const cust = safe(customerName) || 'Untitled';
  const board = safe(boardName) || 'Roadmap';
  return `${cust} - ${board}`;
}
