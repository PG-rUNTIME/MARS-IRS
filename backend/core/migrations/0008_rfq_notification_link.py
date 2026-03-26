from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0007_rfq_events'),
    ]

    operations = [
        migrations.AddField(
            model_name='appnotification',
            name='rfq',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='notifications', to='core.rfq'),
        ),
    ]

