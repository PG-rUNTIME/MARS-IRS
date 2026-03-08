import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type {
  Requisition, PurchaseOrder, AppNotification, AuditEntry, User,
  RequisitionType, UserRole, ApprovalStep, POItem, Attachment,
} from '../data/types';
import { getPrimaryRole } from '../data/roleCapabilities';
import {
  isApiEnabled,
  fetchUsers, createUser as apiCreateUser, updateUser as apiUpdateUser,
  fetchRequisitions, fetchRequisition, createRequisition as apiCreateRequisition,
  updateRequisition as apiUpdateRequisition, addComment as apiAddComment,
  addAttachment as apiAddAttachment, generatePO as apiGeneratePO,
  fetchPurchaseOrders,
  fetchNotifications, createNotification as apiCreateNotification,
  markNotificationRead as apiMarkRead, markAllNotificationsRead as apiMarkAllRead,
  sendNotificationEmail,
  type ApiUser, type ApiRequisition, type ApiPurchaseOrder,
  type ApiNotification, type ApiApprovalStep,
} from '../api/client';

// ─── Mappers: API → frontend types ────────────────────────────────────────────

function mapUser(u: ApiUser): User {
  return {
    id: String(u.id),
    name: u.name,
    email: u.email,
    password: u.password,
    roles: u.roles as UserRole[],
    department: u.department,
    active: u.active,
    joinedDate: u.joined_date || '',
    phone: u.phone || '',
    avatar: u.avatar || '',
    mustChangePassword: u.must_change_password,
    passwordChangedAt: u.password_changed_at || undefined,
  };
}

function mapStep(s: ApiApprovalStep): ApprovalStep {
  return {
    id: String(s.id),
    role: s.role as UserRole,
    label: s.label,
    approverId: s.approver_id != null ? String(s.approver_id) : undefined,
    approverName: s.approver_name || undefined,
    status: s.status as ApprovalStep['status'],
    timestamp: s.timestamp || undefined,
    comments: s.comments || undefined,
    delegatedTo: s.delegated_to_id != null ? String(s.delegated_to_id) : undefined,
    delegatedToName: s.delegated_to_name || undefined,
  };
}

function mapRequisition(r: ApiRequisition): Requisition {
  const attachments: Attachment[] = (r.attachments || [])
    .filter(a => !a.is_proof_of_payment)
    .map(a => ({
      id: String(a.id), name: a.name, type: a.type, size: a.size,
      uploadedBy: a.uploaded_by, uploadedAt: a.uploaded_at, dataUrl: a.data_url || undefined,
    }));
  const pop = r.proof_of_payment
    ? {
        id: String(r.proof_of_payment.id), name: r.proof_of_payment.name,
        type: r.proof_of_payment.type, size: r.proof_of_payment.size,
        uploadedBy: r.proof_of_payment.uploaded_by, uploadedAt: r.proof_of_payment.uploaded_at,
        dataUrl: r.proof_of_payment.data_url || undefined,
      }
    : undefined;
  const items: POItem[] = (r.items || []).map(i => ({
    id: String(i.id), description: i.description, quantity: i.quantity,
    unit: i.unit, unitPrice: Number(i.unit_price), lineTotal: Number(i.line_total),
  }));
  const auditLog: AuditEntry[] = (r.audit_log || []).map(e => ({
    id: String(e.id), action: e.action, userId: e.user_id_str, userName: e.user_name,
    userRole: e.user_role as UserRole, timestamp: e.timestamp, details: e.details,
    requisitionId: e.requisition_id || undefined,
    requisitionNumber: e.requisition_number || undefined,
    requisitionCurrency: e.requisition_currency || undefined,
  }));
  return {
    id: String(r.id),
    reqNumber: r.req_number,
    type: r.type as RequisitionType,
    description: r.description,
    justification: r.justification,
    amount: Number(r.amount),
    currency: r.currency,
    department: r.department,
    costCenter: r.cost_center,
    budgetAvailable: r.budget_available,
    requesterId: String(r.requester_id),
    requesterName: r.requester_name,
    requesterEmail: r.requester_email,
    status: r.status as Requisition['status'],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    submittedAt: r.submitted_at || undefined,
    paidAt: r.paid_at || undefined,
    approvalChain: (r.approval_chain || []).map(mapStep),
    currentApproverRole: r.current_approver_role as UserRole | null,
    isCapex: r.is_capex,
    poGenerated: r.po_generated,
    poNumber: r.po_number || undefined,
    supplier: r.supplier || undefined,
    supplierEmail: r.supplier_email || undefined,
    supplierPhone: r.supplier_phone || undefined,
    supplierAddress: r.supplier_address || undefined,
    supplierContact: r.supplier_contact || undefined,
    vehicleReg: r.vehicle_reg || undefined,
    fuelType: r.fuel_type || undefined,
    fuelQuantity: r.fuel_quantity != null ? Number(r.fuel_quantity) : undefined,
    travelDestination: r.travel_destination || undefined,
    travelStartDate: r.travel_start_date || undefined,
    travelEndDate: r.travel_end_date || undefined,
    assetType: r.asset_type || undefined,
    assetSpecs: r.asset_specs || undefined,
    maintenanceItem: r.maintenance_item || undefined,
    maintenanceUrgency: r.maintenance_urgency as Requisition['maintenanceUrgency'] || undefined,
    attachments,
    proofOfPayment: pop,
    items,
    comments: (r.comments || []).map(c => ({
      id: String(c.id), userId: String(c.user_id), userName: c.user_name,
      userRole: c.user_role as UserRole, text: c.text,
      timestamp: c.timestamp, isFinanceNote: c.is_finance_note,
    })),
    auditLog,
  };
}

function mapPO(p: ApiPurchaseOrder): PurchaseOrder {
  return {
    id: String(p.id),
    poNumber: p.po_number,
    date: p.date,
    version: p.version,
    requisitionId: String(p.requisition_id),
    reqNumber: p.req_number,
    buyerCompany: p.buyer_company,
    buyerAddress: p.buyer_address,
    buyerDepartment: p.buyer_department,
    buyerContact: p.buyer_contact,
    supplierName: p.supplier_name,
    supplierAddress: p.supplier_address,
    supplierContact: p.supplier_contact,
    supplierEmail: p.supplier_email,
    supplierPhone: p.supplier_phone,
    items: p.items.map(i => ({
      id: String(i.id), description: i.description, quantity: i.quantity,
      unit: i.unit, unitPrice: Number(i.unit_price), lineTotal: Number(i.line_total),
    })),
    currency: p.currency,
    subtotal: Number(p.subtotal),
    total: Number(p.total),
    requesterName: p.requester_name,
    approverNames: p.approver_names,
    status: p.status as PurchaseOrder['status'],
    createdAt: p.created_at,
  };
}

function mapNotification(n: ApiNotification): AppNotification {
  return {
    id: String(n.id),
    recipientId: String(n.recipient_id),
    title: n.title,
    message: n.message,
    timestamp: n.timestamp,
    read: n.read,
    requisitionId: n.requisition_id != null ? String(n.requisition_id) : undefined,
    type: n.type as AppNotification['type'],
  };
}

// ─── Approval chain builder ───────────────────────────────────────────────────

function buildApprovalChain(type: RequisitionType): Array<{ order: number; role: string; label: string; status: string }> {
  if (type === 'Petty Cash') {
    return [
      { order: 1, role: 'Department Manager', label: 'Department Manager', status: 'Pending' },
      { order: 2, role: 'Accountant', label: 'Accountant', status: 'Pending' },
      { order: 3, role: 'Head of Operations', label: 'Head of Operations & Training', status: 'Pending' },
    ];
  }
  return [
    { order: 1, role: 'Department Manager', label: 'Department Manager', status: 'Pending' },
    { order: 2, role: 'Accountant', label: 'Accountant', status: 'Pending' },
    { order: 3, role: 'General Manager', label: 'General Manager', status: 'Pending' },
    { order: 4, role: 'Financial Controller', label: 'Financial Controller', status: 'Pending' },
  ];
}

function now() { return new Date().toISOString(); }

// ─── Context interface ────────────────────────────────────────────────────────

interface AppContextValue {
  requisitions: Requisition[];
  purchaseOrders: PurchaseOrder[];
  notifications: AppNotification[];
  auditLog: AuditEntry[];
  users: User[];
  loading: boolean;
  reload: () => Promise<void>;
  createRequisition: (data: Partial<Requisition>, currentUser: User) => Promise<string>;
  updateRequisition: (id: string, data: Partial<Requisition>, currentUser: User) => Promise<void>;
  submitRequisition: (id: string, currentUser: User) => Promise<void>;
  approveStep: (reqId: string, currentUser: User, comments: string) => Promise<void>;
  rejectRequisition: (reqId: string, currentUser: User, reason: string) => Promise<void>;
  returnRejectedToDraft: (reqId: string, currentUser: User) => Promise<void>;
  cancelRequisition: (reqId: string, currentUser: User) => Promise<void>;
  addComment: (reqId: string, text: string, isFinanceNote: boolean, currentUser: User) => Promise<void>;
  markAsPendingPayment: (reqId: string, currentUser: User) => Promise<void>;
  markAsPaid: (reqId: string, currentUser: User) => Promise<void>;
  uploadProofOfPayment: (reqId: string, popAttachment: Attachment, currentUser: User) => Promise<void>;
  generatePO: (reqId: string, currentUser: User) => Promise<string | null>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllRead: (userId: string) => Promise<void>;
  updateUser: (id: string, data: Partial<User>) => Promise<void>;
  toggleUserActive: (id: string) => Promise<void>;
  addUser: (data: Omit<User, 'id'>) => Promise<void>;
}

const AppContext = createContext<AppContextValue>({} as AppContextValue);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [auditLog] = useState<AuditEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    if (!isApiEnabled()) { setLoading(false); return; }
    setLoading(true);
    try {
      const [usersRes, reqRes, poRes, notifRes] = await Promise.all([
        fetchUsers(),
        fetchRequisitions({ page_size: '200' }),
        fetchPurchaseOrders(),
        fetchNotifications(),
      ]);
      setUsers(usersRes.map(mapUser));
      setRequisitions(reqRes.results.map(mapRequisition));
      setPurchaseOrders(poRes.results.map(mapPO));
      setNotifications(notifRes.map(mapNotification));
    } catch (e) {
      console.error('Failed to load app data', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const refreshReq = async (id: string) => {
    const fresh = await fetchRequisition(Number(id));
    const mapped = mapRequisition(fresh);
    setRequisitions(prev => prev.map(r => r.id === id ? mapped : r));
    return fresh;
  };

  const pushNotif = async (
    recipientId: string, title: string, message: string,
    type: AppNotification['type'], requisitionId?: string,
  ) => {
    if (!isApiEnabled()) return;
    try {
      const n = await apiCreateNotification({
        recipient_id: Number(recipientId), title, message, type,
        requisition_id: requisitionId ? Number(requisitionId) : null,
      });
      setNotifications(prev => [mapNotification(n), ...prev]);
      const recipient = users.find(u => u.id === recipientId);
      if (recipient?.email) sendNotificationEmail(recipient.email, title, message);
    } catch { /* non-fatal */ }
  };

  // ─── Requisitions ──────────────────────────────────────────────────────────

  const createRequisition = async (data: Partial<Requisition>, currentUser: User): Promise<string> => {
    const type = (data.type || 'Petty Cash') as RequisitionType;
    const d = new Date();
    const prefix = type === 'Petty Cash' ? 'PC' : 'IR';
    const reqNumber = `${prefix}${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}${String(d.getMilliseconds()).padStart(3,'0')}`;
    const chain = buildApprovalChain(type);
    const created = await apiCreateRequisition({
      req_number: reqNumber, type,
      description: data.description || '',
      justification: data.justification || '',
      amount: data.amount || 0,
      currency: data.currency || 'USD',
      department: data.department || currentUser.department,
      cost_center: data.costCenter || '',
      budget_available: data.budgetAvailable ?? true,
      requester_id: Number(currentUser.id),
      status: 'Draft',
      is_capex: data.isCapex ?? false,
      supplier: data.supplier, supplier_email: data.supplierEmail,
      supplier_phone: data.supplierPhone, supplier_address: data.supplierAddress,
      supplier_contact: data.supplierContact, vehicle_reg: data.vehicleReg,
      fuel_type: data.fuelType, fuel_quantity: data.fuelQuantity ?? null,
      travel_destination: data.travelDestination,
      travel_start_date: data.travelStartDate ?? null,
      travel_end_date: data.travelEndDate ?? null,
      asset_type: data.assetType, asset_specs: data.assetSpecs,
      maintenance_item: data.maintenanceItem, maintenance_urgency: data.maintenanceUrgency,
      items: (data.items || []).map(i => ({ description: i.description, quantity: i.quantity, unit: i.unit, unit_price: i.unitPrice, line_total: i.lineTotal })),
      approval_chain: chain,
      actor_user_id: Number(currentUser.id),
      actor_user_name: currentUser.name,
      actor_user_role: getPrimaryRole(currentUser.roles),
    });
    setRequisitions(prev => [mapRequisition(created), ...prev]);
    return String(created.id);
  };

  const updateRequisition = async (id: string, data: Partial<Requisition>, currentUser: User) => {
    const req = requisitions.find(r => r.id === id);
    if (!req || req.status !== 'Draft' || req.requesterId !== currentUser.id) return;
    const newType = (data.type ?? req.type) as RequisitionType;
    const chain = buildApprovalChain(newType);
    await apiUpdateRequisition(Number(id), {
      type: newType,
      description: data.description ?? req.description,
      justification: data.justification ?? req.justification,
      amount: data.amount ?? req.amount,
      currency: data.currency ?? req.currency,
      department: data.department ?? req.department,
      cost_center: data.costCenter ?? req.costCenter,
      budget_available: data.budgetAvailable ?? req.budgetAvailable,
      is_capex: data.isCapex ?? req.isCapex,
      supplier: data.supplier ?? req.supplier,
      supplier_email: data.supplierEmail ?? req.supplierEmail,
      supplier_phone: data.supplierPhone ?? req.supplierPhone,
      supplier_address: data.supplierAddress ?? req.supplierAddress,
      supplier_contact: data.supplierContact ?? req.supplierContact,
      vehicle_reg: data.vehicleReg ?? req.vehicleReg,
      fuel_type: data.fuelType ?? req.fuelType,
      fuel_quantity: data.fuelQuantity ?? req.fuelQuantity ?? null,
      travel_destination: data.travelDestination ?? req.travelDestination,
      travel_start_date: data.travelStartDate ?? req.travelStartDate ?? null,
      travel_end_date: data.travelEndDate ?? req.travelEndDate ?? null,
      asset_type: data.assetType ?? req.assetType,
      asset_specs: data.assetSpecs ?? req.assetSpecs,
      maintenance_item: data.maintenanceItem ?? req.maintenanceItem,
      maintenance_urgency: data.maintenanceUrgency ?? req.maintenanceUrgency,
      current_approver_role: null,
      approval_chain: chain.map((s, i) => ({ id: 0, order: i+1, role: s.role, label: s.label, status: 'Pending', approver_id: null, approver_name: '', delegated_to_id: null, delegated_to_name: '', timestamp: null, comments: '' })),
      items: (data.items ?? req.items ?? []).map(i => ({ id: 0, description: i.description, quantity: i.quantity, unit: i.unit, unit_price: String(i.unitPrice), line_total: String(i.lineTotal) })),
      audit_action: 'Draft Updated',
      audit_details: `Requisition ${req.reqNumber} draft updated.`,
      actor_user_id: Number(currentUser.id),
      actor_user_name: currentUser.name,
      actor_user_role: getPrimaryRole(currentUser.roles),
    });
    await refreshReq(id);
  };

  const submitRequisition = async (id: string, currentUser: User) => {
    const req = requisitions.find(r => r.id === id);
    if (!req) return;
    const firstRole = req.approvalChain[0]?.role ?? null;
    await apiUpdateRequisition(Number(id), {
      status: 'Submitted', submitted_at: now(), current_approver_role: firstRole,
      audit_action: 'Submitted',
      audit_details: `Requisition ${req.reqNumber} submitted for approval.`,
      actor_user_id: Number(currentUser.id),
      actor_user_name: currentUser.name,
      actor_user_role: getPrimaryRole(currentUser.roles),
    });
    await refreshReq(id);
    if (firstRole) {
      for (const u of users.filter(u => u.roles.includes(firstRole as UserRole))) {
        await pushNotif(u.id, `Pending Approval – ${req.reqNumber}`, `Requisition ${req.reqNumber} from ${currentUser.name} is awaiting ${firstRole} approval.`, 'approval', id);
      }
    }
    await pushNotif(currentUser.id, 'Requisition Submitted', `Your requisition ${req.reqNumber} has been submitted and is pending approval.`, 'submission', id);
  };

  const approveStep = async (reqId: string, currentUser: User, comments: string) => {
    const req = requisitions.find(r => r.id === reqId);
    if (!req) throw new Error('Requisition not found.');
    const chain = req.approvalChain.map(s => ({ ...s }));
    // Find the pending step whose role matches the current approver role
    const stepIdx = chain.findIndex(
      s => s.status === 'Pending' && s.role === req.currentApproverRole
    );
    if (stepIdx === -1) throw new Error('No matching pending step found for your role. Please refresh the page and try again.');
    chain[stepIdx] = { ...chain[stepIdx], status: 'Approved', timestamp: now(), approverName: currentUser.name, approverId: currentUser.id, comments: comments || 'Approved.' };
    const nextPending = chain.find(s => s.status === 'Pending');
    let newStatus: Requisition['status'];
    let newApproverRole: string | null = null;
    if (!nextPending) {
      newStatus = 'Pending Payment';
    } else {
      newApproverRole = nextPending.role;
      newStatus = nextPending.role === 'Accountant' ? 'Pending Review' : 'Pending Approval';
    }
    await apiUpdateRequisition(Number(reqId), {
      status: newStatus, current_approver_role: newApproverRole,
      approval_chain: chain.map((s, i) => ({
        id: Number(s.id) || 0, order: i+1, role: s.role, label: s.label,
        approver_id: s.approverId ? Number(s.approverId) : null,
        approver_name: s.approverName || '', status: s.status,
        timestamp: s.timestamp || null, comments: s.comments || '',
        delegated_to_id: s.delegatedTo ? Number(s.delegatedTo) : null,
        delegated_to_name: s.delegatedToName || '',
      })),
      audit_action: 'Approved',
      audit_details: `${req.reqNumber} approved by ${currentUser.name} (${getPrimaryRole(currentUser.roles)}). ${comments}`,
      actor_user_id: Number(currentUser.id),
      actor_user_name: currentUser.name,
      actor_user_role: getPrimaryRole(currentUser.roles),
    });
    if (newStatus === 'Pending Payment') {
      const needsPO = (req.type === 'Supplier Payment (Normal)' || req.type === 'High-Value/CAPEX') && !req.poGenerated;
      if (needsPO) await generatePOInternal(reqId, currentUser);
      await pushNotif(req.requesterId, 'Requisition Approved – Pending Payment', `Your requisition ${req.reqNumber} has been fully approved and is with the accountant for payment.`, 'approval', reqId);
      for (const u of users.filter(u => u.roles.includes('Accountant') || u.roles.includes('Financial Controller'))) {
        await pushNotif(u.id, 'Payment Required', `Requisition ${req.reqNumber} is pending payment.`, 'info', reqId);
      }
    } else if (nextPending) {
      for (const u of users.filter(u => u.roles.includes(nextPending.role as UserRole))) {
        await pushNotif(u.id, `Pending Approval – ${req.reqNumber}`, `Requisition ${req.reqNumber} is awaiting ${nextPending.label} approval.`, 'approval', reqId);
      }
      await pushNotif(req.requesterId, 'Approval Progress', `Your requisition ${req.reqNumber} has been approved and forwarded to the next approver.`, 'approval', reqId);
    }
    await refreshReq(reqId);
  };

  const rejectRequisition = async (reqId: string, currentUser: User, reason: string) => {
    const req = requisitions.find(r => r.id === reqId);
    if (!req) return;
    const chain = req.approvalChain.map(s =>
      currentUser.roles.includes(s.role) && s.status === 'Pending'
        ? { ...s, status: 'Rejected' as const, timestamp: now(), approverName: currentUser.name, approverId: currentUser.id, comments: reason }
        : s
    );
    await apiUpdateRequisition(Number(reqId), {
      status: 'Rejected', current_approver_role: null,
      approval_chain: chain.map((s, i) => ({
        id: Number(s.id) || 0, order: i+1, role: s.role, label: s.label,
        approver_id: s.approverId ? Number(s.approverId) : null,
        approver_name: s.approverName || '', status: s.status,
        timestamp: s.timestamp || null, comments: s.comments || '',
        delegated_to_id: null, delegated_to_name: '',
      })),
      audit_action: 'Rejected',
      audit_details: `${req.reqNumber} rejected by ${currentUser.name}. Reason: ${reason}`,
      actor_user_id: Number(currentUser.id),
      actor_user_name: currentUser.name,
      actor_user_role: getPrimaryRole(currentUser.roles),
    });
    await pushNotif(req.requesterId, 'Requisition Rejected', `Your requisition ${req.reqNumber} has been rejected. Reason: ${reason}. You can edit and resubmit.`, 'rejection', reqId);
    await refreshReq(reqId);
  };

  const returnRejectedToDraft = async (reqId: string, currentUser: User) => {
    const req = requisitions.find(r => r.id === reqId);
    if (!req || req.status !== 'Rejected' || req.requesterId !== currentUser.id) return;
    const chain = buildApprovalChain(req.type);
    await apiUpdateRequisition(Number(reqId), {
      status: 'Draft', current_approver_role: null, submitted_at: null,
      approval_chain: chain.map((s, i) => ({ id: 0, order: i+1, role: s.role, label: s.label, approver_id: null, approver_name: '', status: 'Pending', timestamp: null, comments: '', delegated_to_id: null, delegated_to_name: '' })),
      audit_action: 'Returned to Draft',
      audit_details: `${req.reqNumber} returned to draft for edit and resubmit after rejection.`,
      actor_user_id: Number(currentUser.id),
      actor_user_name: currentUser.name,
      actor_user_role: getPrimaryRole(currentUser.roles),
    });
    await refreshReq(reqId);
  };

  const cancelRequisition = async (reqId: string, currentUser: User) => {
    const req = requisitions.find(r => r.id === reqId);
    if (!req) return;
    await apiUpdateRequisition(Number(reqId), {
      status: 'Cancelled', current_approver_role: null,
      audit_action: 'Cancelled',
      audit_details: `Requisition ${req.reqNumber} cancelled by ${currentUser.name}.`,
      actor_user_id: Number(currentUser.id),
      actor_user_name: currentUser.name,
      actor_user_role: getPrimaryRole(currentUser.roles),
    });
    await refreshReq(reqId);
  };

  const addComment = async (reqId: string, text: string, isFinanceNote: boolean, currentUser: User) => {
    await apiAddComment(Number(reqId), {
      user_id: Number(currentUser.id),
      user_name: currentUser.name,
      user_role: getPrimaryRole(currentUser.roles),
      text, is_finance_note: isFinanceNote,
    });
    await refreshReq(reqId);
  };

  const markAsPendingPayment = async (reqId: string, currentUser: User) => {
    const req = requisitions.find(r => r.id === reqId);
    if (!req) return;
    await apiUpdateRequisition(Number(reqId), {
      status: 'Pending Payment',
      audit_action: 'Payment Initiated',
      audit_details: `${req.reqNumber} marked as Pending Payment by ${currentUser.name}.`,
      actor_user_id: Number(currentUser.id),
      actor_user_name: currentUser.name,
      actor_user_role: getPrimaryRole(currentUser.roles),
    });
    await refreshReq(reqId);
  };

  const markAsPaid = async (reqId: string, currentUser: User) => {
    const req = requisitions.find(r => r.id === reqId);
    if (!req) return;
    await apiUpdateRequisition(Number(reqId), {
      status: 'Paid', paid_at: now(),
      audit_action: 'Paid',
      audit_details: `Payment completed for ${req.reqNumber}.`,
      actor_user_id: Number(currentUser.id),
      actor_user_name: currentUser.name,
      actor_user_role: getPrimaryRole(currentUser.roles),
    });
    await pushNotif(req.requesterId, 'Payment Completed', `Payment for your requisition ${req.reqNumber} has been processed.`, 'payment', reqId);
    await refreshReq(reqId);
  };

  const uploadProofOfPayment = async (reqId: string, popAttachment: Attachment, currentUser: User) => {
    const req = requisitions.find(r => r.id === reqId);
    if (!req || req.status !== 'Pending Payment') return;
    await apiAddAttachment(Number(reqId), {
      name: popAttachment.name, type: popAttachment.type, size: popAttachment.size,
      uploaded_by: popAttachment.uploadedBy, data_url: popAttachment.dataUrl || '',
      is_proof_of_payment: true,
    });
    await apiUpdateRequisition(Number(reqId), {
      status: 'Paid', paid_at: now(),
      audit_action: 'Proof of Payment Uploaded',
      audit_details: `Proof of payment uploaded for ${req.reqNumber}. Requisition marked as Paid.`,
      actor_user_id: Number(currentUser.id),
      actor_user_name: currentUser.name,
      actor_user_role: getPrimaryRole(currentUser.roles),
    });
    await pushNotif(req.requesterId, 'Payment Completed', `Payment for your requisition ${req.reqNumber} has been processed.`, 'payment', reqId);
    await refreshReq(reqId);
  };

  const generatePOInternal = async (reqId: string, currentUser: User): Promise<string | null> => {
    const po = await apiGeneratePO(Number(reqId), {
      actor_user_id: Number(currentUser.id),
      actor_user_name: currentUser.name,
      actor_user_role: getPrimaryRole(currentUser.roles),
    });
    setPurchaseOrders(prev => [mapPO(po), ...prev.filter(p => p.requisitionId !== reqId)]);
    return po.po_number;
  };

  const generatePO = async (reqId: string, currentUser: User): Promise<string | null> => {
    const poNumber = await generatePOInternal(reqId, currentUser);
    await pushNotif(currentUser.id, 'PO Generated', `Purchase Order ${poNumber} has been generated.`, 'info', reqId);
    await refreshReq(reqId);
    return poNumber;
  };

  // ─── Notifications ──────────────────────────────────────────────────────────

  const markNotificationRead = async (id: string) => {
    await apiMarkRead(Number(id));
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async (userId: string) => {
    await apiMarkAllRead(Number(userId));
    setNotifications(prev => prev.map(n => n.recipientId === userId ? { ...n, read: true } : n));
  };

  // ─── Users ──────────────────────────────────────────────────────────────────

  const updateUser = async (id: string, data: Partial<User>) => {
    const payload: Partial<ApiUser> & { roles?: string[] } = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.email !== undefined) payload.email = data.email;
    if (data.password !== undefined) payload.password = data.password;
    if (data.department !== undefined) payload.department = data.department;
    if (data.active !== undefined) payload.active = data.active;
    if (data.phone !== undefined) payload.phone = data.phone;
    if (data.mustChangePassword !== undefined) payload.must_change_password = data.mustChangePassword;
    if (data.passwordChangedAt !== undefined) payload.password_changed_at = data.passwordChangedAt || null;
    if (data.roles !== undefined) payload.roles = data.roles;
    const updated = await apiUpdateUser(Number(id), payload);
    setUsers(prev => prev.map(u => u.id === id ? mapUser(updated) : u));
  };

  const toggleUserActive = async (id: string) => {
    const user = users.find(u => u.id === id);
    if (!user) return;
    await updateUser(id, { active: !user.active });
  };

  const addUser = async (data: Omit<User, 'id'>) => {
    const created = await apiCreateUser({
      name: data.name, email: data.email, password: data.password,
      department: data.department, active: data.active,
      joined_date: data.joinedDate || null,
      phone: data.phone || '', avatar: data.avatar || '',
      must_change_password: true, password_changed_at: null,
      roles: data.roles,
    });
    setUsers(prev => [...prev, mapUser(created)]);
  };

  return (
    <AppContext.Provider value={{
      requisitions, purchaseOrders, notifications, auditLog, users, loading, reload: loadAll,
      createRequisition, updateRequisition, submitRequisition, approveStep,
      rejectRequisition, returnRejectedToDraft, cancelRequisition, addComment,
      markAsPendingPayment, markAsPaid, uploadProofOfPayment, generatePO,
      markNotificationRead, markAllRead, updateUser, toggleUserActive, addUser,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
