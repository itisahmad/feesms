"""Public payment URLs for invoices (platform billing)."""
import os


def generate_payment_link(invoice_id: int) -> str:
    """
    Return https://<public-app>/pay/<invoice_id>

    Uses PUBLIC_PAYMENT_BASE_URL or FRONTEND_URL / NEXT_PUBLIC_APP_URL (first non-empty).
    """
    base = (
        (os.getenv("PUBLIC_PAYMENT_BASE_URL") or "").strip()
        or (os.getenv("FRONTEND_URL") or "").strip()
        or (os.getenv("NEXT_PUBLIC_APP_URL") or "").strip()
        or "http://localhost:3000"
    ).rstrip("/")
    return f"{base}/pay/{int(invoice_id)}"
