import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { StatusBadge, formatCurrency, formatDate } from './shared/StatusBadge';
import type { RequisitionStatus, RequisitionType } from '../data/types';

interface RequisitionListProps {
  mode: 'my' | 'all' | 'pending' | 'department';
}

const TYPE_OPTIONS: RequisitionType[] = ['Petty Cash', 'Supplier Payment (Normal)', 'High-Value/CAPEX'];
const STATUS_OPTIONS: RequisitionStatus[] = ['Draft', 'Submitted', 'Pending Review', 'Pending Approval', 'Approved', 'Pending Payment', 'Paid', 'Rejected', 'Cancelled'];

export function RequisitionList({ mode }: RequisitionListProps) {
  const { currentUser } = useAuth();
  const { requisitions, purchaseOrders, returnRejectedToDraft } = useApp();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [sortField, setSortField] = useState<'createdAt' | 'amount' | 'status'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  if (!currentUser) return null;

  const baseReqs = useMemo(() => {
    if (mode === 'my') return requisitions.filter((r) => r.requesterId === currentUser.id);
    if (mode === 'pending') return requisitions.filter((r) => r.currentApproverRole != null && currentUser.roles.includes(r.currentApproverRole));
    if (mode === 'department') return requisitions.filter((r) => r.department === currentUser.department);
    return requisitions;
  }, [requisitions, mode, currentUser]);

  const departments = [...new Set(baseReqs.map((r) => r.department))].sort();

  const filtered = useMemo(() => {
    return baseReqs
      .filter((r) => {
        if (search && !r.description.toLowerCase().includes(search.toLowerCase()) && !r.reqNumber.toLowerCase().includes(search.toLowerCase()) && !r.requesterName.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterStatus && r.status !== filterStatus) return false;
        if (filterType && r.type !== filterType) return false;
        if (filterDept && r.department !== filterDept) return false;
        return true;
      })
      .sort((a, b) => {
        let va: string | number = '';
        let vb: string | number = '';
        if (sortField === 'createdAt') { va = a.createdAt; vb = b.createdAt; }
        if (sortField === 'amount') { va = a.amount; vb = b.amount; }
        if (sortField === 'status') { va = a.status; vb = b.status; }
        if (sortDir === 'asc') return va < vb ? -1 : 1;
        return va > vb ? -1 : 1;
      });
  }, [baseReqs, search, filterStatus, filterType, filterDept, sortField, sortDir]);

  const title = mode === 'my' ? 'My Requisitions' : mode === 'pending' ? 'Pending Approvals' : mode === 'department' ? 'Department Requisitions' : 'All Requisitions';
  const subtitle = mode === 'my' ? 'Requisitions you have submitted' : mode === 'pending' ? 'Requisitions awaiting your approval' : mode === 'department' ? `All requisitions raised in ${currentUser.department} and their stages` : 'System-wide requisitions';

  const totalValueUSD = filtered.filter((r) => r.currency === 'USD').reduce((s, r) => s + r.amount, 0);
  const totalValueZIG = filtered.filter((r) => r.currency === 'ZIG').reduce((s, r) => s + r.amount, 0);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => (
    <span className="ml-1 inline-flex flex-col" style={{ lineHeight: 1 }}>
      <span style={{ color: sortField === field && sortDir === 'asc' ? 'var(--mars-red)' : '#CBD5E1', fontSize: 8 }}>▲</span>
      <span style={{ color: sortField === field && sortDir === 'desc' ? 'var(--mars-red)' : '#CBD5E1', fontSize: 8 }}>▼</span>
    </span>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-slate-900">{title}</h1>
          <p className="text-slate-500 text-sm">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden md:block">
            <div className="text-slate-500 text-xs">Total Value</div>
            <div className="text-slate-900 font-bold text-sm">
              {formatCurrency(totalValueUSD, 'USD')}
              {totalValueZIG > 0 && <span className="ml-2 text-slate-600">{formatCurrency(totalValueZIG, 'ZIG')}</span>}
            </div>
          </div>
          {(mode === 'my' || !currentUser.roles.includes('Auditor')) && mode !== 'pending' && (
            <button
              onClick={() => navigate('/requisitions/new')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90 bg-mars-red hover:bg-mars-red-dark"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Requisition
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by number, description, requester…"
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-red-300 transition-colors"
              />
            </div>
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-red-300 bg-white min-w-[140px]"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-red-300 bg-white min-w-[140px]"
          >
            <option value="">All Types</option>
            {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {mode !== 'my' && (
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-red-300 bg-white min-w-[140px]"
            >
              <option value="">All Departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          {(search || filterStatus || filterType || filterDept) && (
            <button
              onClick={() => { setSearch(''); setFilterStatus(''); setFilterType(''); setFilterDept(''); }}
              className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Summary counts */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span>Showing <span className="font-medium text-slate-800">{filtered.length}</span> of {baseReqs.length} requisitions</span>
        {mode === 'pending' && filtered.length > 0 && (
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Action Required</span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" className="mx-auto mb-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            <div className="text-slate-500 font-medium">No requisitions found</div>
            <div className="text-slate-400 text-sm mt-1">Try adjusting your search or filters</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Req #</th>
                  <th className="text-left px-5 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Description</th>
                  {mode !== 'my' && <th className="text-left px-5 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Requester</th>}
                  <th className="text-left px-5 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Type</th>
                  <th className="text-left px-5 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide cursor-pointer select-none" onClick={() => toggleSort('amount')}>
                    Amount <SortIcon field="amount" />
                  </th>
                  <th className="text-left px-5 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide cursor-pointer select-none" onClick={() => toggleSort('status')}>
                    Status <SortIcon field="status" />
                  </th>
                  {mode !== 'my' && <th className="text-left px-5 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Department</th>}
                  <th className="text-left px-5 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide cursor-pointer select-none" onClick={() => toggleSort('createdAt')}>
                    Date <SortIcon field="createdAt" />
                  </th>
                  {mode === 'pending' && <th className="text-left px-5 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Awaiting</th>}
                  {mode === 'my' && <th className="text-left px-5 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">PO</th>}
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((req) => (
                  <tr
                    key={req.id}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/requisitions/${req.id}`)}
                  >
                    <td className="px-5 py-3.5 text-slate-800 text-sm font-mono font-medium">{req.reqNumber}</td>
                    <td className="px-5 py-3.5 text-slate-700 text-sm">
                      <div className="max-w-[220px] truncate">{req.description}</div>
                      {req.isCapex && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">CAPEX</span>}
                    </td>
                    {mode !== 'my' && (
                      <td className="px-5 py-3.5 text-slate-700 text-sm">
                        <div>{req.requesterName}</div>
                        <div className="text-slate-400 text-xs">{req.department}</div>
                      </td>
                    )}
                    <td className="px-5 py-3.5">
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full whitespace-nowrap">{req.type}</span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-800 text-sm font-medium">{formatCurrency(req.amount, req.currency)}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={req.status} /></td>
                    {mode !== 'my' && <td className="px-5 py-3.5 text-slate-600 text-sm">{req.department}</td>}
                    <td className="px-5 py-3.5 text-slate-500 text-xs whitespace-nowrap">{formatDate(req.createdAt)}</td>
                    {mode === 'pending' && (
                      <td className="px-5 py-3.5">
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">{req.currentApproverRole}</span>
                      </td>
                    )}
                    {mode === 'my' && (
                      <td className="px-5 py-3.5 text-slate-600 text-sm font-mono">
                        {req.poGenerated && req.poNumber ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const po = purchaseOrders.find((p) => p.requisitionId === req.id);
                              navigate('/purchase-orders', { state: po ? { openPoId: po.id } : undefined });
                            }}
                            className="text-green-600 hover:underline font-medium"
                          >
                            {req.poNumber}
                          </button>
                        ) : '—'}
                      </td>
                    )}
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {mode === 'my' && req.status === 'Draft' && (
                          <button
                            onClick={() => navigate(`/requisitions/${req.id}/edit`)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-all"
                          >
                            Edit
                          </button>
                        )}
                        {mode === 'my' && req.status === 'Rejected' && (
                          <button
                            onClick={() => { returnRejectedToDraft(req.id, currentUser); navigate(`/requisitions/${req.id}/edit`); }}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-mars-red text-mars-red hover:bg-mars-red-muted transition-all"
                          >
                            Edit and resubmit
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/requisitions/${req.id}`)}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:border-mars-red hover:text-mars-red transition-all"
                        >
                          {mode === 'pending' ? 'Review' : 'View'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}