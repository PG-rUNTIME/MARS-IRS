from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0013_department_budget'),
    ]

    operations = [
        migrations.AddField(
            model_name='requisition',
            name='base',
            field=models.CharField(db_index=True, default='Harare', max_length=64),
        ),
        migrations.AddField(
            model_name='rfq',
            name='base',
            field=models.CharField(db_index=True, default='Harare', max_length=64),
        ),
        migrations.AlterUniqueTogether(
            name='departmentbudget',
            unique_together=set(),
        ),
        migrations.AddField(
            model_name='departmentbudget',
            name='base',
            field=models.CharField(db_index=True, default='Harare', max_length=64),
        ),
        migrations.AlterUniqueTogether(
            name='departmentbudget',
            unique_together={('year', 'department', 'base')},
        ),
        migrations.AlterModelOptions(
            name='departmentbudget',
            options={'ordering': ['-year', 'department', 'base']},
        ),
    ]
