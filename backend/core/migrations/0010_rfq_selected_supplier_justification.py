from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0009_rfq_event_actor_role'),
    ]

    operations = [
        migrations.AddField(
            model_name='rfq',
            name='selected_supplier_justification',
            field=models.TextField(blank=True, default=''),
        ),
    ]
