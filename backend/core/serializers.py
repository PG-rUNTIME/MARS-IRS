import bcrypt
from rest_framework import serializers
from .bases import resolve_base
from .departments import (
    DEPARTMENT_COST_CENTRE,
    ORGANIZATION_DEPARTMENTS_SET,
    resolve_department,
)
from .models import (
    User, UserRole, Requisition, ApprovalStep, ReqComment,
    Attachment, POItem, PurchaseOrder, AppNotification,
    DelegationRecord, AuditEntry,
    RFQ, RFQItem, RFQQuote, RFQQuoteItem, RFQQuoteAttachment, RFQEvent, Supplier, DepartmentBudget,
)


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def check_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


class UserRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserRole
        fields = ['id', 'role']


class UserSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    joined_date = serializers.DateField(required=False, allow_null=True)
    password_changed_at = serializers.DateField(required=False, allow_null=True)
    # Accept plain-text password on write; never return it on read
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'id', 'name', 'email', 'password', 'department', 'active',
            'joined_date', 'phone', 'avatar', 'must_change_password',
            'password_changed_at', 'roles', 'created_at', 'updated_at',
        ]

    def get_roles(self, obj):
        return list(obj.roles.values_list('role', flat=True))

    def create(self, validated_data):
        roles = self.initial_data.get('roles', [])
        plain = validated_data.pop('password', None)
        if plain:
            validated_data['password'] = hash_password(plain)
        user = User.objects.create(**validated_data)
        for r in roles:
            UserRole.objects.get_or_create(user=user, role=r)
        return user

    def update(self, instance, validated_data):
        roles = self.initial_data.get('roles', None)
        plain = validated_data.pop('password', None)
        if plain:
            validated_data['password'] = hash_password(plain)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if roles is not None:
            instance.roles.all().delete()
            for r in roles:
                UserRole.objects.get_or_create(user=instance, role=r)
        return instance

    def validate_department(self, value):
        v = (value or '').strip()
        if not v:
            raise serializers.ValidationError('Department is required.')
        if v not in ORGANIZATION_DEPARTMENTS_SET:
            raise serializers.ValidationError(
                'Invalid department. Choose one of the configured organisation departments.'
            )
        return v

    def validate(self, attrs):
        if self.instance is None and not (attrs.get('department') or '').strip():
            raise serializers.ValidationError({'department': 'Department is required.'})
        return attrs


class ApprovalStepSerializer(serializers.ModelSerializer):
    approver_id = serializers.PrimaryKeyRelatedField(
        source='approver', queryset=User.objects.all(), allow_null=True, required=False
    )
    delegated_to_id = serializers.PrimaryKeyRelatedField(
        source='delegated_to', queryset=User.objects.all(), allow_null=True, required=False
    )

    class Meta:
        model = ApprovalStep
        fields = [
            'id', 'order', 'role', 'label', 'approver_id', 'approver_name',
            'status', 'timestamp', 'comments', 'delegated_to_id', 'delegated_to_name',
        ]


class ReqCommentSerializer(serializers.ModelSerializer):
    user_id = serializers.PrimaryKeyRelatedField(source='user', queryset=User.objects.all())

    class Meta:
        model = ReqComment
        fields = ['id', 'user_id', 'user_name', 'user_role', 'text', 'timestamp', 'is_finance_note']
        read_only_fields = ['timestamp']


class AttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attachment
        fields = ['id', 'name', 'type', 'size', 'uploaded_by', 'uploaded_at', 'data_url', 'is_proof_of_payment']
        read_only_fields = ['uploaded_at']


class POItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = POItem
        fields = ['id', 'description', 'quantity', 'unit', 'unit_price', 'line_total']


class RequisitionListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views – no nested attachments/comments/items."""
    requester_id = serializers.PrimaryKeyRelatedField(source='requester', read_only=True)
    requester_name = serializers.CharField(source='requester.name', read_only=True)
    requester_email = serializers.CharField(source='requester.email', read_only=True)
    current_approver_role = serializers.CharField(allow_null=True, required=False)
    approval_chain = ApprovalStepSerializer(many=True, read_only=True)
    rfq_id = serializers.PrimaryKeyRelatedField(source='rfq', read_only=True)

    class Meta:
        model = Requisition
        fields = [
            'id', 'req_number', 'type', 'description', 'justification',
            'amount', 'currency', 'department', 'cost_center', 'base', 'budget_available',
            'requester_id', 'requester_name', 'requester_email',
            'status', 'current_approver_role', 'is_capex', 'po_generated', 'po_number',
            'supplier', 'supplier_email', 'supplier_phone', 'supplier_address', 'supplier_contact',
            'supplier_bank_name', 'supplier_bank_account_name', 'supplier_bank_account_number', 'supplier_bank_branch',
            'suppliers_json', 'preferred_supplier_index', 'preferred_supplier_justification',
            'vehicle_reg', 'fuel_type', 'fuel_quantity',
            'travel_destination', 'travel_start_date', 'travel_end_date',
            'asset_type', 'asset_specs', 'maintenance_item', 'maintenance_urgency',
            'created_at', 'updated_at', 'submitted_at', 'paid_at',
            'approval_chain',
            'rfq_id',
        ]


class RequisitionDetailSerializer(RequisitionListSerializer):
    """Full serializer with nested relations."""
    approval_chain = ApprovalStepSerializer(many=True, read_only=True)
    comments = ReqCommentSerializer(many=True, read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)
    items = POItemSerializer(many=True, read_only=True)
    proof_of_payment = serializers.SerializerMethodField()
    audit_log = serializers.SerializerMethodField()

    class Meta(RequisitionListSerializer.Meta):
        fields = RequisitionListSerializer.Meta.fields + [
            'approval_chain', 'comments', 'attachments', 'items',
            'proof_of_payment', 'audit_log',
        ]

    def get_proof_of_payment(self, obj):
        pop = obj.attachments.filter(is_proof_of_payment=True).first()
        return AttachmentSerializer(pop).data if pop else None

    def get_audit_log(self, obj):
        entries = obj.audit_entries.all()
        return AuditEntrySerializer(entries, many=True).data


class RequisitionWriteSerializer(serializers.ModelSerializer):
    requester_id = serializers.PrimaryKeyRelatedField(
        source='requester', queryset=User.objects.all()
    )
    rfq_id = serializers.PrimaryKeyRelatedField(
        source='rfq', queryset=RFQ.objects.all(), allow_null=True, required=False
    )
    # Override EmailField → CharField so blank/null passes without email format validation
    supplier_email = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = Requisition
        fields = [
            'req_number', 'type', 'description', 'justification',
            'amount', 'currency', 'department', 'cost_center', 'base', 'budget_available',
            'requester_id', 'status', 'current_approver_role', 'is_capex',
            'po_generated', 'po_number',
            'rfq_id',
            'supplier', 'supplier_email', 'supplier_phone', 'supplier_address', 'supplier_contact',
            'supplier_bank_name', 'supplier_bank_account_name', 'supplier_bank_account_number', 'supplier_bank_branch',
            'suppliers_json', 'preferred_supplier_index', 'preferred_supplier_justification',
            'vehicle_reg', 'fuel_type', 'fuel_quantity',
            'travel_destination', 'travel_start_date', 'travel_end_date',
            'asset_type', 'asset_specs', 'maintenance_item', 'maintenance_urgency',
        ]
        extra_kwargs = {
            'supplier': {'required': False, 'allow_blank': True, 'allow_null': True},
            'supplier_email': {'required': False, 'allow_blank': True, 'allow_null': True},
            'supplier_phone': {'required': False, 'allow_blank': True, 'allow_null': True},
            'supplier_address': {'required': False, 'allow_blank': True, 'allow_null': True},
            'supplier_contact': {'required': False, 'allow_blank': True, 'allow_null': True},
            'supplier_bank_name': {'required': False, 'allow_blank': True, 'allow_null': True},
            'supplier_bank_account_name': {'required': False, 'allow_blank': True, 'allow_null': True},
            'supplier_bank_account_number': {'required': False, 'allow_blank': True, 'allow_null': True},
            'supplier_bank_branch': {'required': False, 'allow_blank': True, 'allow_null': True},
            'vehicle_reg': {'required': False, 'allow_blank': True, 'allow_null': True},
            'fuel_type': {'required': False, 'allow_blank': True, 'allow_null': True},
            'travel_destination': {'required': False, 'allow_blank': True, 'allow_null': True},
            'asset_type': {'required': False, 'allow_blank': True, 'allow_null': True},
            'asset_specs': {'required': False, 'allow_blank': True, 'allow_null': True},
            'maintenance_item': {'required': False, 'allow_blank': True, 'allow_null': True},
            'maintenance_urgency': {'required': False, 'allow_blank': True, 'allow_null': True},
            'po_number': {'required': False, 'allow_blank': True, 'allow_null': True},
            'current_approver_role': {'required': False, 'allow_blank': True, 'allow_null': True},
            'preferred_supplier_justification': {'required': False, 'allow_blank': True, 'allow_null': True},
        }

    # Coerce null → '' for all optional text fields so DB constraints aren't violated
    _nullable_text_fields = [
        'supplier', 'supplier_email', 'supplier_phone', 'supplier_address', 'supplier_contact',
        'supplier_bank_name', 'supplier_bank_account_name', 'supplier_bank_account_number', 'supplier_bank_branch',
        'vehicle_reg', 'fuel_type', 'travel_destination', 'asset_type', 'asset_specs',
        'maintenance_item', 'maintenance_urgency', 'po_number', 'current_approver_role',
        'preferred_supplier_justification',
    ]

    def validate(self, attrs):
        for field in self._nullable_text_fields:
            if field in attrs and attrs[field] is None:
                attrs[field] = ''

        inst = self.instance
        dept_raw = attrs.get('department', None)
        if dept_raw is None:
            dept_raw = getattr(inst, 'department', '') if inst else ''
        else:
            dept_raw = (dept_raw or '').strip()
        resolved = resolve_department(dept_raw)
        if not resolved:
            raise serializers.ValidationError(
                {'department': 'Department is required and must be a valid organisation department.'}
            )
        attrs['department'] = resolved
        attrs['cost_center'] = DEPARTMENT_COST_CENTRE[resolved]

        base_raw = attrs.get('base', None)
        if base_raw is None:
            base_raw = getattr(inst, 'base', '') if inst else ''
        else:
            base_raw = (base_raw or '').strip() if isinstance(base_raw, str) else str(base_raw or '')
        attrs['base'] = resolve_base(base_raw)
        return attrs


class PurchaseOrderSerializer(serializers.ModelSerializer):
    requisition_id = serializers.PrimaryKeyRelatedField(source='requisition', read_only=True)
    req_number = serializers.CharField(source='requisition.req_number', read_only=True)
    items = POItemSerializer(many=True, read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'po_number', 'date', 'version', 'requisition_id', 'req_number',
            'buyer_company', 'buyer_address', 'buyer_department', 'buyer_contact',
            'supplier_name', 'supplier_address', 'supplier_contact', 'supplier_email', 'supplier_phone',
            'items', 'currency', 'subtotal', 'total', 'requester_name', 'approver_names',
            'status', 'created_at',
        ]


class AppNotificationSerializer(serializers.ModelSerializer):
    recipient_id = serializers.PrimaryKeyRelatedField(source='recipient', read_only=True)
    requisition_id = serializers.PrimaryKeyRelatedField(source='requisition', read_only=True, allow_null=True)
    rfq_id = serializers.PrimaryKeyRelatedField(source='rfq', read_only=True, allow_null=True)

    class Meta:
        model = AppNotification
        fields = ['id', 'recipient_id', 'title', 'message', 'timestamp', 'read', 'requisition_id', 'rfq_id', 'type']


class DelegationRecordSerializer(serializers.ModelSerializer):
    from_user_id = serializers.PrimaryKeyRelatedField(source='from_user', queryset=User.objects.all())
    to_user_id = serializers.PrimaryKeyRelatedField(source='to_user', queryset=User.objects.all())

    class Meta:
        model = DelegationRecord
        fields = [
            'id', 'from_user_id', 'from_user_name', 'to_user_id', 'to_user_name',
            'start_date', 'end_date', 'reason', 'created_at', 'active',
        ]
        read_only_fields = ['created_at']


class AuditEntrySerializer(serializers.ModelSerializer):
    requisition_number = serializers.SerializerMethodField()
    requisition_id = serializers.SerializerMethodField()
    requisition_currency = serializers.SerializerMethodField()

    class Meta:
        model = AuditEntry
        fields = [
            'id', 'action', 'user_id_str', 'user_name', 'user_role',
            'timestamp', 'details', 'requisition_id', 'requisition_number', 'requisition_currency',
        ]
        read_only_fields = fields

    def get_requisition_number(self, obj):
        return obj.requisition.req_number if obj.requisition else None

    def get_requisition_id(self, obj):
        return str(obj.requisition_id) if obj.requisition_id is not None else None

    def get_requisition_currency(self, obj):
        return obj.requisition.currency if obj.requisition else None


# ─── RFQ (Request for Quotation) ──────────────────────────────────────────────

class RFQItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = RFQItem
        fields = ['id', 'order', 'description', 'quantity', 'unit']


class RFQQuoteItemSerializer(serializers.ModelSerializer):
    rfq_item_id = serializers.PrimaryKeyRelatedField(source='rfq_item', read_only=True)

    class Meta:
        model = RFQQuoteItem
        fields = ['id', 'rfq_item_id', 'description', 'quantity', 'unit', 'unit_price', 'line_total']


class RFQQuoteAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = RFQQuoteAttachment
        fields = ['id', 'name', 'type', 'size', 'uploaded_by', 'uploaded_at', 'data_url', 'file_path', 'is_quote_document']


class RFQQuoteSerializer(serializers.ModelSerializer):
    items = RFQQuoteItemSerializer(many=True, read_only=True)
    attachments = RFQQuoteAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = RFQQuote
        fields = [
            'id',
            'rfq',
            'created_by',
            'supplier',
            'supplier_name',
            'supplier_email',
            'supplier_phone',
            'supplier_address',
            'supplier_contact',
            'supplier_bank_name',
            'supplier_bank_account_name',
            'supplier_bank_account_number',
            'supplier_bank_branch',
            'quote_currency',
            'quote_total_amount',
            'quote_notes',
            'quote_valid_until',
            'created_at',
            'updated_at',
            'items',
            'attachments',
        ]


class SupplierSerializer(serializers.ModelSerializer):
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Supplier
        fields = [
            'id', 'name', 'category', 'physical_address', 'contact_email', 'contact_person',
            'active', 'suspended', 'created_by', 'created_at', 'updated_at',
        ]
        extra_kwargs = {
            'name': {'required': True, 'allow_blank': False},
            'category': {'required': False, 'allow_blank': True},
            'physical_address': {'required': False, 'allow_blank': True},
            'contact_email': {'required': False, 'allow_blank': True},
            'contact_person': {'required': False, 'allow_blank': True},
        }


class DepartmentBudgetSerializer(serializers.ModelSerializer):
    configured_by = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = DepartmentBudget
        fields = [
            'id', 'year', 'department', 'usd_budget', 'zig_budget',
            'configured_by', 'created_at', 'updated_at',
        ]

    def validate_department(self, value):
        v = (value or '').strip()
        if not v:
            raise serializers.ValidationError('Department is required.')
        if v not in ORGANIZATION_DEPARTMENTS_SET:
            raise serializers.ValidationError(
                'Invalid department. Use one of the configured organisation departments.'
            )
        return v


class RFQSerializer(serializers.ModelSerializer):
    requester_id = serializers.PrimaryKeyRelatedField(source='requester', read_only=True)
    requester_name = serializers.CharField(source='requester.name', read_only=True)
    requester_email = serializers.EmailField(source='requester.email', read_only=True)
    items = RFQItemSerializer(many=True, read_only=True)
    quotes = RFQQuoteSerializer(many=True, read_only=True)
    selected_quote_id = serializers.PrimaryKeyRelatedField(source='selected_quote', read_only=True)
    selected_supplier_name = serializers.SerializerMethodField()
    events = serializers.SerializerMethodField()
    converted_requisition_number = serializers.SerializerMethodField()

    class Meta:
        model = RFQ
        fields = [
            'id',
            'rfq_number',
            'type',
            'requester_id',
            'requester_name',
            'requester_email',
            'department',
            'cost_center',
            'base',
            'budget_available',
            'currency',
            'description',
            'justification',
            'amount_estimated',
            'status',
            'selected_quote_id',
            'selected_supplier_name',
            'selected_supplier_justification',
            'submitted_at',
            'procurement_completed_at',
            'converted_at',
            'items',
            'quotes',
            'events',
            'converted_requisition_number',
        ]

    def get_events(self, obj):
        events_qs = obj.events.all().order_by('order', 'timestamp', 'id')
        return [
            {
                'id': str(e.id),
                'order': e.order,
                'status': e.status,
                'label': e.label,
                'actor_id': str(e.actor_id) if e.actor_id is not None else None,
                'actor_name': e.actor_name or '',
                'actor_role': e.actor_role or '',
                'timestamp': e.timestamp,
            }
            for e in events_qs
        ]

    def get_converted_requisition_number(self, obj):
        first = obj.converted_requisitions.all().order_by('-id').first() if hasattr(obj, 'converted_requisitions') else None
        return first.req_number if first else None

    def get_selected_supplier_name(self, obj):
        return obj.selected_quote.supplier_name if obj.selected_quote_id else None
