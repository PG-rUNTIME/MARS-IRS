import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { timeAgo } from './shared/StatusBadge';
import type { AppNotification } from '../data/types';

const TYPE_ICONS: Record<AppNotification['type'], React.ReactNode> = {
  submission: (
    <div className="w-9 h-9 rounded-full flex items-center justify-center bg-blue-100">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    </div>
  ),
  approval: (
    <div className="w-9 h-9 rounded-full flex items-center justify-center bg-amber-100">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    </div>
  ),
  rejection: (
    <div className="w-9 h-9 rounded-full flex items-center justify-center bg-red-100">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
    </div>
  ),
  payment: (
    <div className="w-9 h-9 rounded-full flex items-center justify-center bg-teal-100">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
    </div>
  ),
  info: (
    <div className="w-9 h-9 rounded-full flex items-center justify-center bg-purple-100">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
    </div>
  ),
};

export function NotificationsPage() {
  const { currentUser } = useAuth();
  const { notifications, markNotificationRead, markAllRead } = useApp();
  const navigate = useNavigate();

  if (!currentUser) return null;

  const myNotifs = notifications
    .filter((n) => n.recipientId === currentUser.id)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const unreadCount = myNotifs.filter((n) => !n.read).length;

  const handleClick = (notif: AppNotification) => {
    void markNotificationRead(notif.id);
    if (notif.rfqId) {
      navigate(`/rfqs/${notif.rfqId}`);
      return;
    }
    if (notif.requisitionId) {
      navigate(`/requisitions/${notif.requisitionId}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-slate-900">Notifications</h1>
          <p className="text-slate-500 text-sm">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => void markAllRead(currentUser.id)}
            className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
          >
            Mark all as read
          </button>
        )}
      </div>

      {myNotifs.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-16 text-center">
          <div className="text-5xl mb-4">🔔</div>
          <div className="text-slate-500 font-medium">No notifications yet</div>
          <div className="text-slate-400 text-sm mt-1">You'll receive notifications when actions are taken on your requisitions</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
            {myNotifs.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleClick(notif)}
                className={`flex items-start gap-4 px-5 py-4 cursor-pointer transition-all hover:bg-slate-50 ${!notif.read ? 'bg-blue-50/50' : ''}`}
              >
                {TYPE_ICONS[notif.type]}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-sm ${notif.read ? 'text-slate-700' : 'text-slate-900 font-medium'}`}>
                      {notif.title}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-slate-400 text-xs whitespace-nowrap">{timeAgo(notif.timestamp)}</span>
                      {!notif.read && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#DC2626' }} />}
                    </div>
                  </div>
                  <p className="text-slate-500 text-sm mt-0.5 leading-snug">{notif.message}</p>
                  {notif.requisitionId && (
                    <div className="mt-1.5">
                      <span className="text-xs font-medium" style={{ color: '#DC2626' }}>View requisition →</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
