from .models import FeeType, School


DEFAULT_SCHOOL_FEE_TYPES = [
    {
        "name": "Tuition Fee",
        "description": "Monthly tuition charges",
        "billing_period": "monthly",
    },
    {
        "name": "Transport Fee",
        "description": "School bus or transport charges",
        "billing_period": "monthly",
    },
    {
        "name": "Admission Fee",
        "description": "One-time admission charges for new students",
        "billing_period": "one_time",
    },
    {
        "name": "Registration Fee",
        "description": "Yearly registration or re-enrollment charges",
        "billing_period": "yearly",
    },
    {
        "name": "Annual Charges",
        "description": "Yearly session or annual school charges",
        "billing_period": "yearly",
    },
    {
        "name": "Exam Fee",
        "description": "Quarterly examination charges",
        "billing_period": "quarterly",
    },
    {
        "name": "Book Fee",
        "description": "Books and study material charges",
        "billing_period": "yearly",
    },
    {
        "name": "Uniform Fee",
        "description": "Uniform charges if collected by the school",
        "billing_period": "yearly",
    },
    {
        "name": "Stationery Fee",
        "description": "Stationery and notebook charges",
        "billing_period": "yearly",
    },
    {
        "name": "Computer Fee",
        "description": "Computer lab or digital learning charges",
        "billing_period": "monthly",
    },
    {
        "name": "Sports Fee",
        "description": "Sports and activities charges",
        "billing_period": "yearly",
    },
]


def ensure_default_fee_types_for_school(school: School) -> None:
    if not school:
        return

    for fee_type in DEFAULT_SCHOOL_FEE_TYPES:
        FeeType.objects.get_or_create(
            school=school,
            name=fee_type["name"],
            defaults={
                "description": fee_type["description"],
                "billing_period": fee_type["billing_period"],
                "is_system": False,
            },
        )
