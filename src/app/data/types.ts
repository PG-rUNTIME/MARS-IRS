export type RequisitionType =
  | 'Petty Cash'
  | 'Supplier Payment (Normal)'
  | 'High-Value/CAPEX';

export type RequisitionStatus =
  | 'Draft'
  | 'Submitted'
  | 'Pending Review'
  | 'Pending Approval'
  | 'Approved'
  | 'Pending Payment'
  | 'Paid'
  | 'Rejected'
  | 'Cancelled';

export type UserRole =
  | 'Requester'
  | 'Department Manager'
  | 'Accountant'
  | 'General Manager'
  | 'Financial Controller'
  | 'Head of Operations'
  | 'Procurement Clerk'
  | 'System Administrator'
  | 'Auditor';

export type RFQStatus =
  | 'Draft'
  | 'Pending Procurement'
  | 'Pending Requester Selection'
  | 'Converted'
  | 'Cancelled';

export type Currency = 'USD' | 'ZIG';

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  /** User can have multiple roles; capabilities are combined from all assigned roles. */
  roles: UserRole[];
  department: string;
  active: boolean;
  joinedDate: string;
  phone?: string;
  avatar?: string;
  /** When true, user must change password on next login (e.g. after first sign-in with default password). */
  mustChangePassword?: boolean;
  /** ISO date when the user last changed their password. Used to enforce 30-day password expiry. */
  passwordChangedAt?: string;
}

export interface ApprovalStep {
  id: string;
  role: UserRole;
  label: string;
  approverId?: string;
  approverName?: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Delegated' | 'Skipped';
  timestamp?: string;
  comments?: string;
  delegatedTo?: string;
  delegatedToName?: string;
}

export interface ReqComment {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  text: string;
  timestamp: string;
  isFinanceNote: boolean;
}

export interface AuditEntry {
  id: string;
  action: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  timestamp: string;
  details: string;
  requisitionId?: string;
  requisitionNumber?: string;
  /** Currency of the linked requisition (USD or ZIG) when applicable */
  requisitionCurrency?: string;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadedBy: string;
  uploadedAt: string;
  /** Optional data URL for download (e.g. from uploaded PDF). */
  dataUrl?: string;
}

export interface POItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
}

export interface Requisition {
  id: string;
  reqNumber: string;
  rfqId?: string;
  type: RequisitionType;
  description: string;
  justification: string;
  amount: number;
  currency: string;
  department: string;
  costCenter: string;
  budgetAvailable: boolean;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  status: RequisitionStatus;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  approvalChain: ApprovalStep[];
  currentApproverRole: UserRole | null;
  supplier?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  supplierAddress?: string;
  supplierContact?: string;
  isCapex: boolean;
  attachments: Attachment[];
  comments: ReqComment[];
  poGenerated: boolean;
  poNumber?: string;
  paidAt?: string;
  /** Proof of Payment document (uploaded by accountant after payment). */
  proofOfPayment?: Attachment;
  auditLog: AuditEntry[];
  // Type-specific
  vehicleReg?: string;
  fuelType?: string;
  fuelQuantity?: number;
  travelDestination?: string;
  travelStartDate?: string;
  travelEndDate?: string;
  assetType?: string;
  assetSpecs?: string;
  maintenanceItem?: string;
  maintenanceUrgency?: 'Low' | 'Medium' | 'High' | 'Critical';
  items?: POItem[];
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  date: string;
  version: number;
  requisitionId: string;
  reqNumber: string;
  buyerCompany: string;
  buyerAddress: string;
  buyerDepartment: string;
  buyerContact: string;
  supplierName: string;
  supplierAddress: string;
  supplierContact: string;
  supplierEmail: string;
  supplierPhone: string;
  items: POItem[];
  currency: string;
  subtotal: number;
  total: number;
  requesterName: string;
  approverNames: string[];
  status: 'Open' | 'Closed' | 'Cancelled';
  createdAt: string;
}

export interface AppNotification {
  id: string;
  recipientId: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  requisitionId?: string;
  rfqId?: string;
  type: 'submission' | 'approval' | 'rejection' | 'payment' | 'info';
}

// ─── RFQ (Request for Quotation) ─────────────────────────────────────────────

export interface RFQItem {
  id: string;
  order: number;
  description: string;
  quantity: number;
  unit: string;
}

export interface RFQQuoteItem {
  id: string;
  rfqItemId: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
}

export interface RFQQuoteAttachment {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadedBy: string;
  uploadedAt: string;
  dataUrl?: string;
  filePath?: string;
  isQuoteDocument: boolean;
}

export interface RFQQuote {
  id: string;
  createdBy?: string;
  supplierId?: string;
  supplierName: string;
  supplierEmail: string;
  supplierPhone: string;
  supplierAddress: string;
  supplierContact: string;
  supplierBankName: string;
  supplierBankAccountName: string;
  supplierBankAccountNumber: string;
  supplierBankBranch: string;
  quoteCurrency: string;
  quoteTotalAmount: number;
  quoteNotes: string;
  quoteValidUntil?: string;
  items: RFQQuoteItem[];
  attachments: RFQQuoteAttachment[];
}

export interface RFQ {
  id: string;
  rfqNumber: string;
  type: RequisitionType;
  requesterId: string;
  requesterName?: string;
  requesterEmail?: string;
  department: string;
  costCenter: string;
  budgetAvailable: boolean;
  currency: string;
  description: string;
  justification: string;
  amountEstimated: number;
  status: RFQStatus;
  selectedQuoteId?: string;
  selectedSupplierName?: string;
  selectedSupplierJustification?: string;
  submittedAt?: string;
  procurementCompletedAt?: string;
  convertedAt?: string;
  convertedRequisitionNumber?: string;
  events: Array<{
    id: string;
    order: number;
    status: string;
    label: string;
    actorId?: string;
    actorName: string;
    actorRole?: string;
    timestamp: string;
  }>;
  items: RFQItem[];
  quotes: RFQQuote[];
}

export interface Supplier {
  id: string;
  name: string;
  category: string;
  physicalAddress: string;
  contactEmail: string;
  contactPerson: string;
  active: boolean;
  suspended: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentBudget {
  id: string;
  year: number;
  department: string;
  usdBudget: number;
  zigBudget: number;
  usdConsumed: number;
  zigConsumed: number;
  usdRemaining: number;
  zigRemaining: number;
  usdUtilizationPct: number;
  zigUtilizationPct: number;
}

export interface DelegationRecord {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  startDate: string;
  endDate: string;
  reason: string;
  createdAt: string;
  active: boolean;
}
