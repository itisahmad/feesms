"""
Seed default fee types for Bihar schools
"""
from django.core.management.base import BaseCommand
from schools.models import FeeType


DEFAULT_FEE_TYPES = [
    # Monthly
    ('Tuition Fee', 'monthly', 'Monthly tuition'),
    ('Transport Fee', 'monthly', 'Bus/transport charges'),
    ('Hostel Fee', 'monthly', 'Hostel charges if applicable'),
    # One-time
    ('Admission Fee', 'one_time', 'New student admission'),
    ('Registration Fee', 'one_time', 'Annual registration'),
    ('Annual Charges', 'one_time', 'Session/annual charges'),
    ('Development Fund', 'one_time', 'Building/development fund'),
    # Books
    ('Book Fee', 'books', 'Books at session start'),
    ('Stationery Fee', 'books', 'Stationery/uniform'),
    ('Notebook Fee', 'books', 'Notebooks'),
    # Exam
    ('Exam Fee', 'exam', 'Half-yearly/annual exam'),
    ('Lab Fee', 'exam', 'Science lab charges'),
    ('Sports Fee', 'exam', 'Sports/activity fee'),
    ('Late Fee', 'exam', 'Late payment fine'),
]


class Command(BaseCommand):
    help = 'Seed default fee types (system-wide, no school)'

    def handle(self, *args, **options):
        created = 0
        for name, category, desc in DEFAULT_FEE_TYPES:
            _, was_created = FeeType.objects.get_or_create(
                name=name,
                school=None,
                defaults={'category': category, 'description': desc, 'is_system': True}
            )
            if was_created:
                created += 1
                self.stdout.write(f'Created: {name}')
        self.stdout.write(self.style.SUCCESS(f'Done. Created {created} fee types.'))
