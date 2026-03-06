"""
Database health check, backup and restore. Admin-only capabilities.
Uses pg_dump/psql; backup files are stored in a named volume (e.g. /backups).
"""
import os
import subprocess
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.db import connection
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

BACKUP_ROOT = Path(os.environ.get('BACKUP_ROOT', '/backups'))


def _db_settings():
    db = settings.DATABASES['default']
    return {
        'host': db.get('HOST', 'localhost'),
        'port': db.get('PORT', '5432'),
        'user': db.get('USER', 'postgres'),
        'password': db.get('PASSWORD', ''),
        'name': db.get('NAME', 'ir_db'),
    }


@api_view(['GET'])
@permission_classes([AllowAny])
def database_health(request):
    """Return database connection status and version."""
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT version();')
            version = cursor.fetchone()[0]
        return Response({
            'status': 'ok',
            'database': _db_settings()['name'],
            'version': version,
        })
    except Exception as e:
        return Response(
            {'status': 'error', 'error': str(e)},
            status=503,
        )


@api_view(['GET'])
@permission_classes([AllowAny])
def backup_list(request):
    """List backup files in the backup volume."""
    if not BACKUP_ROOT.exists():
        return Response({'backups': []})
    backups = []
    for f in sorted(BACKUP_ROOT.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
        if f.is_file() and f.suffix in ('.sql', '.dump'):
            stat = f.stat()
            backups.append({
                'filename': f.name,
                'size_bytes': stat.st_size,
                'created': datetime.fromtimestamp(stat.st_mtime).isoformat(),
            })
    return Response({'backups': backups})


@api_view(['POST'])
@permission_classes([AllowAny])
def backup_create(request):
    """Create a full DB backup to the named volume (plain SQL)."""
    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    name = (request.data.get('name') or '').strip() or datetime.utcnow().strftime('%Y-%m-%d_%H-%M-%S')
    safe_name = "".join(c for c in name if c.isalnum() or c in '-_')
    filename = f"backup_{safe_name}.sql"
    filepath = BACKUP_ROOT / filename

    db = _db_settings()
    env = os.environ.copy()
    env['PGPASSWORD'] = db['password']

    try:
        subprocess.run(
            [
                'pg_dump',
                '-h', db['host'],
                '-p', db['port'],
                '-U', db['user'],
                '-d', db['name'],
                '-F', 'p',
                '-f', str(filepath),
            ],
            env=env,
            check=True,
            capture_output=True,
            text=True,
            timeout=300,
        )
        size = filepath.stat().st_size
        return Response({
            'filename': filename,
            'path': str(filepath),
            'size_bytes': size,
            'created': datetime.fromtimestamp(filepath.stat().st_mtime).isoformat(),
        })
    except subprocess.CalledProcessError as e:
        return Response(
            {'error': e.stderr or str(e)},
            status=500,
        )
    except Exception as e:
        return Response({'error': str(e)}, status=500)


@api_view(['POST'])
@permission_classes([AllowAny])
def backup_restore(request):
    """Restore database from a backup file in the volume."""
    filename = (request.data.get('filename') or '').strip()
    if not filename:
        return Response({'error': 'filename is required'}, status=400)
    if '..' in filename or '/' in filename or '\\' in filename:
        return Response({'error': 'invalid filename'}, status=400)
    filepath = BACKUP_ROOT / filename
    if not filepath.exists() or not filepath.is_file():
        return Response({'error': 'backup file not found'}, status=404)

    db = _db_settings()
    env = os.environ.copy()
    env['PGPASSWORD'] = db['password']

    try:
        result = subprocess.run(
            [
                'psql',
                '-h', db['host'],
                '-p', db['port'],
                '-U', db['user'],
                '-d', db['name'],
                '-v', 'ON_ERROR_STOP=1',
                '-f', str(filepath),
            ],
            env=env,
            capture_output=True,
            text=True,
            timeout=300,
        )
        if result.returncode != 0:
            return Response({'error': result.stderr or result.stdout or 'Restore failed'}, status=500)
        return Response({'status': 'ok', 'message': 'Database restored successfully'})
    except subprocess.TimeoutExpired:
        return Response({'error': 'Restore timed out'}, status=500)
    except Exception as e:
        return Response({'error': str(e)}, status=500)
