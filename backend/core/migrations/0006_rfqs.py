from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0005_api_tokens_and_attachment_file_path'),
    ]

    operations = [
        migrations.CreateModel(
            name='RFQ',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('rfq_number', models.CharField(db_index=True, max_length=32, unique=True)),
                ('type', models.CharField(db_index=True, max_length=32)),
                ('department', models.CharField(db_index=True, default='', max_length=255)),
                ('cost_center', models.CharField(default='', max_length=255)),
                ('budget_available', models.BooleanField(default=True)),
                ('currency', models.CharField(db_index=True, default='USD', max_length=3)),
                ('description', models.TextField(default='')),
                ('justification', models.TextField(default='')),
                ('amount_estimated', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('status', models.CharField(db_index=True, default='Draft', max_length=64)),
                ('submitted_at', models.DateTimeField(blank=True, null=True)),
                ('procurement_completed_at', models.DateTimeField(blank=True, null=True)),
                ('converted_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('requester', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='rfqs', to='core.user')),
            ],
        ),
        migrations.CreateModel(
            name='RFQItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('order', models.PositiveSmallIntegerField(default=0)),
                ('description', models.CharField(default='', max_length=255)),
                ('quantity', models.IntegerField(default=1)),
                ('unit', models.CharField(default='Unit', max_length=64)),
                ('rfq', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='items', to='core.rfq')),
            ],
            options={
                'ordering': ['order', 'id'],
            },
        ),
        migrations.CreateModel(
            name='RFQQuote',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('supplier_name', models.CharField(default='', max_length=255)),
                ('supplier_email', models.EmailField(blank=True, default='', max_length=254)),
                ('supplier_phone', models.CharField(blank=True, default='', max_length=64)),
                ('supplier_address', models.TextField(blank=True, default='')),
                ('supplier_contact', models.CharField(blank=True, default='', max_length=255)),
                ('supplier_bank_name', models.CharField(blank=True, default='', max_length=255)),
                ('supplier_bank_account_name', models.CharField(blank=True, default='', max_length=255)),
                ('supplier_bank_account_number', models.CharField(blank=True, default='', max_length=128)),
                ('supplier_bank_branch', models.CharField(blank=True, default='', max_length=255)),
                ('quote_currency', models.CharField(db_index=True, default='USD', max_length=3)),
                ('quote_total_amount', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('quote_notes', models.TextField(blank=True, default='')),
                ('quote_valid_until', models.DateField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='rfq_quotes_created', to='core.user')),
                ('rfq', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='quotes', to='core.rfq')),
            ],
        ),
        migrations.CreateModel(
            name='RFQQuoteItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('description', models.CharField(default='', max_length=255)),
                ('quantity', models.IntegerField(default=1)),
                ('unit', models.CharField(default='Unit', max_length=64)),
                ('unit_price', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('line_total', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('rfq_item', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='quoted_as', to='core.rfqitem')),
                ('quote', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='items', to='core.rfqquote')),
            ],
            options={
                'ordering': ['quote_id', 'rfq_item_id'],
            },
        ),
        migrations.CreateModel(
            name='RFQQuoteAttachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('type', models.CharField(blank=True, default='', max_length=128)),
                ('size', models.CharField(blank=True, default='', max_length=32)),
                ('uploaded_by', models.CharField(blank=True, default='', max_length=255)),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('data_url', models.TextField(blank=True, default='')),
                ('file_path', models.CharField(blank=True, default='', max_length=512)),
                ('is_quote_document', models.BooleanField(default=True)),
                ('quote', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attachments', to='core.rfqquote')),
            ],
        ),
        migrations.AddField(
            model_name='rfq',
            name='selected_quote',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='selected_for_rfq', to='core.rfqquote'),
        ),
        migrations.AddField(
            model_name='requisition',
            name='rfq',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='converted_requisitions', to='core.rfq'),
        ),
    ]

