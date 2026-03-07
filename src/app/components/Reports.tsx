import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { formatCurrency } from './shared/StatusBadge';
import { exportToExcel, exportToWord } from '../utils/exportUtils';

const COLORS = ['#c41e3a', '#0c2340', '#1e3a5f', '#10B981', '#8B5CF6', '#e8a598', '#06B6D4', '#6B7280', '#84CC16'];

function KPIBox({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="text-slate-500 text-sm mb-2">{label}</div>
      <div style={{ color, fontSize: '1.7rem', fontWeight: 700, lineHeight: 1 }}>{value}</div>
      {sub && <div className="text-slate-500 text-xs mt-1.5">{sub}</div>}
    </div>
  );
}

function filterByDateRange<T extends { createdAt?: string }>(items: T[], range: string): T[] {
  if (range === 'all' || !items.length) return items;
  const now = new Date();
  let start: Date;
  if (range === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (range === 'quarter') {
    const q = Math.floor(now.getMonth() / 3) + 1;
    start = new Date(now.getFullYear(), (q - 1) * 3, 1);
  } else if (range === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
  } else {
    return items;
  }
  const startMs = start.getTime();
  return items.filter((r) => new Date((r as { createdAt?: string }).createdAt ?? 0).getTime() >= startMs);
}

export function Reports() {
  const { requisitions, purchaseOrders } = useApp();
  const [dateRange, setDateRange] = useState('all');

  const filteredRequisitions = useMemo(
    () => filterByDateRange(requisitions, dateRange),
    [requisitions, dateRange]
  );
  const filteredPOs = useMemo(
    () => filterByDateRange(purchaseOrders, dateRange),
    [purchaseOrders, dateRange]
  );

  // Derived data (from filtered requisitions)
  const total = filteredRequisitions.length;
  const paid = filteredRequisitions.filter((r) => r.status === 'Paid').length;
  const pending = filteredRequisitions.filter((r) => ['Submitted', 'Pending Review', 'Pending Approval'].includes(r.status)).length;
  const rejected = filteredRequisitions.filter((r) => r.status === 'Rejected').length;

  const totalValueUSD = filteredRequisitions.filter((r) => r.currency === 'USD').reduce((s, r) => s + r.amount, 0);
  const totalValueZIG = filteredRequisitions.filter((r) => r.currency === 'ZIG').reduce((s, r) => s + r.amount, 0);
  const totalValue = totalValueUSD + totalValueZIG;
  const paidValueUSD = filteredRequisitions.filter((r) => r.status === 'Paid' && r.currency === 'USD').reduce((s, r) => s + r.amount, 0);
  const paidValueZIG = filteredRequisitions.filter((r) => r.status === 'Paid' && r.currency === 'ZIG').reduce((s, r) => s + r.amount, 0);
  const paidValue = paidValueUSD + paidValueZIG;
  const poCount = filteredPOs.length;
  const poValueUSD = filteredPOs.filter((po) => po.currency === 'USD').reduce((s, po) => s + po.total, 0);
  const poValueZIG = filteredPOs.filter((po) => po.currency === 'ZIG').reduce((s, po) => s + po.total, 0);
  const poValue = poValueUSD + poValueZIG;

  const poReqs = filteredRequisitions.filter((r) => r.type === 'Supplier Payment (Normal)' || r.type === 'High-Value/CAPEX');
  const poCompliant = poReqs.filter((r) => r.poGenerated).length;
  const poComplianceRate = poReqs.length > 0 ? Math.round((poCompliant / poReqs.length) * 100) : 0;

  const paidReqs = filteredRequisitions.filter((r) => r.status === 'Paid' && r.paidAt);
  const avgTurnaround = paidReqs.length > 0
    ? Math.round(paidReqs.reduce((s, r) => {
        const days = (new Date(r.paidAt!).getTime() - new Date(r.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        return s + days;
      }, 0) / paidReqs.length)
    : 0;

  const statusMap: Record<string, number> = {};
  filteredRequisitions.forEach((r) => { statusMap[r.status] = (statusMap[r.status] || 0) + 1; });
  const statusData = Object.entries(statusMap).map(([name, value]) => ({ name, value }));

  const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
  const monthlyData = months.map((m) => {
    const reqs = filteredRequisitions.filter((r) => {
      const mo = new Date(r.createdAt).toLocaleString('en-US', { month: 'short' });
      return mo === m;
    });
    return {
      month: m,
      count: reqs.length,
      value: reqs.reduce((s, r) => s + r.amount, 0),
      approved: reqs.filter((r) => ['Approved', 'Pending Payment', 'Paid'].includes(r.status)).length,
    };
  });

  const deptSpend: Record<string, { amount: number; count: number; amountUSD: number; amountZIG: number }> = {};
  filteredRequisitions.forEach((r) => {
    if (!deptSpend[r.department]) deptSpend[r.department] = { amount: 0, count: 0, amountUSD: 0, amountZIG: 0 };
    deptSpend[r.department].amount += r.amount;
    deptSpend[r.department].count++;
    if (r.currency === 'USD') deptSpend[r.department].amountUSD += r.amount;
    else deptSpend[r.department].amountZIG += r.amount;
  });
  const deptData = Object.entries(deptSpend)
    .map(([dept, data]) => ({ dept: dept.length > 14 ? dept.slice(0, 14) + '…' : dept, ...data }))
    .sort((a, b) => b.amount - a.amount);

  const typeMap: Record<string, { count: number; value: number; valueUSD: number; valueZIG: number }> = {};
  filteredRequisitions.forEach((r) => {
    if (!typeMap[r.type]) typeMap[r.type] = { count: 0, value: 0, valueUSD: 0, valueZIG: 0 };
    typeMap[r.type].count++;
    typeMap[r.type].value += r.amount;
    if (r.currency === 'USD') typeMap[r.type].valueUSD += r.amount;
    else typeMap[r.type].valueZIG += r.amount;
  });
  const typeData = Object.entries(typeMap).map(([type, data]) => ({ type, ...data })).sort((a, b) => b.value - a.value);

  const backlog: Record<string, number> = {};
  filteredRequisitions
    .filter((r) => r.status !== 'Rejected' && r.currentApproverRole && ['Submitted', 'Pending Review', 'Pending Approval'].includes(r.status))
    .forEach((r) => {
      const role = r.currentApproverRole!;
      backlog[role] = (backlog[role] || 0) + 1;
    });
  const backlogData = Object.entries(backlog).map(([role, count]) => ({ role, count }));

  const handleExportPDF = () => window.print();

  const reportHeaders = ['Department', 'Total Reqs', 'USD', 'ZIG', 'Approved', 'Pending', 'Rejected', 'Paid'];
  const reportRows = Object.entries(deptSpend).map(([dept, { count, amountUSD, amountZIG }]) => {
    const deptReqs = filteredRequisitions.filter((r) => r.department === dept);
    return [
      dept,
      String(count),
      formatCurrency(amountUSD ?? 0, 'USD'),
      formatCurrency(amountZIG ?? 0, 'ZIG'),
      String(deptReqs.filter((r) => ['Approved', 'Pending Payment', 'Paid'].includes(r.status)).length),
      String(deptReqs.filter((r) => ['Submitted', 'Pending Review', 'Pending Approval'].includes(r.status)).length),
      String(deptReqs.filter((r) => r.status === 'Rejected').length),
      String(deptReqs.filter((r) => r.status === 'Paid').length),
    ];
  });
  const handleExportExcel = () => exportToExcel(reportHeaders, reportRows, 'reports_departmental_summary');
  const handleExportWord = () => exportToWord('Reports & KPIs – Departmental Summary', reportHeaders, reportRows, 'reports_departmental_summary');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-slate-900">Reports & KPIs</h1>
          <p className="text-slate-500 text-sm">Analytics and performance indicators for the requisitions system</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white focus:outline-none print:hidden"
          >
            <option value="all">All Time</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
          </select>
          <div className="flex items-center gap-2">
            <button onClick={handleExportExcel} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50 transition-all print:hidden">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Excel
            </button>
            <button onClick={handleExportWord} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50 transition-all print:hidden">
              Word
            </button>
            <button onClick={handleExportPDF} className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm transition-all hover:opacity-90 bg-mars-red hover:bg-mars-red-dark print:hidden">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download / Print PDF
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPIBox label="Total Requisitions" value={total} sub={`${paid} paid · ${pending} pending`} color="#0c2340" />
        <KPIBox label="Total Value (USD)" value={formatCurrency(totalValueUSD, 'USD')} sub={`${formatCurrency(paidValueUSD, 'USD')} paid`} color="#10B981" />
        <KPIBox label="Total Value (ZIG)" value={formatCurrency(totalValueZIG, 'ZIG')} sub={`${formatCurrency(paidValueZIG, 'ZIG')} paid`} color="#059669" />
        <KPIBox label="Avg. Turnaround Time" value={`${avgTurnaround}d`} sub="From submission to payment" color="#F59E0B" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPIBox label="PO Compliance Rate" value={`${poComplianceRate}%`} sub={`${poCount} POs · ${formatCurrency(poValueUSD, 'USD')} / ${formatCurrency(poValueZIG, 'ZIG')}`} color={poComplianceRate >= 80 ? '#10B981' : '#c41e3a'} />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="text-slate-500 text-xs uppercase tracking-wide mb-3">Approval Backlog</div>
          {backlogData.length === 0 ? (
            <div className="text-green-600 text-sm font-medium">✓ No pending approvals</div>
          ) : (
            <div className="space-y-2">
              {backlogData.map(({ role, count }) => (
                <div key={role} className="flex items-center justify-between">
                  <span className="text-slate-600 text-xs">{role.split(' ')[0]}</span>
                  <span className="text-sm font-bold text-orange-600">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="text-slate-500 text-xs uppercase tracking-wide mb-3">Rejection Rate</div>
          <div className="text-slate-900 mb-1" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {total > 0 ? `${Math.round((rejected / total) * 100)}%` : '0%'}
          </div>
          <div className="text-slate-500 text-xs">{rejected} rejected of {total} total</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="text-slate-500 text-xs uppercase tracking-wide mb-3">CAPEX Requests</div>
          <div className="text-slate-900 mb-1" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {filteredRequisitions.filter((r) => r.isCapex).length}
          </div>
          <div className="text-slate-500 text-xs">
            USD: {formatCurrency(filteredRequisitions.filter((r) => r.isCapex && r.currency === 'USD').reduce((s, r) => s + r.amount, 0), 'USD')}
            {' · '}
            ZIG: {formatCurrency(filteredRequisitions.filter((r) => r.isCapex && r.currency === 'ZIG').reduce((s, r) => s + r.amount, 0), 'ZIG')}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="text-slate-500 text-xs uppercase tracking-wide mb-3">Purchase Orders</div>
          <div className="text-slate-900 mb-1" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{poCount}</div>
          <div className="text-slate-500 text-xs">{poCompliant} with PO compliance</div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-slate-800 mb-1">Monthly Requisition Volume & Value</h3>
          <p className="text-slate-500 text-xs mb-4">Count and total value per month</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }} formatter={(v: number, name: string) => name === 'value' ? formatCurrency(v) : v} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="count" fill="#0c2340" radius={[4, 4, 0, 0]} name="Count" />
              <Bar yAxisId="right" dataKey="value" fill="#c41e3a50" stroke="#c41e3a" radius={[4, 4, 0, 0]} name="Value (USD + ZIG)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-slate-800 mb-1">Status Distribution</h3>
          <p className="text-slate-500 text-xs mb-2">Current requisition status breakdown</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="45%" innerRadius={50} outerRadius={80} dataKey="value" nameKey="name">
                {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-slate-800 mb-1">Spend by Department</h3>
          <p className="text-slate-500 text-xs mb-4">Total requisitioned value per department</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={deptData} layout="vertical" margin={{ left: 0, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="dept" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={75} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }} />
              <Bar dataKey="amount" fill="#c41e3a" radius={[0, 4, 4, 0]} name="Amount" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-slate-800 mb-1">Requisition Type Analysis</h3>
          <p className="text-slate-500 text-xs mb-4">Count and value by type</p>
          <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
            <table className="w-full">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100">
                  <th className="text-left pb-2 text-slate-500 text-xs font-medium">Type</th>
                  <th className="text-right pb-2 text-slate-500 text-xs font-medium">Count</th>
                  <th className="text-right pb-2 text-slate-500 text-xs font-medium">USD</th>
                  <th className="text-right pb-2 text-slate-500 text-xs font-medium">ZIG</th>
                  <th className="text-right pb-2 text-slate-500 text-xs font-medium">Avg USD</th>
                  <th className="text-right pb-2 text-slate-500 text-xs font-medium">Avg ZIG</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {typeData.map(({ type, count, valueUSD, valueZIG }) => {
                  const countUSD = filteredRequisitions.filter((r) => r.type === type && r.currency === 'USD').length;
                  const countZIG = filteredRequisitions.filter((r) => r.type === type && r.currency === 'ZIG').length;
                  return (
                    <tr key={type}>
                      <td className="py-2 text-slate-700 text-sm">{type}</td>
                      <td className="py-2 text-right text-slate-700 text-sm">{count}</td>
                      <td className="py-2 text-right text-slate-800 text-sm font-medium">{formatCurrency(valueUSD ?? 0, 'USD')}</td>
                      <td className="py-2 text-right text-slate-800 text-sm font-medium">{formatCurrency(valueZIG ?? 0, 'ZIG')}</td>
                      <td className="py-2 text-right text-slate-500 text-xs">{countUSD ? formatCurrency(Math.round((valueUSD ?? 0) / countUSD), 'USD') : '—'}</td>
                      <td className="py-2 text-right text-slate-500 text-xs">{countZIG ? formatCurrency(Math.round((valueZIG ?? 0) / countZIG), 'ZIG') : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Monthly Area Chart */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-slate-800 mb-1">Approval Rate Trend</h3>
        <p className="text-slate-500 text-xs mb-4">Monthly requisition count vs. approvals</p>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="count" stroke="#0c2340" fill="#0c234020" strokeWidth={2} name="Submitted" />
            <Area type="monotone" dataKey="approved" stroke="#10B981" fill="#10B98120" strokeWidth={2} name="Approved" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Summary Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-slate-800">Departmental Summary</h3>
          <button onClick={handleExportExcel} className="text-sm text-mars-red hover:underline">Export Excel</button>
          <button onClick={handleExportWord} className="text-sm text-mars-red hover:underline ml-2">Export Word</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Department', 'Total Reqs', 'USD', 'ZIG', 'Approved', 'Pending', 'Rejected', 'Paid'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {Object.entries(deptSpend).map(([dept, { count, amountUSD, amountZIG }]) => {
                const deptReqs = filteredRequisitions.filter((r) => r.department === dept);
                return (
                  <tr key={dept} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-slate-800 text-sm font-medium">{dept}</td>
                    <td className="px-5 py-3 text-slate-700 text-sm">{count}</td>
                    <td className="px-5 py-3 text-slate-800 text-sm font-medium">{formatCurrency(amountUSD ?? 0, 'USD')}</td>
                    <td className="px-5 py-3 text-slate-800 text-sm font-medium">{formatCurrency(amountZIG ?? 0, 'ZIG')}</td>
                    <td className="px-5 py-3 text-green-600 text-sm">{deptReqs.filter((r) => ['Approved', 'Pending Payment', 'Paid'].includes(r.status)).length}</td>
                    <td className="px-5 py-3 text-amber-600 text-sm">{deptReqs.filter((r) => ['Submitted', 'Pending Review', 'Pending Approval'].includes(r.status)).length}</td>
                    <td className="px-5 py-3 text-mars-red text-sm">{deptReqs.filter((r) => r.status === 'Rejected').length}</td>
                    <td className="px-5 py-3 text-teal-600 text-sm">{deptReqs.filter((r) => r.status === 'Paid').length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}