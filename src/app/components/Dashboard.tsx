import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { StatusBadge, formatCurrency, formatDate } from './shared/StatusBadge';
import type { RequisitionStatus, Requisition } from '../data/types';
import { exportToExcel, exportToWord } from '../utils/exportUtils';
import { FileSpreadsheet, FileText, Download } from 'lucide-react';

/* MARS theme: mars-red, mars-navy, navy-light, accent, then chart palette */
const COLORS = ['#c41e3a', '#0c2340', '#1e3a5f', '#e8a598', '#5a6c7d', '#8B5CF6', '#06B6D4', '#6B7280'];

function KPICard({ label, value, sub, color, icon }: { label: string; value: string | number; sub?: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-500 text-sm">{label}</span>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: color + '20' }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <div className="text-slate-900 mb-1" style={{ fontSize: '1.8rem', fontWeight: 700, lineHeight: 1 }}>{value}</div>
      {sub && <div className="text-slate-500 text-xs mt-1">{sub}</div>}
    </div>
  );
}

function inDateRange(req: Requisition, dateFrom: string, dateTo: string): boolean {
  if (!dateFrom && !dateTo) return true;
  const t = new Date(req.createdAt).getTime();
  if (dateFrom) {
    const start = new Date(dateFrom).setHours(0, 0, 0, 0);
    if (t < start) return false;
  }
  if (dateTo) {
    const end = new Date(dateTo).setHours(23, 59, 59, 999);
    if (t > end) return false;
  }
  return true;
}

export function Dashboard() {
  const { currentUser } = useAuth();
  const { requisitions, notifications } = useApp();
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  if (!currentUser) return null;

  // Role-based filtered view
  const myReqs = requisitions.filter((r) => r.requesterId === currentUser.id);
  const pendingApprovals = requisitions.filter((r) => r.status !== 'Rejected' && r.currentApproverRole != null && currentUser.roles.includes(r.currentApproverRole));
  const unread = notifications.filter((n) => n.recipientId === currentUser.id && !n.read);

  const isFinance = currentUser.roles.some((r) => ['Accountant', 'Financial Controller', 'General Manager'].includes(r));
  const isManagement = currentUser.roles.some((r) => ['General Manager', 'Financial Controller'].includes(r));
  const isAuditor = currentUser.roles.includes('Auditor');
  const isAdmin = currentUser.roles.includes('System Administrator');
  const isDeptHead = currentUser.roles.includes('Department Manager');

  // Departmental heads see all requisitions raised within their department (and their various stages)
  const deptReqs = isDeptHead ? requisitions.filter((r) => r.department === currentUser.department) : [];
  const visibleReqsBase =
    isFinance || isManagement || isAuditor || isAdmin
      ? requisitions
      : isDeptHead
        ? deptReqs
        : myReqs;
  const visibleReqs = visibleReqsBase.filter((r) => inDateRange(r, dateFrom, dateTo));

  // KPIs
  const totalAmountUSD = visibleReqs.filter((r) => r.currency === 'USD').reduce((s, r) => s + r.amount, 0);
  const totalAmountZIG = visibleReqs.filter((r) => r.currency === 'ZIG').reduce((s, r) => s + r.amount, 0);
  const totalAmount = totalAmountUSD + totalAmountZIG;
  const approvedCount = visibleReqs.filter((r) => ['Approved', 'Pending Payment', 'Paid'].includes(r.status)).length;
  const pendingCount = visibleReqs.filter((r) => ['Submitted', 'Pending Review', 'Pending Approval'].includes(r.status)).length;
  const paidCount = visibleReqs.filter((r) => r.status === 'Paid').length;
  const rejectedCount = visibleReqs.filter((r) => r.status === 'Rejected').length;

  // Status pie data
  const statusGroups: Record<string, number> = {};
  visibleReqs.forEach((r) => { statusGroups[r.status] = (statusGroups[r.status] || 0) + 1; });
  const pieData = Object.entries(statusGroups).map(([name, value]) => ({ name, value }));

  // Monthly trend (Oct 2025 – Mar 2026)
  const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
  const monthlyMap: Record<string, number> = { Oct: 0, Nov: 0, Dec: 0, Jan: 0, Feb: 0, Mar: 0 };
  visibleReqs.forEach((r) => {
    const d = new Date(r.createdAt);
    const m = d.toLocaleString('en-US', { month: 'short' });
    if (m in monthlyMap) monthlyMap[m]++;
  });
  const trendData = months.map((m) => ({ month: m, count: monthlyMap[m] }));

  // Dept spending
  const deptSpend: Record<string, number> = {};
  visibleReqs.forEach((r) => { deptSpend[r.department] = (deptSpend[r.department] || 0) + r.amount; });
  const deptData = Object.entries(deptSpend)
    .map(([dept, amount]) => ({ dept: dept.length > 10 ? dept.slice(0, 10) + '…' : dept, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  // Type breakdown
  const typeMap: Record<string, number> = {};
  visibleReqs.forEach((r) => { typeMap[r.type] = (typeMap[r.type] || 0) + 1; });
  const typeData = Object.entries(typeMap).map(([name, value]) => ({ name, value }));

  const recentReqs = [...visibleReqs].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 6);

  const dashboardExportHeaders = ['Req #', 'Description', 'Type', 'Department', 'Amount', 'Currency', 'Status', 'Created'];
  const dashboardExportRows = visibleReqs.map((r) => [
    r.reqNumber,
    r.description ?? '',
    r.type,
    r.department,
    String(r.amount),
    r.currency,
    r.status,
    formatDate(r.createdAt),
  ]);
  const handleExportExcel = () => exportToExcel(dashboardExportHeaders, dashboardExportRows, 'dashboard_requisitions');
  const handleExportWord = () => exportToWord('Dashboard – Requisitions', dashboardExportHeaders, dashboardExportRows, 'dashboard_requisitions');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm">Welcome back, {currentUser.name} · {currentUser.roles.join(', ')}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-slate-500 text-sm hidden md:block">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-500 text-xs">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-700"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-500 text-xs">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-700"
            />
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50 transition-all print:hidden"
          >
            <FileText className="size-4" />
            PDF
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50 transition-all print:hidden"
          >
            <FileSpreadsheet className="size-4" />
            Excel
          </button>
          <button
            type="button"
            onClick={handleExportWord}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50 transition-all print:hidden"
          >
            <Download className="size-4" />
            Word
          </button>
        </div>
      </div>

      {/* Alert for pending approvals */}
      {pendingApprovals.length > 0 && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl border border-amber-300 bg-amber-50 cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => navigate('/pending-approvals')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--mars-navy)" strokeWidth="2" className="shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg>
          <span className="text-amber-900 text-sm font-medium">
            You have <span className="font-bold">{pendingApprovals.length}</span> requisition{pendingApprovals.length > 1 ? 's' : ''} awaiting your approval.
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--mars-navy)" strokeWidth="2" className="ml-auto shrink-0"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label={
            isFinance || isManagement || isAuditor || isAdmin
              ? 'Total Requisitions'
              : isDeptHead
                ? 'Department Requisitions'
                : 'My Requisitions'
          }
          value={visibleReqs.length}
          sub={isDeptHead ? `${currentUser.department} · ${pendingCount} in progress` : `${pendingCount} in progress`}
          color="#0c2340"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
        />
        <KPICard
          label="Total Value"
          value={formatCurrency(totalAmountUSD, 'USD')}
          sub={`ZIG: ${formatCurrency(totalAmountZIG, 'ZIG')} · ${approvedCount} approved`}
          color="#10B981"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
        />
        <KPICard
          label="Pending Action"
          value={pendingCount}
          sub={`${unread.length} unread notifications`}
          color="#F59E0B"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
        />
        <KPICard
          label="Paid"
          value={paidCount}
          sub={`${rejectedCount} rejected`}
          color="#c41e3a"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Monthly Trend */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-slate-800 mb-1">Requisition Trend</h3>
          <p className="text-slate-500 text-xs mb-4">Monthly volume (Oct 2025 – Mar 2026)</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
              <Line type="monotone" dataKey="count" stroke="#c41e3a" strokeWidth={2.5} dot={{ fill: '#c41e3a', r: 4 }} name="Requisitions" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Status Pie */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-slate-800 mb-1">By Status</h3>
          <p className="text-slate-500 text-xs mb-2">Current status distribution</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="45%" innerRadius={45} outerRadius={70} dataKey="value" nameKey="name">
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 11 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Second Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Dept Spending */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-slate-800 mb-1">Spend by Department</h3>
          <p className="text-slate-500 text-xs mb-4">Total requisitioned value per department</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={deptData} layout="vertical" margin={{ left: 0, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="dept" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={70} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
              <Bar dataKey="amount" fill="#c41e3a" radius={[0, 4, 4, 0]} name="Amount" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Type Breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-slate-800 mb-1">By Requisition Type</h3>
          <p className="text-slate-500 text-xs mb-4">Count by requisition category</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={typeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }} />
              <Bar dataKey="value" fill="#0c2340" radius={[4, 4, 0, 0]} name="Count" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Requisitions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-slate-800">Recent Requisitions</h3>
          <button
            onClick={() =>
              navigate(
                isFinance || isManagement || isAuditor || isAdmin
                  ? '/all-requisitions'
                  : isDeptHead
                    ? '/department-requisitions'
                    : '/my-requisitions'
              )
            }
            className="text-sm text-mars-red font-medium hover:underline"
          >
            View all →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Req #', 'Description', 'Type', 'Amount', 'Status', 'Date', ''].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recentReqs.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 text-slate-800 text-sm font-mono font-medium">{req.reqNumber}</td>
                  <td className="px-5 py-3 text-slate-700 text-sm max-w-xs">
                    <div className="truncate max-w-[200px]">{req.description}</div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{req.type}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-800 text-sm">{formatCurrency(req.amount)}</td>
                  <td className="px-5 py-3"><StatusBadge status={req.status as RequisitionStatus} /></td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{formatDate(req.createdAt)}</td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => navigate(`/requisitions/${req.id}`)}
                      className="text-xs font-medium px-3 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-800 transition-all"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
