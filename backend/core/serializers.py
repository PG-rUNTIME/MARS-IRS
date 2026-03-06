from rest_framework import serializers
from .models import AuditEntry, Requisition


class AuditEntrySerializer(serializers.ModelSerializer):
    requisition_number = serializers.ReadOnlyField()
    requisition_id = serializers.SerializerMethodField()
    requisition_currency = serializers.SerializerMethodField()

    class Meta:
        model = AuditEntry
        fields = [
            'id', 'action', 'user_id', 'user_name', 'user_role',
            'timestamp', 'details', 'requisition_id', 'requisition_number', 'requisition_currency',
        ]
        read_only_fields = fields

    def get_requisition_id(self, obj):
        return str(obj.requisition_id) if obj.requisition_id is not None else None

    def get_requisition_currency(self, obj):
        return obj.requisition.currency if obj.requisition else None
