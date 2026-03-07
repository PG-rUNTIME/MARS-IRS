# MARS IRS – System Architecture

High-level architecture of the full system (frontend, backend, database) and main data flows.

---

## High-level overview

```mermaid
flowchart TB
  subgraph Client["🖥️ Client"]
    Browser["Browser"]
  end

  subgraph Frontend["Frontend (Static)"]
    SPA["React SPA\n(Vite build)"]
    SPA --> Router["React Router"]
    SPA --> Context["AppContext\n(in-memory state)"]
    SPA --> API["API client\n(VITE_API_BASE)"]
  end

  subgraph Backend["Backend (Django)"]
    API_GW["HTTP API"]
    API_GW --> Auth["Auth / Sessions"]
    API_GW --> ReqAPI["Requisitions API"]
    API_GW --> POAPI["Purchase Orders API"]
    API_GW --> AuditAPI["Audit API"]
    API_GW --> DBAPI["Database / Backup API"]
  end

  subgraph Data["Data"]
    PG[("PostgreSQL")]
  end

  Browser -->|HTTPS| SPA
  API -->|REST / JSON| API_GW
  Backend -->|SQL| PG
```

---

## Component diagram

```mermaid
flowchart LR
  subgraph Users
    U1[Requester]
    U2[Dept Manager]
    U3[Accountant]
    U4[GM / FC / Head of Ops]
    U5[Auditor / Admin]
  end

  subgraph Frontend["Frontend"]
    UI[React UI\nLogin, Dashboard,\nRequisitions, PO, Reports]
    State[AppContext\nRequisitions, POs,\nNotifications, Audit]
    Client[API client\nAudit, DB health when\nVITE_API_BASE set]
  end

  subgraph Backend["Backend (Django)"]
    WSGI[WSGI / ASGI]
    AuthB[Auth]
    ReqB[Requisitions]
    POB[Purchase Orders]
    AuditB[Audit log]
    DBHealth[DB health / backups]
  end

  subgraph DB
    PG[("PostgreSQL")]
  end

  Users --> UI
  UI --> State
  UI --> Client
  Client -->|REST| WSGI
  WSGI --> AuthB
  WSGI --> ReqB
  WSGI --> POB
  WSGI --> AuditB
  WSGI --> DBHealth
  AuthB --> PG
  ReqB --> PG
  POB --> PG
  AuditB --> PG
  DBHealth --> PG
```

---

## Request flow (simplified)

```mermaid
sequenceDiagram
  participant U as User (Browser)
  participant F as Frontend (React)
  participant B as Backend (Django)
  participant D as PostgreSQL

  Note over F: In-memory mode (no VITE_API_BASE)
  U->>F: Load app
  F->>F: AppContext (requisitions, POs, audit)
  U->>F: Create / approve / upload POP
  F->>F: Update state only

  Note over F,B: API mode (VITE_API_BASE set)
  U->>F: Audit trail / DB health
  F->>B: GET /api/audit/ or /api/database/health/
  B->>D: Query
  D-->>B: Rows
  B-->>F: JSON
  F-->>U: Render
```

---

## Requisition lifecycle (logical flow)

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Submitted: Submit
  Submitted --> Pending_Review: Dept Manager approves
  Pending_Review --> Pending_Approval: Accountant approves
  Pending_Approval --> Pending_Approval: GM / FC approve (non–Petty Cash)
  Pending_Approval --> Pending_Payment: Final approval\n(+ auto PO for Supplier/High-Value)
  Pending_Payment --> Paid: Accountant uploads POP
  Submitted --> Rejected: Reject
  Rejected --> Draft: Return to draft
  Draft --> Cancelled: Cancel
```

---

## Deployment (e.g. Render)

```mermaid
flowchart TB
  subgraph Render["Render"]
    subgraph Static["Static Site"]
      FE["Frontend\nbuild: npm run build\npublish: dist"]
    end
    subgraph Web["Web Service"]
      BE["Backend (Docker)\nbackend/Dockerfile"]
    end
    subgraph DB["PostgreSQL"]
      PG[("DB")]
    end
  end

  User["Users"] -->|HTTPS| FE
  FE -->|VITE_API_BASE| BE
  BE -->|Internal URL| PG
```

---

## Ports used by the system

| Port  | Component        | When / where |
|-------|------------------|--------------|
| **5173** | Frontend (Vite dev server) | Local dev: `npm run dev`. Default Vite port; may show 5174, 5175 if 5173 is in use. |
| **5174** | Frontend (nginx) | Docker Compose: host port **5174** → container port 80. Access app at `http://localhost:5174`. |
| **8000** | Backend (Django) | Inside backend container; also Django default when running `runserver` locally. |
| **8001** | Backend (Django) | Docker Compose: host port **8001** → container 8000. Frontend (when built with `VITE_API_BASE=http://localhost:8001`) calls API at `http://localhost:8001`. |
| **5432** | PostgreSQL       | DB listens on **5432** inside the `db` container. Not exposed to host in `docker-compose.yml`; only the backend container connects to it. If you run Postgres locally, it uses 5432 on the host. |

**Summary**

- **Docker Compose:** Use **5174** (frontend) and **8001** (backend) on your machine; Postgres is internal (5432).
- **Local dev (no Docker):** Frontend **5173**, backend **8000**, Postgres **5432** (if running locally).

---

## File / repo layout (conceptual)

| Layer      | Location        | Purpose |
|-----------|------------------|--------|
| Frontend  | `/` (repo root)  | Vite, React, Tailwind; `src/app/` (components, context, routes). |
| Backend   | `/backend`       | Django app; `manage.py`, Dockerfile, entrypoint, migrations. |
| Docs      | `/docs`          | Architecture, deploy guides. |
| Docker    | `docker-compose.yml`, `Dockerfile.frontend` | Local run: db + backend + frontend. |

---

## Summary

- **Frontend:** Single-page app (React + Vite). Serves static assets; state in memory (AppContext) or via backend when `VITE_API_BASE` is set (audit, DB health).
- **Backend:** Django HTTP API for auth, requisitions, POs, audit, DB health/backups. Writes to PostgreSQL.
- **Database:** PostgreSQL; holds users, requisitions, approval chains, POs, audit log, attachments/POP metadata (and optionally file storage).
- **Deployment:** Frontend as static site; backend as web service (e.g. Docker on Render); PostgreSQL as managed DB. Frontend build-time env `VITE_API_BASE` points to backend URL.
