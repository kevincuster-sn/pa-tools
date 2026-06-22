'use client';

import { X } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import type { RoadmapCard as RoadmapCardData } from '../../../shared/file-format';
import { useDocumentStore } from '../../state/document';
import { getCapabilityStatus } from '../../lib/capability-status';
import { STATUS_META } from '../../lib/capability-status';
import type { CapabilityInfo } from '../../lib/adoption-roadmap';
import { isCustomCapabilityId } from '../../lib/capability-map';
import { StatusPopover } from '../capability-map/StatusPopover';

interface Props {
  roadmapId: string;
  card: RoadmapCardData;
  capabilityInfo: CapabilityInfo | undefined;
  /** When true the card is being dragged — show a placeholder. */
  isDragging?: boolean;
}

function RoadmapCardImpl({ roadmapId, card, capabilityInfo, isDragging }: Props) {
  const currentDocument = useDocumentStore((s) => s.currentDocument);
  const setCapabilityStatus = useDocumentStore((s) => s.setCapabilityStatus);
  const setCapabilityNotes = useDocumentStore((s) => s.setCapabilityNotes);
  const renameCapability = useDocumentStore((s) => s.renameCapability);
  const deleteCapability = useDocumentStore((s) => s.deleteCapability);
  const removeRoadmapCard = useDocumentStore((s) => s.removeRoadmapCard);

  const [popover, setPopover] = useState<{ anchor: HTMLElement } | null>(null);

  const capMap = currentDocument?.capabilityMap;
  const status = capMap
    ? getCapabilityStatus(capMap.capabilityStatus, card.capabilityId)
    : 'not-licensed';
  const notes = capMap?.capabilityNotes[card.capabilityId] ?? '';
  const hasNotes = notes.length > 0;
  const meta = STATUS_META[status];

  const name = capabilityInfo?.name ?? card.capabilityId;
  const categoryName = capabilityInfo?.categoryName;

  const isCustom = capMap ? isCustomCapabilityId(capMap, card.capabilityId) : false;

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    setPopover({ anchor: e.currentTarget });
  }, []);

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeRoadmapCard(roadmapId, card.id);
    },
    [roadmapId, card.id, removeRoadmapCard],
  );

  if (isDragging) {
    return (
      <div
        className="h-14 w-full rounded-sm border border-dashed border-border opacity-40"
        aria-hidden="true"
      />
    );
  }

  return (
    <>
      <div
        className="group relative flex w-full flex-col gap-0.5 overflow-hidden rounded-sm border border-border bg-bg pl-2 pr-1.5 py-1.5 text-left"
        style={{ borderLeftColor: meta.color, borderLeftWidth: 3 }}
      >
        <button
          type="button"
          onClick={handleClick}
          className="flex min-w-0 flex-1 flex-col gap-0.5 text-left focus:outline-none"
          aria-label={`${name} — ${meta.label}${hasNotes ? ', has notes' : ''}`}
        >
          <span className="truncate text-xs font-medium text-fg">{name}</span>
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: meta.color }}
            />
            <span className="text-xs text-fg-subtle">{meta.label}</span>
            {categoryName && (
              <>
                <span className="text-fg-subtle">·</span>
                <span className="truncate text-xs text-fg-subtle">{categoryName}</span>
              </>
            )}
            {hasNotes && (
              <span
                aria-hidden="true"
                className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-fg-subtle"
              />
            )}
          </div>
        </button>
        <button
          type="button"
          onClick={handleRemove}
          aria-label={`Remove ${name} from roadmap`}
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-sm text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-bg-sunken hover:text-fg focus:opacity-100 focus:outline-none"
        >
          <X size={11} />
        </button>
      </div>

      {popover && capMap && (
        <StatusPopover
          anchor={popover.anchor}
          capabilityName={name}
          status={status}
          notes={notes}
          isCustomCapability={isCustom}
          onStatusChange={(s) => setCapabilityStatus(card.capabilityId, s)}
          onNotesChange={(n) => setCapabilityNotes(card.capabilityId, n)}
          onRename={isCustom ? (n) => renameCapability(card.capabilityId, n) : undefined}
          onDelete={
            isCustom
              ? () => {
                  deleteCapability(card.capabilityId);
                  setPopover(null);
                }
              : undefined
          }
          onClose={() => setPopover(null)}
        />
      )}
    </>
  );
}

export const RoadmapCard = memo(RoadmapCardImpl);
