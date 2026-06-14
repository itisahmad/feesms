from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("payments", "0002_fee_collection_checkout_session"),
    ]

    operations = [
        migrations.AddField(
            model_name="schoolpaymentconfig",
            name="allow_parent_online_payment",
            field=models.BooleanField(
                default=False,
                help_text="When enabled, parents can pay pending fees online via Razorpay in the parent portal.",
            ),
        ),
    ]
