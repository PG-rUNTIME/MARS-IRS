#!/bin/sh
set -e
echo "Waiting for PostgreSQL..."
until pg_isready -h "${DB_HOST:-localhost}" -U "${DB_USER:-postgres}" -q 2>/dev/null; do
  echo "Database not ready, retrying in 2s..."
  sleep 2
done
if [ -z "$SKIP_MIGRATE" ] || [ "$SKIP_MIGRATE" = "0" ] || [ "$SKIP_MIGRATE" = "false" ]; then
  echo "Running migrations..."
  python manage.py migrate --noinput
else
  echo "Skipping migrations (SKIP_MIGRATE is set)."
fi
echo "Seeding initial data..."
python manage.py seed_audit 2>/dev/null || true
exec "$@"
