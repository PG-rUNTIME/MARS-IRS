import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import type { RFQStatus, RFQ } from '../data/types';
import { formatDate } from './shared/StatusBadge';

type RFQListMode = 'my' | 'pending' | 'actioned';

function rfqStatusClass(status: RFQStatus): string {
  switch (status) {
    case 'Draft':
      return 'bg-slate-100 text-slate-600';
    case 'Pending Procurement':
      return 'bg-amber-100 text-amber-700';
    case 'Pending Requester Selection':
      return 'bg-purple-100 text-purple-700';
    case 'Converted':
      return 'bg-green-100 text-green-700';
    case 'Cancelled':
      return 'bg-slate-100 text-slate-500';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function StatusPill({ status }: { status: RFQStatus }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rfqStatusClass(status)}`}>{status}</span>;
}

export function RFQList({ mode }: { mode: RFQListMode }) {
  const { currentUser } = useAuth();
  const { rfqs } = useApp();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');

  const base = useMemo(() => {
    if (!currentUser) return [];
    if (mode === 'my') return rfqs.filter((r) => r.requesterId === currentUser.id);
    if (mode === 'pending') return rfqs.filter((r) => r.status === 'Pending Procurement');
    return rfqs.filter((r) => (r.events || []).some((e) => e.actorId === currentUser.id));
  }, [rfqs, mode, currentUser]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) => r.rfqNumber.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
  }, [base, search]);

  const title = mode === 'my' ? 'My RFQs' : mode === 'pending' ? 'Pending RFQs' : 'Actioned RFQs';
  const subtitle =
    mode === 'my'
      ? 'RFQs you created and manage through procurement.'
      : mode === 'pending'
        ? 'RFQs waiting for procurement to upload quotations.'
        : 'RFQs you have already actioned as procurement clerk.';

  return (
    <div className="space-y-5">
      <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-3">
        <div>
          <h1 className="text-slate-900">{title}</h1>
          <p className="text-slate-500 text-sm">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-[320px]">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#94A3B8"
              strokeWidth="2"
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by RFQ number or description…"
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-red-300 transition-colors"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-slate-500 font-medium">No RFQs found</div>
            <div className="text-slate-400 text-sm mt-1">Try adjusting your search.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">RFQ #</th>
                  <th className="text-left px-5 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Description</th>
                  <th className="text-left px-5 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Type</th>
                  <th className="text-left px-5 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Base</th>
                  <th className="text-left px-5 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Status</th>
                  <th className="text-left px-5 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((rfq) => (
                  <tr
                    key={rfq.id}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/rfqs/${rfq.id}`)}
                  >
                    <td className="px-5 py-3.5 text-slate-800 text-sm font-mono font-medium">{rfq.rfqNumber}</td>
                    <td className="px-5 py-3.5 text-slate-700 text-sm">
                      <div className="max-w-[320px] truncate">{rfq.description}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full whitespace-nowrap">{rfq.type}</span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 text-sm">{rfq.base || '—'}</td>
                    <td className="px-5 py-3.5">
                      <StatusPill status={rfq.status} />
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs whitespace-nowrap">
                      {rfq.submittedAt ? formatDate(rfq.submittedAt) : '—'}
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

