'use client';

import { memo, useMemo } from 'react';
import type { CapabilityStatus } from '../../../shared/file-format';
import { AI_NATIVE_PILLAR_LABELS, groupedSeed, matchesSearch } from '../../lib/capability-map';
import { getCapabilityStatus } from '../../lib/capability-status';
import { CapabilityPill } from './CapabilityPill';

interface Props {
  searchTerm: string;
  statusFilter: ReadonlySet<CapabilityStatus>;
  capabilityStatus: Record<string, CapabilityStatus>;
  capabilityNotes: Record<string, string>;
  selectedCapabilityId: string | null;
  onPillClick: (capabilityId: string, anchor: HTMLElement) => void;
}

function AiNativeSectionImpl({
  searchTerm,
  statusFilter,
  capabilityStatus,
  capabilityNotes,
  selectedCapabilityId,
  onPillClick,
}: Props) {
  const filterCap = (id: string, name: string) => {
    if (searchTerm && !matchesSearch(name, searchTerm)) return false;
    if (statusFilter.size > 0 && !statusFilter.has(getCapabilityStatus(capabilityStatus, id))) {
      return false;
    }
    return true;
  };

  const aiControlTower = useMemo(
    () => groupedSeed.aiControlTower.capabilities.filter((c) => filterCap(c.id, c.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchTerm, statusFilter, capabilityStatus],
  );

  const pillars = useMemo(
    () =>
      groupedSeed.pillars.map((p) => ({
        ...p,
        visibleCapabilities: p.capabilities.filter((c) => filterCap(c.id, c.name)),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchTerm, statusFilter, capabilityStatus],
  );

  const showEmptyHint = searchTerm || statusFilter.size > 0;

  return (
    <section
      className="mt-6 flex flex-col gap-3 rounded border border-border bg-bg-sunken p-3"
      aria-label="AI-Native platform"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          AI-Native Platform
        </h2>
        <span className="text-xs text-fg-subtle">Foundation — always relevant</span>
      </div>

      {groupedSeed.aiControlTower.category && (
        <div className="rounded border border-border bg-bg-elevated">
          <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
            <h3 className="text-sm font-medium text-fg">
              {groupedSeed.aiControlTower.category.name}
            </h3>
            <span className="text-xs text-fg-subtle">Spans all pillars</span>
          </div>
          <div
            role="list"
            aria-label="AI Control Tower capabilities"
            className="grid grid-cols-2 gap-1 p-2 sm:grid-cols-3 md:grid-cols-4"
          >
            {aiControlTower.length === 0 && showEmptyHint && (
              <div className="col-span-full px-1 text-xs italic text-fg-subtle">No matches</div>
            )}
            {aiControlTower.map((cap) => (
              <CapabilityPill
                key={cap.id}
                capability={cap}
                status={getCapabilityStatus(capabilityStatus, cap.id)}
                hasNotes={Boolean(capabilityNotes[cap.id])}
                disabled={false}
                selected={selectedCapabilityId === cap.id}
                onClick={onPillClick}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {pillars.map(({ pillar, category, visibleCapabilities }) => (
          <div
            key={pillar}
            className="flex flex-col rounded border border-border bg-bg-elevated"
            aria-label={AI_NATIVE_PILLAR_LABELS[pillar]}
          >
            <header className="border-b border-border px-2.5 py-1.5">
              <h3 className="text-sm font-semibold tracking-wide text-fg">
                {AI_NATIVE_PILLAR_LABELS[pillar]}
              </h3>
              {category?.fullName && <p className="text-xs text-fg-subtle">{category.fullName}</p>}
            </header>
            <div
              role="list"
              aria-label={`${AI_NATIVE_PILLAR_LABELS[pillar]} capabilities`}
              className="flex flex-col gap-1 p-2"
            >
              {visibleCapabilities.length === 0 && (
                <div className="px-1 py-0.5 text-xs italic text-fg-subtle">
                  {showEmptyHint ? 'No matches' : 'No capabilities'}
                </div>
              )}
              {visibleCapabilities.map((cap) => (
                <CapabilityPill
                  key={cap.id}
                  capability={cap}
                  status={getCapabilityStatus(capabilityStatus, cap.id)}
                  hasNotes={Boolean(capabilityNotes[cap.id])}
                  disabled={false}
                  selected={selectedCapabilityId === cap.id}
                  onClick={onPillClick}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export const AiNativeSection = memo(AiNativeSectionImpl);
