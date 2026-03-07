import type { User, Requisition, PurchaseOrder, AppNotification, AuditEntry } from './types';

// ─── Users ───────────────────────────────────────────────────────────────────
// Only the system admin exists initially; they can add members via User Management.
export const USERS: User[] = [
  {
    id: 'u9',
    name: 'Admin User',
    email: 'admin@marsambulance.com',
    password: 'mars2026',
    roles: ['System Administrator'],
    department: 'Information Technology',
    active: true,
    joinedDate: '2021-01-12',
    phone: '+263 77 300 0000',
    passwordChangedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // 20 days ago so not expired
  },
];

// ─── Empty initial data (start fresh; no mock requisitions, POs, notifications, or audit) ───
export const INITIAL_REQUISITIONS: Requisition[] = [];
export const INITIAL_PURCHASE_ORDERS: PurchaseOrder[] = [];
export const INITIAL_NOTIFICATIONS: AppNotification[] = [];
export const INITIAL_AUDIT_LOG: AuditEntry[] = [];
