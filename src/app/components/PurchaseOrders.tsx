import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate, formatDateTime } from './shared/StatusBadge';
import type { PurchaseOrder } from '../data/types';
import { FileText } from 'lucide-react';

const LINE_HEIGHT = 5;
const HALF = 0.5;
const MARS_LOGO_URL = '/blue.png';

async function loadLogoDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => reject(new Error('Failed to read logo blob'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function downloadPOAsPDF(po: PurchaseOrder) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.getPageWidth();
  const margin = 14;
  const colWidth = (pageW - 2 * margin - 8) / 2; // Buyer and Supplier columns
  let y = 20;

  // Helper: draw right-aligned text
  const textRight = (str: string, xMax: number, yPos: number, fontSize?: number) => {
    if (fontSize != null) doc.setFontSize(fontSize);
    const w = doc.getTextWidth(str);
    doc.text(str, xMax - w, yPos);
  };

  // Helper: wrap text and return line count
  const wrapText = (str: string, maxW: number): string[] => doc.splitTextToSize(str || '—', maxW);

  // Header
  doc.setFillColor(12, 35, 64); // mars-navy
  doc.rect(0, 0, pageW, 36, 'F');
  doc.setTextColor(255, 255, 255);
  const logoDataUrl = await loadLogoDataUrl(MARS_LOGO_URL);
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', margin, 6, 24, 24, undefined, 'FAST');
    } catch {
      // non-fatal: continue without image if PDF runtime cannot decode it
    }
  }
  const leftHeaderW = pageW * HALF - margin - 4;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  const buyerLines = wrapText(po.buyerCompany, leftHeaderW);
  doc.text(buyerLines, margin + 28, 12);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const subLines = wrapText('Emergency Medical Services', leftHeaderW);
  doc.text(subLines, margin + 28, 12 + buyerLines.length * LINE_HEIGHT);
  const addrLines = wrapText(po.buyerAddress, leftHeaderW);
  doc.text(addrLines, margin + 28, 12 + (buyerLines.length + subLines.length) * LINE_HEIGHT);
  // Right-aligned PO block
  doc.setFontSize(8);
  textRight('PURCHASE ORDER', pageW - margin, 10);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  textRight(po.poNumber, pageW - margin, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  textRight(`Date: ${formatDate(po.date)}`, pageW - margin, 24);
  textRight(`Version: ${po.version}.0`, pageW - margin, 28);

  doc.setTextColor(0, 0, 0);
  y = 44;

  // Buyer / Supplier – two columns with wrapping
  const buyerX = margin;
  const supplierX = margin + colWidth + 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Buyer', buyerX, y);
  doc.text('Supplier', supplierX, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  y += 7;

  const buyerBlocks = [
    po.buyerCompany,
    po.buyerAddress,
    `Department: ${po.buyerDepartment}`,
    `Contact: ${po.buyerContact}`,
  ];
  const supplierBlocks = [
    po.supplierName || '—',
    po.supplierAddress || '—',
    `Contact: ${po.supplierContact || '—'}`,
    `Email: ${po.supplierEmail || '—'}`,
  ];
  for (let i = 0; i < Math.max(buyerBlocks.length, supplierBlocks.length); i++) {
    const bLines = wrapText(buyerBlocks[i] ?? '', colWidth);
    const sLines = wrapText(supplierBlocks[i] ?? '', colWidth);
    const lineCount = Math.max(buyerBlocks[i] != null ? bLines.length : 0, supplierBlocks[i] != null ? sLines.length : 0) || 1;
    if (buyerBlocks[i] != null) doc.text(bLines, buyerX, y);
    if (supplierBlocks[i] != null) doc.text(sLines, supplierX, y);
    y += lineCount * LINE_HEIGHT + 2;
  }
  y += 8;

  // Line items table – clearer column widths
  const tableHead = [['#', 'Description', 'Qty', 'Unit', 'Unit Price', 'Line Total']];
  const tableBody = po.items.map((item, idx) => [
    String(idx + 1),
    item.description,
    String(item.quantity),
    item.unit,
    formatCurrency(item.unitPrice, po.currency),
    formatCurrency(item.lineTotal, po.currency),
  ]);
  autoTable(doc, {
    startY: y,
    head: tableHead,
    body: tableBody,
    foot: [[ '', '', '', '', `TOTAL (${po.currency}):`, formatCurrency(po.total, po.currency) ]],
    theme: 'grid',
    headStyles: { fillColor: [12, 35, 64], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    footStyles: { fillColor: [241, 245, 249], fontStyle: 'bold', fontSize: 9 },
    margin: { left: margin, right: margin },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 55 },
      2: { cellWidth: 14 },
      3: { cellWidth: 18 },
      4: { cellWidth: 28 },
      5: { cellWidth: 28 },
    },
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  // Footer – wrap long lines
  doc.setFontSize(8);
  const footerW = pageW - 2 * margin;
  const reqLines = wrapText(`Requested by: ${po.requesterName}`, footerW);
  doc.text(reqLines, margin, y);
  y += reqLines.length * LINE_HEIGHT + 2;
  const approverLines = wrapText(`Approved by: ${po.approverNames.filter(Boolean).join(', ')}`, footerW);
  doc.text(approverLines, margin, y);
  y += approverLines.length * LINE_HEIGHT + 2;
  const issuedLines = wrapText(`This PO is issued by ${po.buyerCompany} · ${po.buyerAddress}`, footerW);
  doc.text(issuedLines, margin, y);
  y += issuedLines.length * LINE_HEIGHT + 2;
  doc.text(`Generated: ${formatDateTime(po.createdAt)}`, margin, y);
  y += LINE_HEIGHT;
  const termsLines = wrapText(`PO ${po.poNumber} is subject to ${po.buyerCompany} Standard Terms & Conditions.`, footerW);
  doc.text(termsLines, margin, y);

  doc.save(`${po.poNumber}.pdf`);
}

export function PurchaseOrders() {
  const { purchaseOrders } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    const openPoId = (location.state as { openPoId?: string } | null)?.openPoId;
    if (openPoId && purchaseOrders.some((po) => po.id === openPoId)) {
      setSelected(openPoId);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate, purchaseOrders]);

  const filtered = purchaseOrders.filter((po) => {
    if (search && !po.poNumber.toLowerCase().includes(search.toLowerCase()) && !po.supplierName.toLowerCase().includes(search.toLowerCase()) && !po.reqNumber.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus && po.status !== filterStatus) return false;
    return true;
  });

  const selectedPO = purchaseOrders.find((po) => po.id === selected);

  const STATUS_COLORS: Record<string, string> = {
    Open: 'bg-green-100 text-green-700',
    Closed: 'bg-slate-100 text-slate-600',
    Cancelled: 'bg-mars-red-muted text-mars-red-dark',
  };

  if (selectedPO) {
    return (
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={() => setSelected(null)}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <h1 className="text-slate-900">{selectedPO.poNumber}</h1>
            <p className="text-slate-500 text-sm">Purchase Order · Linked to {selectedPO.reqNumber}</p>
          </div>
          <div className="ml-auto flex gap-3 flex-wrap w-full sm:w-auto">
            <button
              onClick={() => void downloadPOAsPDF(selectedPO)}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50 transition-all w-full sm:w-auto"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download PDF
            </button>
            <button
              onClick={() => navigate(`/requisitions/${selectedPO.requisitionId}`)}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50 transition-all w-full sm:w-auto"
            >
              View Requisition
            </button>
          </div>
        </div>

        {/* PO Document */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header Band */}
          <div className="px-4 sm:px-8 py-6 bg-mars-navy">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-16 rounded-lg bg-white/95 px-2 py-1 flex items-center justify-center">
                    <img src={MARS_LOGO_URL} alt="MARS logo" className="max-h-full max-w-full object-contain" />
                  </div>
                  <div>
                    <div className="text-white font-bold text-lg">{selectedPO.buyerCompany}</div>
                    <div className="text-slate-400 text-xs">Emergency Medical Services</div>
                  </div>
                </div>
                <div className="text-slate-400 text-xs">{selectedPO.buyerAddress}</div>
              </div>
              <div className="text-right">
                <div className="text-slate-400 text-xs uppercase tracking-widest mb-1">Purchase Order</div>
                <div className="text-white text-2xl font-bold">{selectedPO.poNumber}</div>
                <div className="text-slate-400 text-xs mt-1">Date: {formatDate(selectedPO.date)}</div>
                <div className="text-slate-400 text-xs">Version: {selectedPO.version}.0</div>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-8 space-y-6">
            {/* Buyer/Supplier Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-slate-500 text-xs uppercase tracking-wide mb-3 font-medium">Buyer Details</div>
                <div className="space-y-1">
                  <div className="text-slate-800 text-sm font-semibold">{selectedPO.buyerCompany}</div>
                  <div className="text-slate-600 text-sm">{selectedPO.buyerAddress}</div>
                  <div className="text-slate-600 text-sm">Department: {selectedPO.buyerDepartment}</div>
                  <div className="text-slate-600 text-sm">Contact: {selectedPO.buyerContact}</div>
                </div>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-slate-500 text-xs uppercase tracking-wide mb-3 font-medium">Supplier Details</div>
                <div className="space-y-1">
                  <div className="text-slate-800 text-sm font-semibold">{selectedPO.supplierName || '—'}</div>
                  <div className="text-slate-600 text-sm">{selectedPO.supplierAddress || '—'}</div>
                  <div className="text-slate-600 text-sm">Contact: {selectedPO.supplierContact || '—'}</div>
                  <div className="text-slate-600 text-sm">Email: {selectedPO.supplierEmail || '—'}</div>
                  <div className="text-slate-600 text-sm">Tel: {selectedPO.supplierPhone || '—'}</div>
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="text-slate-700 text-sm font-semibold mb-3">Line Items</div>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-mars-navy">
                      <th className="text-left px-4 py-3 text-slate-300 text-xs font-medium">#</th>
                      <th className="text-left px-4 py-3 text-slate-300 text-xs font-medium">Description</th>
                      <th className="text-right px-4 py-3 text-slate-300 text-xs font-medium">Qty</th>
                      <th className="text-left px-4 py-3 text-slate-300 text-xs font-medium">Unit</th>
                      <th className="text-right px-4 py-3 text-slate-300 text-xs font-medium">Unit Price</th>
                      <th className="text-right px-4 py-3 text-slate-300 text-xs font-medium">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedPO.items.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-500 text-sm">{idx + 1}</td>
                        <td className="px-4 py-3 text-slate-700 text-sm">{item.description}</td>
                        <td className="px-4 py-3 text-slate-700 text-sm text-right">{item.quantity}</td>
                        <td className="px-4 py-3 text-slate-700 text-sm">{item.unit}</td>
                        <td className="px-4 py-3 text-slate-700 text-sm text-right">{formatCurrency(item.unitPrice, selectedPO.currency)}</td>
                        <td className="px-4 py-3 text-slate-800 text-sm font-medium text-right">{formatCurrency(item.lineTotal, selectedPO.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={5} className="px-4 py-3 text-right text-slate-600 font-semibold text-sm">TOTAL ({selectedPO.currency}):</td>
                      <td className="px-4 py-3 text-right text-slate-900 font-bold">{formatCurrency(selectedPO.total, selectedPO.currency)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Requester & Approvers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <div className="text-slate-500 text-xs uppercase tracking-wide mb-2 font-medium">Requested By</div>
                <div className="text-slate-800 text-sm">{selectedPO.requesterName}</div>
                <div className="text-slate-400 text-xs">{selectedPO.buyerDepartment}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs uppercase tracking-wide mb-2 font-medium">Approved By</div>
                {selectedPO.approverNames.filter(Boolean).map((name, i) => (
                  <div key={i} className="flex items-center gap-2 text-slate-800 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    {name}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 pt-4 text-center">
              <p className="text-slate-400 text-xs">
                This Purchase Order is issued by {selectedPO.buyerCompany} · {selectedPO.buyerAddress} · Generated: {formatDateTime(selectedPO.createdAt)}
              </p>
              <p className="text-slate-400 text-xs mt-1">
                PO #{selectedPO.poNumber} is subject to MARS Ambulance Services Standard Terms & Conditions.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-slate-900">Purchase Orders</h1>
          <p className="text-slate-500 text-sm">{purchaseOrders.length} purchase order{purchaseOrders.length !== 1 ? 's' : ''} in system</p>
        </div>
        <div className="text-slate-500 text-sm hidden md:block">
          Total Value: <span className="text-slate-900 font-bold">{formatCurrency(purchaseOrders.reduce((s, po) => s + po.total, 0))}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by PO number, supplier…" className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-red-300" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none bg-white">
            <option value="">All Statuses</option>
            <option value="Open">Open</option><option value="Closed">Closed</option><option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mb-4 inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 text-slate-500">
              <FileText className="h-7 w-7" aria-hidden />
            </div>
            <div className="text-slate-500 font-medium">No purchase orders found</div>
            <div className="text-slate-400 text-sm mt-1">Purchase orders are generated after requisition approval</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['PO Number', 'Requisition', 'Supplier', 'Department', 'Total', 'Date', 'Status', ''].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-slate-500 text-xs font-medium uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 font-mono font-medium text-slate-800 text-sm">{po.poNumber}</td>
                    <td className="px-5 py-3.5 text-sm">
                      <button onClick={() => navigate(`/requisitions/${po.requisitionId}`)} className="text-slate-600 hover:text-mars-red hover:underline font-mono text-xs">{po.reqNumber}</button>
                    </td>
                    <td className="px-5 py-3.5 text-slate-700 text-sm">
                      <div className="font-medium">{po.supplierName}</div>
                      <div className="text-slate-400 text-xs">{po.supplierEmail}</div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 text-sm">{po.buyerDepartment}</td>
                    <td className="px-5 py-3.5 text-slate-800 font-medium text-sm">{formatCurrency(po.total, po.currency)}</td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">{formatDate(po.date)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[po.status]}`}>{po.status}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => setSelected(po.id)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:border-mars-red hover:text-mars-red transition-all"
                      >
                        View PO
                      </button>
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
