#!/bin/sh
set -e
echo "Waiting for PostgreSQL..."
while ! python manage.py migrate --noinput 2>/dev/null; do
  echo "Database not ready, retrying in 2s..."
  sleep 2
done
echo "Migrations complete."
echo "Seeding initial data..."
python manage.py seed_audit 2>/dev/null || true
exec "$@"
