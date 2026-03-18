"""
Seed default fee types for Bihar schools
"""
from django.core.management.base import BaseCommand
from schools.models import FeeType


DEFAULT_FEE_TYPES = [
    ('Tuition Fee', 'Monthly tuition'),
    ('Transport Fee', 'Bus/transport charges'),
    ('Hostel Fee', 'Hostel charges if applicable'),
    ('Admission Fee', 'New student admission'),
    ('Registration Fee', 'Annual registration'),
    ('Annual Charges', 'Session/annual charges'),
    ('Development Fund', 'Building/development fund'),
    ('Book Fee', 'Books at session start'),
    ('Stationery Fee', 'Stationery/uniform'),
    ('Notebook Fee', 'Notebooks'),
    ('Exam Fee', 'Half-yearly/annual exam'),
    ('Lab Fee', 'Science lab charges'),
    ('Sports Fee', 'Sports/activity fee'),
    ('Late Fee', 'Late payment fine'),
]


class Command(BaseCommand):
    help = 'Seed default fee types (system-wide, no school)'

    def handle(self, *args, **options):
        created = 0
        for name, desc in DEFAULT_FEE_TYPES:
            _, was_created = FeeType.objects.get_or_create(
                name=name,
                school=None,
                defaults={'description': desc, 'is_system': True}
            )
            if was_created:
                created += 1
                self.stdout.write(f'Created: {name}')
        self.stdout.write(self.style.SUCCESS(f'Done. Created {created} fee types.'))
