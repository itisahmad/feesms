"""
Send automated SMS/WhatsApp fee reminders on each school's fee_start_day.

Schedule with cron (server timezone should match schools, e.g. Asia/Kolkata):

    0 8 * * * cd /path/to/backend && ./venv/bin/python manage.py send_fee_start_reminders

Options:
    --date YYYY-MM-DD   Use this calendar date instead of today (dry runs / backfill).
    --force             Send even if a run already logged for that school+date.
    --school-id ID      Limit to one school.

Requires owner-enabled SMS and/or WhatsApp in School Messaging Settings.
"""
from datetime import date

from django.core.management.base import BaseCommand
from django.utils import timezone

from schools.services.fee_start_reminders import run_fee_start_reminders_for_date


class Command(BaseCommand):
    help = "Send fee reminders for schools whose fee_start_day matches today's day of month."

    def add_arguments(self, parser):
        parser.add_argument(
            "--date",
            type=str,
            default=None,
            help="Run as if this calendar date (YYYY-MM-DD). Default: today in the active Django timezone.",
        )
        parser.add_argument("--force", action="store_true", help="Ignore same-day deduplication log.")
        parser.add_argument("--school-id", type=int, default=None, help="Only process this school id.")

    def handle(self, *args, **options):
        raw = options.get("date")
        if raw:
            try:
                run_date = date.fromisoformat(str(raw).strip())
            except ValueError:
                self.stderr.write(self.style.ERROR("Invalid --date; use YYYY-MM-DD"))
                return
        else:
            run_date = timezone.localdate()

        force = bool(options.get("force"))
        school_id = options.get("school_id")

        self.stdout.write(f"Fee start reminders for {run_date} (force={force}, school_id={school_id})")
        summary = run_fee_start_reminders_for_date(run_date, force=force, school_id=school_id)
        self.stdout.write(str(summary))
        self.stdout.write(self.style.SUCCESS("Done."))
