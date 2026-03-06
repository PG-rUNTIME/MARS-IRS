import type { RequisitionStatus } from '../../data/types';

const STATUS_STYLES: Record<RequisitionStatus, string> = {
  Draft: 'bg-slate-100 text-slate-600',
  Submitted: 'bg-blue-100 text-blue-700',
  'Pending Review': 'bg-yellow-100 text-yellow-700',
  'Pending Approval': 'bg-orange-100 text-orange-700',
  Approved: 'bg-green-100 text-green-700',
  'Pending Payment': 'bg-purple-100 text-purple-700',
  Paid: 'bg-teal-100 text-teal-700',
  Rejected: 'bg-mars-red-muted text-mars-red-dark',
  Cancelled: 'bg-slate-100 text-slate-500',
};

const STATUS_DOTS: Record<RequisitionStatus, string> = {
  Draft: 'bg-slate-400',
  Submitted: 'bg-blue-500',
  'Pending Review': 'bg-yellow-500',
  'Pending Approval': 'bg-orange-500',
  Approved: 'bg-green-500',
  'Pending Payment': 'bg-purple-500',
  Paid: 'bg-teal-500',
  Rejected: 'bg-mars-red',
  Cancelled: 'bg-slate-400',
};

export function StatusBadge({ status, size = 'sm' }: { status: RequisitionStatus; size?: 'xs' | 'sm' }) {
  const textSize = size === 'xs' ? 'text-xs' : 'text-xs';
  const padding = size === 'xs' ? 'px-2 py-0.5' : 'px-2.5 py-1';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${textSize} ${padding} ${STATUS_STYLES[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOTS[status]}`} />
      {status}
    </span>
  );
}

export function formatCurrency(amount: number, currency: string = 'USD') {
  const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  if (currency === 'ZIG') return `ZIG ${formatted}`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}
