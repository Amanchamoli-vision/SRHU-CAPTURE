"""SMTP email delivery for Campus Capture."""

from __future__ import annotations

from dataclasses import dataclass
from email.message import EmailMessage
import logging
import smtplib
import ssl

import httpx

from app.config import settings


logger = logging.getLogger(__name__)


class EmailDeliveryError(RuntimeError):
    """Raised when an email could not be delivered without exposing SMTP details."""

    def __init__(
        self,
        message: str,
        *,
        state: SMTPDeliveryState | None = None,
    ) -> None:
        super().__init__(message)
        self.state = state


@dataclass
class SMTPDeliveryState:
    """Safe, non-secret state for SMTP delivery and connectivity diagnostics."""

    port: int
    transport: str
    connection_succeeded: bool = False
    tls_succeeded: bool = False
    authentication_succeeded: bool = False
    send_message_succeeded: bool = False
    failure_stage: str | None = None
    exception_type: str | None = None
    smtp_response_code: int | None = None
    os_errno: int | None = None


def _smtp_transport(port: int) -> str:
    """Return the explicit SMTP transport required by the configured port."""
    if port == 587:
        return "starttls"
    if port == 465:
        return "implicit_tls"
    raise ValueError("SMTP_PORT must be 465 for implicit SSL/TLS or 587 for STARTTLS")


def _failure_stage(state: SMTPDeliveryState, exc: BaseException) -> str:
    if not state.connection_succeeded:
        # SMTP_SSL performs its TLS handshake while creating the connection.
        # An SSL-specific error at that point is therefore a TLS failure, not a
        # TCP reachability failure.
        if state.transport == "implicit_tls" and isinstance(exc, ssl.SSLError):
            return "tls"
        return "connection"
    if not state.tls_succeeded:
        return "tls"
    if not state.authentication_succeeded:
        return "authentication"
    return "send_message"


def _log_delivery_failure(exc: BaseException, state: SMTPDeliveryState) -> None:
    state.failure_stage = _failure_stage(state, exc)
    state.exception_type = type(exc).__name__
    state.smtp_response_code = getattr(exc, "smtp_code", None)
    state.os_errno = getattr(exc, "errno", None)
    logger.error(
        "smtp_delivery_failed stage=%s transport=%s connection_succeeded=%s "
        "tls_succeeded=%s authentication_succeeded=%s send_message_succeeded=%s "
        "type=%s smtp_code=%s os_errno=%s",
        state.failure_stage,
        state.transport,
        state.connection_succeeded,
        state.tls_succeeded,
        state.authentication_succeeded,
        state.send_message_succeeded,
        state.exception_type,
        state.smtp_response_code,
        state.os_errno,
    )


def _deliver_or_check(message: EmailMessage | None = None) -> SMTPDeliveryState:
    """Authenticate with SMTP and optionally deliver a prepared message.

    Passing ``None`` performs a connectivity, TLS, and authentication check only.
    It never sends an email.
    """
    port = settings.smtp_port
    transport = _smtp_transport(port)
    state = SMTPDeliveryState(port=port, transport=transport)
    tls_context = ssl.create_default_context()

    try:
        logger.info(
            "smtp_connection_started host=%s port=%s transport=%s",
            settings.smtp_host,
            port,
            transport,
        )

        if port == 465:
            smtp_client = smtplib.SMTP_SSL(
                settings.smtp_host,
                port,
                timeout=15,
                context=tls_context,
            )
        else:
            smtp_client = smtplib.SMTP(
                settings.smtp_host,
                port,
                timeout=15,
            )

        with smtp_client as smtp:
            state.connection_succeeded = True
            logger.info("smtp_connection_succeeded transport=%s", transport)
            smtp.ehlo()

            if port == 587:
                smtp.starttls(context=tls_context)
                smtp.ehlo()

            # SMTP_SSL completes the TLS handshake while it connects.
            state.tls_succeeded = True
            logger.info("smtp_tls_succeeded transport=%s", transport)

            smtp.login(
                str(settings.smtp_user),
                settings.smtp_password.get_secret_value(),
            )
            state.authentication_succeeded = True
            logger.info("smtp_authentication_succeeded")

            if message is None:
                logger.info("smtp_send_message_skipped reason=connectivity_diagnostic")
                return state

            smtp.send_message(message)
            state.send_message_succeeded = True
            logger.info("smtp_send_message_succeeded")
            return state
    except (OSError, smtplib.SMTPException) as exc:
        _log_delivery_failure(exc, state)
        raise EmailDeliveryError(
            "Unable to deliver email through SMTP",
            state=state,
        ) from exc


def check_smtp_connection() -> SMTPDeliveryState:
    """Test SMTP TCP, TLS, and authentication without sending an email."""
    return _deliver_or_check()


def _send_with_resend(
    to_email: str,
    subject: str,
    body: str,
    html_body: str | None,
) -> None:
    """Send an email through Resend's HTTPS API without logging sensitive data."""
    recipient_domain = to_email.rsplit("@", 1)[-1]
    logger.info("resend_delivery_started recipient_domain=%s", recipient_domain)
    payload = {
        "from": str(settings.resend_from_email),
        "to": [to_email],
        "subject": subject,
        "text": body,
    }
    if html_body is not None:
        payload["html"] = html_body

    try:
        response = httpx.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": (
                    f"Bearer {settings.resend_api_key.get_secret_value()}"
                ),
            },
            json=payload,
            timeout=15,
        )
    except httpx.HTTPError as exc:
        logger.error(
            "resend_delivery_failed type=%s http_status=%s",
            type(exc).__name__,
            None,
        )
        raise EmailDeliveryError("Unable to deliver email through Resend") from exc

    if not response.is_success:
        logger.error(
            "resend_delivery_failed type=http_response http_status=%s",
            response.status_code,
        )
        raise EmailDeliveryError("Unable to deliver email through Resend")

    logger.info("resend_delivery_succeeded http_status=%s", response.status_code)


def send_email(
    to_email: str,
    subject: str,
    body: str,
    html_body: str | None = None,
) -> None:
    """Send an email through the configured SMTP or HTTPS email provider."""
    if settings.email_provider == "resend":
        _send_with_resend(to_email, subject, body, html_body)
        return

    message = EmailMessage()
    message["From"] = str(settings.smtp_from_email)
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    if html_body:
        message.add_alternative(html_body, subtype="html")

    _deliver_or_check(message)
