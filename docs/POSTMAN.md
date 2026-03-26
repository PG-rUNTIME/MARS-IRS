# Testing the MARS IRS API with Postman

This guide explains how to authenticate and call the Django REST API from **Postman** (or any HTTP client). All routes live under the **`/api/`** prefix.

---

## Table of contents

1. [Base URLs](#base-urls)
2. [How authentication works](#how-authentication-works)
3. [Postman setup (recommended)](#postman-setup-recommended)
4. [Step-by-step: first request](#step-by-step-first-request)
5. [Endpoint reference](#endpoint-reference)
6. [Pagination & query parameters](#pagination--query-parameters)
7. [Example JSON bodies](#example-json-bodies)
8. [Common errors](#common-errors)
9. [Security notes](#security-notes)
10. [Further reading](#further-reading)

---

## Base URLs

| Environment | Base URL (use as `{{base_url}}`) |
|-------------|----------------------------------|
| **Deployed backend (your server)** | `http://10.169.39.56:8001/api` |
| **Production (generic)** | `https://your-backend-host/api` |

This document uses the pattern: **`{{base_url}}/auth/login/`** (so `{{base_url}}` includes `/api`).
With the deployed value above, your request URLs will look like:
`http://10.169.39.56:8001/api/<endpoint-path>`.

---

## How authentication works

1. **Login** is a **public** endpoint: `POST /api/auth/login/` with JSON `email` and `password`.
2. The server returns a **`token`** string and a **`user`** object.
3. For **all other endpoints** (except a few special cases below), send:
   - **Header:** `Authorization: Token <your-token-here>`
   - Exactly the word **`Token`**, a space, then the key (same as the web app’s `client.ts`).
4. **Logout** (`POST /api/auth/logout/`) deletes the current token. After that, the same token returns **401**.
5. **Each login creates a new token.** Old tokens remain valid until you delete them (e.g. via logout) or clean the database.

**Content-Type:** For JSON bodies, set:

`Content-Type: application/json`

---

## Postman setup (recommended)

### 1. Create an environment

Create a Postman **Environment** (e.g. `MARS IRS Local`) with:

| Variable | Initial value | Purpose |
|----------|---------------|---------|
| `base_url` | `http://10.169.39.56:8001/api` | All request URLs |
| `token` | *(empty)* | Filled after login |
| `user_id` | *(empty)* | Optional: from login response |

Select this environment in the top-right dropdown before sending requests.

### 2. Collection-level authorization

1. Create a **Collection** for MARS IRS.
2. Open the collection → **Authorization** tab.
3. Set up an `Authorization` header for the collection (so it applies to all requests after login):
   - Header name: `Authorization`
   - Header value: `Token {{token}}`
   - The backend expects the exact prefix `Token` followed by a space and your key.

### 3. Auto-save token after login (optional)

On the **Login** request, tab **Tests**:

```javascript
if (pm.response.code === 200) {
  const json = pm.response.json();
  if (json.token) {
    pm.environment.set("token", json.token);
  }
  if (json.user && json.user.id) {
    pm.environment.set("user_id", String(json.user.id));
  }
}
```

After a successful login, `token` (and `user_id`) are stored for the active environment.

---

## Step-by-step: first request

### 1. Login

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/login/`
- **Headers:** `Content-Type: application/json`
- **Body (raw JSON):**

```json
{
  "email": "admin@marsambulance.com",
  "password": "your-actual-password"
}
```

- **Response (200):** `token`, `user` (id, email, name, roles, department, …).

Copy `token` into your environment if you did not use the Tests script.

### 2. Authenticated request (example: list requisitions)

- **Method:** `GET`
- **URL:** `{{base_url}}/requisitions/`
- **Headers:**
  - `Authorization: Token {{token}}`
  - *(GET bodies are empty)*

You should receive a paginated JSON response with `count`, `next`, `previous`, `results`.

### 3. Logout (optional)

- **Method:** `POST`
- **URL:** `{{base_url}}/auth/logout/`
- **Headers:** `Authorization: Token {{token}}`
- **Body:** none required.

---

## Endpoint reference

Below, paths are relative to **`{{base_url}}`** (i.e. after `/api`).

Legend: **Auth** = requires `Authorization: Token …`. **Roles** = extra permission checks on top of authenticated user (403 if missing).

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login/` | No | Body: `email`, `password`. Returns `token` + `user`. |
| POST | `/auth/logout/` | Yes | Invalidates the token sent in the header. |
| POST | `/auth/verify-password/` | Yes | Body: `password`. Returns `{ "valid": true/false }` for the **current** user. |

### Users

| Method | Path | Auth | Roles / notes |
|--------|------|------|----------------|
| GET | `/users/` | Yes | List all users (any authenticated user). |
| POST | `/users/` | Yes | **System Administrator only.** Create user (see `UserSerializer` / README for fields). |
| GET | `/users/<id>/` | Yes | User detail. |
| PATCH | `/users/<id>/` | Yes | **Admin:** full update. **Non-admin:** only own record, and only `password`, `must_change_password`, `password_changed_at`. |
| DELETE | `/users/<id>/` | Yes | **System Administrator only.** |
| POST | `/users/<id>/reset/` | Yes | **System Administrator.** Resets password to default and forces password change. |

### Requisitions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/requisitions/` | Yes | Query: `status`, `department`, `requester_id`, `page`, `page_size`. Paginated list. |
| POST | `/requisitions/` | Yes | Create requisition (large payload: fields + `approval_chain` + optional `items` + supplier JSON). See [Example JSON bodies](#example-json-bodies). |
| GET | `/requisitions/<id>/` | Yes | Full detail (chain, comments, attachments, items, audit, PO). |
| PATCH | `/requisitions/<id>/` | Yes | Partial update; optional replace `approval_chain` / `items`; use `audit_action` / `audit_details` for audit line. **Payment-state mutations (`Pending Payment`, `Paid`, `paid_at`) are finance-team only** (`Accountant`, `Financial Controller`, `General Manager`). |
| DELETE | `/requisitions/<id>/` | Yes | Delete requisition. |
| POST | `/requisitions/<id>/comments/` | Yes | Body: `user_id`, `user_name`, `user_role`, `text`, `is_finance_note`. |
| POST | `/requisitions/<id>/attachments/` | Yes | Body: `name`, `type`, `size`, `uploaded_by`, `data_url` (URL or `data:...;base64,...`), `is_proof_of_payment`. **If `is_proof_of_payment=true`, requisition must be `Pending Payment` and caller must be finance-team role (`Accountant`, `Financial Controller`, `General Manager`).** |
| GET | `/attachments/<id>/download/` | Yes | Download file when stored on disk. |
| POST | `/requisitions/<id>/generate-po/` | Yes | Generate purchase order. Optional body: `buyer_company`, `buyer_address`, `actor_user_id`, etc. |

### Department budgets

| Method | Path | Auth | Roles / notes |
|--------|------|------|----------------|
| GET | `/budgets/?year=<YYYY>` | Yes | View annual department budgets. Roles: `Financial Controller`, `General Manager`, `Accountant`, `Department Manager`. |
| POST | `/budgets/` | Yes | **Financial Controller only.** Upsert annual department budget. Body: `year`, `department`, `usd_budget`, `zig_budget`. |
| GET | `/budgets/stats/?year=<YYYY>` | Yes | Budget analytics (department + organisation totals), includes utilization percentages, threshold alerts (80/90), and monthly trend (`usd_consumed`, `zig_consumed`). Same view roles as budget GET. |

### Purchase orders

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/purchase-orders/` | Yes | Paginated list. |
| GET | `/purchase-orders/<id>/` | Yes | Detail. |
| PATCH | `/purchase-orders/<id>/` | Yes | Body may include `status`, `approver_names`. |

### Notifications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/notifications/` | Yes | Query: `recipient_id` (optional filter). |
| POST | `/notifications/` | Yes | Body: `recipient_id`, optional `requisition_id`, `title`, `message`, `type` (`submission` / `approval` / `rejection` / `payment` / `info`). |
| PATCH | `/notifications/<id>/read/` | Yes | Mark one notification read. |
| POST | `/notifications/mark-all-read/` | Yes | Body: `recipient_id`. |

### Delegations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/delegations/` | Yes | List delegation records. |
| POST | `/delegations/` | Yes | Create (shape: `DelegationRecordSerializer`). |
| PATCH | `/delegations/<id>/` | Yes | Partial update. |

### Audit

| Method | Path | Auth | Roles |
|--------|------|------|--------|
| GET | `/audit/` | Yes | **Auditor** or **Financial Controller**. Query filters: `search`, `action`, `role`, `user`, `requisition_id`, `date_from`, `date_to`, `page`, `page_size`. |
| GET | `/audit/requisitions/` | Yes | Same roles. Summary per requisition; `page`, `page_size`. |
| GET | `/audit/export/` | Yes | Same roles. Returns CSV download. |

`/audit/requisitions/` only summarizes logs tied to a requisition. For system/user actions that are not requisition-linked (for example `Login`), use `/audit/`.

### Database & backups

These routes use **`AllowAny`** (no token required). **Treat backup/restore as highly sensitive**—restrict by network/firewall in production. See `docs/PRODUCTION.md`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/database/health/` | DB connectivity / version. |
| GET | `/database/backups/` | List backup files. |
| POST | `/database/backups/create/` | Body: optional `name`. Creates SQL backup. |
| POST | `/database/backups/restore/` | Body: `filename`. **Destructive.** |
| POST | `/database/backups/upload-restore/` | Upload + restore (multipart/form-data). **Field name:** `file` (must be a `.sql`). |
| GET | `/database/backups/<filename>/download/` | Download a backup file. |

### SMTP & email helpers

| Method | Path | Auth | Roles / notes |
|--------|------|------|----------------|
| GET | `/settings/smtp/` | Yes | **System Administrator.** Public-safe SMTP fields. |
| POST | `/settings/smtp/save/` | Yes | **System Administrator.** Body: `host`, `port`, `username`, `password`, `from_email`, `use_tls`. |
| POST | `/notifications/send-email/` | Yes | Body: `to_email`, `subject`, `body`, optional `body_html`. Requires SMTP configured. |
| POST | `/notifications/send-requisition-email/` | Yes | Body: `to_email`, `subject`, `headline`, `status_stage`, `requisition_id`, optional `login_url`. |

---

## Pagination & query parameters

- Default page size is **25**; many list endpoints support **`page`** and **`page_size`** (capped, e.g. requisitions max **200** on some clients).
- Paginated responses typically look like:

```json
{
  "count": 123,
  "next": "http://10.169.39.56:8001/api/requisitions/?page=2",
  "previous": null,
  "results": [ ... ]
}
```

**Requisitions GET** filters:

- `status` — exact status string (e.g. `Pending Payment`)
- `department`
- `requester_id` — numeric user id

**Notifications GET:**

- `recipient_id` — only that user’s notifications

---

## Example JSON bodies

### Login

```json
{
  "email": "user@example.com",
  "password": "secret"
}
```

### Create notification

```json
{
  "recipient_id": 2,
  "requisition_id": 15,
  "title": "Payment required",
  "message": "Requisition IR20250319 is pending payment.",
  "type": "payment"
}
```

### Mark all notifications read

```json
{
  "recipient_id": 2
}
```

### Add comment to requisition

```json
{
  "user_id": 2,
  "user_name": "Jane Doe",
  "user_role": "Accountant",
  "text": "Please attach tax invoice.",
  "is_finance_note": true
}
```

### Add attachment (minimal)

```json
{
  "name": "invoice.pdf",
  "type": "application/pdf",
  "size": "120 KB",
  "uploaded_by": "Jane Doe",
  "data_url": "https://example.com/file.pdf",
  "is_proof_of_payment": false
}
```

### Upload POP (finance team only)

```json
{
  "name": "proof-of-payment.pdf",
  "type": "application/pdf",
  "size": "220 KB",
  "uploaded_by": "Finance Officer",
  "data_url": "data:application/pdf;base64,JVBERi0xLjcK...",
  "is_proof_of_payment": true
}
```

### Create or update budget

```json
{
  "year": 2026,
  "department": "Information Technology",
  "usd_budget": 50000,
  "zig_budget": 200000
}
```

For large files, the API accepts **`data_url`** as `data:application/pdf;base64,...` (size limit applies on the server).

### PATCH requisition (status / audit)

Exact fields depend on `RequisitionWriteSerializer`. Typical pattern from the app:

```json
{
  "status": "Pending Payment",
  "current_approver_role": null,
  "audit_action": "Payment Initiated",
  "audit_details": "REQ123 marked as Pending Payment by Jane.",
  "actor_user_id": 2,
  "actor_user_name": "Jane Doe",
  "actor_user_role": "Accountant"
}
```

Use **`GET /requisitions/<id>/`** first to see the full shape, then **`PATCH`** with the fields you need (`partial=True` on the server).

### Generate PO

```json
{
  "buyer_company": "MARS Ambulance Services",
  "buyer_address": "14 Fife Avenue, Harare, Zimbabwe"
}
```

Empty body `{}` is also valid (defaults apply).

---

## Common errors

| HTTP | Meaning |
|------|---------|
| **401 Unauthorized** | Missing/invalid `Authorization` header or unknown token. |
| **403 Forbidden** | Authenticated but not allowed (e.g. non-admin calling `POST /users/`). |
| **400 Bad Request** | Validation error; body often lists field errors from DRF. |
| **404 Not Found** | Wrong `id` or resource deleted. |
| **413 Payload Too Large** | e.g. attachment base64 over server limit. |
| **500 / 503** | Server or DB error; check Django logs (`backend/logs/mars_irs.log` if configured). |

---

## Security notes

- **HTTPS** in production; do not send real passwords over plain HTTP on public networks.
- Tokens are **opaque secrets**—treat like passwords in Postman (do not commit collections with live tokens).
- The API trusts **`actor_user_id`** and similar fields in some payloads for audit/UI parity; for strict security, the backend would need to ignore client-supplied actor ids and use only `request.user`. See **`docs/PRODUCTION.md`** (API authentication section).
- **CORS** does not apply to Postman; it only affects browser-based apps.

---

## Further reading

- Route list in code: `backend/core/urls.py` (included from `backend/config/urls.py` at `/api/`).
- Serializers and field names: `backend/core/serializers.py`.
- Frontend API wrapper (same paths and `Token` header): `src/app/api/client.ts`.
- Production checklist: `docs/PRODUCTION.md`.

---

*Last updated to match the API structure in the MARS IRS repository. If an endpoint returns a different shape after an upgrade, prefer the live response and `serializers.py` as source of truth.*
