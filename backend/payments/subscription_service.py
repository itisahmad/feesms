"""Platform subscription billing for school owners."""
from __future__ import annotations

import calendar
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone

from schools.models import School, Student

User = get_user_model()

PLAN_MONTHLY_AMOUNT = {
    "basic": Decimal("299.00"),
    "standard": Decimal("599.00"),
    "premium": Decimal("999.00"),
}

PLAN_RANK = {"basic": 0, "standard": 1, "premium": 2}


def plan_amount(plan: str, billing_cycle: str) -> Decimal:
    base = PLAN_MONTHLY_AMOUNT.get(plan, Decimal("599.00"))
    return base if billing_cycle == "monthly" else base * Decimal("12")


def add_billing_period(start: date, billing_cycle: str) -> date:
    if billing_cycle == "yearly":
        return start + timedelta(days=365)
    month = start.month + 1
    year = start.year
    if month > 12:
        month = 1
        year += 1
    day = min(start.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def school_usage(school: School) -> dict:
    student_count = Student.objects.filter(school=school, is_active=True).count()
    staff_count = User.objects.filter(school=school).exclude(role__in=["owner", "parent"]).count()
    return {"students": student_count, "staff": staff_count}


def can_fit_plan(school: School, plan: str) -> bool:
    limits = School.PLAN_LIMITS[plan]
    usage = school_usage(school)
    return usage["students"] <= limits["max_students"] and usage["staff"] <= limits["max_staff_logins"]


def can_auto_downgrade_to_basic(school: School) -> bool:
    usage = school_usage(school)
    limits = School.PLAN_LIMITS["basic"]
    return usage["students"] <= limits["max_students"] and usage["staff"] <= limits["max_staff_logins"]


def is_in_trial(school: School) -> bool:
    return bool(school.trial_ends_at and school.trial_ends_at > timezone.now())


def is_paid_period_active(school: School) -> bool:
    return bool(school.plan_period_end and school.plan_period_end >= timezone.now().date())


def is_subscription_active(school: School) -> bool:
    if school.subscription_blocked:
        return False
    if is_in_trial(school):
        return True
    if is_paid_period_active(school):
        return True
    if school.plan == "basic" and not school.plan_period_end and not school.trial_ends_at:
        return True
    return False


def plan_change_requires_payment(current_plan: str, target_plan: str) -> bool:
    if current_plan == target_plan:
        return True
    return PLAN_RANK[target_plan] > PLAN_RANK[current_plan]


def activate_plan_after_payment(school: School, target_plan: str, billing_cycle: str, invoice) -> None:
    today = timezone.now().date()
    period_end = add_billing_period(today, billing_cycle)
    school.apply_plan(target_plan)
    school.plan_period_end = period_end
    school.subscription_blocked = False
    school.trial_ends_at = None
    school.save(update_fields=["plan_period_end", "subscription_blocked", "trial_ends_at"])

    invoice.period_start = today
    invoice.period_end = period_end
    notes = dict(invoice.notes or {})
    notes["target_plan"] = target_plan
    invoice.notes = notes
    invoice.save(update_fields=["period_start", "period_end", "notes"])


def sync_school_subscription(school: School | None) -> School | None:
    """Apply trial/paid expiry rules. Returns refreshed school."""
    if not school:
        return None

    if is_in_trial(school) or is_paid_period_active(school):
        if school.subscription_blocked:
            school.subscription_blocked = False
            school.save(update_fields=["subscription_blocked"])
        return school

    if can_auto_downgrade_to_basic(school):
        if school.plan != "basic":
            school.apply_plan("basic")
        school.plan_period_end = None
        school.subscription_blocked = False
        school.save(update_fields=["plan_period_end", "subscription_blocked"])
        return school

    if not school.subscription_blocked:
        school.subscription_blocked = True
        school.save(update_fields=["subscription_blocked"])
    return school


def subscription_status_payload(school: School) -> dict:
    school = sync_school_subscription(school) or school
    usage = school_usage(school)
    return {
        "plan": school.plan,
        "trial_ends_at": school.trial_ends_at,
        "plan_period_end": school.plan_period_end,
        "subscription_blocked": school.subscription_blocked,
        "subscription_active": is_subscription_active(school),
        "in_trial": is_in_trial(school),
        "student_count": usage["students"],
        "staff_count": usage["staff"],
        "can_auto_downgrade_to_basic": can_auto_downgrade_to_basic(school),
        "next_monthly_amount": str(plan_amount(school.plan, "monthly")),
    }
