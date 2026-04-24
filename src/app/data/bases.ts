/**
 * Canonical MARS operational bases — keep in sync with `backend/core/bases.py`.
 * (Spelling: Bulawayo — standard city name.)
 */
export const ORGANIZATION_BASES = [
  'Harare',
  'Bulawayo',
  'Gweru',
  'Masvingo',
  'Mutare',
  'Victoria Falls',
  'Marondera',
] as const;

export type OrganizationBase = (typeof ORGANIZATION_BASES)[number];

export const DEFAULT_BASE: OrganizationBase = 'Harare';

export function resolveBase(raw: string | undefined): OrganizationBase {
  const s = (raw || '').trim();
  if ((ORGANIZATION_BASES as readonly string[]).includes(s)) return s as OrganizationBase;
  if (s.toLowerCase() === 'bulwayo') return 'Bulawayo';
  return DEFAULT_BASE;
}
