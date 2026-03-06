import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import type { RequisitionType, Currency } from '../data/types';

const CURRENCIES: Currency[] = ['USD', 'ZIG'];
const PETTY_CASH_LIMIT = 200;

const TYPES: RequisitionType[] = ['Petty Cash', 'Supplier Payment (Normal)', 'High-Value/CAPEX'];

const DEPARTMENTS = ['Operations', 'Logistics', 'Human Resources', 'Finance', 'Administration', 'Medical/Clinical', 'Information Technology', 'Management', 'Compliance'];

const COST_CENTERS: Record<string, string[]> = {
  Operations: ['CC-OPS-001', 'CC-OPS-002', 'CC-OPS-003', 'CC-MED-001', 'CC-MED-002'],
  Logistics: ['CC-LOG-001', 'CC-LOG-002', 'CC-LOG-003'],
  'Human Resources': ['CC-HR-001', 'CC-HR-002'],
  Finance: ['CC-FIN-001', 'CC-FIN-002'],
  Administration: ['CC-ADM-001', 'CC-ADM-002'],
  'Medical/Clinical': ['CC-MED-001', 'CC-MED-002'],
  'Information Technology': ['CC-IT-001'],
  Management: ['CC-MGT-001'],
  Compliance: ['CC-COMP-001'],
};

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-slate-700 text-sm mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-slate-400 text-xs mt-1">{hint}</p>}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 transition-all bg-white';

export function RequisitionForm() {
  const { id: editId } = useParams<{ id: string }>();
  const { currentUser } = useAuth();
  const { requisitions, createRequisition, updateRequisition, submitRequisition } = useApp();
  const navigate = useNavigate();

  const existingDraft = editId ? requisitions.find((r) => r.id === editId && r.status === 'Draft' && r.requesterId === currentUser?.id) : null;
  const isEditMode = Boolean(editId && existingDraft);

  useEffect(() => {
    if (!existingDraft) return;
    const r = existingDraft;
    setType(r.type);
    setDescription(r.description);
    setJustification(r.justification);
    setAmount(String(r.amount));
    setCurrency(r.currency as Currency);
    setDepartment(r.department);
    setCostCenter(r.costCenter);
    setBudgetAvailable(r.budgetAvailable);
    setIsCapex(r.isCapex);
    setSupplier(r.supplier ?? '');
    setSupplierEmail(r.supplierEmail ?? '');
    setSupplierPhone(r.supplierPhone ?? '');
    setSupplierAddress(r.supplierAddress ?? '');
    setSupplierContact(r.supplierContact ?? '');
    if (r.attachments?.length) setAttachments(r.attachments.map((a) => ({ id: a.id, name: a.name, file: null, dataUrl: a.dataUrl, size: a.size })));
  }, [editId, existingDraft?.id]);

  const [type, setType] = useState<RequisitionType>('Petty Cash');
  const [description, setDescription] = useState('');
  const [justification, setJustification] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [department, setDepartment] = useState(currentUser?.department || 'Operations');
  const [costCenter, setCostCenter] = useState('');
  const [budgetAvailable, setBudgetAvailable] = useState(true);
  const [isCapex, setIsCapex] = useState(false);

  // Supplier
  const [supplier, setSupplier] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [supplierContact, setSupplierContact] = useState('');

  // Attachments: optional document name + optional PDF file; dataUrl for download, id when editing
  const [attachments, setAttachments] = useState<{ id?: string; name: string; file: File | null; dataUrl?: string; size?: string }[]>([{ name: '', file: null }]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!description.trim()) e.description = 'Description is required.';
    if (!justification.trim()) e.justification = 'Business justification is required.';
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) e.amount = 'A valid amount is required.';
    if (type === 'Petty Cash' && currency !== 'ZIG' && amt > PETTY_CASH_LIMIT) e.amount = `Petty Cash requisitions in USD are limited to $${PETTY_CASH_LIMIT}.`;
    if (!costCenter) e.costCenter = 'Cost centre is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateDraft = (): boolean => {
    const e: Record<string, string> = {};
    if (!description.trim()) e.description = 'Description is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error('Failed to read file'));
      r.readAsDataURL(file);
    });

  const buildPayload = async () => {
    const filtered = attachments.filter((a) => a.name.trim() || a.file);
    const attachmentList = await Promise.all(
      filtered.map(async (a, i) => {
        let dataUrl: string | undefined = a.dataUrl;
        if (a.file) dataUrl = await readFileAsDataUrl(a.file);
        return {
          id: a.id ?? `att-new-${i}`,
          name: a.name.trim() || a.file?.name || 'Document',
          type: 'PDF' as const,
          size: a.file ? `${(a.file.size / 1024).toFixed(1)} KB` : (a.size ?? '—'),
          uploadedBy: currentUser!.name,
          uploadedAt: new Date().toISOString(),
          ...(dataUrl && { dataUrl }),
        };
      })
    );
    const amt = parseFloat(amount);
    return {
      type,
      description: description.trim(),
      justification: justification.trim(),
      amount: isNaN(amt) || !amount ? 0 : amt,
      currency,
      department,
      costCenter,
      budgetAvailable,
      isCapex,
      supplier: supplier || undefined,
      supplierEmail: supplierEmail || undefined,
      supplierPhone: supplierPhone || undefined,
      supplierAddress: supplierAddress || undefined,
      supplierContact: supplierContact || undefined,
      attachments: attachmentList,
    };
  };

  const handleSave = async (andSubmit: boolean) => {
    if (!currentUser) return;
    if (isEditMode) {
      if (andSubmit && !validate()) return;
      if (!andSubmit && !validateDraft()) return;
    } else {
      if (!validate()) return;
    }
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 300));

    const payload = await buildPayload();

    if (isEditMode && editId) {
      updateRequisition(editId, payload, currentUser);
      if (andSubmit) submitRequisition(editId, currentUser);
      setSubmitting(false);
      navigate(`/requisitions/${editId}`);
      return;
    }

    const reqId = createRequisition(payload, currentUser);
    if (andSubmit) submitRequisition(reqId, currentUser);
    setSubmitting(false);
    navigate(`/requisitions/${reqId}`);
  };

  const needsSupplier = type === 'Supplier Payment (Normal)' || type === 'High-Value/CAPEX';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div>
          <h1 className="text-slate-900">{isEditMode ? 'Edit Requisition' : 'New Requisition'}</h1>
          <p className="text-slate-500 text-sm">{isEditMode ? 'Update your draft and save or submit for approval' : 'Complete all required fields before submitting'}</p>
        </div>
      </div>

      {editId && !existingDraft && requisitions.some((r) => r.id === editId) && (
        <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-sm text-slate-700">
          This requisition is not a draft or you don’t have permission to edit it. <button type="button" onClick={() => navigate(`/requisitions/${editId}`)} className="text-mars-red font-medium hover:underline">View requisition</button>
        </div>
      )}

      {editId && !existingDraft && !requisitions.some((r) => r.id === editId) && (
        <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-sm text-slate-700">
          Requisition not found. <button type="button" onClick={() => navigate('/my-requisitions')} className="text-mars-red font-medium hover:underline">Back to My Requisitions</button>
        </div>
      )}

      {(!editId || existingDraft) && (
        <>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <span className="font-medium">Note:</span> Petty Cash in USD is limited to $200; in ZIG there is no limit. For higher USD amounts, select an appropriate requisition type.
      </div>

      {/* Type Selection */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-slate-800 mb-4">Requisition Type</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => { setType(t); setAmount(''); setErrors({}); }}
              className={`px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all text-left ${
                type === t ? 'border-mars-red bg-mars-red-muted text-mars-red-dark' : 'border-border text-muted-foreground hover:border-muted-foreground/50'
              }`}
            >
              <div className="text-xl mb-1">
                {t === 'Petty Cash' ? '💵' : t === 'Supplier Payment (Normal)' ? '📄' : '📊'}
              </div>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Core Details */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        <h3 className="text-slate-800">Core Details</h3>

        <Field label="Description of Item/Service" required hint="Be specific about what is being requested.">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder={type === 'Petty Cash' ? 'e.g. Office stationery and printer paper' : type === 'Supplier Payment (Normal)' ? 'e.g. Supplier invoice for consumables' : 'e.g. Capital equipment or high-value procurement'}
            className={`${inputCls} resize-none ${errors.description ? 'border-red-400' : ''}`}
          />
          {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description}</p>}
        </Field>

        <Field label="Business Justification" required hint="Why is this expenditure necessary?">
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={3}
            placeholder="Explain the business need and impact if not approved…"
            className={`${inputCls} resize-none ${errors.justification ? 'border-red-400' : ''}`}
          />
          {errors.justification && <p className="text-red-500 text-xs mt-1">{errors.justification}</p>}
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Currency">
            <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className={inputCls}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label={`Requested Amount (${currency})`} required>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">{currency === 'ZIG' ? 'ZIG' : '$'}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={`${inputCls} pl-10 ${errors.amount ? 'border-red-400' : ''}`}
              />
            </div>
            {type === 'Petty Cash' && <p className="text-slate-400 text-xs mt-1">{currency === 'ZIG' ? 'No limit for ZIG.' : `Max: $${PETTY_CASH_LIMIT}.00`}</p>}
            {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount}</p>}
          </Field>

          <Field label="Department" required>
            <select value={department} onChange={(e) => { setDepartment(e.target.value); setCostCenter(''); }} className={inputCls}>
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>

          <Field label="Cost Centre" required>
            <select value={costCenter} onChange={(e) => setCostCenter(e.target.value)} className={`${inputCls} ${errors.costCenter ? 'border-red-400' : ''}`}>
              <option value="">Select cost centre…</option>
              {(COST_CENTERS[department] || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {errors.costCenter && <p className="text-red-500 text-xs mt-1">{errors.costCenter}</p>}
          </Field>
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={budgetAvailable}
              onChange={(e) => setBudgetAvailable(e.target.checked)}
              className="w-4 h-4 rounded border-border accent-mars-red"
            />
            <span className="text-sm text-slate-700">Budget is available for this expenditure</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isCapex}
              onChange={(e) => setIsCapex(e.target.checked)}
              className="w-4 h-4 rounded border-border accent-mars-red"
            />
            <span className="text-sm text-slate-700">This is a Capital Expenditure (CAPEX)</span>
          </label>
        </div>
      </div>

      {/* Supplier Details */}
      {needsSupplier && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h3 className="text-slate-800">Supplier Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Supplier Name">
              <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Company name" className={inputCls} />
            </Field>
            <Field label="Contact Person">
              <input value={supplierContact} onChange={(e) => setSupplierContact(e.target.value)} placeholder="Name" className={inputCls} />
            </Field>
            <Field label="Email Address">
              <input type="email" value={supplierEmail} onChange={(e) => setSupplierEmail(e.target.value)} placeholder="user email" className={inputCls} />
            </Field>
            <Field label="Phone Number">
              <input value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} placeholder="+263 24 000 0000" className={inputCls} />
            </Field>
            <Field label="Physical Address">
              <input value={supplierAddress} onChange={(e) => setSupplierAddress(e.target.value)} placeholder="Street, City" className={`${inputCls} md:col-span-2`} />
            </Field>
          </div>
        </div>
      )}

      {/* Supporting Documents (optional PDF upload + document name) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-slate-800">Supporting Documents</h3>
            <p className="text-slate-400 text-xs mt-0.5">Optional: add document name and/or upload a PDF (e.g. quotation, tax clearance).</p>
          </div>
          <button
            onClick={() => setAttachments((prev) => [...prev, { name: '', file: null }])}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300 transition-all"
          >
            + Add Document
          </button>
        </div>
        <div className="space-y-3">
          {attachments.map((att, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-slate-100 bg-slate-50/50">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-mars-red-muted flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mars-red)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <input
                value={att.name}
                onChange={(e) => setAttachments((prev) => { const next = [...prev]; next[idx] = { ...next[idx], name: e.target.value }; return next; })}
                placeholder="Document name (optional)"
                className={`${inputCls} flex-1 min-w-[180px]`}
              />
              <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm cursor-pointer hover:bg-slate-100 transition-all bg-white">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                {att.file ? att.file.name : 'Choose PDF (optional)'}
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setAttachments((prev) => { const next = [...prev]; next[idx] = { ...next[idx], file: file || null }; return next; });
                  }}
                />
              </label>
              {attachments.length > 1 && (
                <button type="button" onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))} className="text-mars-red hover:text-mars-red-dark p-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pb-8">
        <button
          onClick={() => navigate(-1)}
          className="px-5 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all"
        >
          Cancel
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleSave(false)}
            disabled={submitting}
            className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            Save as Draft
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={submitting}
            className="px-6 py-2.5 rounded-lg text-white text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-2 bg-mars-red hover:bg-mars-red-dark"
          >
            {submitting && <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>}
            Submit for Approval
          </button>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
