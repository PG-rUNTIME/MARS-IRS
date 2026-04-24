from django.db import models
import secrets


class User(models.Model):
    ROLE_CHOICES = [
        ('Requester', 'Requester'),
        ('Department Manager', 'Department Manager'),
        ('Accountant', 'Accountant'),
        ('General Manager', 'General Manager'),
        ('Financial Controller', 'Financial Controller'),
        ('Head of Operations', 'Head of Operations'),
        ('Procurement Clerk', 'Procurement Clerk'),
        ('System Administrator', 'System Administrator'),
        ('Auditor', 'Auditor'),
    ]

    name = models.CharField(max_length=255)
    email = models.EmailField(unique=True, db_index=True)
    password = models.CharField(max_length=255)  # plain text for demo; hash in production
    department = models.CharField(max_length=255, default='')
    active = models.BooleanField(default=True, db_index=True)
    joined_date = models.DateField(null=True, blank=True)
    phone = models.CharField(max_length=64, blank=True, default='')
    avatar = models.TextField(blank=True, default='')
    must_change_password = models.BooleanField(default=False)
    password_changed_at = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} <{self.email}>"

    @property
    def is_authenticated(self) -> bool:
        """
        DRF's IsAuthenticated permission checks this attribute.
        Since we use a custom user model (not django.contrib.auth.User),
        we provide the same interface.
        """
        return True

    @property
    def is_anonymous(self) -> bool:
        return False


class UserRole(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='roles')
    role = models.CharField(max_length=64, db_index=True)

    class Meta:
        unique_together = ('user', 'role')

    def __str__(self):
        return f"{self.user.name} – {self.role}"


class Requisition(models.Model):
    TYPE_CHOICES = [
        ('Petty Cash', 'Petty Cash'),
        ('Supplier Payment (Normal)', 'Supplier Payment (Normal)'),
        ('High-Value/CAPEX', 'High-Value/CAPEX'),
    ]
    STATUS_CHOICES = [
        ('Draft', 'Draft'),
        ('Submitted', 'Submitted'),
        ('Pending Review', 'Pending Review'),
        ('Pending Approval', 'Pending Approval'),
        ('Approved', 'Approved'),
        ('Pending Payment', 'Pending Payment'),
        ('Paid', 'Paid'),
        ('Rejected', 'Rejected'),
        ('Cancelled', 'Cancelled'),
    ]
    URGENCY_CHOICES = [
        ('Low', 'Low'), ('Medium', 'Medium'), ('High', 'High'), ('Critical', 'Critical'),
    ]

    req_number = models.CharField(max_length=32, unique=True, db_index=True)
    type = models.CharField(max_length=32, choices=TYPE_CHOICES, db_index=True)
    description = models.TextField(default='')
    justification = models.TextField(default='')
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default='USD', db_index=True)
    department = models.CharField(max_length=255, default='', db_index=True)
    cost_center = models.CharField(max_length=255, default='')
    base = models.CharField(max_length=64, default='Harare', db_index=True)
    budget_available = models.BooleanField(default=True)
    requester = models.ForeignKey(User, on_delete=models.PROTECT, related_name='requisitions')
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default='Draft', db_index=True)
    current_approver_role = models.CharField(max_length=64, blank=True, null=True)
    is_capex = models.BooleanField(default=False)
    po_generated = models.BooleanField(default=False)
    po_number = models.CharField(max_length=32, blank=True, default='')
    supplier = models.CharField(max_length=255, blank=True, default='')
    supplier_email = models.EmailField(blank=True, default='')
    supplier_phone = models.CharField(max_length=64, blank=True, default='')
    supplier_address = models.TextField(blank=True, default='')
    supplier_contact = models.CharField(max_length=255, blank=True, default='')
    supplier_bank_name = models.CharField(max_length=255, blank=True, default='')
    supplier_bank_account_name = models.CharField(max_length=255, blank=True, default='')
    supplier_bank_account_number = models.CharField(max_length=128, blank=True, default='')
    supplier_bank_branch = models.CharField(max_length=255, blank=True, default='')
    suppliers_json = models.JSONField(null=True, blank=True, default=None)
    preferred_supplier_index = models.PositiveSmallIntegerField(null=True, blank=True)
    preferred_supplier_justification = models.TextField(blank=True, default='')
    vehicle_reg = models.CharField(max_length=64, blank=True, default='')
    fuel_type = models.CharField(max_length=64, blank=True, default='')
    fuel_quantity = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    travel_destination = models.CharField(max_length=255, blank=True, default='')
    travel_start_date = models.DateField(null=True, blank=True)
    travel_end_date = models.DateField(null=True, blank=True)
    asset_type = models.CharField(max_length=255, blank=True, default='')
    asset_specs = models.TextField(blank=True, default='')
    maintenance_item = models.CharField(max_length=255, blank=True, default='')
    maintenance_urgency = models.CharField(max_length=16, choices=URGENCY_CHOICES, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    # Optional link: RFQ that was converted into this requisition.
    rfq = models.ForeignKey('RFQ', on_delete=models.SET_NULL, null=True, blank=True, related_name='converted_requisitions')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.req_number


class RFQ(models.Model):
    RFQ_TYPE_CHOICES = [
        ('Petty Cash', 'Petty Cash'),
        ('Supplier Payment (Normal)', 'Supplier Payment (Normal)'),
        ('High-Value/CAPEX', 'High-Value/CAPEX'),
    ]

    STATUS_CHOICES = [
        ('Draft', 'Draft'),
        ('Pending Procurement', 'Pending Procurement'),
        ('Pending Requester Selection', 'Pending Requester Selection'),
        ('Converted', 'Converted'),
        ('Cancelled', 'Cancelled'),
    ]

    rfq_number = models.CharField(max_length=32, unique=True, db_index=True)
    type = models.CharField(max_length=32, choices=RFQ_TYPE_CHOICES, db_index=True)
    requester = models.ForeignKey(User, on_delete=models.PROTECT, related_name='rfqs')
    department = models.CharField(max_length=255, default='', db_index=True)
    cost_center = models.CharField(max_length=255, default='')
    base = models.CharField(max_length=64, default='Harare', db_index=True)
    budget_available = models.BooleanField(default=True)
    currency = models.CharField(max_length=3, default='USD', db_index=True)
    description = models.TextField(default='')
    justification = models.TextField(default='')
    amount_estimated = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=64, choices=STATUS_CHOICES, default='Draft', db_index=True)
    selected_quote = models.ForeignKey('RFQQuote', on_delete=models.SET_NULL, null=True, blank=True, related_name='selected_for_rfq')
    selected_supplier_justification = models.TextField(blank=True, default='')
    submitted_at = models.DateTimeField(null=True, blank=True)
    procurement_completed_at = models.DateTimeField(null=True, blank=True)
    converted_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.rfq_number


class RFQItem(models.Model):
    rfq = models.ForeignKey(RFQ, on_delete=models.CASCADE, related_name='items')
    order = models.PositiveSmallIntegerField(default=0)
    description = models.CharField(max_length=255, default='')
    quantity = models.IntegerField(default=1)
    unit = models.CharField(max_length=64, default='Unit')

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f"{self.rfq.rfq_number} - item {self.order}"


class RFQQuote(models.Model):
    rfq = models.ForeignKey(RFQ, on_delete=models.CASCADE, related_name='quotes')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='rfq_quotes_created')
    supplier = models.ForeignKey('Supplier', on_delete=models.SET_NULL, null=True, blank=True, related_name='rfq_quotes')

    supplier_name = models.CharField(max_length=255, default='')
    supplier_email = models.EmailField(blank=True, default='')
    supplier_phone = models.CharField(max_length=64, blank=True, default='')
    supplier_address = models.TextField(blank=True, default='')
    supplier_contact = models.CharField(max_length=255, blank=True, default='')

    supplier_bank_name = models.CharField(max_length=255, blank=True, default='')
    supplier_bank_account_name = models.CharField(max_length=255, blank=True, default='')
    supplier_bank_account_number = models.CharField(max_length=128, blank=True, default='')
    supplier_bank_branch = models.CharField(max_length=255, blank=True, default='')

    quote_currency = models.CharField(max_length=3, default='USD', db_index=True)
    quote_total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    quote_notes = models.TextField(blank=True, default='')
    quote_valid_until = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Quote {self.id} for {self.rfq.rfq_number}"


class RFQQuoteItem(models.Model):
    quote = models.ForeignKey(RFQQuote, on_delete=models.CASCADE, related_name='items')
    rfq_item = models.ForeignKey(RFQItem, on_delete=models.CASCADE, related_name='quoted_as')

    description = models.CharField(max_length=255, default='')
    quantity = models.IntegerField(default=1)
    unit = models.CharField(max_length=64, default='Unit')
    unit_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        ordering = ['quote_id', 'rfq_item_id']

    def __str__(self):
        return f"Quote item {self.quote_id}/{self.rfq_item_id}"


class RFQQuoteAttachment(models.Model):
    quote = models.ForeignKey(RFQQuote, on_delete=models.CASCADE, related_name='attachments')

    name = models.CharField(max_length=255)
    type = models.CharField(max_length=128, blank=True, default='')
    size = models.CharField(max_length=32, blank=True, default='')
    uploaded_by = models.CharField(max_length=255, blank=True, default='')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    data_url = models.TextField(blank=True, default='')
    file_path = models.CharField(max_length=512, blank=True, default='')

    is_quote_document = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} ({self.quote_id})"


class Supplier(models.Model):
    CATEGORY_CHOICES = [
        ('Medical', 'Medical'),
        ('Fuel', 'Fuel'),
        ('ICT', 'ICT'),
        ('Logistics', 'Logistics'),
        ('Maintenance', 'Maintenance'),
        ('Professional Services', 'Professional Services'),
        ('Other', 'Other'),
    ]

    name = models.CharField(max_length=255, db_index=True)
    category = models.CharField(max_length=64, choices=CATEGORY_CHOICES, default='Other', db_index=True)
    physical_address = models.TextField(default='')
    contact_email = models.EmailField(default='')
    contact_person = models.CharField(max_length=255, default='')
    active = models.BooleanField(default=True, db_index=True)
    suspended = models.BooleanField(default=False, db_index=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='suppliers_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name', 'id']

    def __str__(self):
        return self.name


class DepartmentBudget(models.Model):
    year = models.PositiveIntegerField(db_index=True)
    department = models.CharField(max_length=255, db_index=True)
    usd_budget = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    zig_budget = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    configured_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='department_budgets_configured')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('year', 'department')
        ordering = ['-year', 'department']

    def __str__(self):
        return f"{self.department} budget {self.year}"


class RFQEvent(models.Model):
    rfq = models.ForeignKey('RFQ', on_delete=models.CASCADE, related_name='events')
    order = models.PositiveSmallIntegerField(default=0)
    status = models.CharField(max_length=64, default='')
    label = models.CharField(max_length=255, default='')
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='rfq_events')
    actor_name = models.CharField(max_length=255, blank=True, default='')
    actor_role = models.CharField(max_length=64, blank=True, default='')
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['order', 'timestamp', 'id']

    def __str__(self):
        return f"{self.rfq.rfq_number} – {self.label}"


class ApprovalStep(models.Model):
    STATUS_CHOICES = [
        ('Pending', 'Pending'), ('Approved', 'Approved'), ('Rejected', 'Rejected'),
        ('Delegated', 'Delegated'), ('Skipped', 'Skipped'),
    ]

    requisition = models.ForeignKey(Requisition, on_delete=models.CASCADE, related_name='approval_chain')
    order = models.PositiveSmallIntegerField(default=0)
    role = models.CharField(max_length=64)
    label = models.CharField(max_length=128)
    approver = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approval_steps')
    approver_name = models.CharField(max_length=255, blank=True, default='')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='Pending')
    timestamp = models.DateTimeField(null=True, blank=True)
    comments = models.TextField(blank=True, default='')
    delegated_to = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='delegated_steps')
    delegated_to_name = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.requisition.req_number} – {self.role} ({self.status})"


class ReqComment(models.Model):
    requisition = models.ForeignKey(Requisition, on_delete=models.CASCADE, related_name='comments')
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name='comments')
    user_name = models.CharField(max_length=255)
    user_role = models.CharField(max_length=64)
    text = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    is_finance_note = models.BooleanField(default=False)

    class Meta:
        ordering = ['timestamp']

    def __str__(self):
        return f"Comment by {self.user_name} on {self.requisition.req_number}"


class Attachment(models.Model):
    requisition = models.ForeignKey(Requisition, on_delete=models.CASCADE, related_name='attachments')
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=128)
    size = models.CharField(max_length=32)
    uploaded_by = models.CharField(max_length=255)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    data_url = models.TextField(blank=True, default='')
    file_path = models.CharField(max_length=512, blank=True, default='')
    is_proof_of_payment = models.BooleanField(default=False)

    class Meta:
        ordering = ['uploaded_at']

    def __str__(self):
        return f"{self.name} ({self.requisition.req_number})"


class ApiToken(models.Model):
    """
    Simple API token for the custom `core.User` (not Django's auth user).
    Used for server-side authentication/authorization of API requests.
    """
    key = models.CharField(max_length=64, unique=True, db_index=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='api_tokens')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    last_used_at = models.DateTimeField(null=True, blank=True, db_index=True)

    @staticmethod
    def generate_key() -> str:
        # 32 bytes => 64 hex chars
        return secrets.token_hex(32)

    def __str__(self):
        return f"token:{self.key[:6]}… for {self.user.email}"


class POItem(models.Model):
    requisition = models.ForeignKey(Requisition, on_delete=models.CASCADE, related_name='items', null=True, blank=True)
    purchase_order = models.ForeignKey('PurchaseOrder', on_delete=models.CASCADE, related_name='items', null=True, blank=True)
    description = models.TextField()
    quantity = models.IntegerField(default=1)
    unit = models.CharField(max_length=64, default='Unit')
    unit_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    def __str__(self):
        return self.description[:60]


class PurchaseOrder(models.Model):
    STATUS_CHOICES = [
        ('Open', 'Open'), ('Closed', 'Closed'), ('Cancelled', 'Cancelled'),
    ]

    po_number = models.CharField(max_length=32, unique=True, db_index=True)
    date = models.DateField()
    version = models.PositiveSmallIntegerField(default=1)
    requisition = models.OneToOneField(Requisition, on_delete=models.PROTECT, related_name='purchase_order')
    buyer_company = models.CharField(max_length=255, default='')
    buyer_address = models.TextField(default='')
    buyer_department = models.CharField(max_length=255, default='')
    buyer_contact = models.CharField(max_length=255, default='')
    supplier_name = models.CharField(max_length=255, default='')
    supplier_address = models.TextField(default='')
    supplier_contact = models.CharField(max_length=255, default='')
    supplier_email = models.EmailField(blank=True, default='')
    supplier_phone = models.CharField(max_length=64, blank=True, default='')
    currency = models.CharField(max_length=3, default='USD')
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    requester_name = models.CharField(max_length=255, default='')
    approver_names = models.JSONField(default=list)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='Open')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.po_number


class AppNotification(models.Model):
    TYPE_CHOICES = [
        ('submission', 'Submission'), ('approval', 'Approval'), ('rejection', 'Rejection'),
        ('payment', 'Payment'), ('info', 'Info'),
    ]

    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    title = models.CharField(max_length=255)
    message = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    read = models.BooleanField(default=False, db_index=True)
    requisition = models.ForeignKey(Requisition, on_delete=models.SET_NULL, null=True, blank=True, related_name='notifications')
    rfq = models.ForeignKey('RFQ', on_delete=models.SET_NULL, null=True, blank=True, related_name='notifications')
    type = models.CharField(max_length=16, choices=TYPE_CHOICES, default='info')

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.title} → {self.recipient.name}"


class DelegationRecord(models.Model):
    from_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='delegations_from')
    from_user_name = models.CharField(max_length=255)
    to_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='delegations_to')
    to_user_name = models.CharField(max_length=255)
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.from_user_name} → {self.to_user_name} ({self.start_date} to {self.end_date})"


class AuditEntry(models.Model):
    """Immutable audit log entry."""
    action = models.CharField(max_length=64, db_index=True)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_entries')
    user_id_str = models.CharField(max_length=64, db_index=True, default='')  # preserve even if user deleted
    user_name = models.CharField(max_length=255)
    user_role = models.CharField(max_length=64, db_index=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    details = models.TextField()
    requisition = models.ForeignKey(Requisition, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_entries')

    class Meta:
        ordering = ['-timestamp']
        verbose_name_plural = 'Audit entries'

    def __str__(self):
        return f"{self.action} by {self.user_name} @ {self.timestamp}"
