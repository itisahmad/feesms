from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    RegisterView, CurrentUserView, ForgotPasswordView, ResetPasswordView,
    SchoolViewSet, SchoolClassViewSet, StudentViewSet, FeeTypeViewSet, FeeStructureViewSet, StudentFeeViewSet,
    StaffUserViewSet, StaffLoginView, SchoolStaffRoleViewSet, ExpenseCategoryViewSet, VendorViewSet, ExpenseViewSet, BudgetViewSet,
    AdmissionEnquiryViewSet,
)
from .auth_views import SchoolTokenObtainPairView
from .views.parent import (
    ParentChildDetailView,
    ParentChildExamReportView,
    ParentChildPayVerifyView,
    ParentChildPayView,
    ParentChildMonthReceiptDownloadView,
    ParentChildReceiptDownloadView,
    ParentChildReceiptsListView,
    ParentChildrenView,
    ParentForgotPasswordSendOTPView,
    ParentLoginView,
    ParentRegisterView,
    ParentResetPasswordView,
    ParentSendOTPView,
)
from .views_maintenance import maintenance_check
from .views_booking import booking_slots, book_slot
from .views_messaging import SchoolMessagingSettingsView, SendMessageView

router = DefaultRouter()
router.register(r'schools', SchoolViewSet, basename='school')
router.register(r'classes', SchoolClassViewSet, basename='schoolclass')
router.register(r'students', StudentViewSet, basename='student')
router.register(r'enquiries', AdmissionEnquiryViewSet, basename='admissionenquiry')
router.register(r'staff-roles', SchoolStaffRoleViewSet, basename='staffrole')
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
    path('staff/auth/login/', StaffLoginView.as_view()),
    # Parent portal auth (register, login, forgot password)
    path('parent/auth/send-otp/', ParentSendOTPView.as_view()),
    path('parent/auth/register/', ParentRegisterView.as_view()),
    path('parent/auth/login/', ParentLoginView.as_view()),
    path('parent/auth/forgot-password/send-otp/', ParentForgotPasswordSendOTPView.as_view()),
    path('parent/auth/forgot-password/reset/', ParentResetPasswordView.as_view()),
    path('parent/children/', ParentChildrenView.as_view()),
    path('parent/children/<int:student_id>/', ParentChildDetailView.as_view()),
    path('parent/children/<int:student_id>/exam-report/', ParentChildExamReportView.as_view()),
    path('parent/children/<int:student_id>/receipts/', ParentChildReceiptsListView.as_view()),
    path(
        'parent/children/<int:student_id>/receipts/monthly/',
        ParentChildMonthReceiptDownloadView.as_view(),
    ),
    path(
        'parent/children/<int:student_id>/receipts/<int:student_fee_id>/',
        ParentChildReceiptDownloadView.as_view(),
    ),
    path('parent/children/<int:student_id>/pay/', ParentChildPayView.as_view()),
    path('parent/children/<int:student_id>/pay/verify/', ParentChildPayVerifyView.as_view()),
    path('token/', SchoolTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('maintenance/', maintenance_check, name='maintenance_check'),
    path('booking/slots/', booking_slots, name='booking_slots'),
    path('booking/book/', book_slot, name='book_slot'),
    path('messaging/settings/', SchoolMessagingSettingsView.as_view(), name='messaging_settings'),
    path('messaging/send/', SendMessageView.as_view(), name='messaging_send'),
    path('', include(router.urls)),
]
