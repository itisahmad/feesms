"""Custom querysets and managers."""
from django.db import models
from django.db.models import DecimalField, OuterRef, Subquery, Sum, Value
from django.db.models.functions import Coalesce


class SchoolScopedQuerySet(models.QuerySet):
    def for_school(self, school):
        if school is None:
            return self.none()
        return self.filter(school=school)


class StudentFeeQuerySet(models.QuerySet):
    def for_school(self, school):
        if school is None:
            return self.none()
        return self.filter(student__school=school)

    def with_payment_totals(self):
        paid_sub = (
            self.model.payments.rel.related_model.objects.filter(student_fee_id=OuterRef("pk"))
            .values("student_fee_id")
            .annotate(total=Sum("amount"))
            .values("total")
        )
        return self.annotate(
            paid_total=Coalesce(Subquery(paid_sub[:1]), Value(0), output_field=DecimalField()),
        )

    def up_to_month(self, month: int, year: int):
        return self.filter(models.Q(year__lt=year) | models.Q(year=year, month__lte=month))
