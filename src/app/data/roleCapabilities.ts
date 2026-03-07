import type { UserRole } from './types';

/**
 * Section/capability access: which roles can access each area.
 * A user with multiple roles gets access if any of their roles is in the list.
 */
export const SECTION_ACCESS: Record<string, UserRole[]> = {
  'dashboard': ['Requester', 'Department Manager', 'Accountant', 'General Manager', 'Financial Controller', 'Head of Operations', 'Auditor'],
  'my-requisitions': ['Requester'],
  'all-requisitions': ['Accountant', 'General Manager', 'Financial Controller', 'Head of Operations', 'Auditor'],
  'purchase-orders': ['Accountant', 'General Manager', 'Financial Controller', 'Auditor', 'Requester'],
  'reports': ['General Manager', 'Financial Controller', 'Accountant', 'Head of Operations', 'Auditor'],
  'audit-trail': ['Financial Controller', 'Auditor'],
  'admin': ['System Administrator'],
  'database': ['System Administrator'],
  'pending-approvals': ['Department Manager', 'Accountant', 'General Manager', 'Financial Controller', 'Head of Operations'],
  'department-requisitions': ['Department Manager'],
  'new-req': ['Requester', 'Department Manager', 'Accountant', 'General Manager', 'Financial Controller', 'Head of Operations', 'System Administrator'],
};

/** Check if a user with the given roles can access a section (e.g. nav item or route). */
export function hasSectionAccess(roles: UserRole[], section: string): boolean {
  const allowed = SECTION_ACCESS[section];
  if (!allowed) return false;
  return roles.some((r) => allowed.includes(r));
}

/** Roles that can perform finance actions (mark payment, generate PO, etc.). */
export const FINANCE_ACTION_ROLES: UserRole[] = ['Accountant', 'Financial Controller', 'General Manager'];

export function canDoFinanceActions(roles: UserRole[]): boolean {
  return roles.some((r) => FINANCE_ACTION_ROLES.includes(r));
}

/** Roles that can view finance-only notes. */
export const VIEW_FINANCE_NOTES_ROLES: UserRole[] = ['Accountant', 'Financial Controller', 'General Manager'];

export function canViewFinanceNotes(roles: UserRole[]): boolean {
  return roles.some((r) => VIEW_FINANCE_NOTES_ROLES.includes(r));
}

/** Primary role for display (e.g. sidebar, audit line): first role in the list. */
export function getPrimaryRole(roles: UserRole[]): UserRole {
  return roles.length > 0 ? roles[0] : ('Requester' as UserRole);
}

/** Human-readable capability descriptions per role for the admin UI. */
export const ROLE_CAPABILITIES: Record<UserRole, string> = {
  Requester: 'Own requisitions only. Can create, submit, view, and cancel Draft/Submitted requisitions.',
  'Department Manager': 'First approver for department requisitions. Can view team submissions and pending approvals.',
  Accountant: 'Financial review approver. Can view all requisitions, add finance notes, manage payments, generate POs.',
  'General Manager': 'Senior approval level. Full requisition visibility and finance actions.',
  'Financial Controller': 'Final approver. Full system visibility, audit trail, PO generation, payment oversight.',
  'Head of Operations': 'Final approver for Petty Cash. Operational oversight, reports access.',
  'System Administrator': 'User management and system configuration only. Can assign roles, create users, and access database health, backup, and restore. No access to Dashboard, Finance & Reporting, Purchase Orders, or Reports & KPIs.',
  Auditor: 'Full read-only access to requisitions, audit trail, and reports. Cannot edit records.',
};
