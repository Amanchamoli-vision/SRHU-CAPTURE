"""SMTP email delivery for Campus Capture."""

from __future__ import annotations

from email.message import EmailMessage
import logging
import smtplib
import ssl

from app.config import settings


logger = logging.getLogger(__name__)


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
        logger.info("smtp_connection_started host=%s port=%s", settings.smtp_host, settings.smtp_port)
        with smtplib.SMTP(
            settings.smtp_host,
            settings.smtp_port,
            timeout=15,
        ) as smtp:
            smtp.ehlo()
            smtp.starttls(context=ssl.create_default_context())
            logger.info("smtp_starttls_succeeded")
            smtp.ehlo()
            smtp.login(
                str(settings.smtp_user),
                settings.smtp_password.get_secret_value(),
            )
            logger.info("smtp_authentication_succeeded")
            smtp.send_message(message)
            logger.info("smtp_send_message_succeeded")
    except (OSError, smtplib.SMTPException) as exc:
        logger.error(
            "smtp_delivery_failed type=%s smtp_code=%s os_errno=%s",
            type(exc).__name__,
            getattr(exc, "smtp_code", None),
            getattr(exc, "errno", None),
        )
        raise EmailDeliveryError("Unable to deliver email through SMTP") from exc
