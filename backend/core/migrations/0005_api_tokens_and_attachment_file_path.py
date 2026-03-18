from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0004_add_suppliers_json_and_bank_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='attachment',
            name='file_path',
            field=models.CharField(blank=True, default='', max_length=512),
        ),
        migrations.CreateModel(
            name='ApiToken',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(db_index=True, max_length=64, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('last_used_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='api_tokens', to='core.user')),
            ],
        ),
    ]

