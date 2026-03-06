from django.db import models


class Requisition(models.Model):
    """Requisition reference for audit entries."""
    req_number = models.CharField(max_length=32, unique=True, db_index=True)
    currency = models.CharField(max_length=3, default='USD', db_index=True)  # USD or ZIG
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.req_number


class AuditEntry(models.Model):
    """Immutable audit log entry."""
    action = models.CharField(max_length=64, db_index=True)
    user_id = models.CharField(max_length=64, db_index=True)
    user_name = models.CharField(max_length=255)
    user_role = models.CharField(max_length=64, db_index=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    details = models.TextField()
    requisition = models.ForeignKey(
        Requisition,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_entries'
    )

    class Meta:
        ordering = ['-timestamp']
        verbose_name_plural = 'Audit entries'

    def __str__(self):
        return f"{self.action} by {self.user_name} @ {self.timestamp}"

    @property
    def requisition_number(self):
        return self.requisition.req_number if self.requisition else None
