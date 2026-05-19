import type { CapabilityStatus } from '../../shared/file-format';

export interface StatusMeta {
  id: CapabilityStatus;
  label: string;
  color: string; // CSS var reference
  description: string;
}

// Ordered for display (filter chips, summary): highest engagement first,
// least engagement last. Default for absent keys is 'not-licensed'.
export const STATUSES: readonly StatusMeta[] = [
  {
    id: 'in-use',
    label: 'In Use',
    color: 'var(--status-in-use)',
    description: 'Live in production today.',
  },
  {
    id: 'implementing',
    label: 'Implementing',
    color: 'var(--status-implementing)',
    description: 'Build or rollout in progress.',
  },
  {
    id: 'planning',
    label: 'Planning',
    color: 'var(--status-planning)',
    description: 'Scoped or scheduled, not yet started.',
  },
  {
    id: 'not-in-use',
    label: 'Not In Use',
    color: 'var(--status-not-in-use)',
    description: 'Licensed but not deployed.',
  },
  {
    id: 'no-intent',
    label: 'No Intent',
    color: 'var(--status-no-intent)',
    description: 'Explicitly out of scope.',
  },
  {
    id: 'not-licensed',
    label: 'Not Licensed',
    color: 'var(--status-not-licensed)',
    description: 'Not entitled today (default).',
  },
] as const;

export const STATUS_ORDER: readonly CapabilityStatus[] = STATUSES.map((s) => s.id);

export const STATUS_META: Record<CapabilityStatus, StatusMeta> = Object.fromEntries(
  STATUSES.map((s) => [s.id, s]),
) as Record<CapabilityStatus, StatusMeta>;

export function getCapabilityStatus(
  capabilityStatus: Record<string, CapabilityStatus>,
  capabilityId: string,
): CapabilityStatus {
  return capabilityStatus[capabilityId] ?? 'not-licensed';
}

export function countCapabilitiesByStatus(
  capabilityIds: readonly string[],
  capabilityStatus: Record<string, CapabilityStatus>,
): Record<CapabilityStatus, number> {
  const counts: Record<CapabilityStatus, number> = {
    'in-use': 0,
    implementing: 0,
    planning: 0,
    'not-in-use': 0,
    'no-intent': 0,
    'not-licensed': 0,
  };
  for (const id of capabilityIds) {
    counts[getCapabilityStatus(capabilityStatus, id)] += 1;
  }
  return counts;
}
