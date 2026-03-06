# IR Backend (Django + PostgreSQL)

API backend for the Audit Trail and requisition data.

## Setup

1. Create a virtualenv and install dependencies:

   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate   # or .venv\Scripts\activate on Windows
   pip install -r requirements.txt
   ```

2. Create a PostgreSQL database:

   ```bash
   createdb ir_db
   ```

3. Copy `.env.example` to `.env` and set `DB_*` and `SECRET_KEY`.

4. Run migrations and seed data:

   ```bash
   python manage.py migrate
   python manage.py seed_audit --clear
   ```

5. Run the server:

   ```bash
   python manage.py runserver 8000
   ```

## API

- **GET /api/audit/** — Paginated list of audit entries. Query params: `search`, `action`, `role`, `user`, `page`, `page_size` (default 25).
- **GET /api/audit/export/** — CSV export with same filters.

## Frontend

Point the React app at this backend by setting `VITE_API_BASE=http://localhost:8000` (or the appropriate origin).
