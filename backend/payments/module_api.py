"""APIView mixin enforcing schools.module_permissions."""
from rest_framework.views import APIView

from schools.module_permissions import assert_module_permission


def permission_for_http_method(method: str) -> str:
    if method in ("GET", "HEAD", "OPTIONS"):
        return "view"
    if method == "POST":
        return "actions"
    if method in ("PUT", "PATCH"):
        return "edit"
    if method == "DELETE":
        return "delete"
    return "view"


class ModuleProtectedAPIView(APIView):
    module_key: str | None = None

    def dispatch(self, request, *args, **kwargs):
        if self.module_key and request.user and request.user.is_authenticated:
            assert_module_permission(request.user, self.module_key, permission_for_http_method(request.method))
        return super().dispatch(request, *args, **kwargs)
