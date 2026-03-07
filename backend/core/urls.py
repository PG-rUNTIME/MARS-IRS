from django.urls import path
from . import views
from . import db_admin

urlpatterns = [
    path('audit/', views.audit_list),
    path('audit/export/', views.audit_export_csv),
    path('database/health/', db_admin.database_health),
    path('database/backups/', db_admin.backup_list),
    path('database/backups/create/', db_admin.backup_create),
    path('database/backups/restore/', db_admin.backup_restore),
    path('settings/smtp/', views.smtp_settings_get),
    path('settings/smtp/save/', views.smtp_settings_save),
    path('notifications/send-email/', views.send_notification_email),
]
