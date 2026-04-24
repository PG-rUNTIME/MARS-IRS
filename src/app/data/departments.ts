/**
 * Canonical organisation departments and their single cost centre each.
 * Keep in sync with `backend/core/departments.py`.
 */
export const ORGANIZATION_DEPARTMENTS = [
  'Operations',
  'Finance',
  'Marketing',
  'Training',
  'Medical Stores',
  'Information Technology',
  'Medisport',
] as const;

export type OrganizationDepartment = (typeof ORGANIZATION_DEPARTMENTS)[number];

export const DEPARTMENT_COST_CENTRES: Record<OrganizationDepartment, string> = {
  Operations: 'CC-OPS-001',
  Finance: 'CC-FIN-001',
  Marketing: 'CC-MKT-001',
  Training: 'CC-TRN-001',
  'Medical Stores': 'CC-MS-001',
  'Information Technology': 'CC-IT-001',
  Medisport: 'CC-MSP-001',
};

/** Map retired labels from older installs to the closest current department. */
const LEGACY_DEPARTMENT_MAP: Record<string, OrganizationDepartment> = {
  Logistics: 'Operations',
  'Human Resources': 'Training',
  Administration: 'Finance',
  'Medical/Clinical': 'Medical Stores',
  Management: 'Operations',
  Compliance: 'Finance',
};

export function resolveOrganizationDepartment(raw: string | undefined): OrganizationDepartment {
  const t = (raw || '').trim();
  if ((ORGANIZATION_DEPARTMENTS as readonly string[]).includes(t)) return t as OrganizationDepartment;
  const mapped = LEGACY_DEPARTMENT_MAP[t];
  if (mapped) return mapped;
  return ORGANIZATION_DEPARTMENTS[0];
}

export function costCentreForDepartment(department: string): string {
  const d = resolveOrganizationDepartment(department);
  return DEPARTMENT_COST_CENTRES[d] ?? '';
}
