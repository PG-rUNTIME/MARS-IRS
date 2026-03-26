import { useEffect, useMemo, useState } from 'react';
import { fetchBudgets, saveBudget } from '../api/client';
import { useApp } from '../context/AppContext';

type BudgetRow = {
  id: number;
  year: number;
  department: string;
  usd_budget: string;
  zig_budget: string;
};

export function BudgetManagement() {
  const { users } = useApp();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [department, setDepartment] = useState('');
  const [usdBudget, setUsdBudget] = useState('');
  const [zigBudget, setZigBudget] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchBudgets(year);
      setRows(data as BudgetRow[]);
    } catch {
      setError('Failed to load department budgets.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [year]);

  const totalUsd = useMemo(() => rows.reduce((s, r) => s + Number(r.usd_budget || 0), 0), [rows]);
  const totalZig = useMemo(() => rows.reduce((s, r) => s + Number(r.zig_budget || 0), 0), [rows]);
  const departmentOptions = useMemo(() => {
    const fromUsers = users
      .map((u) => (u.department || '').trim())
      .filter(Boolean);
    const fromBudgets = rows
      .map((r) => (r.department || '').trim())
      .filter(Boolean);
    const all = Array.from(new Set([...fromUsers, ...fromBudgets]));
    all.sort((a, b) => a.localeCompare(b));
    return all;
  }, [users, rows]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await saveBudget({
        year,
        department: department.trim(),
        usd_budget: Number(usdBudget || 0),
        zig_budget: Number(zigBudget || 0),
      });
      setMessage('Budget saved successfully.');
      setDepartment('');
      setUsdBudget('');
      setZigBudget('');
      await load();
    } catch {
      setError('Failed to save budget. Confirm all fields are valid.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-slate-900">Annual Budget Setup</h1>
        <p className="text-slate-500 text-sm">Configure per-department USD and ZIG budgets (Financial Controller).</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-600 mb-1">Year</label>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || new Date().getFullYear()))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-600 mb-1">Department</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              required
            >
              <option value="" disabled>
                Select department
              </option>
              {departmentOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            {departmentOptions.length === 0 && (
              <p className="mt-1 text-xs text-amber-700">
                No departments found yet. Add users with departments first.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">USD Budget</label>
            <input type="number" min="0" step="0.01" value={usdBudget} onChange={(e) => setUsdBudget(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" required />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">ZIG Budget</label>
            <input type="number" min="0" step="0.01" value={zigBudget} onChange={(e) => setZigBudget(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" required />
          </div>
          <div className="md:col-span-5">
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-mars-red text-white text-sm font-medium disabled:opacity-60">
              {saving ? 'Saving…' : 'Save Budget'}
            </button>
          </div>
        </form>
        {message && <div className="mt-3 text-sm text-emerald-700">{message}</div>}
        {error && <div className="mt-3 text-sm text-mars-red">{error}</div>}
      </div>

      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-slate-800">Configured Budgets</h3>
          <div className="text-xs text-slate-500">Year {year} · USD {totalUsd.toFixed(2)} · ZIG {totalZig.toFixed(2)}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Department</th>
                <th className="px-4 py-2">USD Budget</th>
                <th className="px-4 py-2">ZIG Budget</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="px-4 py-2 text-sm text-slate-800">{r.department}</td>
                  <td className="px-4 py-2 text-sm text-slate-700">{Number(r.usd_budget).toFixed(2)}</td>
                  <td className="px-4 py-2 text-sm text-slate-700">{Number(r.zig_budget).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="px-4 py-3 text-sm text-slate-500">Loading budgets...</div>}
          {!loading && rows.length === 0 && <div className="px-4 py-3 text-sm text-slate-500">No budgets configured for this year yet.</div>}
        </div>
      </div>
    </div>
  );
}
