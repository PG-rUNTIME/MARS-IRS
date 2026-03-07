import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import type { UserRole, User } from '../data/types';
import { hasSectionAccess, getPrimaryRole } from '../data/roleCapabilities';
import { MarsLogo } from './shared/MarsLogo';

const PASSWORD_EXPIRY_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isPasswordExpired(user: User): boolean {
  const ref = user.passwordChangedAt || user.joinedDate;
  const refMs = new Date(ref).getTime();
  return Date.now() - refMs >= PASSWORD_EXPIRY_DAYS * MS_PER_DAY;
}

function ChangePasswordModal({
  onClose,
  onSuccess,
  required = false,
  onLogout,
  reason = 'first_login',
}: {
  onClose: () => void;
  onSuccess: () => void;
  /** When true, user must change password (e.g. first login with default or expired); no cancel, only sign out. */
  required?: boolean;
  onLogout?: () => void;
  /** Why the change is required: first_login (default password) or expired (30-day policy). */
  reason?: 'first_login' | 'expired';
}) {
  const { currentUser } = useAuth();
  const { updateUser } = useApp();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!currentUser) return;
    if (currentPassword !== currentUser.password) {
      setError('Current password is incorrect.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setSaving(true);
    await updateUser(currentUser.id, {
      password: newPassword,
      ...(required && { mustChangePassword: false }),
      passwordChangedAt: new Date().toISOString().slice(0, 10),
    });
    setSaving(false);
    onSuccess();
    onClose();
  };

  const requiredMessage =
    reason === 'expired'
      ? `Your password is older than ${PASSWORD_EXPIRY_DAYS} days. Please set a new password to continue.`
      : 'You signed in with the default password. Please set a new password to continue.';

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={required ? undefined : onClose}
    >
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-slate-800 font-semibold mb-4">
          {required ? 'Change your password' : 'Change password'}
        </h3>
        {required && (
          <p className="text-slate-600 text-sm mb-4">
            {requiredMessage}
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-mars-red-muted border border-mars-red/30 rounded-lg px-3 py-2 text-mars-red-dark text-sm">{error}</div>
          )}
          <div>
            <label className="block text-slate-700 text-sm mb-1">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={required ? "Default password (e.g. mars2026)" : undefined}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-mars-red"
              required
            />
          </div>
          <div>
            <label className="block text-slate-700 text-sm mb-1">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-mars-red"
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="block text-slate-700 text-sm mb-1">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-mars-red"
              required
            />
          </div>
          <div className="flex gap-3 pt-2">
            {required ? (
              onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 text-sm hover:bg-slate-50"
                >
                  Sign out
                </button>
              )
            ) : (
              <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 text-sm hover:bg-slate-50">
                Cancel
              </button>
            )}
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium bg-mars-red hover:bg-mars-red-dark disabled:opacity-60">
              {saving ? 'Saving…' : 'Update password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NavItem({ to, icon, label, badge }: { to: string; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all ${
          isActive
            ? 'bg-mars-red text-white font-medium'
            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white'
        }`
      }
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="bg-mars-red text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center" style={{ fontSize: '11px' }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );
}

/** User can access a section if any of their roles has that capability. */
function canAccess(roles: UserRole[], section: string): boolean {
  return hasSectionAccess(roles, section);
}

// Icons
const DashboardIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
const FileIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
const PlusIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const ClockIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const ListIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
const CartIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>;
const BarIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
const ShieldIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const BellIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
const UsersIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const DatabaseIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/></svg>;
const MailIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>;
const LogOutIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const MenuIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;

export function Layout({ onLogout }: { onLogout: () => void }) {
  const { currentUser } = useAuth();
  const { notifications, requisitions } = useApp();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  if (!currentUser) return null;

  const unreadCount = notifications.filter((n) => n.recipientId === currentUser.id && !n.read).length;
  const pendingApprovals = requisitions.filter((r) => r.status !== 'Rejected' && r.currentApproverRole != null && currentUser.roles.includes(r.currentApproverRole)).length;

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  // Force change password: first login (default password) or password older than 30 days
  const passwordExpired = isPasswordExpired(currentUser);
  if (currentUser.mustChangePassword) {
    return (
      <ChangePasswordModal
        required
        reason="first_login"
        onClose={() => {}}
        onSuccess={() => {}}
        onLogout={handleLogout}
      />
    );
  }
  if (passwordExpired) {
    return (
      <ChangePasswordModal
        required
        reason="expired"
        onClose={() => {}}
        onSuccess={() => {}}
        onLogout={handleLogout}
      />
    );
  }

  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <MarsLogo size="sm" className="rounded-lg" />
          <div className="min-w-0">
            <div className="text-sidebar-foreground text-sm font-bold truncate">MARS Ambulance</div>
            <div className="text-sidebar-foreground/60 text-xs">Requisitions</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <div className="text-sidebar-foreground/60 text-xs uppercase tracking-wider px-4 py-2 font-medium">Main</div>
        {canAccess(currentUser.roles, 'dashboard') && (
          <NavItem to="/dashboard" icon={<DashboardIcon />} label="Dashboard" />
        )}
        {canAccess(currentUser.roles, 'my-requisitions') && (
          <NavItem to="/my-requisitions" icon={<FileIcon />} label="My Requisitions" />
        )}
        {canAccess(currentUser.roles, 'new-req') && (
          <NavItem to="/requisitions/new" icon={<PlusIcon />} label="New Requisition" />
        )}
        {canAccess(currentUser.roles, 'pending-approvals') && (
          <NavItem to="/pending-approvals" icon={<ClockIcon />} label="Pending Approvals" badge={pendingApprovals} />
        )}
        {canAccess(currentUser.roles, 'department-requisitions') && (
          <NavItem to="/department-requisitions" icon={<ListIcon />} label="Department Requisitions" />
        )}
        {canAccess(currentUser.roles, 'all-requisitions') && (
          <NavItem to="/all-requisitions" icon={<ListIcon />} label="All Requisitions" />
        )}

        {(canAccess(currentUser.roles, 'purchase-orders') || canAccess(currentUser.roles, 'reports') || canAccess(currentUser.roles, 'audit-trail')) && (
          <div className="text-sidebar-foreground/60 text-xs uppercase tracking-wider px-4 py-2 font-medium mt-3">Finance & Reporting</div>
        )}
        {canAccess(currentUser.roles, 'purchase-orders') && (
          <NavItem to="/purchase-orders" icon={<CartIcon />} label="Purchase Orders" />
        )}
        {canAccess(currentUser.roles, 'reports') && (
          <NavItem to="/reports" icon={<BarIcon />} label="Reports & KPIs" />
        )}
        {canAccess(currentUser.roles, 'audit-trail') && (
          <NavItem to="/audit-trail" icon={<ShieldIcon />} label="Audit Trail" />
        )}

        <div className="text-sidebar-foreground/60 text-xs uppercase tracking-wider px-4 py-2 font-medium mt-3">System</div>
        <NavItem to="/notifications" icon={<BellIcon />} label="Notifications" badge={unreadCount} />
        {canAccess(currentUser.roles, 'admin') && (
          <NavItem to="/admin/users" icon={<UsersIcon />} label="User Management" />
        )}
        {canAccess(currentUser.roles, 'admin') && (
          <NavItem to="/admin/email-settings" icon={<MailIcon />} label="Email / SMTP" />
        )}
        {canAccess(currentUser.roles, 'database') && (
          <NavItem to="/admin/database" icon={<DatabaseIcon />} label="Database & Backup" />
        )}
      </nav>

      {/* User profile */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-sidebar-accent/50 mb-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 bg-mars-red">
            {currentUser.name.split(' ').map((n) => n[0]).join('')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-white text-sm font-medium truncate">{currentUser.name}</div>
            <div className="text-sidebar-foreground/70 text-xs truncate" title={currentUser.roles.join(', ')}>{currentUser.roles.length > 1 ? `${currentUser.roles.length} roles` : getPrimaryRole(currentUser.roles)}</div>
          </div>
        </div>
        <button
          onClick={() => setShowChangePassword(true)}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white text-sm transition-all"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Change password
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white text-sm transition-all"
        >
          <LogOutIcon />
          Sign Out
        </button>
      </div>
      {showChangePassword && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          onSuccess={() => setShowChangePassword(false)}
        />
      )}
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-muted">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex w-60 shrink-0 flex-col bg-sidebar print:hidden">
        {sidebar}
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 flex flex-col bg-sidebar">
            {sidebar}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between shrink-0 print:hidden">
          <button className="lg:hidden p-1 text-slate-600 hover:text-slate-800" onClick={() => setSidebarOpen(true)}>
            <MenuIcon />
          </button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            <NavLink to="/notifications" className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all">
              <BellIcon />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-white bg-mars-red" style={{ fontSize: '10px' }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </NavLink>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 bg-mars-red">
                {currentUser.name.split(' ').map((n) => n[0]).join('')}
              </div>
              <div className="hidden md:block">
                <div className="text-slate-800 text-sm font-medium">{currentUser.name}</div>
                <div className="text-slate-500 text-xs">{currentUser.department}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
