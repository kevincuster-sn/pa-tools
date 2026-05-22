// ServiceNow brand palette and per-status colors, in hex (no CSS vars)
// so they can be embedded directly into PDF and PPTX files.
//
// Mirrors the light-theme tokens in renderer/app/globals.css; if you change
// the brand palette there, update this file too.

import type { CapabilityStatus } from '../../../shared/file-format';

export const BRAND = {
  infiniteBlue: '#032D42',
  wasabiGreen: '#63DF4E',
  brightBlue: '#52B8FF',
  brightIndigo: '#7661FF',
  brightPurple: '#BF71F2',
} as const;

export const EXPORT_PALETTE = {
  bg: '#FFFFFF',
  bgElevated: '#F6F9FA',
  bgSunken: '#ECF1F3',
  fg: BRAND.infiniteBlue,
  fgMuted: '#3C5566',
  fgSubtle: '#6C8290',
  border: '#D7E0E5',
  borderStrong: '#B4C2CB',
  accent: BRAND.wasabiGreen,
  accentFg: BRAND.infiniteBlue,
} as const;

export const STATUS_COLORS: Record<CapabilityStatus, string> = {
  'in-use': BRAND.wasabiGreen,
  implementing: BRAND.brightIndigo,
  planning: '#1D9BFF',
  'not-in-use': '#D97706',
  'no-intent': '#2C3538',
  'not-licensed': '#94A3A6',
};

/** Text color that has acceptable contrast against the given status fill. */
export const STATUS_TEXT_COLORS: Record<CapabilityStatus, string> = {
  'in-use': BRAND.infiniteBlue,
  implementing: '#FFFFFF',
  planning: '#FFFFFF',
  'not-in-use': '#FFFFFF',
  'no-intent': '#FFFFFF',
  'not-licensed': BRAND.infiniteBlue,
};

/**
 * PDF/PPTX exports can't ship the proprietary ServiceNow Sans face, so we
 * embed Inter (OFL-1.1) — a widely-used geometric sans that closely matches
 * ServiceNow Sans's proportions.
 *
 * The PDF font is registered via `jsPDF.addFont()` using the embedded TTF
 * bytes in fonts/inter.gen.ts, so it renders identically everywhere.
 * The PPTX font is referenced by face name; PowerPoint will substitute if
 * the viewer doesn't have Inter installed.
 */
export const EXPORT_FONT_FAMILY = 'Inter';
export const EXPORT_FONT_FAMILY_PPTX = 'Inter';
