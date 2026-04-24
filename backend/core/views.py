import csv
import base64
import logging
import os
import re
from decimal import Decimal
from django.core.mail import get_connection
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse, FileResponse
from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime, parse_date
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import (
    User, Requisition, ApprovalStep, ReqComment, Attachment, ApiToken,
    POItem, PurchaseOrder, AppNotification, DelegationRecord, AuditEntry,
    RFQ, RFQItem, RFQQuote, RFQQuoteItem, RFQQuoteAttachment, RFQEvent, Supplier, DepartmentBudget,
)
from .serializers import (
    UserSerializer, RequisitionListSerializer, RequisitionDetailSerializer,
    RequisitionWriteSerializer, ApprovalStepSerializer, ReqCommentSerializer,
    AttachmentSerializer, POItemSerializer, PurchaseOrderSerializer,
    AppNotificationSerializer, DelegationRecordSerializer, AuditEntrySerializer,
    RFQSerializer, SupplierSerializer, DepartmentBudgetSerializer,
    check_password, hash_password,
)
from .smtp_config import get_smtp_config, get_smtp_config_public, save_smtp_config
from .requisition_email_html import build_requisition_notification_html

logger = logging.getLogger(__name__)
from .permissions import IsSystemAdministrator, IsAuditorOrFinancialController

FINANCE_TEAM_ROLES = ('Accountant', 'Financial Controller', 'General Manager')


def _normalize_supplier_category(value: str) -> str:
    raw = (value or '').strip()
    if not raw:
        return 'Other'
    allowed = {k.lower(): k for (k, _) in Supplier.CATEGORY_CHOICES}
    return allowed.get(raw.lower(), 'Other')


def _has_any_role(user, allowed_roles: tuple[str, ...]) -> bool:
    try:
        roles = list(user.roles.values_list('role', flat=True))
    except Exception:
        roles = []
    return any(r in allowed_roles for r in roles)


def _is_finance_department_user(user) -> bool:
    dep = (getattr(user, 'department', '') or '').strip().lower()
    return 'finance' in dep


def _can_process_finance_payment(user) -> bool:
    return _has_any_role(user, FINANCE_TEAM_ROLES) or _is_finance_department_user(user)


# ─── Pagination ───────────────────────────────────────────────────────────────

class StandardPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 200


# ─── Auth ─────────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    email = (request.data.get('email') or '').strip().lower()
    password = request.data.get('password', '')
    try:
        user = User.objects.prefetch_related('roles').get(email__iexact=email)
    except User.DoesNotExist:
        return Response({'error': 'Invalid email or password.'}, status=401)
    if not check_password(password, user.password):
        return Response({'error': 'Invalid email or password.'}, status=401)
    if not user.active:
        return Response({'error': 'Your account has been deactivated. Please contact the administrator.'}, status=403)
    # Create a token for API authentication (Authorization: Token <key>)
    token = ApiToken.objects.create(key=ApiToken.generate_key(), user=user)
    return Response({'token': token.key, 'user': UserSerializer(user).data})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    """Invalidate the current token (best-effort)."""
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Token '):
        key = auth.split(' ', 1)[1].strip()
        ApiToken.objects.filter(key=key).delete()
    return Response({'status': 'ok'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify_password(request):
    """Verify a user's current password without changing it. Used by change-password flow."""
    password = request.data.get('password', '')
    try:
        user = User.objects.get(pk=request.user.id)
    except (User.DoesNotExist, TypeError, ValueError):
        return Response({'valid': False}, status=400)
    return Response({'valid': check_password(password, user.password)})


def _send_account_email(user: User, plain_password: str | None, *, is_reset: bool = False) -> None:
    """
    Best-effort account email: sends login URL and initial password (if provided).
    Does not raise on failure so user creation/reset still succeed even if SMTP is misconfigured.
    """
    if not user or not getattr(user, "email", None):
        return
    config = get_smtp_config()
    if not config:
        return
    login_url = f"{settings.FRONTEND_BASE_URL}/login"
    subject = "Your MARS IRS account has been reset" if is_reset else "Your MARS IRS account"
    pw_line = f"\nTemporary password: {plain_password}\n" if plain_password else "\n"
    body = (
        f"Hello {user.name or user.email},\n\n"
        f"An account has been {'reset' if is_reset else 'created'} for you in the MARS Internal Requisition System.\n\n"
        f"Email: {user.email}\n"
        f"{pw_line}"
        f"Login URL: {login_url}\n\n"
        "You will be asked to change this password after logging in.\n\n"
        "If you did not expect this email, please contact your system administrator."
    )
    from_email = config.get('from_email') or config.get('username') or 'noreply@localhost'
    try:
        conn = get_connection(
            backend='django.core.mail.backends.smtp.EmailBackend',
            host=config.get('host'), port=config.get('port', 587),
            username=config.get('username') or None,
            password=config.get('password') or None,
            use_tls=config.get('use_tls', True), fail_silently=False,
        )
        from django.core.mail import EmailMessage
        msg = EmailMessage(subject=subject, body=body, from_email=from_email, to=[user.email], connection=conn)
        msg.send()
    except Exception:
        # Non-fatal: just skip email if SMTP fails.
        return


# ─── Users ────────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def user_list(request):
    if request.method == 'GET':
        users = User.objects.prefetch_related('roles').all()
        return Response(UserSerializer(users, many=True).data)
    if not IsSystemAdministrator().has_permission(request, None):
        return Response({'error': 'Forbidden.'}, status=403)
    serializer = UserSerializer(data=request.data)
    if serializer.is_valid():
        # Capture plain password before serializer hashes it so we can email it to the user.
        plain_pw = (serializer.initial_data.get('password') or '').strip()
        user = serializer.save()
        # Fire-and-forget account email (if SMTP configured).
        _send_account_email(user, plain_pw or None, is_reset=False)
        return Response(UserSerializer(user).data, status=201)
    return Response(serializer.errors, status=400)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def user_detail(request, pk):
    try:
        user = User.objects.prefetch_related('roles').get(pk=pk)
    except User.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)
    if request.method == 'GET':
        return Response(UserSerializer(user).data)
    if request.method == 'PATCH':
        if IsSystemAdministrator().has_permission(request, None):
            serializer = UserSerializer(user, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(UserSerializer(user).data)
            return Response(serializer.errors, status=400)
        # Allow any authenticated user to update only their own password-related fields
        # (first-login / forced password change is blocked for non-admins otherwise).
        if request.user.id != user.id:
            return Response({'error': 'Forbidden.'}, status=403)
        allowed_keys = frozenset(('password', 'must_change_password', 'password_changed_at'))
        raw = request.data if isinstance(request.data, dict) else dict(request.data)
        extra = set(raw.keys()) - allowed_keys
        if extra:
            return Response(
                {'error': 'You may only update password-related fields on your own account.'},
                status=400,
            )
        payload = {k: raw[k] for k in allowed_keys if k in raw}
        if not payload:
            return Response({'error': 'No updatable fields.'}, status=400)
        if user.must_change_password and payload.get('must_change_password') is False:
            new_pw = (payload.get('password') or '').strip()
            if not new_pw:
                return Response(
                    {'error': 'You must choose a new password before continuing.'},
                    status=400,
                )
        serializer = UserSerializer(user, data=payload, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(UserSerializer(user).data)
        return Response(serializer.errors, status=400)
    if not IsSystemAdministrator().has_permission(request, None):
        return Response({'error': 'Forbidden.'}, status=403)
    user.delete()
    return Response(status=204)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsSystemAdministrator])
def user_reset_account(request, pk):
    """
    Reset a user's account (admin action).
    - Resets password to the system default (frontend shows it as mars2026)
    - Forces user to change password on next login
    - Clears password_changed_at
    """
    try:
        user = User.objects.prefetch_related('roles').get(pk=pk)
    except User.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)

    default_password = 'mars2026'
    with transaction.atomic():
        user.password = hash_password(default_password)
        user.must_change_password = True
        user.password_changed_at = None
        user.active = True
        user.save(update_fields=['password', 'must_change_password', 'password_changed_at', 'active', 'updated_at'])

        actor_user_id = request.user.id
        actor_user_name = request.user.name
        actor_role = 'System Administrator'
        AuditEntry.objects.create(
            action='Account Reset',
            user_id_str=str(actor_user_id),
            user_name=actor_user_name,
            user_role=actor_role,
            details=f"Reset account for {user.name} <{user.email}>. User must change password at next login.",
            requisition=None,
        )

    # Best-effort notification to the user with their temporary password and login URL.
    _send_account_email(user, default_password, is_reset=True)

    return Response(UserSerializer(user).data)


# ─── Requisitions ─────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def requisition_list(request):
    if request.method == 'GET':
        qs = Requisition.objects.select_related('requester').prefetch_related('approval_chain').all()
        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        dept = request.query_params.get('department')
        if dept:
            qs = qs.filter(department=dept)
        requester_id = request.query_params.get('requester_id')
        if requester_id:
            qs = qs.filter(requester_id=requester_id)
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(RequisitionListSerializer(page, many=True).data)

    # POST – create requisition with approval chain + items
    data = request.data
    write_ser = RequisitionWriteSerializer(data=data)
    if not write_ser.is_valid():
        logger.warning('RequisitionCreate 400: %s | data keys: %s', write_ser.errors, list(data.keys()))
        return Response(write_ser.errors, status=400)

    with transaction.atomic():
        req = write_ser.save()

        # Approval chain
        for step_data in data.get('approval_chain', []):
            ApprovalStep.objects.create(
                requisition=req,
                order=step_data.get('order', 0),
                role=step_data.get('role', ''),
                label=step_data.get('label', ''),
                status=step_data.get('status', 'Pending'),
            )

        # Line items (coerce types for JSON payload)
        for item_data in data.get('items', []):
            qty = item_data.get('quantity', 1)
            try:
                qty = int(qty) if qty is not None else 1
            except (TypeError, ValueError):
                qty = 1
            up = item_data.get('unit_price', 0)
            lt = item_data.get('line_total', 0)
            try:
                up = Decimal(str(up)) if up is not None else Decimal('0')
            except (TypeError, ValueError, Exception):
                up = Decimal('0')
            try:
                lt = Decimal(str(lt)) if lt is not None else Decimal('0')
            except (TypeError, ValueError, Exception):
                lt = Decimal('0')
            POItem.objects.create(
                requisition=req,
                description=item_data.get('description', ''),
                quantity=qty,
                unit=item_data.get('unit') or 'Unit',
                unit_price=up,
                line_total=lt,
            )

        # Persist supplier documents as proper Attachment records
        requester_name = req.requester.name if req.requester else 'Requester'
        for idx, supplier in enumerate(req.suppliers_json or []):
            label = f"Supplier {idx + 1} ({supplier.get('name', '')})"
            doc_slots = [
                ('quotationDataUrl', 'quotationName', 'quotationSize', 'Quotation'),
                ('taxClearanceDataUrl', 'taxClearanceName', 'taxClearanceSize', 'Tax Clearance'),
                ('vatCertDataUrl', 'vatCertName', 'vatCertSize', 'VAT Certificate'),
            ]
            for url_key, name_key, size_key, doc_label in doc_slots:
                data_url = supplier.get(url_key)
                if not data_url:
                    continue
                Attachment.objects.create(
                    requisition=req,
                    name=f"{label} – {doc_label}",
                    type='PDF',
                    size=supplier.get(size_key) or '—',
                    uploaded_by=requester_name,
                    data_url=data_url,
                    is_proof_of_payment=False,
                )

        # Audit
        _log_audit(request, req, 'Created', f"Requisition {req.req_number} created as Draft.")

    return Response(RequisitionDetailSerializer(req).data, status=201)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def requisition_detail(request, pk):
    try:
        req = Requisition.objects.select_related('requester').prefetch_related(
            'approval_chain', 'comments', 'attachments', 'items',
            'audit_entries', 'purchase_order',
        ).get(pk=pk)
    except Requisition.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)

    if request.method == 'GET':
        return Response(RequisitionDetailSerializer(req).data)

    if request.method == 'PATCH':
        data = request.data
        requested_status = (data.get('status') or '').strip()
        requesting_paid_at_set = ('paid_at' in data and data.get('paid_at') is not None)
        is_finance_payment_mutation = (
            requested_status in ('Pending Payment', 'Paid')
            or requesting_paid_at_set
        )
        if is_finance_payment_mutation and not _can_process_finance_payment(request.user):
            return Response({'error': 'Forbidden. Finance team only.'}, status=403)
        write_ser = RequisitionWriteSerializer(req, data=data, partial=True)
        if not write_ser.is_valid():
            return Response(write_ser.errors, status=400)
        with transaction.atomic():
            write_ser.save()

            # Replace approval chain if provided
            if 'approval_chain' in data:
                req.approval_chain.all().delete()
                for step_data in data['approval_chain']:
                    approver_id = step_data.get('approver_id') or None
                    delegated_to_id = step_data.get('delegated_to_id') or None
                    raw_ts = step_data.get('timestamp')
                    ts = parse_datetime(raw_ts) if isinstance(raw_ts, str) else raw_ts
                    ApprovalStep.objects.create(
                        requisition=req,
                        order=step_data.get('order', 0),
                        role=step_data.get('role', ''),
                        label=step_data.get('label', ''),
                        approver_id=approver_id,
                        approver_name=step_data.get('approver_name', ''),
                        status=step_data.get('status', 'Pending'),
                        timestamp=ts,
                        comments=step_data.get('comments', ''),
                        delegated_to_id=delegated_to_id,
                        delegated_to_name=step_data.get('delegated_to_name', ''),
                    )

            # Replace items if provided (coerce types for JSON payload)
            if 'items' in data:
                req.items.all().delete()
                for item_data in data['items']:
                    qty = item_data.get('quantity', 1)
                    try:
                        qty = int(qty) if qty is not None else 1
                    except (TypeError, ValueError):
                        qty = 1
                    up = item_data.get('unit_price', 0)
                    lt = item_data.get('line_total', 0)
                    try:
                        up = Decimal(str(up)) if up is not None else Decimal('0')
                    except (TypeError, ValueError, Exception):
                        up = Decimal('0')
                    try:
                        lt = Decimal(str(lt)) if lt is not None else Decimal('0')
                    except (TypeError, ValueError, Exception):
                        lt = Decimal('0')
                    POItem.objects.create(
                        requisition=req,
                        description=item_data.get('description', ''),
                        quantity=qty,
                        unit=item_data.get('unit') or 'Unit',
                        unit_price=up,
                        line_total=lt,
                    )

            # Audit
            if data.get('audit_action'):
                _log_audit(
                    request, req, data['audit_action'],
                    data.get('audit_details', f"Requisition {req.req_number} updated.")
                )

        # Set submitted_at / paid_at server-side based on payload intent.
        # Client sends non-null to set, null to clear — we use server clock for the actual value.
        updates = {}
        if 'submitted_at' in data:
            if data.get('submitted_at') is not None and req.submitted_at is None:
                updates['submitted_at'] = timezone.now()
            elif data.get('submitted_at') is None:
                updates['submitted_at'] = None
        if 'paid_at' in data:
            if data.get('paid_at') is not None and req.paid_at is None:
                updates['paid_at'] = timezone.now()
            elif data.get('paid_at') is None:
                updates['paid_at'] = None
        if updates:
            Requisition.objects.filter(pk=pk).update(**updates)

        # Re-fetch from DB to get fresh relations after mutations
        req = Requisition.objects.select_related('requester').prefetch_related(
            'approval_chain', 'comments', 'attachments', 'items',
            'audit_entries', 'purchase_order',
        ).get(pk=pk)
        return Response(RequisitionDetailSerializer(req).data)

    req.delete()
    return Response(status=204)


# ─── Comments ─────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_comment(request, req_pk):
    try:
        req = Requisition.objects.get(pk=req_pk)
    except Requisition.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)
    data = {**request.data, 'requisition': req_pk}
    serializer = ReqCommentSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)
    comment = ReqComment.objects.create(
        requisition=req,
        user_id=request.user.id,
        user_name=getattr(request.user, 'name', ''),
        user_role=(request.user.roles.values_list('role', flat=True).first() if hasattr(request.user, 'roles') else ''),
        text=request.data.get('text', ''),
        is_finance_note=request.data.get('is_finance_note', False),
    )
    _log_audit(request, req, 'Comment Added', f"Comment added to {req.req_number}.")
    return Response(ReqCommentSerializer(comment).data, status=201)


# ─── Attachments ──────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_attachment(request, req_pk):
    try:
        req = Requisition.objects.get(pk=req_pk)
    except Requisition.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)
    is_pop = bool(request.data.get('is_proof_of_payment', False))
    if is_pop:
        if req.status != 'Pending Payment':
            return Response({'error': 'Proof of payment can only be uploaded when requisition is Pending Payment.'}, status=400)
        if not _can_process_finance_payment(request.user):
            return Response({'error': 'Forbidden. Finance team only.'}, status=403)

    data_url = request.data.get('data_url', '') or ''
    att = Attachment.objects.create(
        requisition=req,
        name=request.data.get('name', ''),
        type=request.data.get('type', ''),
        size=request.data.get('size', ''),
        uploaded_by=(getattr(request.user, 'name', '') or request.data.get('uploaded_by', '')),
        data_url='' if data_url.startswith('data:') else data_url,
        is_proof_of_payment=is_pop,
    )
    # If client sent base64 data URL, store the binary on disk and return a URL instead.
    try:
        if data_url.startswith('data:'):
            # Example: data:application/pdf;base64,AAA...
            m = re.match(r'^data:(?P<mime>[^;]+);base64,(?P<b64>.+)$', data_url, re.DOTALL)
            if m:
                b64 = m.group('b64')
                raw = base64.b64decode(b64)
                # Basic size guard (10MB)
                if len(raw) > 10 * 1024 * 1024:
                    return Response({'error': 'Attachment too large (max 10MB).'}, status=413)
                os.makedirs(os.path.join(settings.MEDIA_ROOT, 'attachments'), exist_ok=True)
                ext = '.bin'
                if att.name.lower().endswith('.pdf'):
                    ext = '.pdf'
                filename = f'attachment_{att.id}{ext}'
                path = os.path.join(settings.MEDIA_ROOT, 'attachments', filename)
                with open(path, 'wb') as f:
                    f.write(raw)
                att.file_path = path
                att.data_url = f"/api/attachments/{att.id}/download/"
                att.save(update_fields=['file_path', 'data_url'])
    except Exception:
        # Non-fatal: keep original record (data_url may be blank or non-data URL)
        pass
    return Response(AttachmentSerializer(att).data, status=201)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def attachment_download(request, pk):
    try:
        att = Attachment.objects.get(pk=pk)
    except Attachment.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)
    if not att.file_path:
        return Response({'error': 'File not available.'}, status=404)
    if not os.path.exists(att.file_path):
        return Response({'error': 'File missing on server.'}, status=404)
    return FileResponse(open(att.file_path, 'rb'), as_attachment=True, filename=att.name or f'attachment_{att.id}')


# ─── RFQ (Request for Quotation) ─────────────────────────────────────────────

def _generate_number(prefix: str) -> str:
    """Generate stable-ish business IDs with millisecond precision."""
    now = timezone.now()
    ms = int(now.microsecond / 1000)
    return f"{prefix}{now.year}{now.month:02d}{now.day:02d}{now.hour:02d}{now.minute:02d}{now.second:02d}{ms:03d}"


def _approval_chain_template(req_type: str) -> list[dict]:
    """Mirror the frontend buildApprovalChain() logic for conversion."""
    if req_type == 'Petty Cash':
        return [
            { 'role': 'Department Manager', 'label': 'Department Manager' },
            { 'role': 'Accountant', 'label': 'Accountant' },
            { 'role': 'Head of Operations', 'label': 'Head of Operations & Training' },
        ]
    return [
        { 'role': 'Department Manager', 'label': 'Department Manager' },
        { 'role': 'Accountant', 'label': 'Accountant' },
        { 'role': 'General Manager', 'label': 'General Manager' },
        { 'role': 'Financial Controller', 'label': 'Financial Controller' },
    ]


def _primary_role(user) -> str:
    try:
        roles = list(user.roles.values_list('role', flat=True))
        return roles[0] if roles else ''
    except Exception:
        return ''


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def rfq_list(request):
    from .permissions import IsRequesterOrProcurementClerk, IsRequester, IsProcurementClerk

    if not IsRequesterOrProcurementClerk().has_permission(request, None):
        return Response({'error': 'Forbidden.'}, status=403)

    if request.method == 'GET':
        # Procurement clerk: pending queue + RFQs they have already actioned.
        if IsProcurementClerk().has_permission(request, None) and not IsRequester().has_permission(request, None):
            qs = RFQ.objects.filter(
                Q(status='Pending Procurement') | Q(events__actor_id=request.user.id)
            ).distinct()
        else:
            qs = RFQ.objects.filter(requester_id=request.user.id)

        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        paginator = StandardPagination()
        qs = qs.prefetch_related('items', 'events')
        page = paginator.paginate_queryset(qs.order_by('-created_at'), request)
        return paginator.get_paginated_response(RFQSerializer(page, many=True).data)

    # POST – create RFQ (Requester only)
    if not IsRequester().has_permission(request, None):
        return Response({'error': 'Forbidden.'}, status=403)

    data = request.data
    rfq_type = data.get('type') or 'Supplier Payment (Normal)'
    try:
        amount_est = Decimal(str(data.get('amount_estimated', 0) or 0))
    except Exception:
        amount_est = Decimal('0')

    from .bases import resolve_base
    from .departments import (
        DEPARTMENT_COST_CENTRE,
        default_department,
        resolve_department,
    )

    raw_dept = (data.get('department') or getattr(request.user, 'department', '') or '').strip()
    resolved = resolve_department(raw_dept)
    if resolved is None:
        resolved = default_department() if not raw_dept else None
    if resolved is None:
        return Response({'error': 'Invalid department.', 'department': raw_dept}, status=400)
    rfq_dept = resolved
    rfq_cc = DEPARTMENT_COST_CENTRE[rfq_dept]
    rfq_base = resolve_base((data.get('base') or '').strip())

    with transaction.atomic():
        rfq = RFQ.objects.create(
            rfq_number=_generate_number('RFQ'),
            type=rfq_type,
            requester_id=request.user.id,
            department=rfq_dept,
            cost_center=rfq_cc,
            base=rfq_base,
            budget_available=bool(data.get('budget_available', True)),
            currency=data.get('currency') or 'USD',
            description=data.get('description') or '',
            justification=data.get('justification') or '',
            amount_estimated=amount_est,
            status='Draft',
        )
        for idx, item in enumerate(data.get('items', [])):
            RFQItem.objects.create(
                rfq=rfq,
                order=item.get('order', idx + 1),
                description=item.get('description') or '',
                quantity=int(item.get('quantity', 1) or 1),
                unit=item.get('unit') or 'Unit',
            )

        RFQEvent.objects.create(
            rfq=rfq,
            order=1,
            status='Draft',
            label='RFQ created (Draft)',
            actor=request.user,
            actor_name=getattr(request.user, 'name', '') or '',
            actor_role=_primary_role(request.user),
        )

    return Response(RFQSerializer(rfq).data, status=201)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def rfq_detail(request, pk):
    rfq = RFQ.objects.prefetch_related('items', 'events', 'quotes__items', 'quotes__attachments').filter(pk=pk).first()
    if not rfq:
        return Response({'error': 'Not found.'}, status=404)

    return Response(RFQSerializer(rfq).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def rfq_submit_to_procurement(request, pk):
    from .permissions import IsRequester

    if not IsRequester().has_permission(request, None):
        return Response({'error': 'Forbidden.'}, status=403)

    rfq = RFQ.objects.get(pk=pk)
    if rfq.requester_id != request.user.id:
        return Response({'error': 'Forbidden.'}, status=403)
    if rfq.status != 'Draft':
        return Response({'error': 'RFQ must be in Draft status.'}, status=400)

    rfq.status = 'Pending Procurement'
    rfq.submitted_at = timezone.now()
    rfq.save(update_fields=['status', 'submitted_at'])

    RFQEvent.objects.create(
        rfq=rfq,
        order=2,
        status='Pending Procurement',
        label='Submitted to procurement',
        actor=request.user,
        actor_name=getattr(request.user, 'name', '') or '',
        actor_role=_primary_role(request.user),
    )

    # ── Notifications (in-app + email) ───────────────────────────────────────
    requester = request.user
    message = f"Your RFQ {rfq.rfq_number} has been submitted to procurement for quotations."
    AppNotification.objects.create(
        recipient=requester,
        title='RFQ Submitted to Procurement',
        message=message,
        type='submission',
        requisition=None,
        rfq=rfq,
    )

    procurement_clerks = User.objects.filter(roles__role='Procurement Clerk', active=True).distinct()
    for clerk in procurement_clerks:
        if clerk.id == requester.id:
            continue
        AppNotification.objects.create(
            recipient=clerk,
            title=f'RFQ Pending Quotations – {rfq.rfq_number}',
            message=f"RFQ {rfq.rfq_number} is awaiting quotations from you and your team.",
            type='submission',
            requisition=None,
            rfq=rfq,
        )

    # Best-effort email dispatch (only if SMTP configured)
    config = get_smtp_config()
    if config:
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
        from_email = config.get('from_email') or config.get('username') or 'noreply@localhost'
        login_url = f"{settings.FRONTEND_BASE_URL}/login"
        subject_req = f'RFQ Submitted to Procurement ({rfq.rfq_number})'
        body_req = message + f"\n\nLogin: {login_url}\n"
        try:
            EmailMessage(
                subject=subject_req,
                body=body_req,
                from_email=from_email,
                to=[requester.email],
                connection=conn,
            ).send()
        except Exception as e:
            logger.warning("RFQ requester submit email failed for %s: %s", requester.email, str(e))

        subject_clerk = f'RFQ Pending Quotations ({rfq.rfq_number})'
        for clerk in procurement_clerks:
            if not clerk.email:
                continue
            if clerk.id == requester.id:
                continue
            body = f"RFQ {rfq.rfq_number} is awaiting quotations.\n\nLogin: {login_url}\n"
            try:
                EmailMessage(
                    subject=subject_clerk,
                    body=body,
                    from_email=from_email,
                    to=[clerk.email],
                    connection=conn,
                ).send()
            except Exception as e:
                logger.warning("RFQ procurement submit email failed for %s: %s", clerk.email, str(e))
    else:
        logger.warning("RFQ submit email skipped: SMTP not configured.")

    return Response(RFQSerializer(rfq).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def rfq_upload_quotes(request, pk):
    from .permissions import IsProcurementClerk

    if not IsProcurementClerk().has_permission(request, None):
        return Response({'error': 'Forbidden.'}, status=403)

    rfq = RFQ.objects.get(pk=pk)
    if rfq.status != 'Pending Procurement':
        return Response({'error': 'RFQ must be in Pending Procurement status.'}, status=400)

    quotes = request.data.get('quotes')
    if not isinstance(quotes, list) or not quotes:
        return Response({'error': 'quotes[] is required.'}, status=400)

    with transaction.atomic():
        RFQQuote.objects.filter(rfq=rfq).delete()
        for q in quotes:
            supplier_id = q.get('supplier_id') or q.get('supplierId')
            if not supplier_id:
                return Response({'error': 'supplier_id is required for each quote.'}, status=400)
            supplier = Supplier.objects.filter(pk=supplier_id, active=True, suspended=False).first()
            if not supplier:
                return Response({'error': f'Invalid or suspended supplier: {supplier_id}'}, status=400)
            quote = RFQQuote.objects.create(
                rfq=rfq,
                created_by_id=request.user.id,
                supplier=supplier,
                supplier_name=supplier.name,
                supplier_email=supplier.contact_email,
                supplier_phone='',
                supplier_address=supplier.physical_address,
                supplier_contact=supplier.contact_person,
                supplier_bank_name=q.get('supplier_bank_name') or q.get('supplierBankName') or '',
                supplier_bank_account_name=q.get('supplier_bank_account_name') or q.get('supplierBankAccountName') or '',
                supplier_bank_account_number=q.get('supplier_bank_account_number') or q.get('supplierBankAccountNumber') or '',
                supplier_bank_branch=q.get('supplier_bank_branch') or q.get('supplierBankBranch') or '',
                quote_currency=q.get('quote_currency') or q.get('quoteCurrency') or rfq.currency,
                quote_total_amount=Decimal(str(q.get('quote_total_amount') or q.get('quoteTotalAmount') or 0)),
                quote_notes=q.get('quote_notes') or q.get('quoteNotes') or '',
                quote_valid_until=(
                    parse_date(q.get('quote_valid_until') or q.get('quoteValidUntil'))
                    if (q.get('quote_valid_until') or q.get('quoteValidUntil'))
                    else None
                ),
            )

            for it in q.get('items') or []:
                rfq_item_id = it.get('rfq_item_id') or it.get('rfqItemId') or it.get('rfq_item') or it.get('rfqItem')
                if rfq_item_id is None:
                    continue
                RFQQuoteItem.objects.create(
                    quote=quote,
                    rfq_item_id=rfq_item_id,
                    description=it.get('description') or '',
                    quantity=int(it.get('quantity', 1) or 1),
                    unit=it.get('unit') or 'Unit',
                    unit_price=Decimal(str(it.get('unit_price') or it.get('unitPrice') or 0)),
                    line_total=Decimal(str(it.get('line_total') or it.get('lineTotal') or 0)),
                )

            for d in q.get('documents') or q.get('attachments') or []:
                RFQQuoteAttachment.objects.create(
                    quote=quote,
                    name=d.get('name') or 'Quotation Document',
                    type=d.get('type') or 'application/pdf',
                    size=d.get('size') or '',
                    uploaded_by=d.get('uploaded_by') or d.get('uploadedBy') or request.user.name,
                    data_url=d.get('data_url') or d.get('dataUrl') or '',
                    is_quote_document=bool(d.get('is_quote_document', True)),
                )

        # Optional event: quotes uploaded. Status doesn't change here, but it helps the timeline.
        RFQEvent.objects.create(
            rfq=rfq,
            order=2,
            status='Pending Procurement',
            label='Quotation documents uploaded',
            actor=request.user,
            actor_name=getattr(request.user, 'name', '') or '',
            actor_role=_primary_role(request.user),
        )

        # Notifications (in-app): requester and acting procurement clerk.
        requester = rfq.requester
        clerk = request.user
        AppNotification.objects.create(
            recipient=requester,
            title=f'RFQ Quotations Uploaded – {rfq.rfq_number}',
            message=f"Procurement uploaded supplier quotations for RFQ {rfq.rfq_number}.",
            type='info',
            requisition=None,
            rfq=rfq,
        )
        AppNotification.objects.create(
            recipient=clerk,
            title=f'RFQ Quotations Uploaded – {rfq.rfq_number}',
            message=f"You uploaded supplier quotations for RFQ {rfq.rfq_number}.",
            type='info',
            requisition=None,
            rfq=rfq,
        )

    # Best-effort email dispatch (if SMTP configured)
    config = get_smtp_config()
    if config:
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
        from_email = config.get('from_email') or config.get('username') or 'noreply@localhost'
        login_url = f"{settings.FRONTEND_BASE_URL}/login"
        requester = rfq.requester
        clerk = request.user
        if getattr(requester, 'email', ''):
            try:
                EmailMessage(
                    subject=f'RFQ Quotations Uploaded ({rfq.rfq_number})',
                    body=f"Procurement uploaded supplier quotations for RFQ {rfq.rfq_number}.\n\nLogin: {login_url}\n",
                    from_email=from_email,
                    to=[requester.email],
                    connection=conn,
                ).send()
            except Exception as e:
                logger.warning("RFQ quote upload requester email failed for %s: %s", requester.email, str(e))
        if getattr(clerk, 'email', ''):
            try:
                EmailMessage(
                    subject=f'RFQ Quotations Uploaded ({rfq.rfq_number})',
                    body=f"You uploaded supplier quotations for RFQ {rfq.rfq_number}.\n\nLogin: {login_url}\n",
                    from_email=from_email,
                    to=[clerk.email],
                    connection=conn,
                ).send()
            except Exception as e:
                logger.warning("RFQ quote upload actor email failed for %s: %s", clerk.email, str(e))
    else:
        logger.warning("RFQ quote upload email skipped: SMTP not configured.")

    return Response(RFQSerializer(rfq).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def rfq_complete_quotes(request, pk):
    from .permissions import IsProcurementClerk

    if not IsProcurementClerk().has_permission(request, None):
        return Response({'error': 'Forbidden.'}, status=403)

    rfq = RFQ.objects.get(pk=pk)
    if rfq.status == 'Pending Requester Selection':
        # Idempotency: if the clerk clicked twice or state changed,
        # treat this as already completed.
        return Response(RFQSerializer(rfq).data, status=200)
    if rfq.status != 'Pending Procurement':
        return Response(
            {'error': 'RFQ must be in Pending Procurement status.', 'current_status': rfq.status},
            status=400,
        )

    rfq.status = 'Pending Requester Selection'
    rfq.procurement_completed_at = timezone.now()
    rfq.save(update_fields=['status', 'procurement_completed_at'])

    RFQEvent.objects.create(
        rfq=rfq,
        order=3,
        status='Pending Requester Selection',
        label='Procurement completed (awaiting requester selection)',
        actor=request.user,
        actor_name=getattr(request.user, 'name', '') or '',
        actor_role=_primary_role(request.user),
    )

    # Notifications: requester and the clerk who acted.
    requester = rfq.requester
    clerk = request.user
    AppNotification.objects.create(
        recipient=requester,
        title=f'RFQ Ready for Selection – {rfq.rfq_number}',
        message=f"Procurement has completed quotations for RFQ {rfq.rfq_number}. Please select a supplier quote to convert it into a requisition.",
        type='approval',
        requisition=None,
        rfq=rfq,
    )
    AppNotification.objects.create(
        recipient=clerk,
        title=f'RFQ Completed – {rfq.rfq_number}',
        message=f"You completed procurement for RFQ {rfq.rfq_number}. The requester can now select the supplier quote.",
        type='info',
        requisition=None,
        rfq=rfq,
    )

    # Best-effort email (if SMTP configured)
    config = get_smtp_config()
    if config:
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
        from_email = config.get('from_email') or config.get('username') or 'noreply@localhost'
        login_url = f"{settings.FRONTEND_BASE_URL}/login"
        try:
            EmailMessage(
                subject=f'RFQ Ready for Selection ({rfq.rfq_number})',
                body=f"RFQ {rfq.rfq_number} is ready for requester selection.\n\nLogin: {login_url}\n",
                from_email=from_email,
                to=[requester.email],
                connection=conn,
            ).send()
        except Exception as e:
            logger.warning("RFQ requester complete email failed for %s: %s", requester.email, str(e))
        try:
            if clerk.email:
                EmailMessage(
                    subject=f'RFQ Completed ({rfq.rfq_number})',
                    body=f"You completed procurement for RFQ {rfq.rfq_number}.\n\nLogin: {login_url}\n",
                    from_email=from_email,
                    to=[clerk.email],
                    connection=conn,
                ).send()
        except Exception as e:
            logger.warning("RFQ actor complete email failed for %s: %s", clerk.email, str(e))
    else:
        logger.warning("RFQ complete email skipped: SMTP not configured.")
    return Response(RFQSerializer(rfq).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def rfq_convert_to_requisition(request, pk):
    from .permissions import IsRequester

    if not IsRequester().has_permission(request, None):
        return Response({'error': 'Forbidden.'}, status=403)

    rfq = RFQ.objects.select_related('requester').get(pk=pk)
    if rfq.requester_id != request.user.id:
        return Response({'error': 'Forbidden.'}, status=403)
    if rfq.status != 'Pending Requester Selection':
        return Response({'error': 'RFQ must be in Pending Requester Selection status.'}, status=400)

    quote_id = request.data.get('quote_id') or request.data.get('quoteId')
    if not quote_id:
        return Response({'error': 'quote_id is required.'}, status=400)
    selected_supplier_justification = (
        request.data.get('selected_supplier_justification')
        or request.data.get('selectedSupplierJustification')
        or ''
    ).strip()
    if not selected_supplier_justification:
        return Response({'error': 'selected_supplier_justification is required.'}, status=400)

    quote = RFQQuote.objects.filter(rfq=rfq, pk=quote_id).prefetch_related('items').first()
    if not quote:
        return Response({'error': 'Quote not found for this RFQ.'}, status=404)

    template = _approval_chain_template(rfq.type)
    first_role = template[0]['role'] if template else None

    with transaction.atomic():
        rfq.selected_quote = quote
        rfq.status = 'Converted'
        rfq.converted_at = timezone.now()
        rfq.selected_supplier_justification = selected_supplier_justification
        rfq.save(update_fields=['selected_quote', 'status', 'converted_at', 'selected_supplier_justification'])

        req_prefix = 'PC' if rfq.type == 'Petty Cash' else 'IR'
        req_number = _generate_number(req_prefix)

        req = Requisition.objects.create(
            rfq=rfq,
            req_number=req_number,
            type=rfq.type,
            description=rfq.description,
            justification=rfq.justification,
            amount=quote.quote_total_amount,
            currency=quote.quote_currency,
            department=rfq.department,
            cost_center=rfq.cost_center,
            base=rfq.base,
            budget_available=rfq.budget_available,
            requester_id=rfq.requester_id,
            status='Submitted',
            current_approver_role=first_role,
            is_capex=True if rfq.type == 'High-Value/CAPEX' else False,
            po_generated=False,
            supplier=quote.supplier_name,
            supplier_email=quote.supplier_email,
            supplier_phone=quote.supplier_phone,
            supplier_address=quote.supplier_address,
            supplier_contact=quote.supplier_contact,
            supplier_bank_name=quote.supplier_bank_name,
            supplier_bank_account_name=quote.supplier_bank_account_name,
            supplier_bank_account_number=quote.supplier_bank_account_number,
            supplier_bank_branch=quote.supplier_bank_branch,
            suppliers_json=None,
            preferred_supplier_index=None,
            preferred_supplier_justification=selected_supplier_justification,
            vehicle_reg='',
            fuel_type='',
            fuel_quantity=None,
            travel_destination='',
            travel_start_date=None,
            travel_end_date=None,
            asset_type='',
            asset_specs='',
            maintenance_item='',
            maintenance_urgency='',
        )

        for idx, step in enumerate(template):
            ApprovalStep.objects.create(
                requisition=req,
                order=idx + 1,
                role=step['role'],
                label=step['label'],
                status='Pending',
            )

        for it in quote.items.all():
            POItem.objects.create(
                requisition=req,
                description=it.description,
                quantity=it.quantity,
                unit=it.unit,
                unit_price=it.unit_price,
                line_total=it.line_total,
            )

        roles = request.user.roles.values_list('role', flat=True)
        primary_role = roles[0] if roles else ''
        AuditEntry.objects.create(
            action='RFQ Converted',
            user=request.user,
            user_id_str=str(request.user.id),
            user_name=getattr(request.user, 'name', '') or '',
            user_role=primary_role,
            details=f"RFQ {rfq.rfq_number} converted into requisition {req.req_number}.",
            requisition=req,
        )

        RFQEvent.objects.create(
            rfq=rfq,
            order=4,
            status='Converted',
            label=(
                f"Supplier selected: {quote.supplier_name or '—'}; "
                f"justification: {selected_supplier_justification}. "
                "RFQ converted into requisition."
            ),
            actor=request.user,
            actor_name=getattr(request.user, 'name', '') or '',
            actor_role=_primary_role(request.user),
        )

        # Notifications (in-app): requester and procurement clerks after conversion.
        AppNotification.objects.create(
            recipient=request.user,
            title=f'RFQ Converted – {rfq.rfq_number}',
            message=f'Your RFQ {rfq.rfq_number} has been converted into requisition {req.req_number}.',
            type='info',
            requisition=req,
            rfq=rfq,
        )
        procurement_clerks = User.objects.filter(roles__role='Procurement Clerk', active=True).exclude(id=request.user.id).distinct()
        for clerk in procurement_clerks:
            AppNotification.objects.create(
                recipient=clerk,
                title=f'RFQ Converted – {rfq.rfq_number}',
                message=f"Requester selected a supplier and RFQ {rfq.rfq_number} was converted into requisition {req.req_number}.",
                type='info',
                requisition=req,
                rfq=rfq,
            )

        config = get_smtp_config()
        if config:
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
            from_email = config.get('from_email') or config.get('username') or 'noreply@localhost'
            if getattr(request.user, 'email', ''):
                try:
                    EmailMessage(
                        subject=f'RFQ Converted ({rfq.rfq_number})',
                        body=f'RFQ {rfq.rfq_number} converted into requisition {req.req_number}.\n\nLogin: {settings.FRONTEND_BASE_URL}/login\n',
                        from_email=from_email,
                        to=[request.user.email],
                        connection=conn,
                    ).send()
                except Exception as e:
                    logger.warning("RFQ convert email failed for %s: %s", request.user.email, str(e))
            for clerk in procurement_clerks:
                if not clerk.email:
                    continue
                try:
                    EmailMessage(
                        subject=f'RFQ Converted ({rfq.rfq_number})',
                        body=f"Requester selected a supplier and RFQ {rfq.rfq_number} converted into requisition {req.req_number}.\n\nLogin: {settings.FRONTEND_BASE_URL}/login\n",
                        from_email=from_email,
                        to=[clerk.email],
                        connection=conn,
                    ).send()
                except Exception as e:
                    logger.warning("RFQ convert procurement email failed for %s: %s", clerk.email, str(e))
        else:
            logger.warning("RFQ convert email skipped: SMTP not configured.")

    return Response(RequisitionDetailSerializer(req).data)


# ─── Supplier Master Data (Procurement) ───────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def supplier_list(request):
    from .permissions import IsProcurementClerk

    if request.method == 'GET':
        qs = Supplier.objects.all().order_by('name', 'id')
        status_param = (request.query_params.get('status') or '').strip().lower()
        if status_param == 'active':
            qs = qs.filter(active=True, suspended=False)
        elif status_param == 'suspended':
            qs = qs.filter(suspended=True)
        q = (request.query_params.get('q') or '').strip()
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(category__icontains=q) | Q(contact_person__icontains=q))
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(SupplierSerializer(page, many=True).data)

    if not IsProcurementClerk().has_permission(request, None):
        return Response({'error': 'Forbidden.'}, status=403)

    data = request.data
    payload = {
        'name': (data.get('name') or '').strip(),
        'category': _normalize_supplier_category(data.get('category') or 'Other'),
        'physical_address': (data.get('physical_address') or data.get('physicalAddress') or '').strip(),
        'contact_email': (data.get('contact_email') or data.get('contactEmail') or '').strip(),
        'contact_person': (data.get('contact_person') or data.get('contactPerson') or '').strip(),
        'active': bool(data.get('active', True)),
        'suspended': bool(data.get('suspended', False)),
        'created_by': request.user.id,
    }
    serializer = SupplierSerializer(data=payload)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)
    supplier = serializer.save()
    return Response(SupplierSerializer(supplier).data, status=201)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def supplier_detail(request, pk):
    from .permissions import IsProcurementClerk

    if not IsProcurementClerk().has_permission(request, None):
        return Response({'error': 'Forbidden.'}, status=403)

    supplier = Supplier.objects.filter(pk=pk).first()
    if not supplier:
        return Response({'error': 'Not found.'}, status=404)

    raw = request.data
    data = {}
    if 'name' in raw:
        data['name'] = (raw.get('name') or '').strip()
    if 'category' in raw:
        data['category'] = _normalize_supplier_category(raw.get('category') or 'Other')
    if 'physical_address' in raw or 'physicalAddress' in raw:
        data['physical_address'] = (raw.get('physical_address') or raw.get('physicalAddress') or '').strip()
    if 'contact_email' in raw or 'contactEmail' in raw:
        data['contact_email'] = (raw.get('contact_email') or raw.get('contactEmail') or '').strip()
    if 'contact_person' in raw or 'contactPerson' in raw:
        data['contact_person'] = (raw.get('contact_person') or raw.get('contactPerson') or '').strip()
    if 'active' in raw:
        data['active'] = bool(raw.get('active'))
    if 'suspended' in raw:
        data['suspended'] = bool(raw.get('suspended'))

    serializer = SupplierSerializer(supplier, data=data, partial=True)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)
    serializer.save()
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def supplier_bulk_create(request):
    from .permissions import IsProcurementClerk

    if not IsProcurementClerk().has_permission(request, None):
        return Response({'error': 'Forbidden.'}, status=403)

    rows = request.data.get('suppliers')
    if not isinstance(rows, list) or not rows:
        return Response({'error': 'suppliers[] is required.'}, status=400)

    existing = Supplier.objects.all().values('name', 'contact_email')
    existing_name_keys = {((x.get('name') or '').strip().lower()) for x in existing if (x.get('name') or '').strip()}
    existing_email_keys = {((x.get('contact_email') or '').strip().lower()) for x in existing if (x.get('contact_email') or '').strip()}

    seen_name_keys = set()
    seen_email_keys = set()
    created = []
    duplicates = []
    for idx, row in enumerate(rows):
        payload = {
            'name': (row.get('name') or '').strip(),
            'category': _normalize_supplier_category(row.get('category') or 'Other'),
            'physical_address': (row.get('physical_address') or row.get('physicalAddress') or '').strip(),
            'contact_email': (row.get('contact_email') or row.get('contactEmail') or '').strip(),
            'contact_person': (row.get('contact_person') or row.get('contactPerson') or '').strip(),
            'active': bool(row.get('active', True)),
            'suspended': bool(row.get('suspended', False)),
            'created_by': request.user.id,
        }
        name_key = payload['name'].lower()
        email_key = payload['contact_email'].lower()
        duplicate_reasons = []
        if name_key and (name_key in existing_name_keys or name_key in seen_name_keys):
            duplicate_reasons.append('name')
        if email_key and (email_key in existing_email_keys or email_key in seen_email_keys):
            duplicate_reasons.append('contact_email')
        if duplicate_reasons:
            duplicates.append({
                'row': idx + 1,
                'name': payload['name'],
                'contact_email': payload['contact_email'],
                'reasons': duplicate_reasons,
            })
            continue
        serializer = SupplierSerializer(data=payload)
        if not serializer.is_valid():
            duplicates.append({
                'row': idx + 1,
                'name': payload['name'],
                'contact_email': payload['contact_email'],
                'reasons': ['invalid_row'],
                'details': serializer.errors,
            })
            continue
        supplier = serializer.save()
        created.append(supplier)
        if name_key:
            seen_name_keys.add(name_key)
        if email_key:
            seen_email_keys.add(email_key)

    status_code = 201 if created else 200
    return Response(
        {
            'created_count': len(created),
            'skipped_count': len(duplicates),
            'duplicates': duplicates,
            'suppliers': SupplierSerializer(created, many=True).data,
        },
        status=status_code,
    )


# ─── Department Budgets (Annual) ──────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def budget_list(request):
    from .permissions import HasRole

    can_view = HasRole()
    can_view.required_roles = ('Financial Controller', 'General Manager', 'Accountant', 'Department Manager')
    if not can_view.has_permission(request, None):
        return Response({'error': 'Forbidden.'}, status=403)

    year = int(request.query_params.get('year') or timezone.now().year)
    if request.method == 'GET':
        qs = DepartmentBudget.objects.filter(year=year).order_by('department')
        return Response(DepartmentBudgetSerializer(qs, many=True).data)

    can_manage = HasRole()
    can_manage.required_roles = ('Financial Controller',)
    if not can_manage.has_permission(request, None):
        return Response({'error': 'Forbidden.'}, status=403)

    data = request.data
    department = (data.get('department') or '').strip()
    if not department:
        return Response({'error': 'department is required.'}, status=400)
    payload = {
        'year': int(data.get('year') or year),
        'department': department,
        'usd_budget': data.get('usd_budget') or data.get('usdBudget') or 0,
        'zig_budget': data.get('zig_budget') or data.get('zigBudget') or 0,
    }
    existing = DepartmentBudget.objects.filter(year=payload['year'], department=payload['department']).first()
    serializer = DepartmentBudgetSerializer(existing, data=payload, partial=bool(existing))
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)
    budget = serializer.save(configured_by=request.user)
    return Response(DepartmentBudgetSerializer(budget).data, status=200 if existing else 201)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def budget_stats(request):
    from .permissions import HasRole

    can_view = HasRole()
    can_view.required_roles = ('Financial Controller', 'General Manager', 'Accountant', 'Department Manager')
    if not can_view.has_permission(request, None):
        return Response({'error': 'Forbidden.'}, status=403)

    from .bases import ORGANIZATION_BASES

    year = int(request.query_params.get('year') or timezone.now().year)
    rows = DepartmentBudget.objects.filter(year=year).order_by('department')
    reqs = Requisition.objects.filter(created_at__year=year, status='Paid')

    is_dept_manager_only = (
        request.user.roles.filter(role='Department Manager').exists()
        and not request.user.roles.filter(role__in=['Financial Controller', 'General Manager', 'Accountant']).exists()
    )
    if is_dept_manager_only:
        rows = rows.filter(department=request.user.department)
        reqs = reqs.filter(department=request.user.department)

    # Consumption for budget utilisation: all paid amounts in the department (every base).
    by_dept_consumed = {}
    # Paid spend split by operational base (informational only — not a separate budget allocation).
    by_base_consumed = {name: {'usd': 0.0, 'zig': 0.0} for name in ORGANIZATION_BASES}
    monthly = {}
    for r in reqs:
        dept = r.department
        if dept not in by_dept_consumed:
            by_dept_consumed[dept] = {'usd': 0.0, 'zig': 0.0}
        paid_dt = r.paid_at or r.updated_at or r.created_at
        month_key = f"{paid_dt.year:04d}-{paid_dt.month:02d}"
        if month_key not in monthly:
            monthly[month_key] = {'usd_consumed': 0.0, 'zig_consumed': 0.0}
        amt = float(r.amount or 0)
        if (r.currency or '').upper() == 'ZIG':
            by_dept_consumed[dept]['zig'] += amt
            monthly[month_key]['zig_consumed'] += amt
        else:
            by_dept_consumed[dept]['usd'] += amt
            monthly[month_key]['usd_consumed'] += amt
        rb = getattr(r, 'base', '') or 'Harare'
        if rb in by_base_consumed:
            if (r.currency or '').upper() == 'ZIG':
                by_base_consumed[rb]['zig'] += amt
            else:
                by_base_consumed[rb]['usd'] += amt

    departments = []
    totals = {'usd_budget': 0.0, 'zig_budget': 0.0, 'usd_consumed': 0.0, 'zig_consumed': 0.0}
    alerts = []
    for b in rows:
        consumed = by_dept_consumed.get(b.department, {'usd': 0.0, 'zig': 0.0})
        usd_budget = float(b.usd_budget or 0)
        zig_budget = float(b.zig_budget or 0)
        usd_consumed = consumed['usd']
        zig_consumed = consumed['zig']
        departments.append({
            'department': b.department,
            'year': b.year,
            'usd_budget': usd_budget,
            'zig_budget': zig_budget,
            'usd_consumed': usd_consumed,
            'zig_consumed': zig_consumed,
            'usd_remaining': usd_budget - usd_consumed,
            'zig_remaining': zig_budget - zig_consumed,
            'usd_utilization_pct': (usd_consumed / usd_budget * 100.0) if usd_budget > 0 else 0.0,
            'zig_utilization_pct': (zig_consumed / zig_budget * 100.0) if zig_budget > 0 else 0.0,
        })
        usd_pct = (usd_consumed / usd_budget * 100.0) if usd_budget > 0 else 0.0
        zig_pct = (zig_consumed / zig_budget * 100.0) if zig_budget > 0 else 0.0
        if usd_pct >= 80.0:
            alerts.append({
                'scope': 'department',
                'department': b.department,
                'currency': 'USD',
                'utilization_pct': usd_pct,
                'threshold': 90 if usd_pct >= 90.0 else 80,
                'level': 'critical' if usd_pct >= 90.0 else 'warning',
                'message': f"{b.department} has used {usd_pct:.1f}% of USD budget.",
            })
        if zig_pct >= 80.0:
            alerts.append({
                'scope': 'department',
                'department': b.department,
                'currency': 'ZIG',
                'utilization_pct': zig_pct,
                'threshold': 90 if zig_pct >= 90.0 else 80,
                'level': 'critical' if zig_pct >= 90.0 else 'warning',
                'message': f"{b.department} has used {zig_pct:.1f}% of ZIG budget.",
            })
        totals['usd_budget'] += usd_budget
        totals['zig_budget'] += zig_budget
        totals['usd_consumed'] += usd_consumed
        totals['zig_consumed'] += zig_consumed

    bases_summary = []
    for name in ORGANIZATION_BASES:
        c = by_base_consumed.get(name, {'usd': 0.0, 'zig': 0.0})
        bases_summary.append({
            'base': name,
            'usd_consumed': c['usd'],
            'zig_consumed': c['zig'],
        })

    org_usd_pct = (totals['usd_consumed'] / totals['usd_budget'] * 100.0) if totals['usd_budget'] > 0 else 0.0
    org_zig_pct = (totals['zig_consumed'] / totals['zig_budget'] * 100.0) if totals['zig_budget'] > 0 else 0.0
    if org_usd_pct >= 80.0:
        alerts.append({
            'scope': 'organisation',
            'department': None,
            'currency': 'USD',
            'utilization_pct': org_usd_pct,
            'threshold': 90 if org_usd_pct >= 90.0 else 80,
            'level': 'critical' if org_usd_pct >= 90.0 else 'warning',
            'message': f"Organisation has used {org_usd_pct:.1f}% of USD budget.",
        })
    if org_zig_pct >= 80.0:
        alerts.append({
            'scope': 'organisation',
            'department': None,
            'currency': 'ZIG',
            'utilization_pct': org_zig_pct,
            'threshold': 90 if org_zig_pct >= 90.0 else 80,
            'level': 'critical' if org_zig_pct >= 90.0 else 'warning',
            'message': f"Organisation has used {org_zig_pct:.1f}% of ZIG budget.",
        })

    trend = []
    for m in range(1, 13):
        k = f"{year:04d}-{m:02d}"
        val = monthly.get(k, {'usd_consumed': 0.0, 'zig_consumed': 0.0})
        trend.append({
            'month': k,
            'usd_consumed': val['usd_consumed'],
            'zig_consumed': val['zig_consumed'],
        })

    return Response({
        'year': year,
        'departments': departments,
        'bases': bases_summary,
        'alerts': alerts,
        'monthly_trend': trend,
        'totals': {
            **totals,
            'usd_remaining': totals['usd_budget'] - totals['usd_consumed'],
            'zig_remaining': totals['zig_budget'] - totals['zig_consumed'],
            'usd_utilization_pct': (totals['usd_consumed'] / totals['usd_budget'] * 100.0) if totals['usd_budget'] > 0 else 0.0,
            'zig_utilization_pct': (totals['zig_consumed'] / totals['zig_budget'] * 100.0) if totals['zig_budget'] > 0 else 0.0,
        },
    })


# ─── Purchase Orders ──────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def purchase_order_list(request):
    qs = PurchaseOrder.objects.select_related('requisition').prefetch_related('items').all()
    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request)
    return paginator.get_paginated_response(PurchaseOrderSerializer(page, many=True).data)


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def purchase_order_detail(request, pk):
    try:
        po = PurchaseOrder.objects.select_related('requisition').prefetch_related('items').get(pk=pk)
    except PurchaseOrder.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)
    if request.method == 'GET':
        return Response(PurchaseOrderSerializer(po).data)
    for attr in ['status', 'approver_names']:
        if attr in request.data:
            setattr(po, attr, request.data[attr])
    po.save()
    return Response(PurchaseOrderSerializer(po).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generate_po(request, req_pk):
    """Generate a PurchaseOrder from a Requisition."""
    try:
        req = Requisition.objects.prefetch_related('items', 'approval_chain').get(pk=req_pk)
    except Requisition.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)

    if hasattr(req, 'purchase_order'):
        return Response(PurchaseOrderSerializer(req.purchase_order).data)

    data = request.data
    from datetime import date
    with transaction.atomic():
        # Build PO number
        count = PurchaseOrder.objects.count() + 1
        po_number = f"PO-{date.today().year}-{str(count).zfill(3)}"

        po = PurchaseOrder.objects.create(
            po_number=po_number,
            date=date.today(),
            version=1,
            requisition=req,
            buyer_company=data.get('buyer_company', 'MARS Ambulance Services'),
            buyer_address=data.get('buyer_address', '14 Fife Avenue, Harare, Zimbabwe'),
            buyer_department=req.department,
            buyer_contact=req.requester.name,
            supplier_name=req.supplier or 'To Be Advised',
            supplier_address=req.supplier_address,
            supplier_contact=req.supplier_contact,
            supplier_email=req.supplier_email,
            supplier_phone=req.supplier_phone,
            currency=req.currency,
            subtotal=req.amount,
            total=req.amount,
            requester_name=req.requester.name,
            approver_names=[
                s.approver_name for s in req.approval_chain.filter(status='Approved')
            ],
            status='Open',
        )

        # Copy items or create from description
        req_items = req.items.all()
        if req_items.exists():
            for item in req_items:
                POItem.objects.create(
                    purchase_order=po,
                    description=item.description,
                    quantity=item.quantity,
                    unit=item.unit,
                    unit_price=item.unit_price,
                    line_total=item.line_total,
                )
        else:
            POItem.objects.create(
                purchase_order=po,
                description=req.description,
                quantity=1, unit='Unit',
                unit_price=req.amount, line_total=req.amount,
            )

        req.po_generated = True
        req.po_number = po_number
        req.save(update_fields=['po_generated', 'po_number', 'updated_at'])

        _log_audit(request, req, 'Purchase Order Generated', f"{po_number} generated for {req.req_number}.")

    return Response(PurchaseOrderSerializer(po).data, status=201)


# ─── Notifications ────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def notification_list(request):
    if request.method == 'GET':
        recipient_id = request.query_params.get('recipient_id')
        qs = AppNotification.objects.select_related('recipient', 'requisition', 'rfq').all()
        if recipient_id:
            qs = qs.filter(recipient_id=recipient_id)
        return Response(AppNotificationSerializer(qs, many=True).data)

    # POST – create notification
    try:
        recipient = User.objects.get(pk=request.data['recipient_id'])
    except (User.DoesNotExist, KeyError):
        return Response({'error': 'recipient_id required and must exist.'}, status=400)
    req_id = request.data.get('requisition_id')
    notif = AppNotification.objects.create(
        recipient=recipient,
        title=request.data.get('title', ''),
        message=request.data.get('message', ''),
        read=False,
        requisition_id=req_id,
        type=request.data.get('type', 'info'),
    )
    return Response(AppNotificationSerializer(notif).data, status=201)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def notification_mark_read(request, pk):
    try:
        notif = AppNotification.objects.get(pk=pk)
    except AppNotification.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)
    notif.read = True
    notif.save(update_fields=['read'])
    return Response(AppNotificationSerializer(notif).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def notification_mark_all_read(request):
    recipient_id = request.data.get('recipient_id')
    if not recipient_id:
        return Response({'error': 'recipient_id required.'}, status=400)
    AppNotification.objects.filter(recipient_id=recipient_id, read=False).update(read=True)
    return Response({'status': 'ok'})


# ─── Delegations ──────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def delegation_list(request):
    if request.method == 'GET':
        qs = DelegationRecord.objects.select_related('from_user', 'to_user').all()
        return Response(DelegationRecordSerializer(qs, many=True).data)
    serializer = DelegationRecordSerializer(data=request.data)
    if serializer.is_valid():
        record = serializer.save()
        return Response(DelegationRecordSerializer(record).data, status=201)
    return Response(serializer.errors, status=400)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def delegation_detail(request, pk):
    try:
        record = DelegationRecord.objects.get(pk=pk)
    except DelegationRecord.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)
    serializer = DelegationRecordSerializer(record, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=400)


# ─── Audit ────────────────────────────────────────────────────────────────────

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
    req_id = (params.get('requisition_id') or '').strip()
    if req_id:
        qs = qs.filter(requisition__req_number__icontains=req_id)
    date_from = (params.get('date_from') or '').strip()
    if date_from:
        try:
            from datetime import datetime as dt_parse
            d = dt_parse.strptime(date_from, '%Y-%m-%d').date()
            qs = qs.filter(timestamp__date__gte=d)
        except ValueError:
            pass
    date_to = (params.get('date_to') or '').strip()
    if date_to:
        try:
            from datetime import datetime as dt_parse
            d = dt_parse.strptime(date_to, '%Y-%m-%d').date()
            qs = qs.filter(timestamp__date__lte=d)
        except ValueError:
            pass
    return qs


def _log_audit(request, requisition, action, details):
    """Server-owned audit logging: derive actor from authenticated request."""
    user = getattr(request, 'user', None)
    roles = []
    if user and getattr(user, 'id', None) and hasattr(user, 'roles'):
        roles = list(user.roles.values_list('role', flat=True))
    primary_role = roles[0] if roles else ''
    AuditEntry.objects.create(
        action=action,
        user=user if getattr(user, 'id', None) else None,
        user_id_str=str(getattr(user, 'id', '') or ''),
        user_name=getattr(user, 'name', '') or '',
        user_role=primary_role,
        details=details,
        requisition=requisition,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAuditorOrFinancialController])
def audit_list(request):
    qs = AuditEntry.objects.select_related('requisition').all().order_by('-timestamp')
    qs = _filter_audit_queryset(qs, request)
    page_size = min(100, max(1, int(request.query_params.get('page_size', 25))))
    paginator = StandardPagination()
    paginator.page_size = page_size
    page = paginator.paginate_queryset(qs, request)
    if page is not None:
        return paginator.get_paginated_response(AuditEntrySerializer(page, many=True).data)
    return Response(AuditEntrySerializer(qs, many=True).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAuditorOrFinancialController])
def audit_requisitions_list(request):
    """One row per requisition: latest activity and action count. For audit trail summary view."""
    qs = (
        AuditEntry.objects.select_related('requisition')
        .filter(requisition_id__isnull=False)
        .order_by('-timestamp')
    )
    qs = _filter_audit_queryset(qs, request)
    max_entries = 5000
    entries = list(qs[:max_entries])
    # Group by requisition_id (entries already -timestamp, so first in group is latest)
    by_req = {}
    for e in entries:
        rid = e.requisition_id
        if rid not in by_req:
            by_req[rid] = []
        by_req[rid].append(e)
    rows = []
    for req_id, group in by_req.items():
        latest = group[0]
        req = latest.requisition
        rows.append({
            'requisition_id': req_id,
            'requisition_number': req.req_number if req else None,
            'requisition_currency': req.currency if req else None,
            'latest_timestamp': latest.timestamp.isoformat(),
            'latest_action': latest.action,
            'latest_user_name': latest.user_name,
            'latest_user_role': latest.user_role,
            'action_count': len(group),
        })
    rows.sort(key=lambda r: r['latest_timestamp'], reverse=True)
    page = int(request.query_params.get('page', 1))
    page_size = min(50, max(1, int(request.query_params.get('page_size', 25))))
    start = (page - 1) * page_size
    end = start + page_size
    paginated = rows[start:end]
    return Response({
        'count': len(rows),
        'next': f'?page={page + 1}' if end < len(rows) else None,
        'previous': f'?page={page - 1}' if page > 1 else None,
        'results': paginated,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAuditorOrFinancialController])
def audit_export_csv(request):
    qs = AuditEntry.objects.select_related('requisition').all().order_by('-timestamp')
    qs = _filter_audit_queryset(qs, request)
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="audit_trail.csv"'
    writer = csv.writer(response)
    writer.writerow(['Timestamp', 'Action', 'User', 'Role', 'Reference', 'Currency', 'Details'])
    for e in qs:
        writer.writerow([
            e.timestamp.isoformat(), e.action, e.user_name, e.user_role,
            e.requisition.req_number if e.requisition else '',
            e.requisition.currency if e.requisition else '',
            e.details,
        ])
    return response


# ─── SMTP / Email notifications ───────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSystemAdministrator])
def smtp_settings_get(request):
    return Response(get_smtp_config_public())


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsSystemAdministrator])
def smtp_settings_save(request):
    data = request.data
    host = data.get('host', '').strip()
    if not host:
        return Response({'error': 'Host is required.'}, status=400)
    try:
        save_smtp_config(
            host=host, port=data.get('port', 587),
            username=data.get('username', ''), password=data.get('password', ''),
            from_email=data.get('from_email', ''), use_tls=data.get('use_tls', True),
        )
        return Response(get_smtp_config_public())
    except Exception as e:
        return Response({'error': str(e)}, status=400)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_notification_email(request):
    to_email = (request.data.get('to_email') or '').strip()
    subject = (request.data.get('subject') or 'Notification').strip()
    body = (request.data.get('body') or '').strip()
    body_html = (request.data.get('body_html') or '').strip()
    if not to_email or '@' not in to_email:
        return Response({'sent': False, 'error': 'Valid to_email required.'}, status=400)
    config = get_smtp_config()
    if not config:
        return Response({'sent': False, 'reason': 'SMTP not configured.'})
    from_email = config.get('from_email') or config.get('username') or 'noreply@localhost'
    try:
        conn = get_connection(
            backend='django.core.mail.backends.smtp.EmailBackend',
            host=config.get('host'), port=config.get('port', 587),
            username=config.get('username') or None,
            password=config.get('password') or None,
            use_tls=config.get('use_tls', True), fail_silently=False,
        )
        from django.core.mail import EmailMessage, EmailMultiAlternatives
        if body_html:
            msg = EmailMultiAlternatives(subject=subject, body=body or 'View this email in HTML.', from_email=from_email, to=[to_email], connection=conn)
            msg.attach_alternative(body_html, 'text/html')
        else:
            msg = EmailMessage(subject=subject, body=body, from_email=from_email, to=[to_email], connection=conn)
        msg.send()
        return Response({'sent': True})
    except Exception as e:
        return Response({'sent': False, 'error': str(e)}, status=500)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_requisition_notification_email(request):
    """
    Send a formatted HTML email with requisition summary (Internal Requisition Number, Purpose, items, etc.).
    """
    to_email = (request.data.get('to_email') or '').strip()
    subject = (request.data.get('subject') or 'Requisition notification').strip()
    headline = (request.data.get('headline') or '').strip()
    status_stage = (request.data.get('status_stage') or 'PendingAction').strip()
    try:
        req_pk = int(request.data.get('requisition_id'))
    except (TypeError, ValueError):
        return Response({'sent': False, 'error': 'requisition_id required.'}, status=400)
    if not to_email or '@' not in to_email:
        return Response({'sent': False, 'error': 'Valid to_email required.'}, status=400)
    if not headline:
        return Response({'sent': False, 'error': 'headline required.'}, status=400)
    try:
        req = Requisition.objects.select_related('requester').prefetch_related('items').get(pk=req_pk)
    except Requisition.DoesNotExist:
        return Response({'sent': False, 'error': 'Requisition not found.'}, status=404)
    config = get_smtp_config()
    if not config:
        return Response({'sent': False, 'reason': 'SMTP not configured.'})
    login_url = (request.data.get('login_url') or '').strip()
    if not login_url:
        login_url = f"{settings.FRONTEND_BASE_URL}/login"
    system_name = getattr(settings, 'REQUISITION_EMAIL_SYSTEM_NAME', 'Internal Requisition System')
    plain, html_body = build_requisition_notification_html(
        req, headline=headline, status_stage=status_stage, login_url=login_url, system_name=system_name,
    )
    from_email = config.get('from_email') or config.get('username') or 'noreply@localhost'
    try:
        conn = get_connection(
            backend='django.core.mail.backends.smtp.EmailBackend',
            host=config.get('host'), port=config.get('port', 587),
            username=config.get('username') or None,
            password=config.get('password') or None,
            use_tls=config.get('use_tls', True), fail_silently=False,
        )
        from django.core.mail import EmailMultiAlternatives
        msg = EmailMultiAlternatives(subject=subject, body=plain, from_email=from_email, to=[to_email], connection=conn)
        msg.attach_alternative(html_body, 'text/html')
        msg.send()
        return Response({'sent': True})
    except Exception as e:
        return Response({'sent': False, 'error': str(e)}, status=500)
