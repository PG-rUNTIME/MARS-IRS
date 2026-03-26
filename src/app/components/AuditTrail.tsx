import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  fetchAuditRequisitionsList,
  fetchAuditList,
  getAuditExportUrl,
  isApiEnabled as isAuditApiEnabled,
  downloadWithAuth,
  type ApiAuditRequisitionSummary,
  type ApiAuditEntry,
} from '../api/client';
import { useApp } from '../context/AppContext';
import { formatDateTime } from './shared/StatusBadge';
import type { UserRole } from '../data/types';
import { Input } from './ui/input';
import { Button } from './ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Search, Download, Info, FileSpreadsheet, FileText } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { exportToExcel, exportToWord } from '../utils/exportUtils';

const ACTION_COLORS: Record<string, string> = {
  Created: 'bg-blue-100 text-blue-700',
  Submitted: 'bg-indigo-100 text-indigo-700',
  Approved: 'bg-green-100 text-green-700',
  Rejected: 'bg-mars-red-muted text-mars-red-dark',
  Paid: 'bg-teal-100 text-teal-700',
  Cancelled: 'bg-slate-100 text-slate-600',
  'Purchase Order Generated': 'bg-purple-100 text-purple-700',
  'Payment Processed': 'bg-teal-100 text-teal-700',
  'Payment Initiated': 'bg-purple-100 text-purple-700',
  'Comment Added': 'bg-yellow-100 text-yellow-700',
  Login: 'bg-slate-100 text-slate-600',
  'User Account Updated': 'bg-orange-100 text-orange-700',
  'Requisition Created': 'bg-blue-100 text-blue-700',
  'Requisition Submitted': 'bg-indigo-100 text-indigo-700',
  'Requisition Approved': 'bg-green-100 text-green-700',
  'Requisition Rejected': 'bg-mars-red-muted text-mars-red-dark',
  'Proof of Payment Uploaded': 'bg-teal-100 text-teal-700',
};

const ROLE_COLORS: Record<string, string> = {
  Requester: 'text-blue-600',
  'Department Manager': 'text-purple-600',
  Accountant: 'text-yellow-700',
  'General Manager': 'text-orange-600',
  'Financial Controller': 'text-mars-red',
  'Head of Operations': 'text-green-700',
  'System Administrator': 'text-slate-600',
  Auditor: 'text-teal-600',
};

const PER_PAGE = 25;

const FILTER_ACTIONS = Object.keys(ACTION_COLORS).sort();
const FILTER_ROLES = Object.keys(ROLE_COLORS).sort();
const NON_REQUISITION_ACTIONS = new Set(['Login', 'User Account Updated']);

export function AuditTrail() {
  const navigate = useNavigate();
  const useApi = isAuditApiEnabled();

  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterRole, setFilterRole] = useState<UserRole | ''>('');
  const [filterUser, setFilterUser] = useState('');
  const [filterRequisition, setFilterRequisition] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<{ count: number; results: ApiAuditRequisitionSummary[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFromApi = useCallback(async () => {
    if (!useApi) return;
    setLoading(true);
    setError(null);
    try {
      if (filterAction && NON_REQUISITION_ACTIONS.has(filterAction)) {
        const res = await fetchAuditList({
          page,
          page_size: PER_PAGE,
          search: search || undefined,
          action: filterAction || undefined,
          role: filterRole || undefined,
          user: filterUser || undefined,
          requisition_id: filterRequisition || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        });
        const mapped: ApiAuditRequisitionSummary[] = (res.results as ApiAuditEntry[]).map((e) => ({
          requisition_id: e.requisition_id ? Number(e.requisition_id) : -e.id,
          requisition_number: e.requisition_number,
          requisition_currency: e.requisition_currency,
          latest_timestamp: e.timestamp,
          latest_action: e.action,
          latest_user_name: e.user_name,
          latest_user_role: e.user_role,
          action_count: 1,
        }));
        setData({ count: res.count, results: mapped });
      } else {
        const res = await fetchAuditRequisitionsList({
          page,
          page_size: PER_PAGE,
          search: search || undefined,
          action: filterAction || undefined,
          role: filterRole || undefined,
          user: filterUser || undefined,
          requisition_id: filterRequisition || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        });
        setData(res);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [useApi, page, search, filterAction, filterRole, filterUser, filterRequisition, dateFrom, dateTo]);

  useEffect(() => {
    if (useApi) {
      loadFromApi();
    }
  }, [useApi, loadFromApi]);

  // Fallback: use AppContext when API is not configured – group by requisition
  const fallback = useAppFallbackRequisitions(search, filterAction, filterRole, filterUser, filterRequisition, dateFrom, dateTo, page);
  const rows = useApi && data ? data.results : fallback.rows;
  const totalCount = useApi && data ? data.count : fallback.totalCount;
  const totalPages = useApi && data ? Math.max(1, Math.ceil(data.count / PER_PAGE)) : fallback.totalPages;
  const filterOptions = { actions: FILTER_ACTIONS, roles: FILTER_ROLES, users: fallback.users };
  const showPagination = useApi ? (data != null && data.count > PER_PAGE) : fallback.totalPages > 1;
  const hasFilters = !!(search || filterAction || filterRole || filterUser || filterRequisition || dateFrom || dateTo);

  const clearFilters = () => {
    setSearch('');
    setFilterAction('');
    setFilterRole('');
    setFilterUser('');
    setFilterRequisition('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const getActionColor = (action: string) => ACTION_COLORS[action] ?? 'bg-slate-100 text-slate-600';

  const summaryHeaders = ['Reference', 'Latest activity', 'Date', 'By', 'Role', 'Actions'];
  const rowsForExport = (list: ApiAuditRequisitionSummary[]) =>
    list.map((r) => [
      r.requisition_number ? `${r.requisition_number} (${r.requisition_currency ?? 'USD'})` : '—',
      r.latest_action,
      formatDateTime(r.latest_timestamp),
      r.latest_user_name,
      r.latest_user_role,
      String(r.action_count),
    ]);

  const handleExportExcel = () => {
    if (useApi) {
      const url = getAuditExportUrl({
        search: search || undefined,
        action: filterAction || undefined,
        role: filterRole || undefined,
        user: filterUser || undefined,
        requisition_id: filterRequisition || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      void downloadWithAuth(url, `audit_trail_${new Date().toISOString().slice(0, 10)}.csv`).catch((e) => {
        alert(e instanceof Error ? e.message : String(e));
      });
    } else {
      exportToExcel(summaryHeaders, rowsForExport(rows), 'audit_trail_requisitions');
    }
  };

  const handleExportPDF = () => {
    if (rows.length === 0) {
      alert('No requisitions to export.');
      return;
    }
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text('Audit Trail (by requisition)', 14, 16);
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleString()} | ${rows.length} requisitions`, 14, 22);
    const tableBody = rows.map((r) => [
      r.requisition_number ? `${r.requisition_number} (${r.requisition_currency ?? 'USD'})` : '—',
      r.latest_action,
      formatDateTime(r.latest_timestamp),
      r.latest_user_name,
      r.latest_user_role,
      String(r.action_count),
    ]);
    autoTable(doc, {
      startY: 26,
      head: [summaryHeaders],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [12, 35, 64], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 7 },
      margin: { left: 14, right: 14 },
    });
    doc.save(`audit_trail_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handleExportWord = () => {
    if (rows.length === 0) {
      alert('No requisitions to export.');
      return;
    }
    exportToWord('Audit Trail (by requisition)', summaryHeaders, rowsForExport(rows), 'audit_trail_requisitions');
  };

  const handleRowClick = (row: ApiAuditRequisitionSummary) => {
    if (row.requisition_id && row.requisition_id > 0) navigate(`/requisitions/${String(row.requisition_id)}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Audit Trail</h1>
          <p className="text-slate-500 text-sm mt-0.5">Immutable record of all system actions and user activities</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-slate-500 text-sm">{totalCount} requisition{totalCount !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-2">
              <FileSpreadsheet className="size-4" />
              Export Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-2">
              <FileText className="size-4" />
              Export PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportWord} className="gap-2">
              <Download className="size-4" />
              Export Word
            </Button>
          </div>
        </div>
      </div>

      <Alert className="bg-blue-50 border-blue-200 text-blue-800 [&_svg]:text-blue-600">
        <Info className="size-4" />
        <AlertTitle>Access Controlled</AlertTitle>
        <AlertDescription>
          This audit trail shows one row per requisition. For actions like Login and User Account Updated, it shows matching activity rows.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search actions, users, requisitions…"
              className="pl-9"
            />
          </div>
          <select
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
            className="h-9 min-w-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">All Actions</option>
            {filterOptions.actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select
            value={filterRole}
            onChange={(e) => { setFilterRole((e.target.value as UserRole) || ''); setPage(1); }}
            className="h-9 min-w-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">All Roles</option>
            {filterOptions.roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            value={filterUser}
            onChange={(e) => { setFilterUser(e.target.value); setPage(1); }}
            className="h-9 min-w-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">All Users</option>
            {filterOptions.users.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <Input
            value={filterRequisition}
            onChange={(e) => { setFilterRequisition(e.target.value); setPage(1); }}
            placeholder="Requisition ref (e.g. IR…)"
            className="h-9 min-w-[140px] max-w-[180px]"
          />
          <div className="flex items-center gap-2">
            <label className="text-slate-500 text-xs whitespace-nowrap">From</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="h-9 w-[140px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-500 text-xs whitespace-nowrap">To</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="h-9 w-[140px]"
            />
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>
          )}
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        {loading ? (
          <CardContent className="py-16 text-center text-slate-500">Loading audit log…</CardContent>
        ) : rows.length === 0 ? (
          <CardContent className="py-16 text-center">
            <div className="text-4xl mb-4">🛡️</div>
            <p className="text-slate-500 font-medium">No requisitions match your filters</p>
          </CardContent>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                  {['Reference', 'Latest activity', 'Date', 'By', 'Role', 'Actions'].map((h) => (
                    <TableHead key={h} className="text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.requisition_id}
                    className="hover:bg-mars-red-muted/30 cursor-pointer transition-colors"
                    onClick={() => handleRowClick(row)}
                  >
                    <TableCell className="font-mono text-sm text-mars-red font-medium">
                      {row.requisition_number ? `${row.requisition_number} (${row.requisition_currency ?? 'USD'})` : '—'}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex text-xs px-2 py-1 rounded-full font-medium ${getActionColor(row.latest_action)}`}>{row.latest_action}</span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 whitespace-nowrap">{formatDateTime(row.latest_timestamp)}</TableCell>
                    <TableCell className="text-sm text-slate-800">{row.latest_user_name}</TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium ${ROLE_COLORS[row.latest_user_role] ?? 'text-slate-600'}`}>{row.latest_user_role}</span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{row.action_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {showPagination && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50/50">
                <span className="text-slate-500 text-sm">
                  Showing {Math.min((page - 1) * PER_PAGE + 1, totalCount)}–{Math.min(page * PER_PAGE, totalCount)} of {totalCount}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    ←
                  </Button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pg = page <= 3 ? i + 1 : page - 2 + i;
                    if (pg < 1 || pg > totalPages) return null;
                    return (
                      <Button
                        key={pg}
                        variant={pg === page ? 'default' : 'outline'}
                        size="sm"
                        className={pg === page ? 'bg-mars-red hover:bg-mars-red-dark' : ''}
                        onClick={() => setPage(pg)}
                      >
                        {pg}
                      </Button>
                    );
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    →
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

/** Fallback when API is not set: group audit entries by requisition, one row per req. */
function useAppFallbackRequisitions(
  search: string,
  filterAction: string,
  filterRole: UserRole | '',
  filterUser: string,
  filterRequisition: string,
  dateFrom: string,
  dateTo: string,
  page: number
) {
  const { auditLog, requisitions } = useApp();

  const allLogs = useMemo(() => {
    const reqLogs = requisitions.flatMap((r) =>
      r.auditLog.filter((e) => e.id && !auditLog.find((g) => g.id === e.id))
    );
    return [...auditLog, ...reqLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [auditLog, requisitions]);

  const filtered = useMemo(() => {
    return allLogs.filter((e) => {
      if (!e.requisitionId) return false;
      if (search && !e.details.toLowerCase().includes(search.toLowerCase()) && !e.userName.toLowerCase().includes(search.toLowerCase()) && !(e.requisitionNumber?.toLowerCase().includes(search.toLowerCase()))) return false;
      if (filterAction && e.action !== filterAction) return false;
      if (filterRole && e.userRole !== filterRole) return false;
      if (filterUser && e.userName !== filterUser) return false;
      if (filterRequisition) {
        const ref = (e.requisitionNumber ?? '').toLowerCase();
        const q = filterRequisition.trim().toLowerCase();
        if (!ref || !ref.includes(q)) return false;
      }
      if (dateFrom) {
        const t = new Date(e.timestamp).getTime();
        const start = new Date(dateFrom).setHours(0, 0, 0, 0);
        if (t < start) return false;
      }
      if (dateTo) {
        const t = new Date(e.timestamp).getTime();
        const end = new Date(dateTo).setHours(23, 59, 59, 999);
        if (t > end) return false;
      }
      return true;
    });
  }, [allLogs, search, filterAction, filterRole, filterUser, filterRequisition, dateFrom, dateTo]);

  const rows: ApiAuditRequisitionSummary[] = useMemo(() => {
    const byReq = new Map<string, typeof filtered>();
    for (const e of filtered) {
      const id = e.requisitionId!;
      if (!byReq.has(id)) byReq.set(id, []);
      byReq.get(id)!.push(e);
    }
    const reqs = Array.from(byReq.entries()).map(([reqId, entries]) => {
      const latest = entries[0];
      const req = requisitions.find((r) => r.id === reqId);
      return {
        requisition_id: Number(reqId),
        requisition_number: latest.requisitionNumber ?? req?.reqNumber ?? null,
        requisition_currency: req?.currency ?? latest.requisitionCurrency ?? null,
        latest_timestamp: latest.timestamp,
        latest_action: latest.action,
        latest_user_name: latest.userName,
        latest_user_role: latest.userRole,
        action_count: entries.length,
      };
    });
    reqs.sort((a, b) => new Date(b.latest_timestamp).getTime() - new Date(a.latest_timestamp).getTime());
    return reqs;
  }, [filtered, requisitions]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const paginatedRows = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const uniqueUsers = [...new Set(allLogs.map((e) => e.userName))].sort();

  return {
    rows: paginatedRows,
    totalCount: rows.length,
    totalPages,
    users: uniqueUsers,
  };
}
