"""REST API viewsets and endpoints — split by domain."""
from .auth import CurrentUserView, ForgotPasswordView, RegisterView, ResetPasswordView, SchoolStaffRoleViewSet, StaffLoginView, StaffUserViewSet
from .expenses import BudgetViewSet, ExpenseCategoryViewSet, ExpenseViewSet, VendorViewSet
from .fees import StudentFeeViewSet
from .school import SchoolClassViewSet, SchoolViewSet
from .enquiries import AdmissionEnquiryViewSet
from .students import FeeStructureViewSet, FeeTypeViewSet, StudentViewSet

__all__ = [
    "RegisterView",
    "CurrentUserView",
    "StaffLoginView",
    "SchoolStaffRoleViewSet",
    "StaffUserViewSet",
    "ForgotPasswordView",
    "ResetPasswordView",
    "SchoolViewSet",
    "SchoolClassViewSet",
    "StudentViewSet",
    "AdmissionEnquiryViewSet",
    "FeeTypeViewSet",
    "FeeStructureViewSet",
    "StudentFeeViewSet",
    "ExpenseCategoryViewSet",
    "VendorViewSet",
    "ExpenseViewSet",
    "BudgetViewSet",
]
