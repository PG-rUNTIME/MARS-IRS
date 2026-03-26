from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0008_rfq_notification_link'),
    ]

    operations = [
        migrations.AddField(
            model_name='rfqevent',
            name='actor_role',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
    ]

