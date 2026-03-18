from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import (
    RegisterView, CurrentUserView, ForgotPasswordView, ResetPasswordView,
    SchoolViewSet, SchoolClassViewSet, StudentViewSet, FeeTypeViewSet, FeeStructureViewSet, StudentFeeViewSet,
    StaffUserViewSet, ExpenseCategoryViewSet, VendorViewSet, ExpenseViewSet, BudgetViewSet,
)

router = DefaultRouter()
router.register(r'schools', SchoolViewSet, basename='school')
router.register(r'classes', SchoolClassViewSet, basename='schoolclass')
router.register(r'students', StudentViewSet, basename='student')
router.register(r'staff-users', StaffUserViewSet, basename='staffuser')
router.register(r'fee-types', FeeTypeViewSet, basename='feetype')
router.register(r'fee-structures', FeeStructureViewSet, basename='feestructure')
router.register(r'student-fees', StudentFeeViewSet, basename='studentfee')
router.register(r'expense-categories', ExpenseCategoryViewSet, basename='expensecategory')
router.register(r'vendors', VendorViewSet, basename='vendor')
router.register(r'expenses', ExpenseViewSet, basename='expense')
router.register(r'budgets', BudgetViewSet, basename='budget')

urlpatterns = [
    path('auth/register/', RegisterView.as_view()),
    path('auth/me/', CurrentUserView.as_view()),
    path('auth/forgot-password/', ForgotPasswordView.as_view()),
    path('auth/reset-password/', ResetPasswordView.as_view()),
    path('token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('', include(router.urls)),
]
