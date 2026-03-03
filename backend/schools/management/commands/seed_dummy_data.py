"""
Seed dummy data for testing all features
Creates: demo school, owner, classes, sections, students, fee structures, fees, payments
"""
import calendar
from datetime import timedelta, date
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from schools.models import (
    User, School, SchoolClass, Section, Student,
    FeeType, FeeStructure, StudentFee, FeePayment,
)


class Command(BaseCommand):
    help = 'Seed dummy data for testing (school, students, fees, payments)'

    def handle(self, *args, **options):
        # 1. Create or get demo school
        school, created = School.objects.get_or_create(
            name='Demo Public School',
            defaults={
                'address': 'Main Road, Muzaffarpur',
                'city': 'Muzaffarpur',
                'state': 'Bihar',
                'phone': '9876543210',
                'email': 'demo@school.com',
                'plan': 'standard',
                'max_students': 300,
                'max_staff_logins': 2,
                'trial_ends_at': timezone.now() + timedelta(days=30),
            }
        )
        if created:
            self.stdout.write('Created demo school')
        else:
            self.stdout.write('Using existing demo school')

        # 2. Create demo user (owner) if not exists
        user, user_created = User.objects.get_or_create(
            username='demo',
            defaults={
                'email': 'demo@school.com',
                'first_name': 'Demo',
                'last_name': 'Owner',
                'role': 'owner',
                'school': school,
            }
        )
        if user_created:
            user.set_password('demo123')
            user.save()
            self.stdout.write('Created demo user: username=demo, password=demo123')
        else:
            if not user.school:
                user.school = school
                user.save()
            self.stdout.write('Demo user exists: username=demo, password=demo123 (reset if needed)')

        # 3. Create classes with sections
        class_names = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5']
        section_names = ['A', 'B', 'C']
        classes_data = []

        for i, cname in enumerate(class_names):
            sc, _ = SchoolClass.objects.get_or_create(
                school=school,
                name=cname,
                defaults={'display_order': i}
            )
            classes_data.append(sc)
            for j, sname in enumerate(section_names):
                Section.objects.get_or_create(
                    school_class=sc,
                    name=sname,
                    defaults={'display_order': j}
                )

        self.stdout.write(f'Created {len(classes_data)} classes with sections')

        # 4. Create students
        first_names = ['Rahul', 'Priya', 'Amit', 'Sneha', 'Vikram', 'Anjali', 'Rohan', 'Kavita', 'Suresh', 'Pooja',
                       'Rajesh', 'Meera', 'Arun', 'Divya', 'Manoj', 'Neha', 'Sanjay', 'Kiran', 'Vijay', 'Rekha']
        last_names = ['Kumar', 'Singh', 'Sharma', 'Verma', 'Gupta', 'Yadav', 'Prasad', 'Jha', 'Roy', 'Das']

        students_created = 0
        for i, sc in enumerate(classes_data):
            sections = list(sc.sections.all())
            for j in range(4):
                idx = (i * 4 + j) % len(first_names)
                fname = first_names[idx]
                lname = last_names[(i + j) % len(last_names)]
                section = sections[j % len(sections)]
                _, created = Student.objects.get_or_create(
                    school=school,
                    name=f'{fname} {lname}',
                    school_class=sc,
                    section=section,
                    defaults={
                        'parent_name': f'Parent of {fname}',
                        'parent_phone': f'98{70000000 + i * 1000 + j}',
                        'parent_email': f'{fname.lower()}@example.com',
                        'admission_number': f'ADM{2024000 + i * 100 + j}',
                        'roll_number': str(j + 1),
                        'admission_date': date(2024, 4, 1),
                        'uses_transport': j % 3 != 0,
                    }
                )
                if created:
                    students_created += 1

        self.stdout.write(f'Created {students_created} students')

        # 5. Get or create fee types (system-wide)
        tuition, _ = FeeType.objects.get_or_create(
            name='Tuition Fee',
            school=None,
            defaults={'category': 'monthly', 'description': 'Monthly tuition', 'is_system': True}
        )
        transport, _ = FeeType.objects.get_or_create(
            name='Transport Fee',
            school=None,
            defaults={'category': 'monthly', 'description': 'Bus/transport charges', 'is_system': True}
        )

        # 6. Create fee structures per class (with yearly discount)
        fee_amounts = {
            'Class 1': (1700, 500),   # Tuition ₹1,700 × 12 = ₹20,400; Transport ₹500 × 12 = ₹6,000
            'Class 2': (1800, 500),
            'Class 3': (1900, 550),
            'Class 4': (2000, 600),
            'Class 5': (2200, 600),
        }
        for sc in classes_data:
            amt = fee_amounts.get(sc.name, (1700, 500))
            FeeStructure.objects.get_or_create(
                school=school,
                fee_type=tuition,
                school_class=sc,
                academic_year='2024-25',
                defaults={
                    'amount': Decimal(amt[0]),
                    'due_day': 5,
                    'late_fine_per_day': Decimal(10),
                    'allow_yearly_payment': True,
                    'yearly_discount_percent': Decimal('10'),
                }
            )
            FeeStructure.objects.get_or_create(
                school=school,
                fee_type=transport,
                school_class=sc,
                academic_year='2024-25',
                defaults={
                    'amount': Decimal(amt[1]),
                    'due_day': 5,
                    'late_fine_per_day': Decimal(5),
                    'allow_yearly_payment': True,
                    'yearly_discount_percent': Decimal('10'),
                }
            )

        self.stdout.write('Created fee structures (with 10% yearly discount)')

        # 7. Create student fees for full academic year (Apr 2024 - Mar 2025)
        import calendar
        structures = FeeStructure.objects.filter(school=school, academic_year='2024-25').select_related('school_class')
        students = Student.objects.filter(school=school, is_active=True).select_related('school_class', 'section')
        # Apr 2024 through Mar 2025
        months_years = [(m, 2024) for m in range(4, 13)] + [(m, 2025) for m in range(1, 4)]

        fees_created = 0
        for student in students:
            if not student.school_class:
                continue
            for struct in structures.filter(school_class=student.school_class):
                # Skip transport for students who don't use it
                if 'transport' in struct.fee_type.name.lower() and not getattr(student, 'uses_transport', True):
                    continue
                for m, y in months_years:
                    if not struct.should_bill_for_month(m):
                        continue  # e.g. quarterly/half-yearly skip some months
                    if student.admission_date:
                        try:
                            _, last_day = calendar.monthrange(y, m)
                            if student.admission_date > date(y, m, last_day):
                                continue
                        except (ValueError, TypeError):
                            pass
                    _, created = StudentFee.objects.get_or_create(
                        student=student,
                        fee_structure=struct,
                        month=m,
                        year=y,
                        defaults={
                            'amount': struct.amount,
                            'late_fine': Decimal(0),
                            'total_amount': struct.amount,
                            'due_date': date(y, m, min(struct.due_day, 28)),
                        }
                    )
                    if created:
                        fees_created += 1

        self.stdout.write(f'Created {fees_created} student fee records for academic year 2024-25')

        # 8. Add some payments (Apr–Jun 2024: mix of paid, partial, unpaid)
        payment_months = [(4, 2024), (5, 2024), (6, 2024)]
        for pm, py in payment_months:
            student_fees = list(StudentFee.objects.filter(
                student__school=school,
                month=pm,
                year=py
            ).select_related('student')[:8])
            for i, sf in enumerate(student_fees):
                total = float(sf.total_amount)
                if i % 3 == 0:
                    FeePayment.objects.get_or_create(
                        student_fee=sf,
                        amount=Decimal(str(total)),
                        defaults={
                            'payment_date': date(py, pm, 10),
                            'payment_mode': 'Cash',
                            'receipt_number': f'RCP-{sf.id:06d}',
                        }
                    )
                elif i % 3 == 1:
                    FeePayment.objects.get_or_create(
                        student_fee=sf,
                        amount=Decimal(str(round(total * 0.5, 2))),
                        defaults={
                            'payment_date': date(py, pm, 15),
                            'payment_mode': 'UPI',
                            'receipt_number': f'RCP-{sf.id:06d}-P',
                        }
                    )

        self.stdout.write('Added sample payments (some full, some partial)')
        self.stdout.write(self.style.SUCCESS('Done! Login with: demo / demo123'))
