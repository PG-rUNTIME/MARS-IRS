import { useEffect, useMemo, useState } from 'react';
import { fetchBudgetStats } from '../api/client';
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Line, Legend } from 'recharts';

type DepartmentBudgetStat = {
  department: string;
  year: number;
  usd_budget: number;
  zig_budget: number;
  usd_consumed: number;
  zig_consumed: number;
  usd_remaining: number;
  zig_remaining: number;
  usd_utilization_pct: number;
  zig_utilization_pct: number;
};

type BudgetStatsResponse = {
  year: number;
  alerts: Array<{
    scope: 'department' | 'organisation';
    department: string | null;
    currency: 'USD' | 'ZIG';
    utilization_pct: number;
    threshold: 80 | 90;
    level: 'warning' | 'critical';
    message: string;
  }>;
  monthly_trend: Array<{
    month: string;
    usd_consumed: number;
    zig_consumed: number;
  }>;
  departments: DepartmentBudgetStat[];
  totals: Omit<DepartmentBudgetStat, 'department' | 'year'>;
};

export function BudgetStats() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [data, setData] = useState<BudgetStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchBudgetStats(year);
      setData(res as BudgetStatsResponse);
    } catch {
      setError('Failed to load budget statistics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [year]);

  const totals = useMemo(() => data?.totals, [data]);
  const trendData = useMemo(
    () =>
      (data?.monthly_trend || []).map((m) => ({
        ...m,
        monthLabel: m.month.slice(5),
      })),
    [data]
  );

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-slate-900">Budget Statistics</h1>
          <p className="text-slate-500 text-sm">Track annual budget consumption by department and organisation totals.</p>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Year</label>
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || new Date().getFullYear()))} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
        </div>
      </div>

      {totals && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-sm text-slate-500 mb-1">Organisation USD</div>
            <div className="text-slate-900 text-xl font-semibold">Budget {totals.usd_budget.toFixed(2)}</div>
            <div className="text-sm text-slate-700">Consumed {totals.usd_consumed.toFixed(2)} · Remaining {totals.usd_remaining.toFixed(2)} · Utilization {totals.usd_utilization_pct.toFixed(1)}%</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-sm text-slate-500 mb-1">Organisation ZIG</div>
            <div className="text-slate-900 text-xl font-semibold">Budget {totals.zig_budget.toFixed(2)}</div>
            <div className="text-sm text-slate-700">Consumed {totals.zig_consumed.toFixed(2)} · Remaining {totals.zig_remaining.toFixed(2)} · Utilization {totals.zig_utilization_pct.toFixed(1)}%</div>
          </div>
        </div>
      )}

      {!!data?.alerts?.length && (
        <div className="space-y-2">
          {data.alerts.map((a, idx) => (
            <div
              key={`${a.scope}-${a.department || 'org'}-${a.currency}-${idx}`}
              className={`rounded-lg border px-3 py-2 text-sm ${
                a.level === 'critical'
                  ? 'bg-mars-red-muted border-mars-red/30 text-mars-red-dark'
                  : 'bg-amber-50 border-amber-300 text-amber-800'
              }`}
            >
              {a.message} Threshold: {a.threshold}%.
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-slate-800 mb-1">Monthly Consumption Trend</h3>
        <p className="text-slate-500 text-xs mb-4">Paid/disbursed consumption per month for {year}.</p>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
            <Legend />
            <Line type="monotone" dataKey="usd_consumed" stroke="#0c2340" strokeWidth={2} dot={{ r: 3 }} name="USD Consumed" />
            <Line type="monotone" dataKey="zig_consumed" stroke="#c41e3a" strokeWidth={2} dot={{ r: 3 }} name="ZIG Consumed" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">Department</th>
              <th className="px-4 py-2">USD (Budget/Consumed/Remaining)</th>
              <th className="px-4 py-2">USD Utilization</th>
              <th className="px-4 py-2">ZIG (Budget/Consumed/Remaining)</th>
              <th className="px-4 py-2">ZIG Utilization</th>
            </tr>
          </thead>
          <tbody>
            {data?.departments.map((d) => (
              <tr
                key={d.department}
                className={`border-b border-slate-50 ${
                  d.usd_utilization_pct >= 90 || d.zig_utilization_pct >= 90
                    ? 'bg-mars-red-muted/40'
                    : d.usd_utilization_pct >= 80 || d.zig_utilization_pct >= 80
                      ? 'bg-amber-50/70'
                      : ''
                }`}
              >
                <td className="px-4 py-2 text-sm text-slate-800">{d.department}</td>
                <td className="px-4 py-2 text-sm text-slate-700">{d.usd_budget.toFixed(2)} / {d.usd_consumed.toFixed(2)} / {d.usd_remaining.toFixed(2)}</td>
                <td className="px-4 py-2 text-sm text-slate-700">{d.usd_utilization_pct.toFixed(1)}%</td>
                <td className="px-4 py-2 text-sm text-slate-700">{d.zig_budget.toFixed(2)} / {d.zig_consumed.toFixed(2)} / {d.zig_remaining.toFixed(2)}</td>
                <td className="px-4 py-2 text-sm text-slate-700">{d.zig_utilization_pct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="px-4 py-3 text-sm text-slate-500">Loading budget statistics...</div>}
        {!loading && !error && data && data.departments.length === 0 && <div className="px-4 py-3 text-sm text-slate-500">No budget data found for this year.</div>}
        {error && <div className="px-4 py-3 text-sm text-mars-red">{error}</div>}
      </div>
    </div>
  );
}
