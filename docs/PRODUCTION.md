# Production Readiness Checklist

Use this checklist when deploying the IR system to production with Docker.

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
   Set **`FRONTEND_BASE_URL`** on the backend to your real app URL (e.g. `https://app.yourdomain.com`, no trailing slash). Requisition notification emails include a login link built as `{FRONTEND_BASE_URL}/login`.  
   Optional: **`REQUISITION_EMAIL_SYSTEM_NAME`** — short label shown above the summary table (default: `MARS Internal Requisition System`).

---

## Docker production deploy

- Use a production `docker-compose` override or env file that sets:
  - `SECRET_KEY`, `DEBUG=False`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`
  - Strong `DB_PASSWORD` (or `POSTGRES_PASSWORD` for the db service)
  - Optionally `ADMIN_PASSWORD` and `ADMIN_EMAIL` for the seeded admin
- Do not use the dev defaults in `docker-compose.yml` (e.g. `DEBUG=true`, `SECRET_KEY=dev-secret-key-change-in-production`) in production.
- Put the backend behind HTTPS (reverse proxy, e.g. nginx or Traefik) so secure cookies work.

---

## Important limitation: API authentication

The API does **not** use server-side sessions or tokens. All endpoints use `AllowAny`; the backend does not verify that the caller is the user they claim to be. The frontend sends user identity (e.g. `actor_user_id`, `user_id`) in request bodies after login.

- **Suitable for**: Trusted internal networks, or environments where the API is not exposed to the public internet (e.g. frontend and backend on the same private network or behind a single sign-on proxy).
- **Risk if the API is public**: Anyone who can reach the API could, in principle, call it with arbitrary user IDs and perform actions as any user.

To harden for a fully public deployment you would need to add authentication (e.g. session cookies, JWT, or API keys) and authorization checks on the backend so that each request is tied to a verified user and role.

---

## Optional hardening

- **HTTPS**: Use it everywhere; put the stack behind a reverse proxy that terminates TLS. The app sets secure cookie flags when `DEBUG` is False.
- **Admin password at deploy**: Set `ADMIN_PASSWORD` (and optionally `ADMIN_EMAIL`) in the backend environment so the seed command creates the first admin with a strong password.
- **Database backups**: Use the in-app backup/restore (volume `pg_backups`) or your host’s backup; test restore occasionally.
- **Monitoring**: Use your host’s logging and health checks; the backend exposes `/api/database/health/` for DB health.

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
