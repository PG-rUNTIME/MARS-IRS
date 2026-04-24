from django.contrib import admin
from .models import (
    User, UserRole, Requisition, ApprovalStep, ReqComment,
    Attachment, POItem, PurchaseOrder, AppNotification,
    DelegationRecord, AuditEntry,
)


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('name', 'email', 'department', 'active')
    search_fields = ('name', 'email')
    list_filter = ('active', 'department')


@admin.register(Requisition)
class RequisitionAdmin(admin.ModelAdmin):
    list_display = ('req_number', 'type', 'status', 'base', 'requester', 'amount', 'currency', 'created_at')
    list_filter = ('status', 'type', 'currency', 'base')
    search_fields = ('req_number', 'description')


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ('po_number', 'requisition', 'status', 'total', 'currency', 'created_at')
    search_fields = ('po_number',)


@admin.register(AuditEntry)
class AuditEntryAdmin(admin.ModelAdmin):
    list_display = ('action', 'user_name', 'user_role', 'timestamp', 'requisition')
    list_filter = ('action', 'user_role')
    search_fields = ('user_name', 'details')
    readonly_fields = ('action', 'user_id_str', 'user_name', 'user_role', 'timestamp', 'details', 'requisition')
    date_hierarchy = 'timestamp'


admin.site.register(UserRole)
admin.site.register(ApprovalStep)
admin.site.register(ReqComment)
admin.site.register(Attachment)
admin.site.register(POItem)
admin.site.register(AppNotification)
admin.site.register(DelegationRecord)
