"""
Create default classes and sections for schools that don't have any
"""
from django.core.management.base import BaseCommand
from schools.models import School, SchoolClass, Section

DEFAULT_CLASSES = ['Nursery', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10']


class Command(BaseCommand):
    help = 'Create default classes and sections for schools that have none'

    def handle(self, *args, **options):
        for school in School.objects.all():
            if not school.classes.exists():
                for i, name in enumerate(DEFAULT_CLASSES):
                    sc = SchoolClass.objects.create(school=school, name=name, display_order=i)
                    Section.objects.create(school_class=sc, name='A', display_order=0)
                self.stdout.write(f'Created classes for {school.name}')
            else:
                for sc in school.classes.all():
                    if not sc.sections.exists():
                        Section.objects.create(school_class=sc, name='A', display_order=0)
                        self.stdout.write(f'Added section A to {sc.name} in {school.name}')
        self.stdout.write(self.style.SUCCESS('Done.'))
