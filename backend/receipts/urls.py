from django.urls import path

from .views import (
    ReceiptGenerateView,
    ReceiptPreviewView,
    ReceiptTemplateListView,
    SchoolReceiptSettingsView,
)

urlpatterns = [
    path('templates/', ReceiptTemplateListView.as_view(), name='receipt-templates'),
    path('settings/', SchoolReceiptSettingsView.as_view(), name='receipt-settings'),
    path('preview/', ReceiptPreviewView.as_view(), name='receipt-preview'),
    path('generate/', ReceiptGenerateView.as_view(), name='receipt-generate'),
]
