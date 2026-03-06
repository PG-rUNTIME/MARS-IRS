import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  fetchAuditList,
  getAuditExportUrl,
  isAuditApiEnabled,
  type AuditEntryDto,
  type PaginatedAuditResponse,
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
import { Search, Download, Info } from 'lucide-react';

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

function mapDtoToEntry(dto: AuditEntryDto) {
  return {
    id: String(dto.id),
    action: dto.action,
    userId: dto.user_id,
    userName: dto.user_name,
    userRole: dto.user_role as UserRole,
    timestamp: dto.timestamp,
    details: dto.details,
    requisitionId: dto.requisition_id ?? undefined,
    requisitionNumber: dto.requisition_number ?? undefined,
    requisitionCurrency: dto.requisition_currency ?? undefined,
  };
}

export function AuditTrail() {
  const navigate = useNavigate();
  const useApi = isAuditApiEnabled();

  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterRole, setFilterRole] = useState<UserRole | ''>('');
  const [filterUser, setFilterUser] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<PaginatedAuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFromApi = useCallback(async () => {
    if (!useApi) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAuditList({
        page,
        page_size: PER_PAGE,
        search: search || undefined,
        action: filterAction || undefined,
        role: filterRole || undefined,
        user: filterUser || undefined,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [useApi, page, search, filterAction, filterRole, filterUser]);

  useEffect(() => {
    if (useApi) {
      loadFromApi();
    }
  }, [useApi, loadFromApi]);

  // Fallback: use AppContext when API is not configured (existing behaviour)
  const fallback = useAppFallback(search, filterAction, filterRole, filterUser, page);
  const entries = useApi && data ? data.results.map(mapDtoToEntry) : fallback.entries;
  const totalCount = useApi && data ? data.count : fallback.totalCount;
  const totalPages = useApi && data ? Math.max(1, Math.ceil(data.count / PER_PAGE)) : fallback.totalPages;
  const filterOptions = useApi && data
    ? { actions: [...new Set(data.results.map((r) => r.action))].sort(), roles: [...new Set(data.results.map((r) => r.user_role))].sort(), users: [...new Set(data.results.map((r) => r.user_name))].sort() }
    : fallback.filterOptions;
  const showPagination = useApi ? (data != null && data.count > PER_PAGE) : fallback.totalPages > 1;
  const paginatedEntries = useApi ? entries : fallback.paginatedEntries;
  const hasFilters = !!(search || filterAction || filterRole || filterUser);

  const clearFilters = () => {
    setSearch('');
    setFilterAction('');
    setFilterRole('');
    setFilterUser('');
    setPage(1);
  };

  const getActionColor = (action: string) => ACTION_COLORS[action] ?? 'bg-slate-100 text-slate-600';

  const handleExport = () => {
    if (useApi) {
      window.open(getAuditExportUrl({ search: search || undefined, action: filterAction || undefined, role: filterRole || undefined, user: filterUser || undefined }), '_blank');
    } else {
      alert('In the production system, this would export the audit log as a CSV/Excel file.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Audit Trail</h1>
          <p className="text-slate-500 text-sm mt-0.5">Immutable record of all system actions and user activities</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-500 text-sm">{totalCount} entries</span>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
            <Download className="size-4" />
            Export
          </Button>
        </div>
      </div>

      <Alert className="bg-blue-50 border-blue-200 text-blue-800 [&_svg]:text-blue-600">
        <Info className="size-4" />
        <AlertTitle>Access Controlled</AlertTitle>
        <AlertDescription>
          This audit trail is accessible only to the Financial Controller and authorised Auditor/Compliance personnel. All entries are timestamped and changes are traceable.
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
        ) : paginatedEntries.length === 0 ? (
          <CardContent className="py-16 text-center">
            <div className="text-4xl mb-4">🛡️</div>
            <p className="text-slate-500 font-medium">No audit entries match your filters</p>
          </CardContent>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                  {['Timestamp', 'Action', 'User', 'Role', 'Reference', 'Details'].map((h) => (
                    <TableHead key={h} className="text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedEntries.map((entry) => (
                  <TableRow key={entry.id} className="hover:bg-slate-50/50">
                    <TableCell className="text-xs text-slate-600 whitespace-nowrap">{formatDateTime(entry.timestamp)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex text-xs px-2 py-1 rounded-full font-medium ${getActionColor(entry.action)}`}>{entry.action}</span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-800">{entry.userName}</TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium ${ROLE_COLORS[entry.userRole] ?? 'text-slate-600'}`}>{entry.userRole}</span>
                    </TableCell>
                    <TableCell>
                      {entry.requisitionNumber ? (
                        <span className="flex items-center gap-1.5">
                          <Button
                            variant="link"
                            className="text-xs font-mono text-mars-red hover:underline p-0 h-auto"
                            onClick={() => entry.requisitionId && navigate(`/requisitions/${entry.requisitionId}`)}
                          >
                            {entry.requisitionNumber}
                          </Button>
                          <span className="text-slate-500 text-xs font-medium">({entry.requisitionCurrency ?? 'USD'})</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600 max-w-[280px]">
                      <span className="truncate block" title={entry.details}>{entry.details}</span>
                    </TableCell>
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

/** Fallback when VITE_API_BASE is not set: use AppContext and client-side filtering/pagination. */
function useAppFallback(
  search: string,
  filterAction: string,
  filterRole: UserRole | '',
  filterUser: string,
  page: number
) {
  const { auditLog, requisitions } = useApp();

  const allLogs = useMemo(() => {
    const reqLogs = requisitions.flatMap((r) =>
      r.auditLog.filter((e) => e.id && !auditLog.find((g) => g.id === e.id))
    );
    return [...auditLog, ...reqLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [auditLog, requisitions]);

  const allLogsWithCurrency = useMemo(() => {
    return allLogs.map((e) => ({
      ...e,
      requisitionCurrency: e.requisitionId ? requisitions.find((r) => r.id === e.requisitionId)?.currency : undefined,
    }));
  }, [allLogs, requisitions]);

  const filtered = useMemo(() => {
    return allLogsWithCurrency.filter((e) => {
      if (search && !e.details.toLowerCase().includes(search.toLowerCase()) && !e.userName.toLowerCase().includes(search.toLowerCase()) && !(e.requisitionNumber?.toLowerCase().includes(search.toLowerCase()))) return false;
      if (filterAction && e.action !== filterAction) return false;
      if (filterRole && e.userRole !== filterRole) return false;
      if (filterUser && e.userName !== filterUser) return false;
      return true;
    });
  }, [allLogsWithCurrency, search, filterAction, filterRole, filterUser]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const uniqueActions = [...new Set(allLogsWithCurrency.map((e) => e.action))].sort();
  const uniqueRoles = [...new Set(allLogsWithCurrency.map((e) => e.userRole))].sort();
  const uniqueUsers = [...new Set(allLogsWithCurrency.map((e) => e.userName))].sort();

  return {
    entries: allLogsWithCurrency,
    totalCount: filtered.length,
    totalPages,
    paginatedEntries: paginated,
    filterOptions: { actions: uniqueActions, roles: uniqueRoles, users: uniqueUsers },
  };
}
