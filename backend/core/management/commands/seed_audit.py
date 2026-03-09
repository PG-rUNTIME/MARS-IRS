import os
from datetime import date

from django.core.management.base import BaseCommand

from core.models import User, UserRole
from core.serializers import hash_password

DEFAULT_ADMIN_EMAIL = 'admin@marsambulance.com'
DEFAULT_ADMIN_PASSWORD = 'mars2026'


class Command(BaseCommand):
    help = 'Seed initial admin user if no users exist.'

    def handle(self, *args, **options):
        admin_password = os.environ.get('ADMIN_PASSWORD', DEFAULT_ADMIN_PASSWORD)
        admin_email = os.environ.get('ADMIN_EMAIL', DEFAULT_ADMIN_EMAIL).strip().lower() or DEFAULT_ADMIN_EMAIL

        if User.objects.exists():
            # Fix existing admin if they were seeded with plain-text password (pre-bcrypt fix)
            admin = User.objects.filter(email=DEFAULT_ADMIN_EMAIL).first()
            if admin and admin.password == DEFAULT_ADMIN_PASSWORD:
                admin.password = hash_password(DEFAULT_ADMIN_PASSWORD)
                admin.save()
                self.stdout.write(self.style.SUCCESS('Updated admin password to bcrypt hash.'))
            else:
                self.stdout.write('Users already exist — skipping seed.')
            return

        admin = User.objects.create(
            name='Admin User',
            email=admin_email,
            password=hash_password(admin_password),
            department='Information Technology',
            active=True,
            must_change_password=False,
            joined_date=date.today(),
        )
        UserRole.objects.create(user=admin, role='System Administrator')
        self.stdout.write(self.style.SUCCESS(
            f'Created admin user: {admin.email} (set ADMIN_PASSWORD in production)'
        ))
