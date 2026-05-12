from django.urls import path

from .views import (
    FeeCollectionCreateOrderView,
    FeeCollectionVerifyView,
    PaymentConfigView,
    PlatformBillingSummaryView,
    PlatformCreateOrderView,
    PlatformVerifyPaymentView,
    ParentCreateIntentView,
    ParentVerifyPaymentView,
)


urlpatterns = [
    path("config/", PaymentConfigView.as_view()),
    path("platform/summary/", PlatformBillingSummaryView.as_view()),
    path("platform/create-order/", PlatformCreateOrderView.as_view()),
    path("platform/verify/", PlatformVerifyPaymentView.as_view()),
    path("parent/create-intent/", ParentCreateIntentView.as_view()),
    path("parent/verify/", ParentVerifyPaymentView.as_view()),
    path("fee-collection/create-order/", FeeCollectionCreateOrderView.as_view()),
    path("fee-collection/verify/", FeeCollectionVerifyView.as_view()),
]
