import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { StatusBadge, formatCurrency, formatDate, formatDateTime } from './shared/StatusBadge';
import { canDoFinanceActions, canViewFinanceNotes, getPrimaryRole } from '../data/roleCapabilities';
import { exportToExcel, exportToWord } from '../utils/exportUtils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileSpreadsheet, FileText } from 'lucide-react';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h3 className="text-slate-800 mb-4 pb-3 border-b border-slate-100">{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className="text-slate-500 text-sm w-44 shrink-0">{label}</span>
      <span className="text-slate-800 text-sm flex-1">{value || '—'}</span>
    </div>
  );
}

const STEP_COLORS: Record<string, string> = {
  Approved: 'bg-green-100 border-green-300 text-green-700',
  Rejected: 'bg-mars-red-muted border-mars-red/40 text-mars-red-dark',
  Delegated: 'bg-blue-100 border-blue-300 text-blue-700',
  Pending: 'bg-slate-100 border-slate-200 text-slate-500',
  Skipped: 'bg-slate-50 border-slate-200 text-slate-400',
};

const STEP_ICONS: Record<string, React.ReactNode> = {
  Approved: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
  Rejected: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Pending: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Delegated: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>,
};


export function RequisitionDetail() {
  const { id } = useParams<{ id: string }>();
  const { currentUser } = useAuth();
  const { requisitions, purchaseOrders, approveStep, rejectRequisition, returnRejectedToDraft, cancelRequisition, addComment, markAsPaid, uploadProofOfPayment, generatePO, submitRequisition } = useApp();
  const navigate = useNavigate();

  const [approveComment, setApproveComment] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [comment, setComment] = useState('');
  const [isFinanceNote, setIsFinanceNote] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDelegateModal, setShowDelegateModal] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const req = requisitions.find((r) => r.id === id);

  if (!currentUser) return null;
  if (!req) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="text-slate-400 text-5xl mb-4">🔍</div>
        <div className="text-slate-600 font-medium">Requisition not found</div>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-mars-red hover:underline">← Go back</button>
      </div>
    );
  }

  const isCurrentApprover = req.currentApproverRole != null && currentUser.roles.includes(req.currentApproverRole) && ['Submitted', 'Pending Review', 'Pending Approval'].includes(req.status);
  const isRequester = req.requesterId === currentUser.id;
  const canCancel = isRequester && ['Draft', 'Submitted'].includes(req.status);
  const canFinanceAction = canDoFinanceActions(currentUser.roles);
  const canViewFinanceNotesFlag = canViewFinanceNotes(currentUser.roles);
  const isAuditor = currentUser.roles.includes('Auditor');

  const handleApprove = async () => {
    setLoading('approve');
    setActionError(null);
    try {
      await approveStep(req.id, currentUser, approveComment);
      setShowApproveModal(false);
      setApproveComment('');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Approval failed. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setLoading('reject');
    setActionError(null);
    try {
      await rejectRequisition(req.id, currentUser, rejectReason);
      setShowRejectModal(false);
      setRejectReason('');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Rejection failed. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    setLoading('comment');
    await addComment(req.id, comment, isFinanceNote, currentUser);
    setComment('');
    setLoading(null);
  };

  const handleMarkPaid = async () => {
    setLoading('paid');
    await markAsPaid(req.id, currentUser);
    setLoading(null);
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error('Failed to read file'));
      r.readAsDataURL(file);
    });

  const handleUploadPOP = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    e.target.value = '';
    setLoading('pop');
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const popAttachment = {
        id: `pop-${Date.now()}`,
        name: file.name,
        type: file.type || 'application/pdf',
        size: `${(file.size / 1024).toFixed(1)} KB`,
        uploadedBy: currentUser.name,
        uploadedAt: new Date().toISOString(),
        dataUrl,
      };
      await uploadProofOfPayment(req.id, popAttachment, currentUser);
    } finally {
      setLoading(null);
    }
  };

  const handleCancel = async () => {
    await cancelRequisition(req.id, currentUser);
    setShowCancelModal(false);
  };

  const visibleComments = req.comments.filter((c) => {
    if (c.isFinanceNote && !canViewFinanceNotesFlag) return false;
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-slate-900">{req.reqNumber}</h1>
              <StatusBadge status={req.status} />
              {req.isCapex && <span className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-700 font-medium">CAPEX</span>}
            </div>
            <p className="text-slate-500 text-sm mt-0.5">{req.type} · {req.department}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {req.poGenerated && req.poNumber && (() => {
            const linkedPO = purchaseOrders.find((po) => po.requisitionId === req.id);
            return (
              <button
                onClick={() => navigate('/purchase-orders', { state: linkedPO ? { openPoId: linkedPO.id } : undefined })}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-all"
              >
                📄 View PO: {req.poNumber}
              </button>
            );
          })()}
          {isRequester && req.status === 'Draft' && (
            <>
              <button
                onClick={() => navigate(`/requisitions/${req.id}/edit`)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition-all"
              >
                ✏️ Edit Draft
              </button>
              <button
                onClick={() => void submitRequisition(req.id, currentUser)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-mars-red hover:bg-mars-red-dark transition-all"
              >
                Submit for Approval
              </button>
            </>
          )}
          {isRequester && req.status === 'Rejected' && (
            <button
              onClick={() => void returnRejectedToDraft(req.id, currentUser).then(() => navigate(`/requisitions/${req.id}/edit`))}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-mars-red hover:bg-mars-red-dark transition-all"
            >
              ✏️ Edit and resubmit
            </button>
          )}
          {canCancel && !isAuditor && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-mars-red/40 text-mars-red hover:bg-mars-red-muted transition-all"
            >
              Cancel Requisition
            </button>
          )}
        </div>
      </div>

      {/* Action Error */}
      {actionError && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4 flex items-start gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg>
          <span className="text-red-700 text-sm">{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-auto text-red-400 hover:text-red-600 shrink-0">✕</button>
        </div>
      )}

      {/* Approval Actions */}
      {isCurrentApprover && !isAuditor && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg>
            <span className="text-amber-800 font-medium text-sm">This requisition requires your approval ({getPrimaryRole(currentUser.roles)})</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setShowApproveModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-medium bg-green-600 hover:bg-green-700 transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Approve
            </button>
            <button
              onClick={() => setShowRejectModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-medium bg-mars-red hover:bg-mars-red-dark transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Reject
            </button>
            <button
              onClick={() => setShowDelegateModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border border-slate-300 text-slate-600 hover:bg-slate-50 transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
              Delegate
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-5">
          <Section title="Requisition Details">
            <InfoRow label="Requisition Number" value={<span className="font-mono font-medium">{req.reqNumber}</span>} />
            <InfoRow label="Type" value={req.type} />
            <InfoRow label="Department" value={req.department} />
            <InfoRow label="Cost Centre" value={req.costCenter} />
            <InfoRow label="Currency" value={req.currency} />
            <InfoRow label="Requested Amount" value={<span className="font-bold text-slate-900 text-base">{formatCurrency(req.amount, req.currency)}</span>} />
            <InfoRow label="Budget Available" value={req.budgetAvailable ? <span className="text-green-600">✓ Confirmed</span> : <span className="text-mars-red">Not confirmed</span>} />
            <InfoRow label="CAPEX" value={req.isCapex ? <span className="text-orange-600 font-medium">Yes – Capital Expenditure</span> : 'No'} />
            <InfoRow label="Submitted By" value={`${req.requesterName} (${req.requesterEmail})`} />
            <InfoRow label="Created" value={formatDateTime(req.createdAt)} />
            {req.submittedAt && <InfoRow label="Submitted" value={formatDateTime(req.submittedAt)} />}
            {req.paidAt && <InfoRow label="Paid" value={formatDateTime(req.paidAt)} />}
          </Section>

          <Section title="Description & Justification">
            <div className="mb-4">
              <div className="text-slate-500 text-xs uppercase tracking-wide mb-1.5">Description</div>
              <div className="text-slate-800 text-sm leading-relaxed">{req.description}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs uppercase tracking-wide mb-1.5">Business Justification</div>
              <div className="text-slate-800 text-sm leading-relaxed">{req.justification}</div>
            </div>
          </Section>

          {(req.supplier || req.supplierEmail) && (
            <Section title="Supplier Details">
              <InfoRow label="Supplier Name" value={req.supplier} />
              <InfoRow label="Contact Person" value={req.supplierContact} />
              <InfoRow label="Email" value={req.supplierEmail} />
              <InfoRow label="Phone" value={req.supplierPhone} />
              <InfoRow label="Address" value={req.supplierAddress} />
            </Section>
          )}

          {/* Line Items */}
          {req.items && req.items.length > 0 && (
            <Section title="Line Items">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left pb-2 text-slate-500 text-xs font-medium">Description</th>
                      <th className="text-right pb-2 text-slate-500 text-xs font-medium">Qty</th>
                      <th className="text-left pb-2 text-slate-500 text-xs font-medium">Unit</th>
                      <th className="text-right pb-2 text-slate-500 text-xs font-medium">Unit Price</th>
                      <th className="text-right pb-2 text-slate-500 text-xs font-medium">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {req.items.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2.5 text-sm text-slate-700">{item.description}</td>
                        <td className="py-2.5 text-sm text-slate-700 text-right">{item.quantity}</td>
                        <td className="py-2.5 text-sm text-slate-700">{item.unit}</td>
                        <td className="py-2.5 text-sm text-slate-700 text-right">{formatCurrency(item.unitPrice, req.currency)}</td>
                        <td className="py-2.5 text-sm text-slate-800 font-medium text-right">{formatCurrency(item.lineTotal, req.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200">
                      <td colSpan={4} className="pt-3 text-right text-slate-600 font-medium text-sm">Total:</td>
                      <td className="pt-3 text-right text-slate-900 font-bold">{formatCurrency(req.amount, req.currency)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Section>
          )}

          {/* Attachments – visible throughout requisition lifecycle to anyone who can view this requisition */}
          <Section title={`Supporting Documents (${req.attachments.length})`}>
            <p className="text-slate-500 text-xs mb-3">Uploaded by requester; visible to all viewers throughout the lifecycle.</p>
            {req.attachments.length === 0 ? (
              <p className="text-slate-400 text-sm">No documents attached.</p>
            ) : (
              <div className="space-y-2">
                {req.attachments.map((att) => (
                  <div key={att.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-slate-300 transition-all">
                    <div className="w-8 h-8 rounded-lg bg-mars-red-muted flex items-center justify-center shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mars-red)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-800 text-sm font-medium truncate">{att.name}</div>
                      <div className="text-slate-400 text-xs">{att.type} · {att.size} · uploaded by {att.uploadedBy}</div>
                    </div>
                    {att.dataUrl ? (
                      <a
                        href={att.dataUrl}
                        download={att.name.replace(/[^a-zA-Z0-9.-]/g, '_') || 'document.pdf'}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-mars-red/30 bg-mars-red-muted text-mars-red-dark text-xs font-medium hover:bg-mars-red/10 transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Download
                      </a>
                    ) : (
                      <span className="text-slate-400 text-xs shrink-0">PDF</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Payment processing: View PO + Upload Proof of Payment (accountant) */}
          {req.status === 'Pending Payment' && canFinanceAction && (
            <Section title="Payment Processing">
              <p className="text-slate-600 text-sm mb-4">Process payment outside the system, then upload proof of payment below. The requisition will be marked as Paid once POP is uploaded.</p>
              {req.poGenerated && req.poNumber && (() => {
                const linkedPO = purchaseOrders.find((po) => po.requisitionId === req.id);
                return (
                  <div className="mb-4">
                    <a
                      href="#"
                      onClick={(e) => { e.preventDefault(); navigate('/purchase-orders', { state: linkedPO ? { openPoId: linkedPO.id } : undefined }); }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-all"
                    >
                      📄 View Purchase Order: {req.poNumber}
                    </a>
                  </div>
                );
              })()}
              <div>
                <label className="block text-slate-700 text-sm mb-1.5">Upload Proof of Payment</label>
                <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 text-sm cursor-pointer hover:bg-slate-50 transition-all bg-white">
                  {loading === 'pop' ? (
                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  )}
                  {loading === 'pop' ? 'Uploading…' : 'Choose file (PDF or image)'}
                  <input
                    type="file"
                    accept=".pdf,application/pdf,image/*"
                    className="sr-only"
                    onChange={handleUploadPOP}
                    disabled={loading === 'pop'}
                  />
                </label>
                <p className="text-slate-400 text-xs mt-1">Upload POP to mark this requisition as Paid.</p>
              </div>
            </Section>
          )}

          {/* Proof of Payment (when paid) */}
          {req.proofOfPayment && (
            <Section title="Proof of Payment">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-slate-800 text-sm font-medium">{req.proofOfPayment.name}</div>
                  <div className="text-slate-400 text-xs">Uploaded by {req.proofOfPayment.uploadedBy} · {req.proofOfPayment.uploadedAt ? formatDateTime(req.proofOfPayment.uploadedAt) : ''}</div>
                </div>
                {req.proofOfPayment.dataUrl && (
                  <a
                    href={req.proofOfPayment.dataUrl}
                    download={req.proofOfPayment.name.replace(/[^a-zA-Z0-9.-]/g, '_') || 'proof-of-payment.pdf'}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-300 bg-green-50 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download POP
                  </a>
                )}
              </div>
            </Section>
          )}

          {/* Comments */}
          <Section title="Comments & Notes">
            <div className="space-y-3 mb-5">
              {visibleComments.length === 0 ? (
                <p className="text-slate-400 text-sm">No comments yet.</p>
              ) : (
                visibleComments.map((c) => (
                  <div key={c.id} className={`p-4 rounded-lg border ${c.isFinanceNote ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold bg-mars-red">
                        {c.userName.split(' ').map((n) => n[0]).join('')}
                      </div>
                      <div>
                        <span className="text-slate-800 text-sm font-medium">{c.userName}</span>
                        <span className="text-slate-400 text-xs ml-2">{c.userRole}</span>
                        {c.isFinanceNote && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Finance Note</span>}
                      </div>
                      <span className="text-slate-400 text-xs ml-auto">{formatDateTime(c.timestamp)}</span>
                    </div>
                    <p className="text-slate-700 text-sm">{c.text}</p>
                  </div>
                ))
              )}
            </div>
            {!isAuditor && (
              <div className="space-y-3">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  placeholder="Add a comment or query…"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-red-300 transition-all resize-none"
                />
                <div className="flex items-center justify-between">
                  {canViewFinanceNotesFlag && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={isFinanceNote} onChange={(e) => setIsFinanceNote(e.target.checked)} className="accent-amber-500" />
                      <span className="text-sm text-slate-600">Mark as Finance Note (internal)</span>
                    </label>
                  )}
                  <button
                    onClick={handleAddComment}
                    disabled={!comment.trim() || loading === 'comment'}
                    className="px-4 py-2 rounded-lg text-white text-sm font-medium transition-all disabled:opacity-50 ml-auto bg-mars-red hover:bg-mars-red-dark"
                  >
                    Post Comment
                  </button>
                </div>
              </div>
            )}
          </Section>

          {/* Audit Log */}
          {req.auditLog.length > 0 && (
            <Section title="Requisition Activity Log">
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-slate-500 text-xs">All changes for this requisition — who did it and when</p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const headers = ['Timestamp', 'Action', 'User', 'Role', 'Details'];
                      const rows = req.auditLog.map((e) => [formatDateTime(e.timestamp), e.action, e.userName, e.userRole, e.details]);
                      exportToExcel(headers, rows, `audit_${req.reqNumber}`);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs hover:bg-slate-50"
                  >
                    <FileSpreadsheet className="size-3.5" />
                    Export Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                      doc.setFontSize(14);
                      doc.text(`Activity Log: ${req.reqNumber}`, 14, 16);
                      doc.setFontSize(9);
                      doc.text(`Requisition: ${req.reqNumber} | Generated: ${new Date().toLocaleString()}`, 14, 22);
                      const headers = ['Timestamp', 'Action', 'User', 'Role', 'Details'];
                      const body = req.auditLog.map((e) => [formatDateTime(e.timestamp), e.action, e.userName, e.userRole, e.details]);
                      autoTable(doc, {
                        startY: 28,
                        head: [headers],
                        body,
                        theme: 'grid',
                        headStyles: { fillColor: [12, 35, 64], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
                        bodyStyles: { fontSize: 7 },
                        margin: { left: 14, right: 14 },
                      });
                      doc.save(`audit_${req.reqNumber}.pdf`);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs hover:bg-slate-50"
                  >
                    <FileText className="size-3.5" />
                    Export PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const headers = ['Timestamp', 'Action', 'User', 'Role', 'Details'];
                      const rows = req.auditLog.map((e) => [formatDateTime(e.timestamp), e.action, e.userName, e.userRole, e.details]);
                      exportToWord(`Activity Log – ${req.reqNumber}`, headers, rows, `audit_${req.reqNumber}`);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs hover:bg-slate-50"
                  >
                    Export Word
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {req.auditLog.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                    <div className="w-2 h-2 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-slate-800 text-sm font-medium">{entry.action}</span>
                      <span className="text-slate-500 text-sm"> — {entry.userName}</span>
                      <div className="text-slate-400 text-xs mt-0.5">{entry.details}</div>
                    </div>
                    <span className="text-slate-400 text-xs shrink-0">{formatDateTime(entry.timestamp)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-5">
          {/* Approval Chain */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-slate-800 mb-4 text-sm font-semibold uppercase tracking-wide">Approval Chain</h3>
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />
              <div className="space-y-4">
                {/* Initiator */}
                <div className="flex items-start gap-3 relative">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 bg-blue-100 border-2 border-blue-300 text-blue-700">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="text-slate-800 text-sm font-medium">{req.requesterName}</div>
                    <div className="text-slate-400 text-xs">Initiator · {req.submittedAt ? formatDate(req.submittedAt) : 'Draft'}</div>
                  </div>
                </div>
                {req.approvalChain.map((step, idx) => (
                  <div key={step.id} className="flex items-start gap-3 relative">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 border-2 ${STEP_COLORS[step.status]}`}>
                      {STEP_ICONS[step.status] || STEP_ICONS.Pending}
                    </div>
                    <div className="flex-1 pt-1 min-w-0">
                      {step.status === 'Pending' ? (
                        <>
                          <div className="text-slate-800 text-sm font-medium">Awaiting {step.label} approval</div>
                          <div className="text-slate-500 text-xs">Visible to users with this role</div>
                        </>
                      ) : (
                        <>
                          <div className="text-slate-800 text-sm font-medium">
                            {step.status === 'Approved' ? (step.approverName ? `Approved by ${step.approverName}` : `Approved by ${step.label}`) : step.label}
                          </div>
                          {step.status === 'Approved' && <div className="text-slate-500 text-xs">{step.label}</div>}
                          {step.timestamp && <div className="text-slate-400 text-xs">{formatDate(step.timestamp)}</div>}
                          {step.comments && step.comments !== 'Approved.' && (
                            <div className="text-slate-600 text-xs mt-1 italic">"{step.comments}"</div>
                          )}
                        </>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 mt-1 font-medium ${
                      step.status === 'Approved' ? 'bg-green-100 text-green-700' :
                      step.status === 'Rejected' ? 'bg-mars-red-muted text-mars-red-dark' :
                      step.status === 'Pending' ? 'bg-slate-100 text-slate-500' :
                      'bg-blue-100 text-blue-700'
                    }`}>{step.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Info */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-slate-800 mb-3 text-sm font-semibold uppercase tracking-wide">Quick Info</h3>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-xs">Status</span>
                <StatusBadge status={req.status} size="xs" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-xs">Amount</span>
                <span className="text-slate-800 text-sm font-bold">{formatCurrency(req.amount, req.currency)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-xs">Type</span>
                <span className="text-slate-700 text-xs">{req.type}</span>
              </div>
              {req.type !== 'Petty Cash' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-xs">Awaiting</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{req.currentApproverRole || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-xs">PO</span>
                    <span className={`text-xs font-medium ${req.poGenerated ? 'text-green-600' : 'text-slate-400'}`}>
                      {req.poGenerated ? req.poNumber : 'Not generated'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-slate-800 mb-1">Approve Requisition</h3>
            <p className="text-slate-500 text-sm mb-4">{req.reqNumber} – {req.description}</p>
            <div className="mb-4">
              <label className="block text-slate-700 text-sm mb-1.5">Comments (optional)</label>
              <textarea
                value={approveComment}
                onChange={(e) => setApproveComment(e.target.value)}
                rows={3}
                placeholder="Add any comments or conditions…"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-400 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowApproveModal(false)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-slate-600 text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={handleApprove} disabled={loading === 'approve'} className="flex-1 px-4 py-2.5 rounded-lg text-white text-sm font-medium bg-green-600 hover:bg-green-700 transition-all">
                {loading === 'approve' ? 'Approving…' : 'Confirm Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-slate-800 mb-1">Reject Requisition</h3>
            <p className="text-slate-500 text-sm mb-4">{req.reqNumber} – {req.description}</p>
            <div className="mb-4">
              <label className="block text-slate-700 text-sm mb-1.5">Reason for Rejection <span className="text-red-500">*</span></label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                placeholder="Provide a clear reason for rejection so the requester can take appropriate action…"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-red-400 resize-none"
              />
              {!rejectReason.trim() && <p className="text-red-500 text-xs mt-1">Rejection reason is required.</p>}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowRejectModal(false)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-slate-600 text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={handleReject} disabled={loading === 'reject' || !rejectReason.trim()} className="flex-1 px-4 py-2.5 rounded-lg text-white text-sm font-medium bg-mars-red hover:bg-mars-red-dark transition-all disabled:opacity-50">
                {loading === 'reject' ? 'Rejecting…' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-slate-800 mb-1">Cancel Requisition</h3>
            <p className="text-slate-500 text-sm mb-4">Are you sure you want to cancel {req.reqNumber}? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowCancelModal(false)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-slate-600 text-sm hover:bg-slate-50">Keep</button>
              <button onClick={handleCancel} className="flex-1 px-4 py-2.5 rounded-lg text-white text-sm font-medium bg-mars-red hover:bg-mars-red-dark">Cancel Requisition</button>
            </div>
          </div>
        </div>
      )}

      {/* Delegate Modal */}
      {showDelegateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-slate-800 mb-1">Delegate Approval</h3>
            <p className="text-slate-500 text-sm mb-4">Delegating approval for {req.reqNumber}. This action will be fully logged in the audit trail.</p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 mb-4">
              Delegation feature is available in the full system. Please contact the System Administrator to configure a formal delegation.
            </div>
            <button onClick={() => setShowDelegateModal(false)} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-slate-600 text-sm hover:bg-slate-50">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
