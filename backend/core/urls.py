from django.urls import path
from . import views
from . import db_admin

urlpatterns = [
    # Auth
    path('auth/login/', views.login),
    path('auth/verify-password/', views.verify_password),
    path('auth/logout/', views.logout),

    # Users
    path('users/', views.user_list),
    path('users/<int:pk>/', views.user_detail),
    path('users/<int:pk>/reset/', views.user_reset_account),

    # Requisitions
    path('requisitions/', views.requisition_list),
    path('requisitions/<int:pk>/', views.requisition_detail),
    path('requisitions/<int:req_pk>/comments/', views.add_comment),
    path('requisitions/<int:req_pk>/attachments/', views.add_attachment),
    path('attachments/<int:pk>/download/', views.attachment_download),
    path('requisitions/<int:req_pk>/generate-po/', views.generate_po),

    # RFQ (Request for Quotation)
    path('rfqs/', views.rfq_list),
    path('rfqs/<int:pk>/', views.rfq_detail),
    path('rfqs/<int:pk>/submit/', views.rfq_submit_to_procurement),
    path('rfqs/<int:pk>/quotes/', views.rfq_upload_quotes),
    path('rfqs/<int:pk>/quotes-complete/', views.rfq_complete_quotes),
    path('rfqs/<int:pk>/convert/', views.rfq_convert_to_requisition),
    path('suppliers/', views.supplier_list),
    path('suppliers/<int:pk>/', views.supplier_detail),
    path('suppliers/bulk/', views.supplier_bulk_create),
    path('budgets/', views.budget_list),
    path('budgets/stats/', views.budget_stats),

    # Purchase Orders
    path('purchase-orders/', views.purchase_order_list),
    path('purchase-orders/<int:pk>/', views.purchase_order_detail),

    # Notifications
    path('notifications/', views.notification_list),
    path('notifications/<int:pk>/read/', views.notification_mark_read),
    path('notifications/mark-all-read/', views.notification_mark_all_read),

    # Delegations
    path('delegations/', views.delegation_list),
    path('delegations/<int:pk>/', views.delegation_detail),

    # Audit
    path('audit/', views.audit_list),
    path('audit/requisitions/', views.audit_requisitions_list),
    path('audit/export/', views.audit_export_csv),

    # Database admin
    path('database/health/', db_admin.database_health),
    path('database/backups/', db_admin.backup_list),
    path('database/backups/create/', db_admin.backup_create),
    path('database/backups/restore/', db_admin.backup_restore),
    path('database/backups/upload-restore/', db_admin.backup_upload_restore),
    path('database/backups/<str:filename>/download/', db_admin.backup_download),

    # Settings
    path('settings/smtp/', views.smtp_settings_get),
    path('settings/smtp/save/', views.smtp_settings_save),
    path('notifications/send-email/', views.send_notification_email),
    path('notifications/send-requisition-email/', views.send_requisition_notification_email),
]
