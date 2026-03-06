from django.core.management.base import BaseCommand
from django.utils import timezone
from core.models import Requisition, AuditEntry


# No sample data – start with empty requisitions and audit log.
SAMPLE_AUDIT: list[tuple] = []


class Command(BaseCommand):
    help = 'Seed Requisition and AuditEntry sample data for development.'

    def add_arguments(self, parser):
        parser.add_argument('--clear', action='store_true', help='Clear existing audit and requisition data first.')

    def handle(self, *args, **options):
        if options['clear']:
            AuditEntry.objects.all().delete()
            Requisition.objects.all().delete()
            self.stdout.write('Cleared audit and requisition data.')

        req_numbers = sorted({r for _, _, _, _, _, r in SAMPLE_AUDIT if r})
        req_by_number = {}
        # Map some req numbers to ZIG for demo variety
        req_currency = {'REQ-2026-002': 'ZIG', 'REQ-2026-010': 'ZIG', 'REQ-2026-011': 'ZIG'}
        for req_number in req_numbers:
            currency = req_currency.get(req_number, 'USD')
            req, _ = Requisition.objects.get_or_create(req_number=req_number, defaults={'currency': currency})
            if req.currency != currency:
                req.currency = currency
                req.save()
            req_by_number[req_number] = req

        created = 0
        for action, user_id, user_name, user_role, details, req_number in SAMPLE_AUDIT:
            requisition = req_by_number.get(req_number) if req_number else None
            AuditEntry.objects.create(
                action=action,
                user_id=user_id,
                user_name=user_name,
                user_role=user_role,
                details=details,
                requisition=requisition,
            )
            created += 1

        self.stdout.write(self.style.SUCCESS(f'Seeded {len(req_by_number)} requisitions and {created} audit entries.'))
