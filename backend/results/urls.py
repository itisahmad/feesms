from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import ExamResultViewSet, SchoolGradingSettingsView, StudentPublishedResultsView

router = DefaultRouter()
router.register(r'exams', ExamResultViewSet, basename='examresult')

urlpatterns = [
    path('grading-settings/', SchoolGradingSettingsView.as_view(), name='grading-settings'),
    path('students/<int:student_id>/published/', StudentPublishedResultsView.as_view(), name='student-published-results'),
    path('', include(router.urls)),
]
