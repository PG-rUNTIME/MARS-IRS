from django.db import migrations, models


def merge_duplicate_department_budgets(apps, schema_editor):
    """Budgets are per (year, department) only; merge rows that were split by base."""
    DepartmentBudget = apps.get_model('core', 'DepartmentBudget')
    seen = {}
    for b in DepartmentBudget.objects.all().order_by('id'):
        key = (b.year, b.department)
        if key not in seen:
            seen[key] = b
            continue
        keeper = seen[key]
        keeper.usd_budget = (keeper.usd_budget or 0) + (b.usd_budget or 0)
        keeper.zig_budget = (keeper.zig_budget or 0) + (b.zig_budget or 0)
        keeper.save(update_fields=['usd_budget', 'zig_budget', 'updated_at'])
        b.delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0014_requisition_rfq_budget_base'),
    ]

    operations = [
        migrations.RunPython(merge_duplicate_department_budgets, migrations.RunPython.noop),
        migrations.AlterUniqueTogether(
            name='departmentbudget',
            unique_together=set(),
        ),
        migrations.RemoveField(
            model_name='departmentbudget',
            name='base',
        ),
        migrations.AlterUniqueTogether(
            name='departmentbudget',
            unique_together={('year', 'department')},
        ),
        migrations.AlterModelOptions(
            name='departmentbudget',
            options={'ordering': ['-year', 'department']},
        ),
    ]
