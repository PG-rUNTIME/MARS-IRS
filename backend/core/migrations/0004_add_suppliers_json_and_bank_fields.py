# Generated manually for Requisition suppliers_json, bank, and preferred_supplier fields

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_full_persistence'),
    ]

    operations = [
        migrations.AddField(
            model_name='requisition',
            name='supplier_bank_name',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='requisition',
            name='supplier_bank_account_name',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='requisition',
            name='supplier_bank_account_number',
            field=models.CharField(blank=True, default='', max_length=128),
        ),
        migrations.AddField(
            model_name='requisition',
            name='supplier_bank_branch',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='requisition',
            name='suppliers_json',
            field=models.JSONField(blank=True, default=None, null=True),
        ),
        migrations.AddField(
            model_name='requisition',
            name='preferred_supplier_index',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='requisition',
            name='preferred_supplier_justification',
            field=models.TextField(blank=True, default=''),
        ),
    ]
