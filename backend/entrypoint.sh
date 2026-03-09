#!/bin/sh
set -e
echo "Waiting for PostgreSQL..."
until pg_isready -h "${DB_HOST:-localhost}" -U "${DB_USER:-postgres}" -q 2>/dev/null; do
  echo "Database not ready, retrying in 2s..."
  sleep 2
done
echo "Running migrations..."
python manage.py migrate --noinput
echo "Seeding initial data..."
python manage.py seed_audit 2>/dev/null || true
exec "$@"
