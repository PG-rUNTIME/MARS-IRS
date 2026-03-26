import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import type { RFQ, RFQQuote, RFQItem, RequisitionType, Supplier } from '../data/types';
import { fetchSuppliers } from '../api/client';
import { formatDateTime } from './shared/StatusBadge';

type RFQQuoteDraft = {
  supplierId: string;
  quoteNotes: string;
  quoteValidUntil?: string;
  items: Array<{ rfqItemId: string; unitPrice: number; lineTotal: number }>;
  documents: Array<{ id?: string; name: string; type: string; size: string; uploadedBy: string; dataUrl?: string }>;
};

function RFQStatusTag({ status }: { status: RFQ['status'] }) {
  const cls =
    status === 'Draft'
      ? 'bg-slate-100 text-slate-600'
      : status === 'Pending Procurement'
        ? 'bg-amber-100 text-amber-700'
        : status === 'Pending Requester Selection'
          ? 'bg-purple-100 text-purple-700'
          : status === 'Converted'
            ? 'bg-green-100 text-green-700'
            : 'bg-slate-100 text-slate-500';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{status}</span>;
}

export function RFQDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { rfqs, loadRFQDetail, submitRFQ, uploadRFQQuotes, completeRFQQuotes, convertRFQToRequisition } = useApp();

  const rfq = useMemo(() => rfqs.find((r) => r.id === id), [rfqs, id]);

  useEffect(() => {
    if (id) loadRFQDetail(id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [selectionJustification, setSelectionJustification] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const isRequester = !!currentUser?.roles.includes('Requester');
  const isProcurement = !!currentUser?.roles.includes('Procurement Clerk');

  const [quoteDrafts, setQuoteDrafts] = useState<RFQQuoteDraft[]>([]);
  const [approvedSuppliers, setApprovedSuppliers] = useState<Supplier[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error('Failed to read file'));
      r.readAsDataURL(file);
    });

  useEffect(() => {
    if (!isProcurement || !rfq || rfq.status !== 'Pending Procurement') return;
    fetchSuppliers({ page_size: '500', status: 'active' })
      .then((res) => {
        const mapped = (res.results || []).map((s: any) => ({
          id: String(s.id),
          name: s.name || '',
          category: s.category || 'Other',
          physicalAddress: s.physical_address || '',
          contactEmail: s.contact_email || '',
          contactPerson: s.contact_person || '',
          active: !!s.active,
          suspended: !!s.suspended,
          createdAt: s.created_at || '',
          updatedAt: s.updated_at || '',
        }));
        setApprovedSuppliers(mapped.filter((s) => s.active && !s.suspended));
      })
      .catch(() => setApprovedSuppliers([]));
  }, [isProcurement, rfq]);

  useEffect(() => {
    if (!rfq) return;
    if (rfq.status !== 'Pending Procurement') return;
    // Initialize draft quotes once we have the RFQ items.
    if (quoteDrafts.length === 0) {
      setQuoteDrafts([
        {
          supplierId: '',
          quoteNotes: '',
          quoteValidUntil: undefined,
          items: rfq.items.map((it) => ({ rfqItemId: it.id, unitPrice: 0, lineTotal: 0 })),
          documents: [],
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfq]);

  const requestedItems = rfq?.items ?? [];

  const computeQuoteTotal = (draft: RFQQuoteDraft) => draft.items.reduce((sum, it) => sum + (Number(it.lineTotal) || 0), 0);

  const updateDraftItem = (quoteIdx: number, itemIdx: number, patch: Partial<RFQQuoteDraft['items'][number]>) => {
    setQuoteDrafts((prev) => {
      const next = [...prev];
      const q = next[quoteIdx];
      const item = q.items[itemIdx];
      const rfqItem = rfq?.items.find((x) => x.id === item.rfqItemId);
      const qty = rfqItem?.quantity ?? 1;
      const unitPrice = patch.unitPrice !== undefined ? patch.unitPrice : item.unitPrice;
      const lineTotal = patch.lineTotal !== undefined ? patch.lineTotal : qty * unitPrice;
      q.items[itemIdx] = { ...item, ...patch, unitPrice, lineTotal };
      next[quoteIdx] = { ...q };
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!id || !currentUser || !isRequester || !rfq) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await submitRFQ(id, currentUser);
      // RFQ list refresh is handled by AppContext loadAll on navigation.
      navigate(`/rfqs/${id}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to submit RFQ.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadQuotes = async () => {
    if (!id || !currentUser || !rfq || !isProcurement) return;
    setUploading(true);
    setErrors({});
    setActionError(null);
    try {
      if (!quoteDrafts.length) {
        setErrors({ quotes: 'At least one supplier quote is required.' });
        return false;
      }
      if (quoteDrafts.some((q) => !q.supplierId)) {
        setErrors({ quotes: 'Select an approved supplier for each quote.' });
        return false;
      }
      const payloadQuotes = quoteDrafts.map((qd) => ({
        supplier_id: Number(qd.supplierId),
        supplier_bank_name: '',
        supplier_bank_account_name: '',
        supplier_bank_account_number: '',
        supplier_bank_branch: '',
        quote_currency: rfq.currency,
        quote_total_amount: computeQuoteTotal(qd),
        quote_notes: qd.quoteNotes,
        quote_valid_until: qd.quoteValidUntil || null,
        items: qd.items.map((it) => {
          const reqItem = rfq.items.find((x) => x.id === it.rfqItemId);
          const quantity = reqItem?.quantity ?? 1;
          const unit = reqItem?.unit ?? 'Unit';
          return {
            rfq_item_id: Number(it.rfqItemId),
            description: reqItem?.description ?? '',
            quantity,
            unit,
            unit_price: it.unitPrice,
            line_total: it.lineTotal,
          };
        }),
        documents: qd.documents.map((d) => ({
          name: d.name,
          type: d.type,
          size: d.size,
          uploaded_by: d.uploadedBy,
          data_url: d.dataUrl || '',
          is_quote_document: true,
        })),
      }));

      await uploadRFQQuotes(id, payloadQuotes, currentUser);
      return true;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to upload supplier quotes.');
      return false;
    } finally {
      setUploading(false);
    }
  };

  const handleCompleteQuotes = async () => {
    if (!id || !currentUser || !rfq || !isProcurement) return;
    setCompleting(true);
    setActionError(null);
    try {
      const uploaded = await handleUploadQuotes();
      if (!uploaded) return;
      await completeRFQQuotes(id, currentUser);
      navigate(`/rfqs/${id}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to mark RFQ complete.');
      // Refresh in case backend rejected due to status mismatch (idempotent transition).
      loadRFQDetail(id).catch(() => {});
    } finally {
      setCompleting(false);
    }
  };

  const requesterQuotes = (rfq?.quotes ?? []).slice().sort((a, b) => Number(a.id) - Number(b.id));

  const handleConvert = async () => {
    if (!id || !currentUser || !rfq || !isRequester || !selectedQuoteId) return;
    if (!selectionJustification.trim()) {
      setActionError('Please provide a justification for selecting this supplier quote.');
      return;
    }
    setActionError(null);
    try {
      const reqId = await convertRFQToRequisition(id, selectedQuoteId, selectionJustification.trim(), currentUser);
      if (reqId) navigate(`/requisitions/${reqId}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to convert RFQ to requisition.');
    }
  };

  if (!rfq) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="text-slate-400 text-5xl mb-4">🔍</div>
        <div className="text-slate-600 font-medium">RFQ not found</div>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-mars-red hover:underline">
          ← Go back
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {actionError}
        </div>
      )}
      <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-slate-900">{rfq.rfqNumber}</h1>
              <RFQStatusTag status={rfq.status} />
              <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">{rfq.type}</span>
            </div>
            <p className="text-slate-500 text-sm mt-1">{rfq.department || '—'} · {rfq.costCenter || '—'}</p>
          </div>
        </div>
        <div className="text-slate-500 text-sm">
          Created: {rfq.events?.[0]?.timestamp ? formatDateTime(rfq.events[0].timestamp) : (rfq.submittedAt ? formatDateTime(rfq.submittedAt) : formatDateTime(rfq.convertedAt || rfq.procurementCompletedAt || new Date().toISOString()))}
        </div>
      </div>

      {/* RFQ details (always visible to the requester) */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-3">
        <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
          <div>
            <h2 className="text-slate-900 font-semibold text-lg">RFQ Details</h2>
            <p className="text-slate-600 text-sm mt-1">
              Requester: {rfq.requesterName || rfq.requesterEmail || rfq.requesterId}
            </p>
          </div>
          {rfq.convertedRequisitionNumber && (
            <div className="text-sm text-slate-600">
              Converted requisition: <span className="font-semibold text-slate-900">{rfq.convertedRequisitionNumber}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wide">Department</div>
            <div className="text-slate-800 text-sm">{rfq.department || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wide">Cost Center</div>
            <div className="text-slate-800 text-sm">{rfq.costCenter || '—'}</div>
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wide">Description</div>
          <div className="text-slate-800 text-sm whitespace-pre-wrap">{rfq.description || '—'}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wide">Justification</div>
          <div className="text-slate-800 text-sm whitespace-pre-wrap">{rfq.justification || '—'}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wide">Selected Supplier</div>
          <div className="text-slate-800 text-sm whitespace-pre-wrap">{rfq.selectedSupplierName || '—'}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wide">Supplier Selection Justification</div>
          <div className="text-slate-800 text-sm whitespace-pre-wrap">{rfq.selectedSupplierJustification || '—'}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wide">Estimated Amount</div>
          <div className="text-slate-800 text-sm">
            {rfq.amountEstimated?.toFixed(2) || '0.00'} {rfq.currency}
          </div>
        </div>
      </div>

      {/* RFQ Chain (organized like requisition approval chain) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-slate-800 mb-4 text-sm font-semibold uppercase tracking-wide">RFQ Chain</h3>

        {(() => {
          const eventsSorted = (rfq.events || [])
            .slice()
            .sort((a, b) => (a.order - b.order) || (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
          const initiatorEvent = eventsSorted[0];
          const submittedToProcurement = eventsSorted.find((e) => e.label.toLowerCase().includes('submitted to procurement'));
          const sourcingDone = eventsSorted.find((e) => e.status === 'Pending Requester Selection');
          const conversionDone = eventsSorted.find((e) => e.status === 'Converted');

          type ChainStatus = 'done' | 'pending' | 'active';
          const sourcingStatus: ChainStatus =
            rfq.status === 'Draft' ? 'pending' : rfq.status === 'Pending Procurement' ? 'active' : 'done';
          const selectionStatus: ChainStatus =
            rfq.status === 'Pending Requester Selection' ? 'active' : rfq.status === 'Converted' ? 'done' : 'pending';
          const conversionStatus: ChainStatus = rfq.status === 'Converted' ? 'done' : 'pending';

          const steps = [
            {
              id: 'sourcing',
              role: 'Procurement Clerk',
              title: 'Supplier Sourcing',
              actionText: sourcingDone ? 'Supplier quotations uploaded and sourcing completed' : 'Awaiting supplier sourcing and quotation upload',
              status: sourcingStatus,
              timestamp: sourcingDone?.timestamp || submittedToProcurement?.timestamp,
              actorName: sourcingDone?.actorName || submittedToProcurement?.actorName || '',
              actorRole: sourcingDone?.actorRole || submittedToProcurement?.actorRole || 'Procurement Clerk',
            },
            {
              id: 'selection',
              role: 'Requester',
              title: 'Supplier Selection',
              actionText: rfq.selectedQuoteId
                ? `Selected supplier: ${rfq.selectedSupplierName || '—'}${rfq.selectedSupplierJustification ? `; justification: ${rfq.selectedSupplierJustification}` : ''}`
                : 'Awaiting requester supplier selection',
              status: selectionStatus,
              timestamp: conversionDone?.timestamp,
              actorName: conversionDone?.actorName || '',
              actorRole: conversionDone?.actorRole || 'Requester',
            },
            {
              id: 'conversion',
              role: 'System',
              title: 'RFQ Conversion',
              actionText: conversionDone?.label || 'Convert RFQ into requisition',
              status: conversionStatus,
              timestamp: conversionDone?.timestamp,
              actorName: conversionDone?.actorName || '',
              actorRole: conversionDone?.actorRole || 'System',
            },
          ] as const;

          return (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />
              <div className="space-y-4">
                {/* Initiator */}
                <div className="flex items-start gap-3 relative">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 bg-blue-100 border-2 border-blue-300 text-blue-700">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="text-slate-800 text-sm font-medium">{initiatorEvent?.actorName || rfq.requesterName || rfq.requesterId}</div>
                    <div className="text-slate-400 text-xs">
                      Initiator ({initiatorEvent?.actorRole || 'Requester'}) · {rfq.status === 'Draft' ? 'Draft' : 'Submitted'}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full shrink-0 mt-1 bg-slate-100 text-slate-600 font-medium">
                    {rfq.status === 'Draft' ? 'Draft' : rfq.status}
                  </span>
                </div>

                {steps.map((step) => {
                  const isDone = step.status === 'done';
                  const isActive = step.status === 'active';
                  const isPending = step.status === 'pending';

                  const pill =
                    isDone
                      ? 'bg-green-100 text-green-700'
                      : isActive
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-500';

                  const icon = isDone
                    ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="9 11 12 14 22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                    )
                    : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    );

                  return (
                    <div
                      key={step.id}
                      className={`flex items-start gap-3 relative rounded-lg transition-all ${isActive ? 'bg-amber-50 border border-amber-200 p-2 -mx-2' : ''}`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 border-2 ${isActive ? 'bg-amber-100 border-amber-400 text-amber-700' : isDone ? 'bg-green-100 border-green-300 text-green-700' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
                        {icon}
                      </div>
                      <div className="flex-1 pt-1 min-w-0">
                        <div className={`text-sm font-medium ${isActive ? 'text-amber-900' : 'text-slate-800'}`}>
                          {step.title}
                        </div>
                        <div className="text-slate-500 text-xs">{step.actionText}</div>
                        <div className="text-slate-400 text-xs">{step.role}</div>
                        {isDone && (
                          <div className="text-slate-500 text-xs">
                            Done by {step.actorName || '—'} ({step.actorRole || step.role})
                          </div>
                        )}
                        {isActive && <div className="text-amber-700 text-xs font-medium mt-0.5">Action required now</div>}
                        {isPending && <div className="text-slate-400 text-xs">Pending previous action</div>}
                        {step.timestamp && isDone && (
                          <div className="text-slate-400 text-xs mt-1">{formatDateTime(step.timestamp)}</div>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 mt-1 font-medium ${pill}`}>
                        {isActive ? 'Pending' : isDone ? 'Done' : 'Pending'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Requested items */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-3">
        <h2 className="text-slate-900 font-semibold text-lg">Requested Items</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Item</th>
                <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Qty</th>
                <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rfq.items.map((it) => (
                <tr key={it.id}>
                  <td className="px-4 py-3 text-slate-800 text-sm">{it.description}</td>
                  <td className="px-4 py-3 text-slate-700 text-sm">{it.quantity}</td>
                  <td className="px-4 py-3 text-slate-700 text-sm">{it.unit}</td>
                </tr>
              ))}
              {rfq.items.length === 0 && (
                <tr>
                  <td className="px-4 py-5 text-slate-500 text-sm" colSpan={3}>No items</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Supplier quotes summary */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-3">
        <h2 className="text-slate-900 font-semibold text-lg">Supplier Quotes</h2>
        {rfq.quotes.length === 0 ? (
          <div className="text-slate-500 text-sm">No supplier quotes uploaded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Supplier</th>
                  <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Total</th>
                  <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {requesterQuotes.map((q) => (
                  <tr key={q.id} className="align-top">
                    <td className="px-4 py-3 text-slate-800 text-sm font-medium">{q.supplierName}</td>
                    <td className="px-4 py-3 text-slate-700 text-sm whitespace-nowrap">{q.quoteTotalAmount.toFixed(2)} {rfq.currency}</td>
                    <td className="px-4 py-3 text-slate-600 text-sm">
                      <div className="max-w-[420px] truncate">{q.quoteNotes || '—'}</div>
                      <div className="mt-2 text-xs text-slate-500 space-y-0.5">
                        <div>Supplier Name: <span className="text-slate-700">{q.supplierName || '—'}</span></div>
                        <div>Contact Person: <span className="text-slate-700">{q.supplierContact || '—'}</span></div>
                        <div>Email: <span className="text-slate-700">{q.supplierEmail || '—'}</span></div>
                        <div>Phone: <span className="text-slate-700">{q.supplierPhone || '—'}</span></div>
                        <div>Address: <span className="text-slate-700">{q.supplierAddress || '—'}</span></div>
                      </div>
                      {q.attachments && q.attachments.length > 0 && (
                        <div className="mt-3">
                          <div className="text-slate-500 text-xs font-medium uppercase tracking-wide">Documents</div>
                          <div className="mt-2 space-y-2">
                            {q.attachments
                              .filter((a) => !!a.dataUrl)
                              .map((a) => (
                                <a
                                  key={a.id}
                                  href={a.dataUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  download={a.name || 'quotation-document'}
                                  className="block text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                  Download: {a.name}
                                </a>
                              ))}
                            {q.attachments.filter((a) => !!a.dataUrl).length === 0 && (
                              <div className="text-slate-400 text-xs">Documents are stored but not viewable via data URL.</div>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rfq.status === 'Draft' && isRequester && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 flex items-center justify-between gap-4 flex-col sm:flex-row">
          <div>
            <div className="text-slate-900 font-semibold">Send RFQ to procurement</div>
            <div className="text-slate-600 text-sm mt-1">Procurement clerk will upload supplier quotes for the requested items.</div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2.5 rounded-lg text-white font-medium bg-red-600 hover:bg-red-700 transition-all"
          >
            {submitting ? 'Sending…' : 'Send to procurement'}
          </button>
        </div>
      )}

      {rfq.status === 'Pending Procurement' && isProcurement && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
              <div>
                <h2 className="text-slate-900 font-semibold">Upload supplier quotations</h2>
                <p className="text-slate-600 text-sm mt-1">Provide supplier details and the quoted unit prices for each requested item.</p>
              </div>
              <div className="text-slate-500 text-sm">
                Items requested: <span className="font-medium text-slate-800">{requestedItems.length}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Item</th>
                    <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Qty</th>
                    <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {requestedItems.map((it) => (
                    <tr key={it.id}>
                      <td className="px-4 py-3 text-slate-800 text-sm">{it.description}</td>
                      <td className="px-4 py-3 text-slate-700 text-sm">{it.quantity}</td>
                      <td className="px-4 py-3 text-slate-700 text-sm">{it.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {quoteDrafts.map((qd, qIdx) => (
            <div key={qIdx} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-col sm:flex-row">
                <div>
                  <h3 className="text-slate-900 font-semibold">Supplier quote {qIdx + 1}</h3>
                  <p className="text-slate-600 text-sm mt-1">Select approved supplier and fill quoted prices.</p>
                </div>
                <div className="text-sm text-slate-600">
                  Total: <span className="font-semibold text-slate-900">{computeQuoteTotal(qd).toFixed(2)}</span> {rfq.currency}
                </div>
              </div>

              <div>
                <label className="block text-slate-700 text-xs mb-1.5">Approved supplier</label>
                <select
                  value={qd.supplierId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setQuoteDrafts((prev) => {
                      const next = [...prev];
                      next[qIdx] = { ...next[qIdx], supplierId: v };
                      return next;
                    });
                  }}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-100 focus:border-red-400 transition-all bg-white"
                >
                  <option value="">Select supplier...</option>
                  {approvedSuppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                  ))}
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Item</th>
                      <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Unit price</th>
                      <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Line total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {qd.items.map((it, itemIdx) => {
                      const reqItem = rfq.items.find((x) => x.id === it.rfqItemId);
                      if (!reqItem) return null;
                      return (
                        <tr key={it.rfqItemId}>
                          <td className="px-4 py-3 text-slate-800 text-sm">
                            {reqItem.description} <span className="text-slate-400 text-xs">({reqItem.quantity} {reqItem.unit})</span>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={String(it.unitPrice)}
                              onChange={(e) => updateDraftItem(qIdx, itemIdx, { unitPrice: Number(e.target.value) || 0 })}
                              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-100 focus:border-red-400 transition-all bg-white"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={String(it.lineTotal)}
                              onChange={(e) => updateDraftItem(qIdx, itemIdx, { lineTotal: Number(e.target.value) || 0 })}
                              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-100 focus:border-red-400 transition-all bg-white"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-slate-700 text-xs mb-1.5">Quote notes (optional)</label>
                  <textarea
                    value={qd.quoteNotes}
                    onChange={(e) => {
                      const v = e.target.value;
                      setQuoteDrafts((prev) => {
                        const next = [...prev];
                        next[qIdx] = { ...next[qIdx], quoteNotes: v };
                        return next;
                      });
                    }}
                    className="w-full min-h-[70px] px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-100 focus:border-red-400 transition-all bg-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 text-xs mb-1.5">Valid until (optional)</label>
                    <input
                      value={qd.quoteValidUntil || ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setQuoteDrafts((prev) => {
                          const next = [...prev];
                          next[qIdx] = { ...next[qIdx], quoteValidUntil: v || undefined };
                          return next;
                        });
                      }}
                      type="date"
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-100 focus:border-red-400 transition-all bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 text-xs mb-1.5">Quotation document(s)</label>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      multiple
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        e.target.value = '';
                        if (!files.length) return;
                        const docs = await Promise.all(
                          files.map(async (f) => ({
                            name: f.name,
                            type: f.type || 'application/pdf',
                            size: `${(f.size / 1024).toFixed(1)} KB`,
                            uploadedBy: currentUser?.name || '',
                            dataUrl: await readFileAsDataUrl(f),
                          })),
                        );
                        setQuoteDrafts((prev) => {
                          const next = [...prev];
                          next[qIdx] = { ...next[qIdx], documents: [...next[qIdx].documents, ...docs] };
                          return next;
                        });
                      }}
                      className="block w-full text-sm text-slate-700"
                    />
                    {qd.documents.length > 0 && (
                      <p className="text-slate-500 text-xs mt-1">{qd.documents.length} file(s) selected.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {errors.quotes && <p className="text-red-500 text-sm">{errors.quotes}</p>}

          <div className="flex justify-end gap-3 flex-col sm:flex-row">
            <button
              onClick={() => {
                setQuoteDrafts((prev) => [
                  ...prev,
                  {
                    supplierName: '',
                    supplierContact: '',
                    supplierEmail: '',
                    supplierPhone: '',
                    supplierAddress: '',
                    quoteNotes: '',
                    quoteValidUntil: undefined,
                    items: (rfq.items || []).map((it) => ({ rfqItemId: it.id, unitPrice: 0, lineTotal: 0 })),
                    documents: [],
                  },
                ]);
              }}
              className="px-4 py-2.5 border border-slate-200 rounded-lg text-slate-700 bg-white hover:bg-slate-50 transition-colors"
              type="button"
            >
              + Add another supplier quote
            </button>

            <button
              onClick={handleCompleteQuotes}
              disabled={completing || uploading}
              className="px-5 py-2.5 rounded-lg text-white font-medium bg-slate-900 hover:bg-slate-800 transition-all"
              type="button"
            >
              {uploading ? 'Uploading…' : completing ? 'Completing…' : 'Mark RFQ complete'}
            </button>
          </div>
        </div>
      )}

      {rfq.status === 'Pending Requester Selection' && isRequester && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
            <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
              <div>
                <h2 className="text-slate-900 font-semibold">Select supplier quote</h2>
                <p className="text-slate-600 text-sm mt-1">Choose the supplier quotation to convert the RFQ into a requisition.</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Select</th>
                  <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Supplier</th>
                  <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Total</th>
                  <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {requesterQuotes.map((q: RFQQuote) => (
                  <tr key={q.id}>
                    <td className="px-4 py-3">
                      <input
                        type="radio"
                        name="selectedQuote"
                        checked={selectedQuoteId === q.id}
                        onChange={() => setSelectedQuoteId(q.id)}
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-800 text-sm font-medium">{q.supplierName}</td>
                    <td className="px-4 py-3 text-slate-700 text-sm">{q.quoteTotalAmount.toFixed(2)} {rfq.currency}</td>
                    <td className="px-4 py-3 text-slate-600 text-sm">
                      <div className="max-w-[320px] truncate">{q.quoteNotes || '—'}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {requesterQuotes.length === 0 && <p className="text-slate-500 text-sm mt-3">No quotes uploaded yet.</p>}
          </div>

          {selectedQuoteId && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              {(() => {
                const q = requesterQuotes.find((x) => x.id === selectedQuoteId);
                if (!q) return null;
                return (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
                      <div>
                        <h3 className="text-slate-900 font-semibold">Selected quote: {q.supplierName}</h3>
                        <p className="text-slate-600 text-sm mt-1">Quote total: {q.quoteTotalAmount.toFixed(2)} {rfq.currency}</p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50">
                            <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Item</th>
                            <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Qty</th>
                            <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Unit price</th>
                            <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">Line total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {q.items.map((it) => {
                            const reqItem = rfq.items.find((x) => x.id === it.rfqItemId);
                            return (
                              <tr key={it.id}>
                                <td className="px-4 py-3 text-slate-800 text-sm">{reqItem?.description || it.description}</td>
                                <td className="px-4 py-3 text-slate-700 text-sm">{it.quantity}</td>
                                <td className="px-4 py-3 text-slate-700 text-sm">{it.unitPrice.toFixed(2)}</td>
                                <td className="px-4 py-3 text-slate-700 text-sm">{it.lineTotal.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div>
                      <label className="block text-slate-700 text-sm mb-1.5">
                        Selection justification <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={selectionJustification}
                        onChange={(e) => setSelectionJustification(e.target.value)}
                        placeholder="Why is this supplier the preferred option?"
                        className="w-full min-h-[90px] px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-100 focus:border-red-400 transition-all bg-white"
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={handleConvert}
              disabled={!selectedQuoteId}
              className="px-5 py-2.5 rounded-lg text-white font-medium bg-red-600 hover:bg-red-700 transition-all"
              type="button"
            >
              Convert to requisition
            </button>
          </div>
        </div>
      )}

      {rfq.status === 'Converted' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 text-slate-700">
          This RFQ has already been converted into a requisition.
        </div>
      )}

      {!isRequester && !isProcurement && (
        <div className="bg-mars-red-muted border border-mars-red-muted border-opacity-50 rounded-xl p-5 text-sm text-mars-red-dark">
          Your account does not have access to RFQ processing.
        </div>
      )}
    </div>
  );
}

