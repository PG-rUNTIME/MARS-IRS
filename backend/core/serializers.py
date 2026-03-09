import bcrypt
from rest_framework import serializers
from .models import (
    User, UserRole, Requisition, ApprovalStep, ReqComment,
    Attachment, POItem, PurchaseOrder, AppNotification,
    DelegationRecord, AuditEntry,
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

    class Meta:
        model = Requisition
        fields = [
            'id', 'req_number', 'type', 'description', 'justification',
            'amount', 'currency', 'department', 'cost_center', 'budget_available',
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
    # Override EmailField → CharField so blank/null passes without email format validation
    supplier_email = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = Requisition
        fields = [
            'req_number', 'type', 'description', 'justification',
            'amount', 'currency', 'department', 'cost_center', 'budget_available',
            'requester_id', 'status', 'current_approver_role', 'is_capex',
            'po_generated', 'po_number',
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

    class Meta:
        model = AppNotification
        fields = ['id', 'recipient_id', 'title', 'message', 'timestamp', 'read', 'requisition_id', 'type']


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
