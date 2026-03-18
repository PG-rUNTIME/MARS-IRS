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
from django.http import FileResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

BACKUP_ROOT = Path(os.environ.get('BACKUP_ROOT', '/backups'))


def _is_sysadmin(request) -> bool:
    user = getattr(request, 'user', None)
    if not user or not getattr(user, 'id', None) or not hasattr(user, 'roles'):
        return False
    return user.roles.filter(role='System Administrator').exists()


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
@permission_classes([IsAuthenticated])
def database_health(request):
    """Return database connection status and version."""
    if not _is_sysadmin(request):
        return Response({'error': 'Forbidden.'}, status=403)
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
@permission_classes([IsAuthenticated])
def backup_list(request):
    """List backup files in the backup volume."""
    if not _is_sysadmin(request):
        return Response({'error': 'Forbidden.'}, status=403)
    if not BACKUP_ROOT.exists():
        return Response({'backups': []})
    backups = []
    for f in sorted(BACKUP_ROOT.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
        if f.is_file() and f.suffix in ('.sql', '.dump'):
            stat = f.stat()
            backups.append({
                'filename': f.name,
                'size_bytes': stat.st_size,
                'created': datetime.utcfromtimestamp(stat.st_mtime).strftime('%Y-%m-%dT%H:%M:%S') + 'Z',
            })
    return Response({'backups': backups})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def backup_create(request):
    """Create a full DB backup to the named volume (plain SQL)."""
    if not _is_sysadmin(request):
        return Response({'error': 'Forbidden.'}, status=403)
    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    created_at = datetime.utcnow()
    default_name = created_at.strftime('%Y-%m-%d_%H-%M-%S')
    name = (request.data.get('name') or '').strip() or default_name
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
                '--clean',
                '--if-exists',
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
            'created': created_at.strftime('%Y-%m-%dT%H:%M:%S') + 'Z',
        })
    except subprocess.CalledProcessError as e:
        return Response(
            {'error': e.stderr or str(e)},
            status=500,
        )
    except Exception as e:
        return Response({'error': str(e)}, status=500)


def _filter_pg17_session_params(sql_content: str) -> str:
    """Remove SET/set_config lines for params not in older PostgreSQL (e.g. transaction_timeout in PG17)."""
    lines = []
    for line in sql_content.splitlines():
        s = line.strip()
        if (
            (s.startswith('SET ') and 'transaction_timeout' in s)
            or ("set_config('transaction_timeout'" in s)
        ):
            continue
        lines.append(line)
    return '\n'.join(lines) + '\n' if lines else sql_content


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def backup_restore(request):
    """Restore database from a backup file in the volume."""
    if not _is_sysadmin(request):
        return Response({'error': 'Forbidden.'}, status=403)
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
        sql = filepath.read_text(encoding='utf-8', errors='replace')
        sql = _filter_pg17_session_params(sql)
        result = subprocess.run(
            [
                'psql',
                '-h', db['host'],
                '-p', db['port'],
                '-U', db['user'],
                '-d', db['name'],
                '-v', 'ON_ERROR_STOP=1',
                '-f', '-',
            ],
            input=sql,
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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def backup_download(request, filename: str):
    """Download a backup file from the backup volume."""
    if not _is_sysadmin(request):
        return Response({'error': 'Forbidden.'}, status=403)
    filename = (filename or '').strip()
    if not filename:
        return Response({'error': 'filename is required'}, status=400)
    if '..' in filename or '/' in filename or '\\' in filename:
        return Response({'error': 'invalid filename'}, status=400)
    filepath = BACKUP_ROOT / filename
    if not filepath.exists() or not filepath.is_file():
        return Response({'error': 'backup file not found'}, status=404)
    if filepath.suffix not in ('.sql', '.dump'):
        return Response({'error': 'unsupported file type'}, status=400)
    return FileResponse(
        open(filepath, 'rb'),
        as_attachment=True,
        filename=filepath.name,
        content_type='application/sql' if filepath.suffix == '.sql' else 'application/octet-stream',
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def backup_upload_restore(request):
    """
    Upload a .sql backup file and restore it.
    Expects multipart/form-data with `file`.
    """
    if not _is_sysadmin(request):
        return Response({'error': 'Forbidden.'}, status=403)
    uploaded = request.FILES.get('file')
    if not uploaded:
        return Response({'error': 'file is required'}, status=400)

    original_name = (getattr(uploaded, 'name', '') or '').strip()
    if not original_name.lower().endswith('.sql'):
        return Response({'error': 'Only .sql backups are supported for upload/restore.'}, status=400)

    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    created_at = datetime.utcnow()
    safe_stem = "".join(c for c in Path(original_name).stem if c.isalnum() or c in '-_') or 'uploaded'
    target_name = f"upload_{created_at.strftime('%Y-%m-%d_%H-%M-%S')}_{safe_stem}.sql"
    filepath = BACKUP_ROOT / target_name

    try:
        # Stream upload to disk to avoid loading full file in memory
        with open(filepath, 'wb') as out:
            for chunk in uploaded.chunks():
                out.write(chunk)

        db = _db_settings()
        env = os.environ.copy()
        env['PGPASSWORD'] = db['password']

        sql = filepath.read_text(encoding='utf-8', errors='replace')
        sql = _filter_pg17_session_params(sql)
        result = subprocess.run(
            [
                'psql',
                '-h', db['host'],
                '-p', db['port'],
                '-U', db['user'],
                '-d', db['name'],
                '-v', 'ON_ERROR_STOP=1',
                '-f', '-',
            ],
            input=sql,
            env=env,
            capture_output=True,
            text=True,
            timeout=600,
        )
        if result.returncode != 0:
            return Response({'error': result.stderr or result.stdout or 'Restore failed'}, status=500)
        return Response({'status': 'ok', 'message': 'Backup uploaded and restored successfully'})
    except subprocess.TimeoutExpired:
        return Response({'error': 'Restore timed out'}, status=500)
    except Exception as e:
        return Response({'error': str(e)}, status=500)
