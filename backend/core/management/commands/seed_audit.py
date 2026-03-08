from datetime import date

from django.core.management.base import BaseCommand

from core.models import User, UserRole


class Command(BaseCommand):
    help = 'Seed initial admin user if no users exist.'

    def handle(self, *args, **options):
        if User.objects.exists():
            self.stdout.write('Users already exist — skipping seed.')
            return

        admin = User.objects.create(
            name='Admin User',
            email='admin@marsambulance.com',
            password='mars2026',
            department='Information Technology',
            active=True,
            must_change_password=False,
            joined_date=date.today(),
        )
        UserRole.objects.create(user=admin, role='System Administrator')
        self.stdout.write(self.style.SUCCESS(
            f'Created admin user: {admin.email} (password: mars2026)'
        ))
