from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from .default_fee_types import ensure_default_fee_types_for_school


class SchoolTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        ensure_default_fee_types_for_school(getattr(user, "school", None))
        return super().get_token(user)


class SchoolTokenObtainPairView(TokenObtainPairView):
    serializer_class = SchoolTokenObtainPairSerializer
