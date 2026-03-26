from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0006_rfqs'),
    ]

    operations = [
        migrations.CreateModel(
            name='RFQEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('order', models.PositiveSmallIntegerField(default=0)),
                ('status', models.CharField(default='', max_length=64)),
                ('label', models.CharField(default='', max_length=255)),
                ('actor_name', models.CharField(blank=True, default='', max_length=255)),
                ('timestamp', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='rfq_events', to='core.user')),
                ('rfq', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='events', to='core.rfq')),
            ],
            options={
                'ordering': ['order', 'timestamp', 'id'],
            },
        ),
    ]

