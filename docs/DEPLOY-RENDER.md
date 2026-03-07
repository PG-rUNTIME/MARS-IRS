# Deploy MARS IRS on Render

Three services: **PostgreSQL** + **Django backend** + **React frontend (static site)**.
The repo includes a `render.yaml` Blueprint that automates most of this.

---

## Option A — One-click Blueprint (recommended)

1. Push the repo to GitHub (already done).
2. In [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
3. Connect the **INTERNAL-REQUISITIONS** repo.
4. Render reads `render.yaml` and creates all three services automatically.
5. After the first deploy, note the **frontend URL** (e.g. `https://mars-irs.onrender.com`) and the **backend URL** (e.g. `https://mars-irs-api.onrender.com`).
6. If the frontend URL differs from `https://mars-irs.onrender.com`, update `CORS_ALLOWED_ORIGINS` on the backend service and redeploy.

---

## Option B — Manual setup (step by step)

### 1. PostgreSQL database

1. **New** → **PostgreSQL**.
2. Name: `mars-irs-db`, plan: Free.
3. After creation, copy the **Internal Database URL**.

---

### 2. Backend (Django — Docker)

1. **New** → **Web Service**.
2. Connect the **INTERNAL-REQUISITIONS** repo.
3. Settings:
   - **Root Directory:** `backend`
   - **Runtime:** Docker
   - **Dockerfile path:** `./Dockerfile` (relative to root directory)

4. Environment variables:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Internal Database URL from step 1 |
| `SECRET_KEY` | Generate with `openssl rand -hex 32` |
| `DEBUG` | `False` |
| `ALLOWED_HOSTS` | `mars-irs-api.onrender.com` |
| `CORS_ALLOWED_ORIGINS` | `https://mars-irs.onrender.com` (set after step 3) |

5. **Create Web Service.** The entrypoint runs `migrate` then seeds the admin user automatically.

---

### 3. Frontend (React — Static Site)

1. **New** → **Static Site**.
2. Connect the same repo.
3. Settings:
   - **Root Directory:** *(leave blank)*
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`

4. Environment variable:

| Key | Value |
|-----|-------|
| `VITE_API_BASE` | `https://mars-irs-api.onrender.com` (your backend URL — no trailing slash) |

> **Important:** `VITE_API_BASE` is baked into the JS bundle at build time. If you change it, trigger a redeploy of the frontend.

5. **Create Static Site.**

---

### 4. Wire CORS

Once both services are deployed:

- In the **backend** service → **Environment** → set `CORS_ALLOWED_ORIGINS` to the frontend URL.
- **Manual deploy** the backend to apply the change.

---

## First login

The entrypoint seeds one admin user on first deploy:

| Field | Value |
|-------|-------|
| Email | `admin@marsambulance.com` |
| Password | `mars2026` |

> Change the password immediately after first login via User Management.

---

## Summary

| Component | Render type | Key settings |
|-----------|-------------|--------------|
| PostgreSQL | Database | Free plan, Internal URL for backend |
| Backend (Django) | Web Service – Docker | `DATABASE_URL`, `SECRET_KEY`, `CORS_ALLOWED_ORIGINS` |
| Frontend (React) | Static Site | `VITE_API_BASE` = backend URL |
