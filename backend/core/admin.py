from django.contrib import admin
from .models import Requisition, AuditEntry


@admin.register(Requisition)
class RequisitionAdmin(admin.ModelAdmin):
    list_display = ('req_number', 'created_at')
    search_fields = ('req_number',)


@admin.register(AuditEntry)
class AuditEntryAdmin(admin.ModelAdmin):
    list_display = ('action', 'user_name', 'user_role', 'timestamp', 'requisition')
    list_filter = ('action', 'user_role')
    search_fields = ('user_name', 'details')
    readonly_fields = ('action', 'user_id', 'user_name', 'user_role', 'timestamp', 'details', 'requisition')
    date_hierarchy = 'timestamp'
