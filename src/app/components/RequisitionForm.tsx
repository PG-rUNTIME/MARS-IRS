import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import type { RequisitionType, Currency, SupplierEntry } from '../data/types';
import { Banknote, BarChart3, FileText } from 'lucide-react';

const CURRENCIES: Currency[] = ['USD', 'ZIG'];
const PETTY_CASH_LIMIT = 200;
const MAX_SUPPLIERS = 3;

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

interface LineItem {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}

// Supplier entry with attached file objects (not persisted, converted to dataUrls before save)
interface SupplierDraft extends Omit<SupplierEntry, 'quotationDataUrl' | 'taxClearanceDataUrl' | 'vatCertDataUrl'> {
  quotationFile?: File | null;
  quotationDataUrl?: string;
  taxClearanceFile?: File | null;
  taxClearanceDataUrl?: string;
  vatCertFile?: File | null;
  vatCertDataUrl?: string;
}

function emptySupplier(): SupplierDraft {
  return { name: '', email: '', phone: '', address: '' };
}

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
const emptyLine = (): LineItem => ({ description: '', quantity: '', unit: '', unitPrice: '' });

export function RequisitionForm() {
  const { id: editId } = useParams<{ id: string }>();
  const { currentUser } = useAuth();
  const { requisitions, createRequisition, updateRequisition, submitRequisition } = useApp();
  const navigate = useNavigate();

  // Compute existingDraft only once when the component mounts or editId changes.
  // Do NOT recompute on every render — if requisitions/currentUser briefly change
  // (e.g. when a file picker opens), recomputing would change the useEffect
  // dependency and reset all form state, wiping uploaded files.
  const existingDraftRef = useRef<typeof requisitions[0] | null>(null);
  const draftLoadedRef = useRef(false);

  if (!draftLoadedRef.current && editId && currentUser && requisitions.length > 0) {
    existingDraftRef.current = requisitions.find(
      (r) => r.id === editId && r.status === 'Draft' && r.requesterId === currentUser.id
    ) ?? null;
    draftLoadedRef.current = true;
  }

  const existingDraft = existingDraftRef.current;
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
    if (r.suppliers?.length) {
      setSuppliers(r.suppliers.map((s) => ({ ...s, quotationFile: null, taxClearanceFile: null, vatCertFile: null })));
      setPreferredIdx(r.preferredSupplierIndex ?? 0);
      setPreferredJustification(r.preferredSupplierJustification ?? '');
    }
    if (r.items?.length) {
      setLineItems(r.items.map((it) => ({
        description: it.description,
        quantity: String(it.quantity),
        unit: it.unit,
        unitPrice: String(it.unitPrice),
      })));
    }
    if (r.attachments?.length) setAttachments(r.attachments.map((a) => ({ id: a.id, name: a.name, file: null, dataUrl: a.dataUrl, size: a.size })));
    setStep(2); // when editing, open on step 2 (supplier & documents)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const [type, setType] = useState<RequisitionType>('Petty Cash');
  const [description, setDescription] = useState('');
  const [justification, setJustification] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [department, setDepartment] = useState(currentUser?.department || 'Operations');
  const [costCenter, setCostCenter] = useState('');
  const [budgetAvailable, setBudgetAvailable] = useState(true);
  const [isCapex, setIsCapex] = useState(false);

  // Multi-supplier state
  const [suppliers, setSuppliers] = useState<SupplierDraft[]>([emptySupplier()]);
  const [preferredIdx, setPreferredIdx] = useState(0);
  const [preferredJustification, setPreferredJustification] = useState('');

  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);

  // General attachments (Petty Cash)
  const [attachments, setAttachments] = useState<{ id?: string; name: string; file: File | null; dataUrl?: string; size?: string }[]>([{ name: '', file: null }]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const needsSupplier = type === 'Supplier Payment (Normal)' || type === 'High-Value/CAPEX';

  const lineTotal = lineItems.reduce((sum, it) => {
    const q = parseFloat(it.quantity) || 0;
    const p = parseFloat(it.unitPrice) || 0;
    return sum + q * p;
  }, 0);

  const updateLine = (idx: number, field: keyof LineItem, value: string) => {
    setLineItems((prev) => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next; });
  };

  /** After file upload: update state, blur input so view doesn’t jump, and clamp scroll if past end. In-flow actions = no blank gap. */
  const afterFileUpload = (update: () => void) => {
    update();
    requestAnimationFrame(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      const main = document.querySelector('main');
      if (main) {
        const maxScroll = Math.max(0, main.scrollHeight - main.clientHeight);
        if (main.scrollTop > maxScroll) main.scrollTop = maxScroll;
      }
    });
  };

  const updateSupplier = (idx: number, field: keyof SupplierDraft, value: unknown) => {
    const isFileUpload = value instanceof File;
    const doUpdate = () => setSuppliers((prev) => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next; });
    if (isFileUpload) afterFileUpload(doUpdate);
    else doUpdate();
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!description.trim()) e.description = 'Description is required.';
    if (!justification.trim()) e.justification = 'Business justification is required.';
    if (!costCenter) e.costCenter = 'Cost centre is required.';

    if (needsSupplier) {
      // At least one supplier with a name
      const filledSuppliers = suppliers.filter((s) => s.name.trim());
      if (filledSuppliers.length === 0) e.suppliers = 'At least one supplier is required.';
      if (filledSuppliers.length > 1 && !preferredJustification.trim()) {
        e.preferredJustification = 'Please provide a justification for your preferred supplier.';
      }

      // Line items
      const filledItems = lineItems.filter((it) => it.description.trim());
      if (filledItems.length === 0) {
        e.lineItems = 'At least one line item is required.';
      } else {
        for (let i = 0; i < lineItems.length; i++) {
          const it = lineItems[i];
          if (!it.description.trim()) continue;
          const q = parseFloat(it.quantity);
          const p = parseFloat(it.unitPrice);
          if (!it.quantity || isNaN(q) || q <= 0) e[`line_qty_${i}`] = 'Required';
          if (!it.unitPrice || isNaN(p) || p <= 0) e[`line_price_${i}`] = 'Required';
        }
      }
      if (lineTotal <= 0 && !e.lineItems) e.lineItems = 'Line items total must be greater than zero.';
    } else {
      const amt = parseFloat(amount);
      if (!amount || isNaN(amt) || amt <= 0) e.amount = 'A valid amount is required.';
      if (type === 'Petty Cash' && currency !== 'ZIG' && amt > PETTY_CASH_LIMIT) e.amount = `Petty Cash in USD is limited to $${PETTY_CASH_LIMIT}.`;
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateDraft = (): boolean => {
    const e: Record<string, string> = {};
    if (!description.trim()) e.description = 'Description is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /** Validate step 1 (overview) so we can allow "Continue" to step 2. */
  const validateStep1 = (): boolean => {
    const e: Record<string, string> = {};
    if (!description.trim()) e.description = 'Description is required.';
    if (!justification.trim()) e.justification = 'Business justification is required.';
    if (!costCenter) e.costCenter = 'Cost centre is required.';
    if (!needsSupplier) {
      const amt = parseFloat(amount);
      if (!amount || isNaN(amt) || amt <= 0) e.amount = 'A valid amount is required.';
      if (type === 'Petty Cash' && currency !== 'ZIG' && amt > PETTY_CASH_LIMIT) e.amount = `Petty Cash in USD is limited to $${PETTY_CASH_LIMIT}.`;
    }
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
    // Process general attachments (Petty Cash)
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

    // Process supplier docs
    const processedSuppliers: SupplierEntry[] = await Promise.all(
      suppliers
        .filter((s) => s.name.trim())
        .map(async (s) => {
          const entry: SupplierEntry = { name: s.name, email: s.email, phone: s.phone, address: s.address };
          if (s.quotationFile) { entry.quotationName = s.quotationFile.name; entry.quotationDataUrl = await readFileAsDataUrl(s.quotationFile); entry.quotationSize = `${(s.quotationFile.size / 1024).toFixed(1)} KB`; }
          else if (s.quotationDataUrl) { entry.quotationName = s.quotationName; entry.quotationDataUrl = s.quotationDataUrl; entry.quotationSize = s.quotationSize; }
          if (s.taxClearanceFile) { entry.taxClearanceName = s.taxClearanceFile.name; entry.taxClearanceDataUrl = await readFileAsDataUrl(s.taxClearanceFile); entry.taxClearanceSize = `${(s.taxClearanceFile.size / 1024).toFixed(1)} KB`; }
          else if (s.taxClearanceDataUrl) { entry.taxClearanceName = s.taxClearanceName; entry.taxClearanceDataUrl = s.taxClearanceDataUrl; entry.taxClearanceSize = s.taxClearanceSize; }
          if (s.vatCertFile) { entry.vatCertName = s.vatCertFile.name; entry.vatCertDataUrl = await readFileAsDataUrl(s.vatCertFile); entry.vatCertSize = `${(s.vatCertFile.size / 1024).toFixed(1)} KB`; }
          else if (s.vatCertDataUrl) { entry.vatCertName = s.vatCertName; entry.vatCertDataUrl = s.vatCertDataUrl; entry.vatCertSize = s.vatCertSize; }
          return entry;
        })
    );

    let computedAmount: number;
    let items: { description: string; quantity: number; unit: string; unitPrice: number; lineTotal: number }[] = [];

    if (needsSupplier) {
      items = lineItems
        .filter((it) => it.description.trim())
        .map((it) => {
          const q = parseFloat(it.quantity) || 0;
          const p = parseFloat(it.unitPrice) || 0;
          return { description: it.description.trim(), quantity: q, unit: it.unit.trim() || 'unit', unitPrice: p, lineTotal: q * p };
        });
      computedAmount = items.reduce((s, it) => s + it.lineTotal, 0);
    } else {
      const amt = parseFloat(amount);
      computedAmount = isNaN(amt) || !amount ? 0 : amt;
    }

    // Preferred supplier becomes the primary supplier fields on the requisition
    const preferred = processedSuppliers[preferredIdx] ?? processedSuppliers[0];

    return {
      type,
      description: description.trim(),
      justification: justification.trim(),
      amount: computedAmount,
      currency,
      department,
      costCenter,
      budgetAvailable,
      isCapex,
      supplier: preferred?.name || undefined,
      supplierEmail: preferred?.email || undefined,
      supplierPhone: preferred?.phone || undefined,
      supplierAddress: preferred?.address || undefined,
      suppliers: processedSuppliers.length ? processedSuppliers : undefined,
      preferredSupplierIndex: preferredIdx,
      preferredSupplierJustification: preferredJustification.trim() || undefined,
      items,
      attachments: attachmentList,
    };
  };

  const handleSave = async (andSubmit: boolean) => {
    if (!currentUser) return;
    if (andSubmit && !validate()) return;
    if (!andSubmit && !validateDraft()) return;
    setSubmitting(true);
    try {
      const payload = await buildPayload();
      if (isEditMode && editId) {
        await updateRequisition(editId, payload, currentUser);
        if (andSubmit) await submitRequisition(editId, currentUser);
        navigate(`/requisitions/${editId}`);
        return;
      }
      const reqId = await createRequisition(payload, currentUser);
      if (andSubmit) await submitRequisition(reqId, currentUser);
      navigate(`/requisitions/${reqId}`);
    } catch (err) {
      console.error('Failed to save/submit requisition:', err);
      alert((err as Error).message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-10">
      {/* Single scroll: action bar in-flow at bottom — no fixed footer, no blank gap after file upload */}
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div>
          <h1 className="text-slate-900">{isEditMode ? 'Edit Requisition' : 'New Requisition'}</h1>
          <p className="text-slate-500 text-sm">
            {(!editId || existingDraft) ? `Step ${step} of 2 — ${step === 1 ? 'Overview' : 'Supplier & documents'}` : (isEditMode ? 'Update your draft and save or submit for approval' : 'Complete all required fields before submitting')}
          </p>
        </div>
      </div>

      {editId && !existingDraft && requisitions.some((r) => r.id === editId) && (
        <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-sm text-slate-700">
          This requisition is not a draft or you don't have permission to edit it. <button type="button" onClick={() => navigate(`/requisitions/${editId}`)} className="text-mars-red font-medium hover:underline">View requisition</button>
        </div>
      )}
      {editId && !existingDraft && !requisitions.some((r) => r.id === editId) && (
        <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-sm text-slate-700">
          Requisition not found. <button type="button" onClick={() => navigate('/my-requisitions')} className="text-mars-red font-medium hover:underline">Back to My Requisitions</button>
        </div>
      )}

      {(!editId || existingDraft) && (
        <>
          {/* ─── Step 1: High-level info ───────────────────────────────────────── */}
          {step === 1 && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                <span className="font-medium">Note:</span> Petty Cash in USD is limited to $200; in ZIG there is no limit. For higher USD amounts, select an appropriate requisition type.
              </div>

              <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6" aria-label="Requisition type">
                <h2 className="text-slate-800 font-semibold text-base mb-4">Requisition Type</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {TYPES.map((t) => (
                    <button key={t} type="button" onClick={() => { setType(t); setAmount(''); setErrors({}); }}
                      className={`px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all text-left ${type === t ? 'border-mars-red bg-mars-red-muted text-mars-red-dark' : 'border-border text-muted-foreground hover:border-muted-foreground/50'}`}>
                      <div className="mb-1 text-slate-700">
                        {t === 'Petty Cash' ? (
                          <Banknote className="h-5 w-5" aria-hidden />
                        ) : t === 'Supplier Payment (Normal)' ? (
                          <FileText className="h-5 w-5" aria-hidden />
                        ) : (
                          <BarChart3 className="h-5 w-5" aria-hidden />
                        )}
                      </div>
                      {t}
                    </button>
                  ))}
                </div>
              </section>

              <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-5" aria-label="Core details">
                <h2 className="text-slate-800 font-semibold text-base">Core Details</h2>

                <Field label="Description of Item/Service" required hint="Be specific about what is being requested.">
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                    placeholder={type === 'Petty Cash' ? 'e.g. Office stationery and printer paper' : 'e.g. Supplier invoice for consumables'}
                    className={`${inputCls} resize-none ${errors.description ? 'border-red-400' : ''}`} />
                  {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description}</p>}
                </Field>

                <Field label="Business Justification" required hint="Why is this expenditure necessary?">
                  <textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={3}
                    placeholder="Explain the business need and impact if not approved…"
                    className={`${inputCls} resize-none ${errors.justification ? 'border-red-400' : ''}`} />
                  {errors.justification && <p className="text-red-500 text-xs mt-1">{errors.justification}</p>}
                </Field>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Currency">
                    <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className={inputCls}>
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>

                  {!needsSupplier && (
                    <Field label={`Requested Amount (${currency})`} required>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">{currency === 'ZIG' ? 'ZIG' : '$'}</span>
                        <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                          className={`${inputCls} pl-10 ${errors.amount ? 'border-red-400' : ''}`} />
                      </div>
                      {type === 'Petty Cash' && <p className="text-slate-400 text-xs mt-1">{currency === 'ZIG' ? 'No limit for ZIG.' : `Max: $${PETTY_CASH_LIMIT}.00`}</p>}
                      {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount}</p>}
                    </Field>
                  )}

                  {needsSupplier && (
                    <Field label={`Total Amount (${currency})`} hint="Filled from line items on the next page.">
                      <div className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 bg-slate-50">
                        {currency === 'ZIG' ? 'ZIG ' : '$'}{lineTotal.toFixed(2)}
                      </div>
                    </Field>
                  )}

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
                    <input type="checkbox" checked={budgetAvailable} onChange={(e) => setBudgetAvailable(e.target.checked)} className="w-4 h-4 rounded border-border accent-mars-red" />
                    <span className="text-sm text-slate-700">Budget is available for this expenditure</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={isCapex} onChange={(e) => setIsCapex(e.target.checked)} className="w-4 h-4 rounded border-border accent-mars-red" />
                    <span className="text-sm text-slate-700">This is a Capital Expenditure (CAPEX)</span>
                  </label>
                </div>
              </section>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                <button type="button" onClick={() => navigate(-1)} className="px-5 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
                  Cancel
                </button>
                <button type="button" onClick={() => validateStep1() && setStep(2)} className="px-6 py-2.5 rounded-lg text-white text-sm font-medium bg-mars-red hover:bg-mars-red-dark">
                  {needsSupplier ? 'Continue to supplier & documents' : 'Continue to documents'}
                </button>
              </div>
            </>
          )}

          {/* ─── Step 2: Supplier info, documents, and submit ─────────────────── */}
          {step === 2 && (
            <>
          {/* Line Items — mandatory for non-Petty-Cash */}
          {needsSupplier && (
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6" aria-label="Line items">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-slate-800 font-semibold text-base">Line Items <span className="text-red-500">*</span></h2>
                  <p className="text-slate-500 text-sm mt-0.5">Add all items/services to be procured — used to generate the Purchase Order.</p>
                </div>
                <button type="button" onClick={() => setLineItems((prev) => [...prev, emptyLine()])}
                  className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:border-mars-red/40 hover:bg-mars-red-muted/50 transition-all">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add Row
                </button>
              </div>
              {errors.lineItems && <p className="text-red-500 text-xs mb-3">{errors.lineItems}</p>}
              <div className="grid grid-cols-12 gap-2 mb-2 px-1">
                <div className="col-span-5 text-xs font-medium text-slate-500 uppercase tracking-wide">Description</div>
                <div className="col-span-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Qty</div>
                <div className="col-span-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Unit</div>
                <div className="col-span-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Unit Price</div>
                <div className="col-span-1"></div>
              </div>
              <div className="space-y-2">
                {lineItems.map((item, idx) => {
                  const q = parseFloat(item.quantity) || 0;
                  const p = parseFloat(item.unitPrice) || 0;
                  const total = q * p;
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                      <div className="col-span-5">
                        <input value={item.description} onChange={(e) => updateLine(idx, 'description', e.target.value)} placeholder="Item or service" className={`${inputCls} text-xs py-2`} />
                      </div>
                      <div className="col-span-2">
                        <input type="number" min="0" step="0.01" value={item.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} placeholder="1"
                          className={`${inputCls} text-xs py-2 ${errors[`line_qty_${idx}`] ? 'border-red-400' : ''}`} />
                        {errors[`line_qty_${idx}`] && <p className="text-red-500 text-xs mt-0.5">Required</p>}
                      </div>
                      <div className="col-span-2">
                        <input value={item.unit} onChange={(e) => updateLine(idx, 'unit', e.target.value)} placeholder="unit" className={`${inputCls} text-xs py-2`} />
                      </div>
                      <div className="col-span-2">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">{currency === 'ZIG' ? 'Z' : '$'}</span>
                          <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)} placeholder="0.00"
                            className={`${inputCls} text-xs py-2 pl-5 ${errors[`line_price_${idx}`] ? 'border-red-400' : ''}`} />
                        </div>
                        {errors[`line_price_${idx}`] && <p className="text-red-500 text-xs mt-0.5">Required</p>}
                      </div>
                      <div className="col-span-1 flex items-center justify-end">
                        {lineItems.length > 1 && (
                          <button type="button" onClick={() => setLineItems((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-1.5 rounded text-slate-400 hover:text-mars-red hover:bg-mars-red-muted/30 transition-colors">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        )}
                      </div>
                      {total > 0 && (
                        <div className="col-span-11 text-right text-xs text-slate-500 -mt-1">
                          Line total: {currency === 'ZIG' ? 'ZIG ' : '$'}{total.toFixed(2)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200 flex justify-end">
                <span className="text-sm text-slate-500 mr-3">Grand Total:</span>
                <span className="text-base font-semibold text-slate-900">{currency === 'ZIG' ? 'ZIG ' : '$'}{lineTotal.toFixed(2)}</span>
              </div>
            </section>
          )}

          {/* Supplier Comparison — non-Petty-Cash */}
          {needsSupplier && (
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5" aria-label="Supplier details">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-slate-800 font-semibold text-base">Supplier Details <span className="text-red-500">*</span></h2>
                  <p className="text-slate-500 text-sm mt-0.5">
                    Add up to {MAX_SUPPLIERS} suppliers for comparison. At least one is required. Upload the quotation, tax clearance, and VAT certificate for each supplier.
                  </p>
                </div>
                {suppliers.length < MAX_SUPPLIERS && (
                  <button type="button" onClick={() => setSuppliers((prev) => [...prev, emptySupplier()])}
                    className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:border-mars-red/40 hover:bg-mars-red-muted/50 transition-all">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add Supplier
                  </button>
                )}
              </div>

              {errors.suppliers && <p className="text-red-500 text-xs">{errors.suppliers}</p>}

              <div className="space-y-4">
                {suppliers.map((s, idx) => (
                  <SupplierCard
                    key={idx}
                    index={idx}
                    total={suppliers.length}
                    supplier={s}
                    isPreferred={preferredIdx === idx}
                    onSetPreferred={() => setPreferredIdx(idx)}
                    onChange={(field, value) => updateSupplier(idx, field, value)}
                    onRemove={suppliers.length > 1 ? () => {
                      setSuppliers((prev) => prev.filter((_, i) => i !== idx));
                      setPreferredIdx((prev) => (prev >= idx && prev > 0 ? prev - 1 : prev));
                    } : undefined}
                    readFileAsDataUrl={readFileAsDataUrl}
                  />
                ))}
              </div>

              {/* Preferred supplier justification — only when more than one supplier */}
              {suppliers.filter((s) => s.name.trim()).length > 1 && (
                <div>
                  <Field label="Justification for Preferred Supplier" required hint={`Explain why Supplier ${preferredIdx + 1} (${suppliers[preferredIdx]?.name || '—'}) is the preferred choice.`}>
                    <textarea
                      value={preferredJustification}
                      onChange={(e) => setPreferredJustification(e.target.value)}
                      rows={3}
                      placeholder="e.g. Lowest quoted price, best delivery terms, prior experience with this supplier…"
                      className={`${inputCls} resize-none ${errors.preferredJustification ? 'border-red-400' : ''}`}
                    />
                    {errors.preferredJustification && <p className="text-red-500 text-xs mt-1">{errors.preferredJustification}</p>}
                  </Field>
                </div>
              )}
            </section>
          )}

          {/* Supporting Documents — Petty Cash only */}
          {!needsSupplier && (
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6" aria-label="Supporting documents">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-slate-800 font-semibold text-base">Supporting Documents</h2>
                  <p className="text-slate-500 text-sm mt-1">Upload receipts or authorisation documents (optional).</p>
                </div>
                <button type="button" onClick={() => setAttachments((prev) => [...prev, { name: '', file: null }])}
                  className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:border-mars-red/40 hover:bg-mars-red-muted/50 transition-all">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add Document
                </button>
              </div>
              <div className="max-h-[260px] overflow-y-auto overflow-x-hidden rounded-lg border border-slate-200 bg-slate-50/50 p-2 space-y-2">
                {attachments.map((att, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-white border border-slate-200 shadow-sm min-h-[52px]">
                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-mars-red-muted flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--mars-red)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </div>
                    <input value={att.name}
                      onChange={(e) => setAttachments((prev) => { const next = [...prev]; next[idx] = { ...next[idx], name: e.target.value }; return next; })}
                      placeholder="Document name (optional)" className={`${inputCls} flex-1 min-w-[160px] py-2 text-sm`} />
                    <div className="flex items-center gap-2 shrink-0 min-w-[180px]">
                      <label className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium cursor-pointer hover:border-mars-red/30 hover:bg-mars-red-muted/30 transition-all bg-white min-h-[40px]">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        <span className={att.file ? 'text-green-700 font-medium truncate max-w-[140px]' : 'text-slate-600'}>{att.file ? att.file.name : 'Choose PDF'}</span>
                        {att.file && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                      <input type="file" accept=".pdf,application/pdf" className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file !== undefined) {
                            afterFileUpload(() => setAttachments((prev) => { const next = [...prev]; next[idx] = { ...next[idx], file: file || null }; return next; }));
                          }
                          e.target.value = '';
                        }} />
                      </label>
                      {att.file && (
                        <span className="text-xs text-green-700 font-medium whitespace-nowrap" title={att.file.name}>Attached</span>
                      )}
                    </div>
                    {attachments.length > 1 && (
                      <button type="button" onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                        className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-mars-red hover:bg-mars-red-muted/30 transition-colors">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Actions — step 2 only */}
          <div className="pt-6 mt-2 border-t border-slate-200 bg-slate-50/50 rounded-xl px-4 py-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setStep(1)} className="px-5 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-all inline-flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                Back
              </button>
              <button type="button" onClick={() => navigate(-1)} className="px-5 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-all">
                Cancel
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => handleSave(false)} disabled={submitting}
                className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-white bg-white transition-all disabled:opacity-50">
                Save as Draft
              </button>
              <button type="button" onClick={() => handleSave(true)} disabled={submitting}
                className="px-6 py-2.5 rounded-lg text-white text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2 bg-mars-red hover:bg-mars-red-dark">
                {submitting && <svg className="animate-spin shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>}
                Submit for Approval
              </button>
            </div>
          </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── Supplier Card ─────────────────────────────────────────────────────────────

interface SupplierCardProps {
  index: number;
  total: number;
  supplier: SupplierDraft;
  isPreferred: boolean;
  onSetPreferred: () => void;
  onChange: (field: keyof SupplierDraft, value: unknown) => void;
  onRemove?: () => void;
  readFileAsDataUrl: (file: File) => Promise<string>;
}

const inputClsCard = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 transition-all bg-white';

function DocUpload({ label, fileName, onFile }: { label: string; fileName?: string; onFile: (f: File) => void }) {
  return (
    <div className="min-h-[52px]">
      <p className="text-slate-500 text-xs mb-1">{label}</p>
      <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium cursor-pointer hover:border-mars-red/30 hover:bg-mars-red-muted/20 transition-all bg-white w-full min-h-[36px]">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <span className={`truncate flex-1 text-left ${fileName ? 'text-green-700 font-medium' : ''}`}>
          {fileName ? `Attached: ${fileName}` : 'Upload PDF'}
        </span>
        {fileName && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" className="shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
        )}
        <input type="file" accept=".pdf,application/pdf" className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      </label>
    </div>
  );
}

function SupplierCard({ index, total, supplier, isPreferred, onSetPreferred, onChange, onRemove }: SupplierCardProps) {
  return (
    <div className={`rounded-xl border-2 p-4 transition-all ${isPreferred ? 'border-mars-red bg-mars-red-muted/20' : 'border-slate-200 bg-white'}`}>
      {/* Card header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isPreferred ? 'bg-mars-red text-white' : 'bg-slate-100 text-slate-600'}`}>
            Supplier {index + 1}
          </span>
          {isPreferred && <span className="text-xs text-mars-red font-medium">★ Preferred</span>}
        </div>
        <div className="flex items-center gap-2">
          {total > 1 && !isPreferred && (
            <button type="button" onClick={onSetPreferred}
              className="text-xs px-3 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-mars-red/40 hover:text-mars-red hover:bg-mars-red-muted/30 transition-all">
              Set as Preferred
            </button>
          )}
          {onRemove && (
            <button type="button" onClick={onRemove} className="p-1.5 rounded-lg text-slate-400 hover:text-mars-red hover:bg-mars-red-muted/30 transition-colors" title="Remove supplier">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Contact fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-slate-600 text-xs mb-1">Supplier Name <span className="text-red-500">*</span></label>
          <input value={supplier.name} onChange={(e) => onChange('name', e.target.value)} placeholder="Company name" className={inputClsCard} />
        </div>
        <div>
          <label className="block text-slate-600 text-xs mb-1">Phone</label>
          <input value={supplier.phone} onChange={(e) => onChange('phone', e.target.value)} placeholder="+263 24 000 0000" className={inputClsCard} />
        </div>
        <div>
          <label className="block text-slate-600 text-xs mb-1">Email</label>
          <input type="email" value={supplier.email} onChange={(e) => onChange('email', e.target.value)} placeholder="supplier@email.com" className={inputClsCard} />
        </div>
        <div>
          <label className="block text-slate-600 text-xs mb-1">Address</label>
          <input value={supplier.address} onChange={(e) => onChange('address', e.target.value)} placeholder="Street, City" className={inputClsCard} />
        </div>
      </div>

      {/* Document uploads */}
      <div className="pt-3 border-t border-slate-200/80">
        <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-2">Supporting Documents</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <DocUpload
            label="Quotation"
            fileName={supplier.quotationFile?.name || supplier.quotationName}
            onFile={(f) => onChange('quotationFile', f)}
          />
          <DocUpload
            label="Tax Clearance"
            fileName={supplier.taxClearanceFile?.name || supplier.taxClearanceName}
            onFile={(f) => onChange('taxClearanceFile', f)}
          />
          <DocUpload
            label="VAT Certificate"
            fileName={supplier.vatCertFile?.name || supplier.vatCertName}
            onFile={(f) => onChange('vatCertFile', f)}
          />
        </div>
      </div>
    </div>
  );
}
