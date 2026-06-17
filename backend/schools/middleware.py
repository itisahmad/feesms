"""Block dashboard API access when a school's subscription has expired."""
from django.http import JsonResponse

from payments.subscription_service import sync_school_subscription

EXEMPT_PATH_PREFIXES = (
    "/api/auth/",
    "/api/payments/platform/",
    "/api/payments/config/",
    "/api/schools/",
    "/api/maintenance/",
    "/api/booking/",
    "/admin/",
)


class SubscriptionEnforcementMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path
        if path.startswith("/api/") and not any(path.startswith(prefix) for prefix in EXEMPT_PATH_PREFIXES):
            user = getattr(request, "user", None)
            if user and user.is_authenticated and getattr(user, "role", None) != "parent":
                school = getattr(user, "school", None)
                if school:
                    school = sync_school_subscription(school)
                    if school.subscription_blocked:
                        return JsonResponse(
                            {
                                "error": (
                                    "Your subscription has expired. Pay online in Settings → Subscription "
                                    "to continue, or reduce students/staff to qualify for Basic."
                                ),
                                "subscription_blocked": True,
                                "code": "subscription_expired",
                            },
                            status=402,
                        )

        return self.get_response(request)
