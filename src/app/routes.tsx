import { createBrowserRouter, Navigate } from 'react-router';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { RequisitionList } from './components/RequisitionList';
import { RequisitionForm } from './components/RequisitionForm';
import { RequisitionDetail } from './components/RequisitionDetail';
import { PurchaseOrders } from './components/PurchaseOrders';
import { Reports } from './components/Reports';
import { AuditTrail } from './components/AuditTrail';
import { NotificationsPage } from './components/NotificationsPage';
import { UserManagement } from './components/UserManagement';
import { DatabaseHealthBackup } from './components/DatabaseHealthBackup';
import { EmailSmtpSettings } from './components/EmailSmtpSettings';
import { useAuth } from './context/AuthContext';

// Role guard: user must have at least one of the allowed roles (multi-role aware)
function RequireRole({ roles, redirectTo = '/dashboard', children }: { roles?: string[]; redirectTo?: string; children: React.ReactNode }) {
  const { currentUser } = useAuth();
  if (!roles || !currentUser) return <>{children}</>;
  const hasAccess = currentUser.roles.some((r) => roles.includes(r));
  if (hasAccess) return <>{children}</>;
  return <Navigate to={redirectTo} replace />;
}

export function createAppRouter(onLogout: () => void) {
  return createBrowserRouter([
    {
      path: '/',
      element: <Layout onLogout={onLogout} />,
      children: [
        { index: true, element: <Navigate to="/dashboard" replace /> },
        {
          path: 'dashboard',
          element: (
            <RequireRole roles={['Requester', 'Department Manager', 'Accountant', 'General Manager', 'Financial Controller', 'Head of Operations', 'Auditor']} redirectTo="/admin/users">
              <Dashboard />
            </RequireRole>
          ),
        },
        {
          path: 'my-requisitions',
          element: (
            <RequireRole roles={['Requester']}>
              <RequisitionList mode="my" />
            </RequireRole>
          ),
        },
        {
          path: 'requisitions/new',
          element: (
            <RequireRole roles={['Requester', 'Department Manager', 'Accountant', 'General Manager', 'Financial Controller', 'Head of Operations', 'System Administrator']}>
              <RequisitionForm />
            </RequireRole>
          ),
        },
        {
          path: 'requisitions/:id/edit',
          element: (
            <RequireRole roles={['Requester', 'Department Manager', 'Accountant', 'General Manager', 'Financial Controller', 'Head of Operations', 'System Administrator']}>
              <RequisitionForm />
            </RequireRole>
          ),
        },
        { path: 'requisitions/:id', element: <RequisitionDetail /> },
        {
          path: 'pending-approvals',
          element: (
            <RequireRole roles={['Department Manager', 'Accountant', 'General Manager', 'Financial Controller', 'Head of Operations']}>
              <RequisitionList mode="pending" />
            </RequireRole>
          ),
        },
        {
          path: 'department-requisitions',
          element: (
            <RequireRole roles={['Department Manager']}>
              <RequisitionList mode="department" />
            </RequireRole>
          ),
        },
        {
          path: 'all-requisitions',
          element: (
            <RequireRole roles={['Accountant', 'General Manager', 'Financial Controller', 'Head of Operations', 'Auditor']}>
              <RequisitionList mode="all" />
            </RequireRole>
          ),
        },
        {
          path: 'purchase-orders',
          element: (
            <RequireRole roles={['Accountant', 'General Manager', 'Financial Controller', 'Auditor', 'Requester']}>
              <PurchaseOrders />
            </RequireRole>
          ),
        },
        {
          path: 'reports',
          element: (
            <RequireRole roles={['Accountant', 'General Manager', 'Financial Controller', 'Head of Operations', 'Auditor']}>
              <Reports />
            </RequireRole>
          ),
        },
        {
          path: 'audit-trail',
          element: (
            <RequireRole roles={['Financial Controller', 'Auditor']}>
              <AuditTrail />
            </RequireRole>
          ),
        },
        { path: 'notifications', element: <NotificationsPage /> },
        {
          path: 'admin/users',
          element: (
            <RequireRole roles={['System Administrator']}>
              <UserManagement />
            </RequireRole>
          ),
        },
        {
          path: 'admin/database',
          element: (
            <RequireRole roles={['System Administrator']}>
              <DatabaseHealthBackup />
            </RequireRole>
          ),
        },
        {
          path: 'admin/email-settings',
          element: (
            <RequireRole roles={['System Administrator']}>
              <EmailSmtpSettings />
            </RequireRole>
          ),
        },
        { path: '*', element: <Navigate to="/dashboard" replace /> },
      ],
    },
  ]);
}