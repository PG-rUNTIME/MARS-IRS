from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0011_supplier_master'),
    ]

    operations = [
        migrations.CreateModel(
            name='DepartmentBudget',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('year', models.PositiveIntegerField(db_index=True)),
                ('department', models.CharField(db_index=True, max_length=255)),
                ('usd_budget', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('zig_budget', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('configured_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='department_budgets_configured', to='core.user')),
            ],
            options={
                'ordering': ['-year', 'department'],
                'unique_together': {('year', 'department')},
            },
        ),
    ]
