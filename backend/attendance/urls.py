from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AttendanceSessionViewSet, ClassTeacherAssignmentViewSet, MyClassesView
from .views.reports import ClassReportView, ExportReportView, StudentReportView

router = DefaultRouter()
router.register(r'sessions', AttendanceSessionViewSet, basename='attendance-session')
router.register(r'assignments', ClassTeacherAssignmentViewSet, basename='attendance-assignment')

urlpatterns = [
    path('my-classes/', MyClassesView.as_view()),
    path('reports/class/', ClassReportView.as_view()),
    path('reports/student/<int:student_id>/', StudentReportView.as_view()),
    path('reports/export/', ExportReportView.as_view()),
    path('', include(router.urls)),
]
