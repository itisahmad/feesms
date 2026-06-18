from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from .auth_utils import resolve_user_for_login
from .default_fee_types import ensure_default_fee_types_for_school


class SchoolTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Owners: email + password only."""

    login = serializers.CharField()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields.pop(self.username_field, None)

    @classmethod
    def get_token(cls, user):
        ensure_default_fee_types_for_school(getattr(user, "school", None))
        return super().get_token(user)

    def validate(self, attrs):
        login = attrs.pop("login", "").strip()
        password = attrs.get("password", "")
        user, err = resolve_user_for_login(login, password)
        if err:
            raise AuthenticationFailed(err, code="authorization")
        refresh = self.get_token(user)
        data = {"refresh": str(refresh), "access": str(refresh.access_token)}
        data["role"] = user.role
        return data


class SchoolTokenObtainPairView(TokenObtainPairView):
    serializer_class = SchoolTokenObtainPairSerializer
