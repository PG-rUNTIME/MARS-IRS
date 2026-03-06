# MARS IRS

**MARS  IRS** (Internal Requisitions System) covers both **frontend** (this repo) and **backend** (APIs, auth, persistence). This document describes both.

---

## Frontend

### Stack

- **React 18** + **TypeScript**
- **Vite 7** (build tool)
- **React Router 7** (routing)
- **Tailwind CSS 4** (styling)
- **Recharts** (charts)

At present the app uses **in-memory state** (AppContext) and mock users; a real backend would replace this with API calls.

### Run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) (or the port shown in the terminal).

```bash
npm run build      # production build
npm run preview    # preview production build
```

Clean rebuild (no cache):

```bash
rm -rf node_modules/.vite dist && npm run build
```

### Features (UI)

- **Dashboard** – KPIs and charts by role (e.g. department heads see department requisitions).
- **Requisitions** – Create, edit (draft), submit; search and filter by type, status, department.
- **Department Requisitions** – Department heads see all requisitions in their department and stages.
- **Approval workflow** – Approve, reject, return to draft; comments and audit trail.
- **Purchase Orders** – Auto-generated on final approval for Supplier Payment and High-Value/CAPEX; view from requisition or Purchase Orders list.
- **Payment** – Pending Payment → accountant views PO, pays externally, uploads POP → status becomes Paid.
- **Attachments** – Supporting documents (e.g. PDFs); upload and download where stored.
- **Audit trail** – Filterable log of actions.
- **Reports** – Summary and breakdowns by type, status, department.
- **User management** – (Admin) Users, roles, departments.

### Frontend structure

```
src/
  app/
    components/     # Layout, Dashboard, RequisitionForm, RequisitionDetail, etc.
    context/        # AppContext (requisitions, POs, notifications, audit)
    data/           # types, mock users, role capabilities
    routes.tsx
  styles/
```

---

## Backend

The backend is responsible for **authentication**, **persistence**, and **business rules** (approvals, PO generation, payment status). The frontend expects a backend that exposes APIs and stores data in a database.

### Responsibilities

| Area | Backend role |
|------|----------------|
| **Auth** | Login, sessions/JWT, role-based access (Department Manager, Accountant, GM, FC, Head of Ops, Auditor, Admin). |
| **Requisitions** | CRUD, status transitions (Draft → Submitted → Pending Approval/Review → Pending Payment → Paid), approval chain by type. |
| **Approval chain** | Petty Cash: Dept Manager → Accountant → Head of Ops & Training. Supplier Payment / High-Value/CAPEX: Dept Manager → Accountant → GM → FC. |
| **Purchase orders** | Auto-generate PO on final approval for Supplier Payment and High-Value/CAPEX; store PO number and link to requisition. |
| **Payment** | Pending Payment → accountant uploads Proof of Payment (POP); mark requisition Paid with `paidAt`. |
| **Attachments** | Store file metadata and (or) file binary/blob storage for supporting docs and POP. |
| **Audit** | Append-only log of actions (create, submit, approve, reject, PO generated, POP uploaded, etc.) with user, timestamp, requisition id. |
| **Users & roles** | User CRUD, departments, roles, active flag. |

### Suggested API shape (examples)

- `POST /auth/login` → token / session
- `GET /me` → current user and roles
- `GET /requisitions` – list (filters: status, type, department)
- `POST /requisitions` – create (draft)
- `PATCH /requisitions/:id` – update draft
- `POST /requisitions/:id/submit`
- `POST /requisitions/:id/approve` – body: comments
- `POST /requisitions/:id/reject` – body: reason
- `POST /requisitions/:id/return-to-draft`
- `POST /requisitions/:id/upload-pop` – multipart POP file → mark Paid
- `GET /purchase-orders` – list POs (optionally by requisition)
- `GET /audit` – audit log (filters)
- `GET /users`, `POST /users`, `PATCH /users/:id` – admin

### Data model (high level)

- **User** – id, name, email, department, roles[], active.
- **Requisition** – id, reqNumber (e.g. `IR…` / `PC…` + timestamp), type (Petty Cash, Supplier Payment (Normal), High-Value/CAPEX), status, amount, currency, department, cost centre, requester, approval chain (steps with role/status), supplier fields, attachments[], proofOfPayment?, poGenerated, poNumber, paidAt, audit references.
- **PurchaseOrder** – id, poNumber, requisitionId, supplier, amount, etc.
- **AuditEntry** – action, userId, requisitionId, timestamp, details.

---

## Requisition numbers

- **Petty Cash:** `PC` + timestamp (e.g. `PC20260306143045123`)
- **All other types:** `IR` + timestamp (e.g. `IR20260306143045123`)

Format: `PREFIX` + `YYYYMMDDHHmmssmmm` (no dashes).

---

## License

Private / internal use.
