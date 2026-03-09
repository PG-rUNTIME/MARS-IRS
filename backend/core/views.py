import csv
from decimal import Decimal
from django.core.mail import get_connection
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import (
    User, Requisition, ApprovalStep, ReqComment, Attachment,
    POItem, PurchaseOrder, AppNotification, DelegationRecord, AuditEntry,
)
from .serializers import (
    UserSerializer, RequisitionListSerializer, RequisitionDetailSerializer,
    RequisitionWriteSerializer, ApprovalStepSerializer, ReqCommentSerializer,
    AttachmentSerializer, POItemSerializer, PurchaseOrderSerializer,
    AppNotificationSerializer, DelegationRecordSerializer, AuditEntrySerializer,
    check_password,
)
from .smtp_config import get_smtp_config, get_smtp_config_public, save_smtp_config


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
    return Response(UserSerializer(user).data)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_password(request):
    """Verify a user's current password without changing it. Used by change-password flow."""
    user_id = request.data.get('user_id')
    password = request.data.get('password', '')
    try:
        user = User.objects.get(pk=user_id)
    except (User.DoesNotExist, TypeError, ValueError):
        return Response({'valid': False}, status=400)
    return Response({'valid': check_password(password, user.password)})


# ─── Users ────────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def user_list(request):
    if request.method == 'GET':
        users = User.objects.prefetch_related('roles').all()
        return Response(UserSerializer(users, many=True).data)
    serializer = UserSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        return Response(UserSerializer(user).data, status=201)
    return Response(serializer.errors, status=400)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([AllowAny])
def user_detail(request, pk):
    try:
        user = User.objects.prefetch_related('roles').get(pk=pk)
    except User.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)
    if request.method == 'GET':
        return Response(UserSerializer(user).data)
    if request.method == 'PATCH':
        serializer = UserSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(UserSerializer(user).data)
        return Response(serializer.errors, status=400)
    user.delete()
    return Response(status=204)


# ─── Requisitions ─────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
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
        import logging
        logging.getLogger('django').error('RequisitionCreate 400: %s | data keys: %s', write_ser.errors, list(data.keys()))
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
        _log_audit(req, data.get('actor_user_id'), data.get('actor_user_name', ''),
                   data.get('actor_user_role', ''), 'Created',
                   f"Requisition {req.req_number} created as Draft.")

    return Response(RequisitionDetailSerializer(req).data, status=201)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([AllowAny])
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
                _log_audit(req, data.get('actor_user_id'), data.get('actor_user_name', ''),
                           data.get('actor_user_role', ''), data['audit_action'],
                           data.get('audit_details', f"Requisition {req.req_number} updated."))

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
@permission_classes([AllowAny])
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
        user_id=request.data['user_id'],
        user_name=request.data.get('user_name', ''),
        user_role=request.data.get('user_role', ''),
        text=request.data.get('text', ''),
        is_finance_note=request.data.get('is_finance_note', False),
    )
    _log_audit(req, request.data.get('user_id'), request.data.get('user_name', ''),
               request.data.get('user_role', ''), 'Comment Added',
               f"Comment added to {req.req_number}.")
    return Response(ReqCommentSerializer(comment).data, status=201)


# ─── Attachments ──────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def add_attachment(request, req_pk):
    try:
        req = Requisition.objects.get(pk=req_pk)
    except Requisition.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)
    att = Attachment.objects.create(
        requisition=req,
        name=request.data.get('name', ''),
        type=request.data.get('type', ''),
        size=request.data.get('size', ''),
        uploaded_by=request.data.get('uploaded_by', ''),
        data_url=request.data.get('data_url', ''),
        is_proof_of_payment=request.data.get('is_proof_of_payment', False),
    )
    return Response(AttachmentSerializer(att).data, status=201)


# ─── Purchase Orders ──────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def purchase_order_list(request):
    qs = PurchaseOrder.objects.select_related('requisition').prefetch_related('items').all()
    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request)
    return paginator.get_paginated_response(PurchaseOrderSerializer(page, many=True).data)


@api_view(['GET', 'PATCH'])
@permission_classes([AllowAny])
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
@permission_classes([AllowAny])
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

        _log_audit(req, data.get('actor_user_id'), data.get('actor_user_name', ''),
                   data.get('actor_user_role', ''), 'Purchase Order Generated',
                   f"{po_number} generated for {req.req_number}.")

    return Response(PurchaseOrderSerializer(po).data, status=201)


# ─── Notifications ────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def notification_list(request):
    if request.method == 'GET':
        recipient_id = request.query_params.get('recipient_id')
        qs = AppNotification.objects.select_related('recipient', 'requisition').all()
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
@permission_classes([AllowAny])
def notification_mark_read(request, pk):
    try:
        notif = AppNotification.objects.get(pk=pk)
    except AppNotification.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)
    notif.read = True
    notif.save(update_fields=['read'])
    return Response(AppNotificationSerializer(notif).data)


@api_view(['POST'])
@permission_classes([AllowAny])
def notification_mark_all_read(request):
    recipient_id = request.data.get('recipient_id')
    if not recipient_id:
        return Response({'error': 'recipient_id required.'}, status=400)
    AppNotification.objects.filter(recipient_id=recipient_id, read=False).update(read=True)
    return Response({'status': 'ok'})


# ─── Delegations ──────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
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
@permission_classes([AllowAny])
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
    return qs


def _log_audit(requisition, user_id, user_name, user_role, action, details):
    user = None
    if user_id:
        try:
            user = User.objects.get(pk=user_id)
        except (User.DoesNotExist, ValueError):
            pass
    AuditEntry.objects.create(
        action=action,
        user=user,
        user_id_str=str(user_id) if user_id else '',
        user_name=user_name,
        user_role=user_role,
        details=details,
        requisition=requisition,
    )


@api_view(['GET'])
@permission_classes([AllowAny])
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
@permission_classes([AllowAny])
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
@permission_classes([AllowAny])
def smtp_settings_get(request):
    return Response(get_smtp_config_public())


@api_view(['POST'])
@permission_classes([AllowAny])
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
@permission_classes([AllowAny])
def send_notification_email(request):
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
            host=config.get('host'), port=config.get('port', 587),
            username=config.get('username') or None,
            password=config.get('password') or None,
            use_tls=config.get('use_tls', True), fail_silently=False,
        )
        from django.core.mail import EmailMessage
        msg = EmailMessage(subject=subject, body=body, from_email=from_email, to=[to_email], connection=conn)
        msg.send()
        return Response({'sent': True})
    except Exception as e:
        return Response({'sent': False, 'error': str(e)}, status=500)
