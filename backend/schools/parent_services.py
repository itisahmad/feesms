"""Parent portal child profile payloads."""
from payments.models import SchoolPaymentConfig
from results.services import list_student_published_results, student_result_card

from .services.fee_collection import build_student_fee_history


def build_parent_child_profile(student) -> dict:
    fee_history = build_student_fee_history(student)
    cfg, _ = SchoolPaymentConfig.objects.get_or_create(school=student.school)
    return {
        **fee_history,
        "allow_parent_online_payment": cfg.allow_parent_online_payment,
        "published_results": list_student_published_results(student),
    }
