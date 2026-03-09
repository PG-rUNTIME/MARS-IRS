from django.urls import path
from . import views
from . import db_admin

urlpatterns = [
    # Auth
    path('auth/login/', views.login),

    # Users
    path('users/', views.user_list),
    path('users/<int:pk>/', views.user_detail),

    # Requisitions
    path('requisitions/', views.requisition_list),
    path('requisitions/<int:pk>/', views.requisition_detail),
    path('requisitions/<int:req_pk>/comments/', views.add_comment),
    path('requisitions/<int:req_pk>/attachments/', views.add_attachment),
    path('requisitions/<int:req_pk>/generate-po/', views.generate_po),

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

    # Settings
    path('settings/smtp/', views.smtp_settings_get),
    path('settings/smtp/save/', views.smtp_settings_save),
    path('notifications/send-email/', views.send_notification_email),
]
