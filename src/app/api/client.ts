/**
 * API base URL. Set VITE_API_BASE in .env to point at the Django backend (e.g. http://localhost:8000).
 * When unset, the app can fall back to mock/context data.
 */
const API_BASE = typeof import.meta.env?.VITE_API_BASE === 'string'
  ? import.meta.env.VITE_API_BASE.replace(/\/$/, '')
  : '';

export function getApiBase(): string {
  return API_BASE;
}

export function isAuditApiEnabled(): boolean {
  return API_BASE.length > 0;
}

export interface AuditEntryDto {
  id: number | string;
  action: string;
  user_id: string;
  user_name: string;
  user_role: string;
  timestamp: string;
  details: string;
  requisition_id: string | null;
  requisition_number: string | null;
  requisition_currency: string | null;
}

export interface PaginatedAuditResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: AuditEntryDto[];
}

export interface AuditListParams {
  page?: number;
  page_size?: number;
  search?: string;
  action?: string;
  role?: string;
  user?: string;
  requisition_id?: string;
  date_from?: string; // YYYY-MM-DD
  date_to?: string;   // YYYY-MM-DD
}

export async function fetchAuditList(params: AuditListParams = {}): Promise<PaginatedAuditResponse> {
  const url = new URL(`${API_BASE}/api/audit/`);
  if (params.page != null) url.searchParams.set('page', String(params.page));
  if (params.page_size != null) url.searchParams.set('page_size', String(params.page_size));
  if (params.search) url.searchParams.set('search', params.search);
  if (params.action) url.searchParams.set('action', params.action);
  if (params.role) url.searchParams.set('role', params.role);
  if (params.user) url.searchParams.set('user', params.user);
  if (params.requisition_id) url.searchParams.set('requisition_id', params.requisition_id);
  if (params.date_from) url.searchParams.set('date_from', params.date_from);
  if (params.date_to) url.searchParams.set('date_to', params.date_to);

  const res = await fetch(url.toString(), { credentials: 'include' });
  if (!res.ok) throw new Error(`Audit API error: ${res.status}`);
  return res.json();
}

/** Build URL for CSV export with current filters (open in new tab or use as download link). */
export function getAuditExportUrl(params: Omit<AuditListParams, 'page' | 'page_size'> = {}): string {
  const url = new URL(`${API_BASE}/api/audit/export/`);
  if (params.search) url.searchParams.set('search', params.search);
  if (params.action) url.searchParams.set('action', params.action);
  if (params.role) url.searchParams.set('role', params.role);
  if (params.user) url.searchParams.set('user', params.user);
  if (params.requisition_id) url.searchParams.set('requisition_id', params.requisition_id);
  if (params.date_from) url.searchParams.set('date_from', params.date_from);
  if (params.date_to) url.searchParams.set('date_to', params.date_to);
  return url.toString();
}

// ─── Database Health & Backup (admin) ─────────────────────────────────────────

export interface DatabaseHealthResponse {
  status: 'ok' | 'error';
  database?: string;
  version?: string;
  error?: string;
}

export interface BackupItem {
  filename: string;
  size_bytes: number;
  created: string;
}

export interface BackupListResponse {
  backups: BackupItem[];
}

export interface BackupCreateResponse {
  filename: string;
  path: string;
  size_bytes: number;
  created: string;
}

export async function fetchDatabaseHealth(): Promise<DatabaseHealthResponse> {
  const res = await fetch(`${API_BASE}/api/database/health/`, { credentials: 'include' });
  return res.json();
}

export async function fetchBackupList(): Promise<BackupListResponse> {
  const res = await fetch(`${API_BASE}/api/database/backups/`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Backups API error: ${res.status}`);
  return res.json();
}

export async function createBackup(name?: string): Promise<BackupCreateResponse> {
  const res = await fetch(`${API_BASE}/api/database/backups/create/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name: name || undefined }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Backup failed: ${res.status}`);
  return data;
}

export async function restoreBackup(filename: string): Promise<{ status: string; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/api/database/backups/restore/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ filename }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Restore failed: ${res.status}`);
  return data;
}

// ─── SMTP / Email notifications ─────────────────────────────────────────────

export interface SmtpSettingsPublic {
  configured: boolean;
  host?: string;
  port?: number;
  username?: string;
  from_email?: string;
  use_tls?: boolean;
}

export interface SmtpSettingsSave {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  from_email?: string;
  use_tls?: boolean;
}

export async function fetchSmtpSettings(): Promise<SmtpSettingsPublic> {
  const res = await fetch(`${API_BASE}/api/settings/smtp/`, { credentials: 'include' });
  if (!res.ok) return { configured: false };
  return res.json();
}

export async function saveSmtpSettings(data: SmtpSettingsSave): Promise<SmtpSettingsPublic> {
  const res = await fetch(`${API_BASE}/api/settings/smtp/save/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  const out = await res.json();
  if (!res.ok) throw new Error(out.error || `Save failed: ${res.status}`);
  return out;
}

/** Send a notification email via backend. Backend sends only if SMTP is configured. Fire-and-forget. */
export function sendNotificationEmail(to_email: string, subject: string, body: string): void {
  if (!API_BASE || !to_email || !to_email.includes('@')) return;
  fetch(`${API_BASE}/api/notifications/send-email/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ to_email, subject, body }),
  }).catch(() => {});
}
