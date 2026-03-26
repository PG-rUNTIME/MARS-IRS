import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import type { RequisitionType, RFQItem, UserRole } from '../data/types';

const TYPES: RequisitionType[] = ['Petty Cash', 'Supplier Payment (Normal)', 'High-Value/CAPEX'];

const CURRENCIES = ['USD', 'ZIG'] as const;

const DEPARTMENTS = [
  'Operations',
  'Logistics',
  'Human Resources',
  'Finance',
  'Administration',
  'Medical/Clinical',
  'Information Technology',
  'Management',
  'Compliance',
];

const emptyItem = (): RFQItem => ({ id: '', order: 1, description: '', quantity: 1, unit: 'Unit' });

export function RFQForm() {
  const { currentUser } = useAuth();
  const { createRFQ } = useApp();
  const navigate = useNavigate();

  const [type, setType] = useState<RequisitionType>('Supplier Payment (Normal)');
  const [description, setDescription] = useState('');
  const [justification, setJustification] = useState('');
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('USD');
  const [amountEstimated, setAmountEstimated] = useState('');
  const [department, setDepartment] = useState(currentUser?.department || 'Operations');
  const [costCenter, setCostCenter] = useState('');
  const [budgetAvailable, setBudgetAvailable] = useState(true);

  const [items, setItems] = useState<RFQItem[]>([emptyItem()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!description.trim()) e.description = 'Description is required.';
    if (!justification.trim()) e.justification = 'Justification is required.';
    if (!department.trim()) e.department = 'Department is required.';
    if (!costCenter.trim()) e.costCenter = 'Cost centre is required.';
    if (items.filter((it) => it.description.trim()).length === 0) e.items = 'At least one item is required.';

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.description.trim()) continue;
      if (!it.quantity || it.quantity <= 0) e[`qty_${i}`] = 'Quantity must be greater than zero.';
      if (!it.unit.trim()) e[`unit_${i}`] = 'Unit is required.';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const lineCount = useMemo(() => items.filter((it) => it.description.trim()).length, [items]);

  const updateItem = (idx: number, patch: Partial<RFQItem>) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch, order: idx + 1 };
      return next;
    });
  };

  const addItem = () => setItems((prev) => [...prev, { ...emptyItem(), order: prev.length + 1 }]);

  const handleSubmit = async () => {
    if (!currentUser) return;
    setSubmitting(true);
    try {
      if (!validate()) return;
      const createdId = await createRFQ(
        {
          type,
          description,
          justification,
          currency,
          amountEstimated: amountEstimated ? Number(amountEstimated) : 0,
          department,
          costCenter,
          budgetAvailable,
          items: items
            .filter((it) => it.description.trim())
            .map((it, idx) => ({ ...it, id: String(idx), order: idx + 1, quantity: it.quantity, unit: it.unit })),
        },
        currentUser,
      );
      navigate(`/rfqs/${createdId}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-slate-900 text-2xl font-semibold">Create RFQ</h1>
        <p className="text-slate-500 text-sm mt-1">Raise a Request for Quotation and hand it over to procurement.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-slate-700 text-sm mb-1.5">RFQ Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as RequisitionType)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-100 focus:border-red-400 transition-all bg-white"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-slate-700 text-sm mb-1.5">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as any)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-100 focus:border-red-400 transition-all bg-white"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-slate-700 text-sm mb-1.5">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full min-h-[90px] px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-100 focus:border-red-400 transition-all bg-white"
          />
          {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description}</p>}
        </div>

        <div>
          <label className="block text-slate-700 text-sm mb-1.5">
            Business justification <span className="text-red-500">*</span>
          </label>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            className="w-full min-h-[90px] px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-100 focus:border-red-400 transition-all bg-white"
          />
          {errors.justification && <p className="text-red-500 text-xs mt-1">{errors.justification}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-slate-700 text-sm mb-1.5">Department</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-100 focus:border-red-400 transition-all bg-white"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            {errors.department && <p className="text-red-500 text-xs mt-1">{errors.department}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className="block text-slate-700 text-sm mb-1.5">
              Cost centre <span className="text-red-500">*</span>
            </label>
            <input
              value={costCenter}
              onChange={(e) => setCostCenter(e.target.value)}
              placeholder="e.g. CC-OPS-001"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-100 focus:border-red-400 transition-all bg-white"
            />
            {errors.costCenter && <p className="text-red-500 text-xs mt-1">{errors.costCenter}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-slate-700 text-sm mb-1.5">Estimated amount (optional)</label>
            <input
              value={amountEstimated}
              onChange={(e) => setAmountEstimated(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-100 focus:border-red-400 transition-all bg-white"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-slate-700 select-none">
              <input
                type="checkbox"
                checked={budgetAvailable}
                onChange={(e) => setBudgetAvailable(e.target.checked)}
              />
              Budget available
            </label>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-slate-900 text-sm font-semibold">Requested items</h2>
            <button
              onClick={addItem}
              className="text-sm px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors"
              type="button"
            >
              + Add item
            </button>
          </div>

          {errors.items && <p className="text-red-500 text-xs">{errors.items}</p>}

          <div className="space-y-3">
            {items.map((it, idx) => (
              <div key={`${idx}-${it.id}`} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-6">
                  <label className="block text-slate-700 text-xs mb-1.5">Item description {idx + 1}</label>
                  <input
                    value={it.description}
                    onChange={(e) => updateItem(idx, { description: e.target.value })}
                    placeholder="e.g. Fuel, repairs, medical supplies"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-100 focus:border-red-400 transition-all bg-white"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-slate-700 text-xs mb-1.5">Quantity</label>
                  <input
                    value={String(it.quantity)}
                    onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) || 1 })}
                    type="number"
                    min={1}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-100 focus:border-red-400 transition-all bg-white"
                  />
                  {errors[`qty_${idx}`] && <p className="text-red-500 text-xs mt-1">{errors[`qty_${idx}`]}</p>}
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-slate-700 text-xs mb-1.5">Unit</label>
                  <input
                    value={it.unit}
                    onChange={(e) => updateItem(idx, { unit: e.target.value })}
                    placeholder="e.g. Litres, Days, Units"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-100 focus:border-red-400 transition-all bg-white"
                  />
                  {errors[`unit_${idx}`] && <p className="text-red-500 text-xs mt-1">{errors[`unit_${idx}`]}</p>}
                </div>
              </div>
            ))}
          </div>

          <p className="text-slate-500 text-xs mt-2">{lineCount} item(s) filled.</p>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          type="button"
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="px-5 py-2.5 rounded-lg text-white font-medium bg-red-600 hover:bg-red-700 transition-all"
          disabled={submitting}
          type="button"
        >
          {submitting ? 'Creating…' : 'Create RFQ'}
        </button>
      </div>
    </div>
  );
}

