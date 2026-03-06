import csv
from django.db.models import Q
from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import AuditEntry
from .serializers import AuditEntrySerializer


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
