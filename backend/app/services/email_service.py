"""SMTP email delivery for Campus Capture."""

from __future__ import annotations

from email.message import EmailMessage
import smtplib
import ssl

from app.config import settings


class EmailDeliveryError(RuntimeError):
    """Raised when an email could not be delivered without exposing SMTP details."""


def send_email(
    to_email: str,
    subject: str,
    body: str,
    html_body: str | None = None,
) -> None:
    """Send an email through the configured STARTTLS SMTP server."""
    message = EmailMessage()
    message["From"] = str(settings.smtp_from_email)
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    if html_body:
        message.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(
            settings.smtp_host,
            settings.smtp_port,
            timeout=15,
        ) as smtp:
            smtp.ehlo()
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
            smtp.login(
                str(settings.smtp_user),
                settings.smtp_password.get_secret_value(),
            )
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        raise EmailDeliveryError("Unable to deliver email through SMTP") from exc
