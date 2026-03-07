import React, { createContext, useContext, useState } from 'react';
import type {
  Requisition,
  PurchaseOrder,
  AppNotification,
  AuditEntry,
  User,
  RequisitionType,
  UserRole,
  ApprovalStep,
  POItem,
  Attachment,
} from '../data/types';
import {
  INITIAL_REQUISITIONS,
  INITIAL_PURCHASE_ORDERS,
  INITIAL_NOTIFICATIONS,
  INITIAL_AUDIT_LOG,
  USERS,
} from '../data/mockData';
import { getPrimaryRole } from '../data/roleCapabilities';
import { sendNotificationEmail } from '../api/client';

interface AppContextValue {
  requisitions: Requisition[];
  purchaseOrders: PurchaseOrder[];
  notifications: AppNotification[];
  auditLog: AuditEntry[];
  users: User[];
  createRequisition: (data: Partial<Requisition>, currentUser: User) => string;
  updateRequisition: (id: string, data: Partial<Requisition>, currentUser: User) => void;
  submitRequisition: (id: string, currentUser: User) => void;
  approveStep: (reqId: string, currentUser: User, comments: string) => void;
  rejectRequisition: (reqId: string, currentUser: User, reason: string) => void;
  returnRejectedToDraft: (reqId: string, currentUser: User) => void;
  cancelRequisition: (reqId: string, currentUser: User) => void;
  addComment: (reqId: string, text: string, isFinanceNote: boolean, currentUser: User) => void;
  markAsPendingPayment: (reqId: string, currentUser: User) => void;
  markAsPaid: (reqId: string, currentUser: User) => void;
  uploadProofOfPayment: (reqId: string, popAttachment: Attachment, currentUser: User) => void;
  generatePO: (reqId: string, currentUser: User) => string | null;
  markNotificationRead: (id: string) => void;
  markAllRead: (userId: string) => void;
  updateUser: (id: string, data: Partial<User>) => void;
  toggleUserActive: (id: string) => void;
  addUser: (data: Omit<User, 'id'>) => void;
}

const AppContext = createContext<AppContextValue>({} as AppContextValue);

let reqCounter = 16;
let poCounter = 2;
let auditCounter = 100;
let notifCounter = 50;

function newId(prefix: string, counter: number) {
  return `${prefix}-${String(counter).padStart(3, '0')}`;
}

function now() {
  return new Date().toISOString();
}

function buildApprovalChain(type: RequisitionType, _amount: number, _currency: string, _department: string): ApprovalStep[] {
  // Petty Cash: Initiator → Department Manager → Accountant → Head of Operations & Training
  if (type === 'Petty Cash') {
    return [
      { id: `step-new-1`, role: 'Department Manager', label: 'Department Manager', status: 'Pending' },
      { id: `step-new-2`, role: 'Accountant', label: 'Accountant', status: 'Pending' },
      { id: `step-new-3`, role: 'Head of Operations', label: 'Head of Operations & Training', status: 'Pending' },
    ];
  }
  // Supplier Payment (Normal) & High-Value/CAPEX: Initiator → Department Manager → Accountant → General Manager → Financial Controller
  return [
    { id: `step-new-1`, role: 'Department Manager', label: 'Department Manager', status: 'Pending' },
    { id: `step-new-2`, role: 'Accountant', label: 'Accountant', status: 'Pending' },
    { id: `step-new-3`, role: 'General Manager', label: 'General Manager', status: 'Pending' },
    { id: `step-new-4`, role: 'Financial Controller', label: 'Financial Controller', status: 'Pending' },
  ];
}

function getCurrentApproverRole(chain: ApprovalStep[]): UserRole | null {
  const pending = chain.find((s) => s.status === 'Pending');
  return pending ? pending.role : null;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [requisitions, setRequisitions] = useState<Requisition[]>(INITIAL_REQUISITIONS);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(INITIAL_PURCHASE_ORDERS);
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>(INITIAL_AUDIT_LOG);
  const [users, setUsers] = useState<User[]>(USERS);

  const addAudit = (entry: Omit<AuditEntry, 'id'>) => {
    const id = `audit-${auditCounter++}`;
    setAuditLog((prev) => [{ ...entry, id }, ...prev]);
  };

  const addNotification = (notif: Omit<AppNotification, 'id'>) => {
    const id = `notif-${notifCounter++}`;
    setNotifications((prev) => [{ ...notif, id }, ...prev]);
    const recipient = users.find((u) => u.id === notif.recipientId);
    if (recipient?.email) {
      sendNotificationEmail(recipient.email, notif.title, notif.message);
    }
  };

  const updateReq = (id: string, updates: Partial<Requisition>) => {
    setRequisitions((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates, updatedAt: now() } : r))
    );
  };

  const createRequisition = (data: Partial<Requisition>, currentUser: User): string => {
    const id = `req-new-${reqCounter}`;
    const d = new Date();
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const sec = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    const prefix = data.type === 'Petty Cash' ? 'PC' : 'IR';
    const reqNumber = `${prefix}${y}${mo}${day}${h}${min}${sec}${ms}`;
    reqCounter++;
    const chain = buildApprovalChain(
      data.type || 'Petty Cash',
      data.amount || 0,
      data.currency || 'USD',
      currentUser.department
    );
    const req: Requisition = {
      id,
      reqNumber,
      type: data.type || 'Petty Cash',
      description: data.description || '',
      justification: data.justification || '',
      amount: data.amount || 0,
      currency: data.currency || 'USD',
      department: data.department || currentUser.department,
      costCenter: data.costCenter || '',
      budgetAvailable: data.budgetAvailable ?? true,
      requesterId: currentUser.id,
      requesterName: currentUser.name,
      requesterEmail: currentUser.email,
      status: 'Draft',
      createdAt: now(),
      updatedAt: now(),
      approvalChain: chain,
      currentApproverRole: null,
      isCapex: data.isCapex ?? false,
      attachments: data.attachments || [],
      comments: [],
      poGenerated: false,
      auditLog: [],
      supplier: data.supplier,
      supplierEmail: data.supplierEmail,
      supplierPhone: data.supplierPhone,
      supplierAddress: data.supplierAddress,
      supplierContact: data.supplierContact,
      vehicleReg: data.vehicleReg,
      fuelType: data.fuelType,
      fuelQuantity: data.fuelQuantity,
      travelDestination: data.travelDestination,
      travelStartDate: data.travelStartDate,
      travelEndDate: data.travelEndDate,
      assetType: data.assetType,
      assetSpecs: data.assetSpecs,
      maintenanceItem: data.maintenanceItem,
      maintenanceUrgency: data.maintenanceUrgency,
      items: data.items || [],
    };
    setRequisitions((prev) => [req, ...prev]);
    addAudit({ action: 'Created', userId: currentUser.id, userName: currentUser.name, userRole: getPrimaryRole(currentUser.roles), timestamp: now(), details: `Requisition ${reqNumber} created as Draft.`, requisitionId: id, requisitionNumber: reqNumber });
    return id;
  };

  const updateRequisition = (id: string, data: Partial<Requisition>, currentUser: User) => {
    const req = requisitions.find((r) => r.id === id);
    if (!req || req.status !== 'Draft' || req.requesterId !== currentUser.id) return;
    const chain = buildApprovalChain(
      data.type ?? req.type,
      data.amount ?? req.amount,
      data.currency ?? req.currency,
      data.department ?? req.department
    );
    updateReq(id, {
      type: data.type ?? req.type,
      description: data.description ?? req.description,
      justification: data.justification ?? req.justification,
      amount: data.amount ?? req.amount,
      currency: data.currency ?? req.currency,
      department: data.department ?? req.department,
      costCenter: data.costCenter ?? req.costCenter,
      budgetAvailable: data.budgetAvailable ?? req.budgetAvailable,
      isCapex: data.isCapex ?? req.isCapex,
      approvalChain: chain,
      currentApproverRole: getCurrentApproverRole(chain),
      supplier: data.supplier ?? req.supplier,
      supplierEmail: data.supplierEmail ?? req.supplierEmail,
      supplierPhone: data.supplierPhone ?? req.supplierPhone,
      supplierAddress: data.supplierAddress ?? req.supplierAddress,
      supplierContact: data.supplierContact ?? req.supplierContact,
      vehicleReg: data.vehicleReg ?? req.vehicleReg,
      fuelType: data.fuelType ?? req.fuelType,
      fuelQuantity: data.fuelQuantity ?? req.fuelQuantity,
      travelDestination: data.travelDestination ?? req.travelDestination,
      travelStartDate: data.travelStartDate ?? req.travelStartDate,
      travelEndDate: data.travelEndDate ?? req.travelEndDate,
      assetType: data.assetType ?? req.assetType,
      assetSpecs: data.assetSpecs ?? req.assetSpecs,
      maintenanceItem: data.maintenanceItem ?? req.maintenanceItem,
      maintenanceUrgency: data.maintenanceUrgency ?? req.maintenanceUrgency,
      items: data.items ?? req.items,
      attachments: data.attachments ?? req.attachments,
    });
    addAudit({ action: 'Draft Updated', userId: currentUser.id, userName: currentUser.name, userRole: getPrimaryRole(currentUser.roles), timestamp: now(), details: `Requisition ${req.reqNumber} draft updated.`, requisitionId: id, requisitionNumber: req.reqNumber });
  };

  const submitRequisition = (id: string, currentUser: User) => {
    const req = requisitions.find((r) => r.id === id);
    if (!req) return;
    const currentApproverRole = getCurrentApproverRole(req.approvalChain);
    updateReq(id, { status: 'Submitted', submittedAt: now(), currentApproverRole });
    addAudit({ action: 'Submitted', userId: currentUser.id, userName: currentUser.name, userRole: getPrimaryRole(currentUser.roles), timestamp: now(), details: `Requisition ${req.reqNumber} submitted for approval.`, requisitionId: id, requisitionNumber: req.reqNumber });
    // Notify all users with the first approver role
    const firstStep = req.approvalChain[0];
    if (firstStep) {
      users.filter((u) => u.roles.includes(firstStep.role)).forEach((u) => {
        addNotification({ recipientId: u.id, title: `Pending Approval – ${req.reqNumber}`, message: `Requisition ${req.reqNumber} from ${currentUser.name} is awaiting ${firstStep.label} approval.`, timestamp: now(), read: false, requisitionId: id, type: 'approval' });
      });
    }
    addNotification({ recipientId: currentUser.id, title: 'Requisition Submitted', message: `Your requisition ${req.reqNumber} has been submitted and is pending approval.`, timestamp: now(), read: false, requisitionId: id, type: 'submission' });
  };

  const approveStep = (reqId: string, currentUser: User, comments: string) => {
    const req = requisitions.find((r) => r.id === reqId);
    if (!req) return;
    const chain = [...req.approvalChain];
    const stepIdx = chain.findIndex((s) => currentUser.roles.includes(s.role) && s.status === 'Pending');
    if (stepIdx === -1) return;
    chain[stepIdx] = { ...chain[stepIdx], status: 'Approved', timestamp: now(), approverName: currentUser.name, approverId: currentUser.id, comments: comments || 'Approved.' };

    const nextPending = chain.find((s) => s.status === 'Pending');
    let newStatus: Requisition['status'];
    let newApproverRole: UserRole | null = null;

    if (!nextPending) {
      // All approvals done: go to Pending Payment (accountant pays and uploads POP). Auto-generate PO for Supplier Payment / High-Value/CAPEX.
      newStatus = 'Pending Payment';
    } else {
      newApproverRole = nextPending.role;
      if (nextPending.role === 'Accountant') newStatus = 'Pending Review';
      else newStatus = 'Pending Approval';
    }

    updateReq(reqId, { approvalChain: chain, status: newStatus, currentApproverRole: newApproverRole });
    addAudit({ action: 'Approved', userId: currentUser.id, userName: currentUser.name, userRole: getPrimaryRole(currentUser.roles), timestamp: now(), details: `${req.reqNumber} approved by ${currentUser.name} (${getPrimaryRole(currentUser.roles)}). ${comments}`, requisitionId: reqId, requisitionNumber: req.reqNumber });

    if (newStatus === 'Pending Payment') {
      const needsPO = (req.type === 'Supplier Payment (Normal)' || req.type === 'High-Value/CAPEX') && !req.poGenerated;
      if (needsPO) generatePO(reqId, currentUser);
      addNotification({ recipientId: req.requesterId, title: 'Requisition Approved – Pending Payment', message: `Your requisition ${req.reqNumber} has been fully approved and is with the accountant for payment.`, timestamp: now(), read: false, requisitionId: reqId, type: 'approval' });
      users.filter((u) => u.roles.includes('Accountant') || u.roles.includes('Financial Controller')).forEach((u) => {
        addNotification({ recipientId: u.id, title: 'Payment Required', message: `Requisition ${req.reqNumber} is pending payment. View the PO, process payment, and upload proof of payment.`, timestamp: now(), read: false, requisitionId: reqId, type: 'info' });
      });
    } else if (nextPending) {
      users.filter((u) => u.roles.includes(nextPending.role)).forEach((u) => {
        addNotification({ recipientId: u.id, title: `Pending Approval – ${req.reqNumber}`, message: `Requisition ${req.reqNumber} is awaiting ${nextPending.label} approval.`, timestamp: now(), read: false, requisitionId: reqId, type: 'approval' });
      });
      addNotification({ recipientId: req.requesterId, title: 'Approval Progress', message: `Your requisition ${req.reqNumber} has been approved and forwarded to the next approver.`, timestamp: now(), read: false, requisitionId: reqId, type: 'approval' });
    }
    clearNotificationsForRequisition(currentUser.id, reqId);
  };

  const rejectRequisition = (reqId: string, currentUser: User, reason: string) => {
    const req = requisitions.find((r) => r.id === reqId);
    if (!req) return;
    const chain = req.approvalChain.map((s) =>
      currentUser.roles.includes(s.role) && s.status === 'Pending'
        ? { ...s, status: 'Rejected' as const, timestamp: now(), approverName: currentUser.name, approverId: currentUser.id, comments: reason }
        : s
    );
    updateReq(reqId, { status: 'Rejected', approvalChain: chain, currentApproverRole: null });
    addAudit({ action: 'Rejected', userId: currentUser.id, userName: currentUser.name, userRole: getPrimaryRole(currentUser.roles), timestamp: now(), details: `${req.reqNumber} rejected by ${currentUser.name}. Reason: ${reason}`, requisitionId: reqId, requisitionNumber: req.reqNumber });
    addNotification({ recipientId: req.requesterId, title: 'Requisition Rejected', message: `Your requisition ${req.reqNumber} has been rejected. Reason: ${reason}. You can edit and resubmit.`, timestamp: now(), read: false, requisitionId: reqId, type: 'rejection' });
    clearNotificationsForRequisition(currentUser.id, reqId);
  };

  const returnRejectedToDraft = (reqId: string, currentUser: User) => {
    const req = requisitions.find((r) => r.id === reqId);
    if (!req || req.status !== 'Rejected' || req.requesterId !== currentUser.id) return;
    const chain = buildApprovalChain(req.type, req.amount, req.currency, req.department);
    updateReq(reqId, {
      status: 'Draft',
      approvalChain: chain,
      currentApproverRole: null,
      submittedAt: undefined,
    });
    addAudit({ action: 'Returned to Draft', userId: currentUser.id, userName: currentUser.name, userRole: getPrimaryRole(currentUser.roles), timestamp: now(), details: `${req.reqNumber} returned to draft for edit and resubmit after rejection.`, requisitionId: reqId, requisitionNumber: req.reqNumber });
    clearNotificationsForRequisition(currentUser.id, reqId);
  };

  const cancelRequisition = (reqId: string, currentUser: User) => {
    const req = requisitions.find((r) => r.id === reqId);
    if (!req) return;
    updateReq(reqId, { status: 'Cancelled', currentApproverRole: null });
    addAudit({ action: 'Cancelled', userId: currentUser.id, userName: currentUser.name, userRole: getPrimaryRole(currentUser.roles), timestamp: now(), details: `Requisition ${req.reqNumber} cancelled by ${currentUser.name}.`, requisitionId: reqId, requisitionNumber: req.reqNumber });
    clearNotificationsForRequisition(currentUser.id, reqId);
  };

  const addComment = (reqId: string, text: string, isFinanceNote: boolean, currentUser: User) => {
    const id = `c-${auditCounter++}`;
    setRequisitions((prev) =>
      prev.map((r) =>
        r.id === reqId
          ? { ...r, comments: [...r.comments, { id, userId: currentUser.id, userName: currentUser.name, userRole: getPrimaryRole(currentUser.roles), text, timestamp: now(), isFinanceNote }] }
          : r
      )
    );
    addAudit({ action: 'Comment Added', userId: currentUser.id, userName: currentUser.name, userRole: getPrimaryRole(currentUser.roles), timestamp: now(), details: `Comment added to ${requisitions.find((r) => r.id === reqId)?.reqNumber || reqId}.`, requisitionId: reqId });
    clearNotificationsForRequisition(currentUser.id, reqId);
  };

  const markAsPendingPayment = (reqId: string, currentUser: User) => {
    const req = requisitions.find((r) => r.id === reqId);
    if (!req) return;
    updateReq(reqId, { status: 'Pending Payment' });
    addAudit({ action: 'Payment Initiated', userId: currentUser.id, userName: currentUser.name, userRole: getPrimaryRole(currentUser.roles), timestamp: now(), details: `${req.reqNumber} marked as Pending Payment by ${currentUser.name}.`, requisitionId: reqId, requisitionNumber: req.reqNumber });
    addNotification({ recipientId: 'u5', title: 'Payment Processing', message: `Requisition ${req.reqNumber} has been marked as Pending Payment.`, timestamp: now(), read: false, requisitionId: reqId, type: 'payment' });
    clearNotificationsForRequisition(currentUser.id, reqId);
  };

  const markAsPaid = (reqId: string, currentUser: User) => {
    const req = requisitions.find((r) => r.id === reqId);
    if (!req) return;
    updateReq(reqId, { status: 'Paid', paidAt: now() });
    addAudit({ action: 'Paid', userId: currentUser.id, userName: currentUser.name, userRole: getPrimaryRole(currentUser.roles), timestamp: now(), details: `Payment completed for ${req.reqNumber}.`, requisitionId: reqId, requisitionNumber: req.reqNumber });
    addNotification({ recipientId: req.requesterId, title: 'Payment Completed', message: `Payment for your requisition ${req.reqNumber} has been processed and completed.`, timestamp: now(), read: false, requisitionId: reqId, type: 'payment' });
    users.filter((u) => u.roles.includes('Accountant') || u.roles.includes('Financial Controller')).forEach((u) => {
      addNotification({ recipientId: u.id, title: 'Payment Confirmed', message: `Payment for ${req.reqNumber} has been recorded as completed.`, timestamp: now(), read: false, requisitionId: reqId, type: 'payment' });
    });
    clearNotificationsForRequisition(currentUser.id, reqId);
  };

  const uploadProofOfPayment = (reqId: string, popAttachment: Attachment, currentUser: User) => {
    const req = requisitions.find((r) => r.id === reqId);
    if (!req || req.status !== 'Pending Payment') return;
    updateReq(reqId, { proofOfPayment: popAttachment, status: 'Paid', paidAt: now() });
    addAudit({ action: 'Proof of Payment Uploaded', userId: currentUser.id, userName: currentUser.name, userRole: getPrimaryRole(currentUser.roles), timestamp: now(), details: `Proof of payment uploaded for ${req.reqNumber}. Requisition marked as Paid.`, requisitionId: reqId, requisitionNumber: req.reqNumber });
    addNotification({ recipientId: req.requesterId, title: 'Payment Completed', message: `Payment for your requisition ${req.reqNumber} has been processed and completed.`, timestamp: now(), read: false, requisitionId: reqId, type: 'payment' });
    clearNotificationsForRequisition(currentUser.id, reqId);
  };

  const generatePO = (reqId: string, currentUser: User): string | null => {
    const req = requisitions.find((r) => r.id === reqId);
    if (!req) return null;
    const poNumber = `PO-2026-${String(poCounter).padStart(3, '0')}`;
    poCounter++;
    const items: POItem[] = req.items && req.items.length > 0
      ? req.items
      : [{ id: 'item-gen-1', description: req.description, quantity: 1, unit: 'Unit', unitPrice: req.amount, lineTotal: req.amount }];
    const po: PurchaseOrder = {
      id: `po-new-${poCounter}`,
      poNumber,
      date: new Date().toISOString().split('T')[0],
      version: 1,
      requisitionId: reqId,
      reqNumber: req.reqNumber,
      buyerCompany: 'MARS Ambulance Services',
      buyerAddress: '14 Fife Avenue, Harare, Zimbabwe',
      buyerDepartment: req.department,
      buyerContact: req.requesterName,
      supplierName: req.supplier || 'To Be Advised',
      supplierAddress: req.supplierAddress || '',
      supplierContact: req.supplierContact || '',
      supplierEmail: req.supplierEmail || '',
      supplierPhone: req.supplierPhone || '',
      items,
      currency: req.currency,
      subtotal: req.amount,
      total: req.amount,
      requesterName: req.requesterName,
      approverNames: req.approvalChain.filter((s) => s.status === 'Approved').map((s) => s.approverName || ''),
      status: 'Open',
      createdAt: now(),
    };
    setPurchaseOrders((prev) => [po, ...prev]);
    updateReq(reqId, { poGenerated: true, poNumber });
    addAudit({ action: 'Purchase Order Generated', userId: currentUser.id, userName: currentUser.name, userRole: getPrimaryRole(currentUser.roles), timestamp: now(), details: `${poNumber} generated for ${req.reqNumber}.`, requisitionId: reqId, requisitionNumber: req.reqNumber });
    addNotification({ recipientId: currentUser.id, title: 'PO Generated', message: `Purchase Order ${poNumber} has been generated for ${req.reqNumber}.`, timestamp: now(), read: false, requisitionId: reqId, type: 'info' });
    return poNumber;
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllRead = (userId: string) => {
    setNotifications((prev) => prev.map((n) => (n.recipientId === userId ? { ...n, read: true } : n)));
  };

  /** Mark all notifications for this user about this requisition as read (after user has actioned the request). */
  const clearNotificationsForRequisition = (recipientId: string, requisitionId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.recipientId === recipientId && n.requisitionId === requisitionId ? { ...n, read: true } : n))
    );
  };

  const updateUser = (id: string, data: Partial<User>) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...data } : u)));
  };

  const toggleUserActive = (id: string) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, active: !u.active } : u)));
  };

  const addUser = (data: Omit<User, 'id'>) => {
    const id = `u-new-${auditCounter++}`;
    setUsers((prev) => [...prev, { ...data, id, mustChangePassword: true }]);
  };

  return (
    <AppContext.Provider value={{ requisitions, purchaseOrders, notifications, auditLog, users, createRequisition, updateRequisition, submitRequisition, approveStep, rejectRequisition, returnRejectedToDraft, cancelRequisition, addComment, markAsPendingPayment, markAsPaid, uploadProofOfPayment, generatePO, markNotificationRead, markAllRead, updateUser, toggleUserActive, addUser }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
