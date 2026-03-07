# Deploy MARS IRS on Render

Yes. You can run the whole project on [Render](https://render.com): **PostgreSQL** + **backend (Django)** + **frontend (static site)**.

---

## 1. Create a PostgreSQL database

1. In [Render Dashboard](https://dashboard.render.com) → **New** → **PostgreSQL**.
2. Name it (e.g. `mars-irs-db`), choose region, then **Create Database**.
3. After it’s created, open the DB and copy the **Internal Database URL** (use this for the backend; it’s only available to other Render services in the same account).

---

## 2. Deploy the backend (Django)

1. **New** → **Web Service**.
2. Connect the **INTERNAL-REQUISITIONS** repo.
3. Configure:
   - **Name:** e.g. `mars-irs-api`
   - **Region:** same as the database.
   - **Root Directory:** `backend`
   - **Runtime:** **Docker** (use the repo’s `backend/Dockerfile`).
   - **Instance type:** Free or paid.

4. **Environment variables** (use “Add from Render” for the DB, or set manually):

   | Key | Value |
   |-----|--------|
   | `DATABASE_URL` | *(from Render PostgreSQL “Internal Database URL”)* |
   | `SECRET_KEY` | A long random string (e.g. from `openssl rand -hex 32`) |
   | `DEBUG` | `False` |
   | `ALLOWED_HOSTS` | `mars-irs-api.onrender.com` (and any custom domain) |
   | `CORS_ALLOWED_ORIGINS` | `https://mars-irs.onrender.com` *(set after you create the frontend; see below)* |

   If your backend doesn’t use `DATABASE_URL` and expects separate vars (e.g. from `backend/.env.example`), set:

   - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` from the Internal Database URL, or use a [script](https://render.com/docs/databases#connection-strings) to parse `DATABASE_URL` into these.

5. **Build & Deploy.** Note the backend URL, e.g. `https://mars-irs-api.onrender.com`.

---

## 3. Deploy the frontend (static site)

1. **New** → **Static Site**.
2. Connect the same **INTERNAL-REQUISITIONS** repo.
3. Configure:
   - **Name:** e.g. `mars-irs`
   - **Root Directory:** *(leave blank; repo root)*
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`

4. **Environment** (important – Vite bakes this in at build time):

   | Key | Value |
   |-----|--------|
   | `VITE_API_BASE` | `https://mars-irs-api.onrender.com` *(your backend URL from step 2, no trailing slash)* |

5. **Create Static Site.** Note the frontend URL, e.g. `https://mars-irs.onrender.com`.

6. **CORS:** In the **backend** service on Render, set:
   - `CORS_ALLOWED_ORIGINS` = `https://mars-irs.onrender.com` (and any other frontend origins you use).

   Then redeploy the backend so the new CORS setting is applied.

---

## 4. Optional: render.yaml (Blueprint)

You can define all of the above in a single **Blueprint** so Render creates/updates everything from the repo.

Example `render.yaml` in the **repo root**:

```yaml
databases:
  - name: mars-irs-db
    databaseName: ir_db
    user: ir_user
    plan: free

services:
  - type: web
    name: mars-irs-api
    runtime: docker
    dockerfilePath: ./backend/Dockerfile
    dockerContext: ./backend
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: mars-irs-db
          property: connectionString
      - key: SECRET_KEY
        generateValue: true
      - key: DEBUG
        value: "false"
      - key: ALLOWED_HOSTS
        value: mars-irs-api.onrender.com
      - key: CORS_ALLOWED_ORIGINS
        sync: false  # set manually to frontend URL after first deploy

  - type: web
    name: mars-irs
    runtime: static
    staticPublishPath: dist
    buildCommand: npm install && npm run build
    envVars:
      - key: VITE_API_BASE
        value: https://mars-irs-api.onrender.com  # or sync: false and set after backend is live
```

Then in the Render dashboard: **New** → **Blueprint** → connect the repo and select `render.yaml`. Adjust names/URLs to match what you chose in steps 1–3.

---

## Summary

| Component | Render type | Notes |
|-----------|-------------|--------|
| **PostgreSQL** | Database | Use Internal URL for backend. |
| **Backend (Django)** | Web Service (Docker) | Root `backend`, use `backend/Dockerfile`. Set DB + CORS + SECRET_KEY. |
| **Frontend (Vite/React)** | Static Site | Build `npm run build`, publish `dist`, set `VITE_API_BASE` to backend URL. |

After deployment, open the **frontend** URL; the app will call the **backend** URL for audit trail and any other APIs that use `VITE_API_BASE`. Requisition/approval flow that still uses in-memory state in the frontend will work without the backend; connect those to Django APIs when you’re ready.
