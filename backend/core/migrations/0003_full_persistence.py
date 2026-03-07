"""
Migration: full persistence
Drops the old minimal schema and builds the full application schema.
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_requisition_currency'),
    ]

    operations = [
        # ── Drop old tables ───────────────────────────────────────────────────
        migrations.DeleteModel(name='AuditEntry'),
        migrations.DeleteModel(name='Requisition'),

        # ── User ──────────────────────────────────────────────────────────────
        migrations.CreateModel(
            name='User',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('email', models.EmailField(db_index=True, max_length=254, unique=True)),
                ('password', models.CharField(max_length=255)),
                ('department', models.CharField(default='', max_length=255)),
                ('active', models.BooleanField(db_index=True, default=True)),
                ('joined_date', models.DateField(blank=True, null=True)),
                ('phone', models.CharField(blank=True, default='', max_length=64)),
                ('avatar', models.TextField(blank=True, default='')),
                ('must_change_password', models.BooleanField(default=False)),
                ('password_changed_at', models.DateField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'ordering': ['name']},
        ),
        migrations.CreateModel(
            name='UserRole',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(db_index=True, max_length=64)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='roles', to='core.user')),
            ],
            options={'unique_together': {('user', 'role')}},
        ),

        # ── Requisition ───────────────────────────────────────────────────────
        migrations.CreateModel(
            name='Requisition',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('req_number', models.CharField(db_index=True, max_length=32, unique=True)),
                ('type', models.CharField(choices=[('Petty Cash', 'Petty Cash'), ('Supplier Payment (Normal)', 'Supplier Payment (Normal)'), ('High-Value/CAPEX', 'High-Value/CAPEX')], db_index=True, max_length=32)),
                ('description', models.TextField(default='')),
                ('justification', models.TextField(default='')),
                ('amount', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('currency', models.CharField(db_index=True, default='USD', max_length=3)),
                ('department', models.CharField(db_index=True, default='', max_length=255)),
                ('cost_center', models.CharField(default='', max_length=255)),
                ('budget_available', models.BooleanField(default=True)),
                ('status', models.CharField(choices=[('Draft', 'Draft'), ('Submitted', 'Submitted'), ('Pending Review', 'Pending Review'), ('Pending Approval', 'Pending Approval'), ('Approved', 'Approved'), ('Pending Payment', 'Pending Payment'), ('Paid', 'Paid'), ('Rejected', 'Rejected'), ('Cancelled', 'Cancelled')], db_index=True, default='Draft', max_length=32)),
                ('current_approver_role', models.CharField(blank=True, max_length=64, null=True)),
                ('is_capex', models.BooleanField(default=False)),
                ('po_generated', models.BooleanField(default=False)),
                ('po_number', models.CharField(blank=True, default='', max_length=32)),
                ('supplier', models.CharField(blank=True, default='', max_length=255)),
                ('supplier_email', models.EmailField(blank=True, default='')),
                ('supplier_phone', models.CharField(blank=True, default='', max_length=64)),
                ('supplier_address', models.TextField(blank=True, default='')),
                ('supplier_contact', models.CharField(blank=True, default='', max_length=255)),
                ('vehicle_reg', models.CharField(blank=True, default='', max_length=64)),
                ('fuel_type', models.CharField(blank=True, default='', max_length=64)),
                ('fuel_quantity', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('travel_destination', models.CharField(blank=True, default='', max_length=255)),
                ('travel_start_date', models.DateField(blank=True, null=True)),
                ('travel_end_date', models.DateField(blank=True, null=True)),
                ('asset_type', models.CharField(blank=True, default='', max_length=255)),
                ('asset_specs', models.TextField(blank=True, default='')),
                ('maintenance_item', models.CharField(blank=True, default='', max_length=255)),
                ('maintenance_urgency', models.CharField(blank=True, choices=[('Low', 'Low'), ('Medium', 'Medium'), ('High', 'High'), ('Critical', 'Critical')], default='', max_length=16)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('submitted_at', models.DateTimeField(blank=True, null=True)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('requester', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='requisitions', to='core.user')),
            ],
            options={'ordering': ['-created_at']},
        ),

        # ── ApprovalStep ──────────────────────────────────────────────────────
        migrations.CreateModel(
            name='ApprovalStep',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('order', models.PositiveSmallIntegerField(default=0)),
                ('role', models.CharField(max_length=64)),
                ('label', models.CharField(max_length=128)),
                ('approver_name', models.CharField(blank=True, default='', max_length=255)),
                ('status', models.CharField(choices=[('Pending', 'Pending'), ('Approved', 'Approved'), ('Rejected', 'Rejected'), ('Delegated', 'Delegated'), ('Skipped', 'Skipped')], default='Pending', max_length=16)),
                ('timestamp', models.DateTimeField(blank=True, null=True)),
                ('comments', models.TextField(blank=True, default='')),
                ('delegated_to_name', models.CharField(blank=True, default='', max_length=255)),
                ('requisition', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='approval_chain', to='core.requisition')),
                ('approver', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='approval_steps', to='core.user')),
                ('delegated_to', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='delegated_steps', to='core.user')),
            ],
            options={'ordering': ['order']},
        ),

        # ── ReqComment ────────────────────────────────────────────────────────
        migrations.CreateModel(
            name='ReqComment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('user_name', models.CharField(max_length=255)),
                ('user_role', models.CharField(max_length=64)),
                ('text', models.TextField()),
                ('timestamp', models.DateTimeField(auto_now_add=True)),
                ('is_finance_note', models.BooleanField(default=False)),
                ('requisition', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='comments', to='core.requisition')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='comments', to='core.user')),
            ],
            options={'ordering': ['timestamp']},
        ),

        # ── Attachment ────────────────────────────────────────────────────────
        migrations.CreateModel(
            name='Attachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('type', models.CharField(max_length=128)),
                ('size', models.CharField(max_length=32)),
                ('uploaded_by', models.CharField(max_length=255)),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('data_url', models.TextField(blank=True, default='')),
                ('is_proof_of_payment', models.BooleanField(default=False)),
                ('requisition', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attachments', to='core.requisition')),
            ],
            options={'ordering': ['uploaded_at']},
        ),

        # ── PurchaseOrder ─────────────────────────────────────────────────────
        migrations.CreateModel(
            name='PurchaseOrder',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('po_number', models.CharField(db_index=True, max_length=32, unique=True)),
                ('date', models.DateField()),
                ('version', models.PositiveSmallIntegerField(default=1)),
                ('buyer_company', models.CharField(default='', max_length=255)),
                ('buyer_address', models.TextField(default='')),
                ('buyer_department', models.CharField(default='', max_length=255)),
                ('buyer_contact', models.CharField(default='', max_length=255)),
                ('supplier_name', models.CharField(default='', max_length=255)),
                ('supplier_address', models.TextField(default='')),
                ('supplier_contact', models.CharField(default='', max_length=255)),
                ('supplier_email', models.EmailField(blank=True, default='')),
                ('supplier_phone', models.CharField(blank=True, default='', max_length=64)),
                ('currency', models.CharField(default='USD', max_length=3)),
                ('subtotal', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('total', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('requester_name', models.CharField(default='', max_length=255)),
                ('approver_names', models.JSONField(default=list)),
                ('status', models.CharField(choices=[('Open', 'Open'), ('Closed', 'Closed'), ('Cancelled', 'Cancelled')], default='Open', max_length=16)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('requisition', models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name='purchase_order', to='core.requisition')),
            ],
            options={'ordering': ['-created_at']},
        ),

        # ── POItem ────────────────────────────────────────────────────────────
        migrations.CreateModel(
            name='POItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('description', models.TextField()),
                ('quantity', models.IntegerField(default=1)),
                ('unit', models.CharField(default='Unit', max_length=64)),
                ('unit_price', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('line_total', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('requisition', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='items', to='core.requisition')),
                ('purchase_order', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='items', to='core.purchaseorder')),
            ],
        ),

        # ── AppNotification ───────────────────────────────────────────────────
        migrations.CreateModel(
            name='AppNotification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=255)),
                ('message', models.TextField()),
                ('timestamp', models.DateTimeField(auto_now_add=True)),
                ('read', models.BooleanField(db_index=True, default=False)),
                ('type', models.CharField(choices=[('submission', 'Submission'), ('approval', 'Approval'), ('rejection', 'Rejection'), ('payment', 'Payment'), ('info', 'Info')], default='info', max_length=16)),
                ('recipient', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to='core.user')),
                ('requisition', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='notifications', to='core.requisition')),
            ],
            options={'ordering': ['-timestamp']},
        ),

        # ── DelegationRecord ──────────────────────────────────────────────────
        migrations.CreateModel(
            name='DelegationRecord',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('from_user_name', models.CharField(max_length=255)),
                ('to_user_name', models.CharField(max_length=255)),
                ('start_date', models.DateField()),
                ('end_date', models.DateField()),
                ('reason', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('active', models.BooleanField(db_index=True, default=True)),
                ('from_user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='delegations_from', to='core.user')),
                ('to_user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='delegations_to', to='core.user')),
            ],
            options={'ordering': ['-created_at']},
        ),

        # ── AuditEntry ────────────────────────────────────────────────────────
        migrations.CreateModel(
            name='AuditEntry',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(db_index=True, max_length=64)),
                ('user_id_str', models.CharField(db_index=True, default='', max_length=64)),
                ('user_name', models.CharField(max_length=255)),
                ('user_role', models.CharField(db_index=True, max_length=64)),
                ('timestamp', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('details', models.TextField()),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='audit_entries', to='core.user')),
                ('requisition', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='audit_entries', to='core.requisition')),
            ],
            options={'ordering': ['-timestamp'], 'verbose_name_plural': 'Audit entries'},
        ),
    ]
