from django.db import models

from .templates_registry import DEFAULT_TEMPLATE_KEY


class SchoolReceiptSettings(models.Model):
    """Per-school receipt template and branding overrides."""

    PRINT_A4 = 'a4'
    PRINT_THERMAL = 'thermal'
    PRINT_FORMAT_CHOICES = [
        (PRINT_A4, 'A4'),
        (PRINT_THERMAL, 'Thermal (80mm)'),
    ]

    school = models.OneToOneField(
        'schools.School',
        on_delete=models.CASCADE,
        related_name='receipt_settings',
    )
    template_key = models.CharField(max_length=50, default=DEFAULT_TEMPLATE_KEY)
    print_format = models.CharField(
        max_length=20,
        choices=PRINT_FORMAT_CHOICES,
        default=PRINT_A4,
    )
    school_name = models.CharField(max_length=200, blank=True)
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    header_color = models.CharField(max_length=7, default='#0d9488')
    footer_text = models.TextField(
        blank=True,
        default='This is a computer-generated receipt.',
    )
    signature_label = models.CharField(
        max_length=120,
        blank=True,
        default='Authorized Signatory',
    )
    stamp_text = models.CharField(max_length=120, blank=True)
    show_logo = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'School receipt settings'
        verbose_name_plural = 'School receipt settings'

    def __str__(self):
        return f'Receipt settings — {self.school.name}'
