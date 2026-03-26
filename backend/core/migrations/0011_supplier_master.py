from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0010_rfq_selected_supplier_justification'),
    ]

    operations = [
        migrations.CreateModel(
            name='Supplier',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(db_index=True, max_length=255)),
                ('category', models.CharField(choices=[('Medical', 'Medical'), ('Fuel', 'Fuel'), ('ICT', 'ICT'), ('Logistics', 'Logistics'), ('Maintenance', 'Maintenance'), ('Professional Services', 'Professional Services'), ('Other', 'Other')], db_index=True, default='Other', max_length=64)),
                ('physical_address', models.TextField(default='')),
                ('contact_email', models.EmailField(default='', max_length=254)),
                ('contact_person', models.CharField(default='', max_length=255)),
                ('active', models.BooleanField(db_index=True, default=True)),
                ('suspended', models.BooleanField(db_index=True, default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='suppliers_created', to='core.user')),
            ],
            options={'ordering': ['name', 'id']},
        ),
        migrations.AddField(
            model_name='rfqquote',
            name='supplier',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='rfq_quotes', to='core.supplier'),
        ),
    ]
