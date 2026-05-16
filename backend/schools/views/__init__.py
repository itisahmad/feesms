"""REST API viewsets and endpoints — split by domain."""
from .auth import CurrentUserView, ForgotPasswordView, RegisterView, ResetPasswordView, StaffUserViewSet
from .expenses import BudgetViewSet, ExpenseCategoryViewSet, ExpenseViewSet, VendorViewSet
from .fees import StudentFeeViewSet
from .school import SchoolClassViewSet, SchoolViewSet
from .students import FeeStructureViewSet, FeeTypeViewSet, StudentViewSet

__all__ = [
    "RegisterView",
    "CurrentUserView",
    "StaffUserViewSet",
    "ForgotPasswordView",
    "ResetPasswordView",
    "SchoolViewSet",
    "SchoolClassViewSet",
    "StudentViewSet",
    "FeeTypeViewSet",
    "FeeStructureViewSet",
    "StudentFeeViewSet",
    "ExpenseCategoryViewSet",
    "VendorViewSet",
    "ExpenseViewSet",
    "BudgetViewSet",
]
