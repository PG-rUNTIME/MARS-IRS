/**
 * API client for the Django backend.
 * nginx proxies /api/ to the backend — no absolute URL needed.
 * For local dev without Docker, set VITE_API_BASE in .env.local (e.g. http://localhost:8001).
 */
const API_BASE: string = ((import.meta as unknown as Record<string, Record<string, string>>).env?.VITE_API_BASE ?? '').replace(/\/$/, '');

export function getApiBase(): string { return API_BASE; }
// Always enabled — nginx proxy handles routing in Docker; VITE_API_BASE handles local dev
export function isApiEnabled(): boolean { return true; }

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || `API error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ApiUser {
  id: number;
  name: string;
  email: string;
  department: string;
  active: boolean;
  joined_date: string | null;
  phone: string;
  avatar: string;
  must_change_password: boolean;
  password_changed_at: string | null;
  roles: string[];
}

export interface ApiApprovalStep {
  id: number;
  order: number;
  role: string;
  label: string;
  approver_id: number | null;
  approver_name: string;
  status: string;
  timestamp: string | null;
  comments: string;
  delegated_to_id: number | null;
  delegated_to_name: string;
}

export interface ApiComment {
  id: number;
  user_id: number;
  user_name: string;
  user_role: string;
  text: string;
  timestamp: string;
  is_finance_note: boolean;
}

export interface ApiAttachment {
  id: number;
  name: string;
  type: string;
  size: string;
  uploaded_by: string;
  uploaded_at: string;
  data_url: string;
  is_proof_of_payment: boolean;
}

export interface ApiPOItem {
  id: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price: string;
  line_total: string;
}

export interface ApiAuditEntry {
  id: number;
  action: string;
  user_id_str: string;
  user_name: string;
  user_role: string;
  timestamp: string;
  details: string;
  requisition_id: string | null;
  requisition_number: string | null;
  requisition_currency: string | null;
}

export interface ApiRequisition {
  id: number;
  req_number: string;
  type: string;
  description: string;
  justification: string;
  amount: string;
  currency: string;
  department: string;
  cost_center: string;
  budget_available: boolean;
  requester_id: number;
  requester_name: string;
  requester_email: string;
  status: string;
  current_approver_role: string | null;
  is_capex: boolean;
  po_generated: boolean;
  po_number: string;
  supplier: string;
  supplier_email: string;
  supplier_phone: string;
  supplier_address: string;
  supplier_contact: string;
  supplier_bank_name: string;
  supplier_bank_account_name: string;
  supplier_bank_account_number: string;
  supplier_bank_branch: string;
  suppliers_json: unknown[] | null;
  preferred_supplier_index: number | null;
  preferred_supplier_justification: string;
  vehicle_reg: string;
  fuel_type: string;
  fuel_quantity: string | null;
  travel_destination: string;
  travel_start_date: string | null;
  travel_end_date: string | null;
  asset_type: string;
  asset_specs: string;
  maintenance_item: string;
  maintenance_urgency: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  paid_at: string | null;
  // detail only
  approval_chain?: ApiApprovalStep[];
  comments?: ApiComment[];
  attachments?: ApiAttachment[];
  items?: ApiPOItem[];
  proof_of_payment?: ApiAttachment | null;
  audit_log?: ApiAuditEntry[];
}

export interface ApiPurchaseOrder {
  id: number;
  po_number: string;
  date: string;
  version: number;
  requisition_id: number;
  req_number: string;
  buyer_company: string;
  buyer_address: string;
  buyer_department: string;
  buyer_contact: string;
  supplier_name: string;
  supplier_address: string;
  supplier_contact: string;
  supplier_email: string;
  supplier_phone: string;
  items: ApiPOItem[];
  currency: string;
  subtotal: string;
  total: string;
  requester_name: string;
  approver_names: string[];
  status: string;
  created_at: string;
}

export interface ApiNotification {
  id: number;
  recipient_id: number;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  requisition_id: number | null;
  type: string;
}

export interface ApiDelegation {
  id: number;
  from_user_id: number;
  from_user_name: string;
  to_user_id: number;
  to_user_name: string;
  start_date: string;
  end_date: string;
  reason: string;
  created_at: string;
  active: boolean;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export function loginApi(email: string, password: string): Promise<ApiUser> {
  return api('/auth/login/', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function verifyPassword(userId: string, password: string): Promise<{ valid: boolean }> {
  return api('/auth/verify-password/', { method: 'POST', body: JSON.stringify({ user_id: userId, password }) });
}

// ─── Users ────────────────────────────────────────────────────────────────────

export function fetchUsers(): Promise<ApiUser[]> {
  return api('/users/');
}

export function createUser(data: Partial<ApiUser> & { roles: string[] }): Promise<ApiUser> {
  return api('/users/', { method: 'POST', body: JSON.stringify(data) });
}

export function updateUser(id: number, data: Partial<ApiUser>): Promise<ApiUser> {
  return api(`/users/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}

// ─── Requisitions ─────────────────────────────────────────────────────────────

export function fetchRequisitions(params: Record<string, string> = {}): Promise<Paginated<ApiRequisition>> {
  const q = new URLSearchParams(params).toString();
  return api(`/requisitions/${q ? '?' + q : ''}`);
}

export function fetchRequisition(id: number): Promise<ApiRequisition> {
  return api(`/requisitions/${id}/`);
}

export interface CreateRequisitionPayload {
  req_number: string;
  type: string;
  description: string;
  justification: string;
  amount: number;
  currency: string;
  department: string;
  cost_center: string;
  budget_available: boolean;
  requester_id: number;
  status: string;
  is_capex: boolean;
  supplier?: string;
  supplier_email?: string;
  supplier_phone?: string;
  supplier_address?: string;
  supplier_contact?: string;
  supplier_bank_name?: string;
  supplier_bank_account_name?: string;
  supplier_bank_account_number?: string;
  supplier_bank_branch?: string;
  suppliers_json?: unknown[] | null;
  preferred_supplier_index?: number | null;
  preferred_supplier_justification?: string;
  vehicle_reg?: string;
  fuel_type?: string;
  fuel_quantity?: number | null;
  travel_destination?: string;
  travel_start_date?: string | null;
  travel_end_date?: string | null;
  asset_type?: string;
  asset_specs?: string;
  maintenance_item?: string;
  maintenance_urgency?: string;
  items?: Array<{ description: string; quantity: number; unit: string; unit_price: number; line_total: number }>;
  approval_chain?: Array<{ order: number; role: string; label: string; status: string }>;
  actor_user_id?: number;
  actor_user_name?: string;
  actor_user_role?: string;
}

export function createRequisition(data: CreateRequisitionPayload): Promise<ApiRequisition> {
  return api('/requisitions/', { method: 'POST', body: JSON.stringify(data) });
}

export interface UpdateRequisitionPayload extends Omit<Partial<CreateRequisitionPayload>, 'items' | 'approval_chain'> {
  status?: string;
  current_approver_role?: string | null;
  submitted_at?: string | null;
  paid_at?: string | null;
  audit_action?: string;
  audit_details?: string;
  actor_user_id?: number;
  actor_user_name?: string;
  actor_user_role?: string;
  approval_chain?: Partial<ApiApprovalStep>[];
  items?: Array<{ id?: number; description: string; quantity: number; unit: string; unit_price: number | string; line_total: number | string }>;
}

export function updateRequisition(id: number, data: UpdateRequisitionPayload): Promise<ApiRequisition> {
  return api(`/requisitions/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function addComment(reqId: number, data: {
  user_id: number; user_name: string; user_role: string; text: string; is_finance_note: boolean;
}): Promise<ApiComment> {
  return api(`/requisitions/${reqId}/comments/`, { method: 'POST', body: JSON.stringify(data) });
}

export function addAttachment(reqId: number, data: {
  name: string; type: string; size: string; uploaded_by: string; data_url: string; is_proof_of_payment?: boolean;
}): Promise<ApiAttachment> {
  return api(`/requisitions/${reqId}/attachments/`, { method: 'POST', body: JSON.stringify(data) });
}

export function generatePO(reqId: number, data: {
  actor_user_id?: number; actor_user_name?: string; actor_user_role?: string;
}): Promise<ApiPurchaseOrder> {
  return api(`/requisitions/${reqId}/generate-po/`, { method: 'POST', body: JSON.stringify(data) });
}

// ─── Purchase Orders ──────────────────────────────────────────────────────────

export function fetchPurchaseOrders(): Promise<Paginated<ApiPurchaseOrder>> {
  return api('/purchase-orders/');
}

export function updatePurchaseOrder(id: number, data: Partial<ApiPurchaseOrder>): Promise<ApiPurchaseOrder> {
  return api(`/purchase-orders/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}

// ─── Notifications ────────────────────────────────────────────────────────────

export function fetchNotifications(recipientId?: number): Promise<ApiNotification[]> {
  const q = recipientId != null ? `?recipient_id=${recipientId}` : '';
  return api(`/notifications/${q}`);
}

export function createNotification(data: {
  recipient_id: number; title: string; message: string; type: string; requisition_id?: number | null;
}): Promise<ApiNotification> {
  return api('/notifications/', { method: 'POST', body: JSON.stringify(data) });
}

export function markNotificationRead(id: number): Promise<ApiNotification> {
  return api(`/notifications/${id}/read/`, { method: 'PATCH' });
}

export function markAllNotificationsRead(recipientId: number): Promise<void> {
  return api('/notifications/mark-all-read/', { method: 'POST', body: JSON.stringify({ recipient_id: recipientId }) });
}

// ─── Delegations ──────────────────────────────────────────────────────────────

export function fetchDelegations(): Promise<ApiDelegation[]> {
  return api('/delegations/');
}

export function createDelegation(data: Omit<ApiDelegation, 'id' | 'created_at'>): Promise<ApiDelegation> {
  return api('/delegations/', { method: 'POST', body: JSON.stringify(data) });
}

export function updateDelegation(id: number, data: Partial<ApiDelegation>): Promise<ApiDelegation> {
  return api(`/delegations/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export interface AuditListParams {
  page?: number;
  page_size?: number;
  search?: string;
  action?: string;
  role?: string;
  user?: string;
  requisition_id?: string;
  date_from?: string;
  date_to?: string;
}

export function fetchAuditList(params: AuditListParams = {}): Promise<Paginated<ApiAuditEntry>> {
  const url = new URLSearchParams();
  if (params.page != null) url.set('page', String(params.page));
  if (params.page_size != null) url.set('page_size', String(params.page_size));
  if (params.search) url.set('search', params.search);
  if (params.action) url.set('action', params.action);
  if (params.role) url.set('role', params.role);
  if (params.user) url.set('user', params.user);
  if (params.requisition_id) url.set('requisition_id', params.requisition_id);
  if (params.date_from) url.set('date_from', params.date_from);
  if (params.date_to) url.set('date_to', params.date_to);
  const q = url.toString();
  return api(`/audit/${q ? '?' + q : ''}`);
}

export function getAuditExportUrl(params: Omit<AuditListParams, 'page' | 'page_size'> = {}): string {
  const url = new URLSearchParams();
  if (params.search) url.set('search', params.search);
  if (params.action) url.set('action', params.action);
  if (params.role) url.set('role', params.role);
  if (params.user) url.set('user', params.user);
  if (params.requisition_id) url.set('requisition_id', params.requisition_id);
  if (params.date_from) url.set('date_from', params.date_from);
  if (params.date_to) url.set('date_to', params.date_to);
  const q = url.toString();
  return `${API_BASE}/api/audit/export/${q ? '?' + q : ''}`;
}

// ─── Database health & backup ─────────────────────────────────────────────────

export interface DatabaseHealthResponse { status: 'ok' | 'error'; database?: string; version?: string; error?: string; }
export interface BackupItem { filename: string; size_bytes: number; created: string; }
export interface BackupListResponse { backups: BackupItem[]; }
export interface BackupCreateResponse { filename: string; path: string; size_bytes: number; created: string; }

export function fetchDatabaseHealth(): Promise<DatabaseHealthResponse> {
  return api('/database/health/');
}
export function fetchBackupList(): Promise<BackupListResponse> {
  return api('/database/backups/');
}
export function createBackup(name?: string): Promise<BackupCreateResponse> {
  return api('/database/backups/create/', { method: 'POST', body: JSON.stringify({ name: name || undefined }) });
}
export function restoreBackup(filename: string): Promise<{ status: string; message?: string; error?: string }> {
  return api('/database/backups/restore/', { method: 'POST', body: JSON.stringify({ filename }) });
}
export function getBackupDownloadUrl(filename: string): string {
  return `${API_BASE}/api/database/backups/${encodeURIComponent(filename)}/download/`;
}
export function uploadAndRestoreBackup(file: File): Promise<{ status: string; message?: string; error?: string }> {
  const form = new FormData();
  form.append('file', file);
  return fetch(`${API_BASE}/api/database/backups/upload-restore/`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
    return data;
  });
}

// ─── SMTP ─────────────────────────────────────────────────────────────────────

export interface SmtpSettingsPublic { configured: boolean; host?: string; port?: number; username?: string; from_email?: string; use_tls?: boolean; }
export interface SmtpSettingsSave { host: string; port?: number; username?: string; password?: string; from_email?: string; use_tls?: boolean; }

export function fetchSmtpSettings(): Promise<SmtpSettingsPublic> {
  return api('/settings/smtp/');
}
export function saveSmtpSettings(data: SmtpSettingsSave): Promise<SmtpSettingsPublic> {
  return api('/settings/smtp/save/', { method: 'POST', body: JSON.stringify(data) });
}

/** Fire-and-forget notification email. */
export function sendNotificationEmail(to_email: string, subject: string, body: string): void {
  if (!API_BASE || !to_email || !to_email.includes('@')) return;
  api('/notifications/send-email/', {
    method: 'POST',
    body: JSON.stringify({ to_email, subject, body }),
  }).catch(() => {});
}
