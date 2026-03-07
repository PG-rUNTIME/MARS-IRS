import csv
from django.core.mail import get_connection
from django.db.models import Q
from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import AuditEntry
from .serializers import AuditEntrySerializer
from .smtp_config import get_smtp_config, get_smtp_config_public, save_smtp_config


def _filter_audit_queryset(qs, request):
    params = request.query_params
    search = params.get('search', '').strip()
    if search:
        qs = qs.filter(
            Q(details__icontains=search)
            | Q(user_name__icontains=search)
            | Q(requisition__req_number__icontains=search)
        )
    action = (params.get('action') or '').strip()
    if action:
        qs = qs.filter(action=action)
    role = (params.get('role') or '').strip()
    if role:
        qs = qs.filter(user_role=role)
    user = (params.get('user') or '').strip()
    if user:
        qs = qs.filter(user_name=user)
    return qs


@api_view(['GET'])
@permission_classes([AllowAny])  # Replace with IsAuthenticated + role check in production
def audit_list(request):
    """List audit entries with optional filters. Pagination via DRF."""
    qs = AuditEntry.objects.select_related('requisition').all().order_by('-timestamp')
    qs = _filter_audit_queryset(qs, request)

    page_size = min(100, max(1, int(request.query_params.get('page_size', 25))))
    paginator = PageNumberPagination()
    paginator.page_size = page_size
    page = paginator.paginate_queryset(qs, request)
    if page is not None:
        serializer = AuditEntrySerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)
    serializer = AuditEntrySerializer(qs, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([AllowAny])
def audit_export_csv(request):
    """Export filtered audit log as CSV."""
    qs = AuditEntry.objects.select_related('requisition').all().order_by('-timestamp')
    qs = _filter_audit_queryset(qs, request)

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="audit_trail.csv"'
    writer = csv.writer(response)
    writer.writerow(['Timestamp', 'Action', 'User', 'Role', 'Reference', 'Currency', 'Details'])
    for e in qs:
        writer.writerow([
            e.timestamp.isoformat(),
            e.action,
            e.user_name,
            e.user_role,
            e.requisition.req_number if e.requisition else '',
            e.requisition.currency if e.requisition else '',
            e.details,
        ])
    return response


# ─── SMTP / Email notifications ─────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def smtp_settings_get(request):
    """Return current SMTP config for admin UI (no password)."""
    return Response(get_smtp_config_public())


@api_view(['POST'])
@permission_classes([AllowAny])
def smtp_settings_save(request):
    """Save SMTP config (admin only in production; allow for demo)."""
    data = request.data
    host = data.get('host', '').strip()
    if not host:
        return Response({'error': 'Host is required.'}, status=400)
    try:
        save_smtp_config(
            host=host,
            port=data.get('port', 587),
            username=data.get('username', ''),
            password=data.get('password', ''),
            from_email=data.get('from_email', ''),
            use_tls=data.get('use_tls', True),
        )
        return Response(get_smtp_config_public())
    except Exception as e:
        return Response({'error': str(e)}, status=400)


@api_view(['POST'])
@permission_classes([AllowAny])
def send_notification_email(request):
    """Send one notification email. Used by frontend when a notification is created. If SMTP not configured, return 200 with sent=False."""
    to_email = (request.data.get('to_email') or '').strip()
    subject = (request.data.get('subject') or 'Notification').strip()
    body = (request.data.get('body') or '').strip()
    if not to_email or '@' not in to_email:
        return Response({'sent': False, 'error': 'Valid to_email required.'}, status=400)
    config = get_smtp_config()
    if not config:
        return Response({'sent': False, 'reason': 'SMTP not configured.'})
    from_email = config.get('from_email') or config.get('username') or 'noreply@localhost'
    try:
        conn = get_connection(
            backend='django.core.mail.backends.smtp.EmailBackend',
            host=config.get('host'),
            port=config.get('port', 587),
            username=config.get('username') or None,
            password=config.get('password') or None,
            use_tls=config.get('use_tls', True),
            fail_silently=False,
        )
        from django.core.mail import EmailMessage
        msg = EmailMessage(subject=subject, body=body, from_email=from_email, to=[to_email], connection=conn)
        msg.send()
        return Response({'sent': True})
    except Exception as e:
        return Response({'sent': False, 'error': str(e)}, status=500)
