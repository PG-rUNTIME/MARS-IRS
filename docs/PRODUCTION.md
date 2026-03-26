# Production Readiness Checklist

Use this checklist when deploying the IR system to production with Docker.

---

## Today's changes (Mar 26, 2026)

- Added **annual department budgets** (`USD` + `ZIG`) with:
  - budget setup endpoint/UI (`/api/budgets/`, Budget Setup page),
  - budget stats endpoint/UI (`/api/budgets/stats/`, Budget Stats page),
  - **80% / 90% utilization alerts**,
  - **monthly consumption trend** (USD and ZIG).
- Updated payment security and workflow:
  - **any finance-team member** (`Accountant`, `Financial Controller`, `General Manager`) can upload POP for `Pending Payment`,
  - payment-state mutations are enforced server-side as finance-only,
  - POP uploader role is now visible in requisition detail.
- Audit trail UX fix:
  - requisition-summary endpoint is used for requisition-linked events,
  - non-requisition actions (e.g. `Login`) are fetched from detailed audit endpoint in UI.

---

## Already production-friendly

- **Django settings**: `DEBUG` and `ALLOWED_HOSTS` come from environment variables; production security (secure cookies, proxy SSL header) is enabled when `DEBUG` is False.
- **Passwords**: Stored with bcrypt; seed command supports `ADMIN_PASSWORD` (and `ADMIN_EMAIL`) via environment.
- **Database**: PostgreSQL with migrations; backup/restore and health check endpoints available.
- **Frontend**: Build uses `VITE_API_BASE` so the app talks to your backend URL (empty when using same-origin proxy).

---

## Must do before production

1. **Set a strong `SECRET_KEY`**  
   Never use the default. Generate one, e.g. `openssl rand -hex 32`, and set it in your backend environment.

2. **Set `DEBUG=False`**  
   Set explicitly in the backend environment for production.

3. **Set `ALLOWED_HOSTS`**  
   Must include your backend hostname or IP (e.g. `api.yourdomain.com` or the backend service name in Docker). No wildcards in production.

4. **Set `CORS_ALLOWED_ORIGINS`**  
   Must include the exact frontend origin (e.g. `https://app.yourdomain.com`). No `*` in production.

5. **Use a strong database password**  
   Set `DB_PASSWORD` (or use `DATABASE_URL` with a strong password). Avoid default `postgres`.

6. **Change the default admin password**  
   First login: `admin@marsambulance.com` / `mars2026`. Change it immediately in User Management. For new deploys you can set `ADMIN_PASSWORD` (and optionally `ADMIN_EMAIL`) in the backend environment so the seed creates an admin with a secure password.

7. **Email “log in” link (notification emails)**  
   In **`docker-compose.yml`**, set **`FRONTEND_BASE_URL`** for the backend to your real app URL (e.g. `https://app.yourdomain.com`, no trailing slash). Emails use `{FRONTEND_BASE_URL}/login`.  
   Optional: **`REQUISITION_EMAIL_SYSTEM_NAME`** in the same file.

---

## Docker production deploy

- Edit **`docker-compose.yml`** (or a production override) so the backend service sets:
  - `SECRET_KEY`, `DEBUG=False`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`
  - Strong `DB_PASSWORD` (or `POSTGRES_PASSWORD` for the db service)
  - Optionally `ADMIN_PASSWORD` and `ADMIN_EMAIL` for the seeded admin
- Do not use the dev defaults in `docker-compose.yml` (e.g. `DEBUG=true`, `SECRET_KEY=dev-secret-key-change-in-production`) in production.
- Put the backend behind HTTPS (reverse proxy, e.g. nginx or Traefik) so secure cookies work.

---

## Rollout checklist (today's release)

1. **Pull latest code**
   - Deploy branch with backend + frontend + docs updates.

2. **Rebuild and restart services**
   - `docker compose up -d --build backend frontend`

3. **Run migrations**
   - `docker compose exec backend python manage.py migrate`

4. **Sanity check backend boot**
   - `docker compose logs backend --tail=120`
   - Confirm migrations complete and gunicorn is running.

5. **Smoke test (API)**
   - Login works (`POST /api/auth/login/`).
   - Budgets:
     - create/update budget (`POST /api/budgets/` as Financial Controller),
     - stats load (`GET /api/budgets/stats/?year=YYYY`) with alerts and monthly trend.
   - Payment:
     - finance user uploads POP on `Pending Payment`,
     - requisition transitions to `Paid`.
   - Audit:
     - `Login` action filter returns records in Audit Trail.

6. **Smoke test (UI)**
   - Budget Setup page: department dropdown and save.
   - Budget Stats page: alerts and monthly trend chart render.
   - Requisition detail: POP uploader role badge appears after POP upload.

7. **Post-deploy checks**
   - Verify notifications still flow for approval/payment steps.
   - Verify `backend/logs/mars_irs.log` has no new errors.

---

## Important limitation: API authentication

The API uses **token authentication** (`Authorization: Token <key>`) for protected endpoints. Some utility endpoints (database backup/health tools) are intentionally open in the current implementation and should be restricted by network/firewall in production.

- **Suitable for**: Internal networks and controlled environments.
- **Risk if API/admin tools are public**: Backup/restore and other sensitive routes may be abused if not protected at the edge.

To harden for public exposure:
- lock sensitive utility endpoints behind admin auth and/or reverse proxy access controls,
- enforce strict server-side actor derivation (ignore client-provided actor IDs where possible),
- add rate limiting and request monitoring.

---

## Optional hardening

- **HTTPS**: Use it everywhere; put the stack behind a reverse proxy that terminates TLS. The app sets secure cookie flags when `DEBUG` is False.
- **Admin password at deploy**: Set `ADMIN_PASSWORD` (and optionally `ADMIN_EMAIL`) in the backend environment so the seed command creates the first admin with a strong password.
- **Database backups**: Use the in-app backup/restore (volume `pg_backups`) or your host’s backup; test restore occasionally.
- **Monitoring**: Use your host’s logging and health checks; the backend exposes `/api/database/health/` for DB health.
- **Application log file**: The backend writes **rotating technical logs** to `backend/logs/mars_irs.log` (configurable via `LOG_DIR`, `LOG_LEVEL`, `LOG_FILE_MAX_BYTES`, `LOG_FILE_BACKUP_COUNT` in the backend environment). Docker Compose mounts `./backend/logs` so logs survive container restarts. This is separate from the **in-app audit trail** (requisition actions in the database)—use both: DB for business audit, files for ops/debugging.

---

## Summary

| Item | Status |
|------|--------|
| SECRET_KEY | Set in production (generate a strong value) |
| DEBUG | False in production |
| ALLOWED_HOSTS / CORS | Set to your hostnames |
| DB password | Strong; avoid defaults |
| Admin password | Change after first login or set via ADMIN_PASSWORD |
| HTTPS | Use reverse proxy; secure cookies enabled when DEBUG=False |
| API auth | Trust-based; add auth if API is publicly exposed |
