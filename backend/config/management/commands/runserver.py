from django.conf import settings
from django.core.management.commands.runserver import Command as RunserverCommand


class Command(RunserverCommand):
    def handle(self, *args, **options):
        db = settings.DATABASES["default"]
        engine = db.get("ENGINE", "").rsplit(".", maxsplit=1)[-1]
        name = db.get("NAME") or "(unset)"
        host = db.get("HOST") or "localhost"
        port = db.get("PORT") or ""
        db_port = f":{port}" if port else ""
        self.stdout.write("")
        self.stdout.write(
            self.style.NOTICE(
                f"Database: {engine} — {name} @ {host}{db_port}"
            )
        )
        self.stdout.write("")
        super().handle(*args, **options)
