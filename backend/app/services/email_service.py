"""Outbound email over SMTP.

Every message the application sends goes through ``send_email``. The templates
below are plain functions so they are easy to test and to adjust.
"""

from __future__ import annotations

import logging
import smtplib
import ssl
import time
from email.message import EmailMessage
from email.utils import formataddr
from html import escape

from app.config import settings


logger = logging.getLogger(__name__)


class EmailDeliveryError(RuntimeError):
    """Raised when an email could not be handed to the SMTP server."""


def is_configured() -> bool:
    return settings.smtp_configured


def _clean_header(value: str) -> str:
    """Collapse CR/LF (and other line breaks) that would make a header invalid.

    Subjects include user-controlled text such as an event name; the email
    package refuses a header containing a newline.
    """
    return " ".join(str(value).split()) if value else ""


def _build_message(to_email: str, subject: str, text: str, html: str | None) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = _clean_header(subject)
    message["From"] = formataddr((settings.smtp_from_name, settings.smtp_from_email))
    message["To"] = to_email
    message.set_content(text)
    if html:
        message.add_alternative(html, subtype="html")
    return message


# Failures worth a second attempt: dropped connections, timeouts and 4xx
# "try again later" replies. Bad credentials or a rejected recipient will fail
# the same way twice, so those are reported straight away.
_PERMANENT_ERRORS = (smtplib.SMTPAuthenticationError, smtplib.SMTPRecipientsRefused)
_TRANSIENT_ERRORS = (OSError, smtplib.SMTPException)
SEND_ATTEMPTS = 2
RETRY_DELAY_SECONDS = 2


def send_email(to_email: str, subject: str, text: str, html: str | None = None) -> None:
    """Deliver one message. Raises ``EmailDeliveryError`` on any failure."""
    if not is_configured():
        raise EmailDeliveryError(
            "SMTP is not configured: missing " + ", ".join(settings.smtp_missing_variables)
        )

    # Inside the error handling so a malformed header surfaces as the usual
    # EmailDeliveryError (which background callers catch and log) instead of an
    # uncaught exception that silently kills the background task.
    try:
        message = _build_message(to_email, subject, text, html)
    except (ValueError, TypeError) as error:
        _log_failure(to_email, error, 0)
        raise EmailDeliveryError(f"Could not build the message: {error}") from error
    subject = message["Subject"]
    started = time.perf_counter()

    for attempt in range(1, SEND_ATTEMPTS + 1):
        try:
            _deliver(message)
            break
        except _PERMANENT_ERRORS as error:
            _log_failure(to_email, error, attempt)
            raise EmailDeliveryError(str(error)) from error
        except _TRANSIENT_ERRORS as error:
            _log_failure(to_email, error, attempt)
            if attempt == SEND_ATTEMPTS:
                raise EmailDeliveryError(str(error)) from error
            time.sleep(RETRY_DELAY_SECONDS)

    logger.info(
        "email_sent recipient_domain=%s subject=%s elapsed_ms=%d",
        to_email.rsplit("@", 1)[-1],
        subject,
        (time.perf_counter() - started) * 1000,
    )


def _log_failure(to_email: str, error: Exception, attempt: int) -> None:
    logger.error(
        "email_send_failed recipient_domain=%s error_type=%s attempt=%d/%d detail=%s",
        to_email.rsplit("@", 1)[-1],
        type(error).__name__,
        attempt,
        SEND_ATTEMPTS,
        str(error)[:200],
    )


def _deliver(message: EmailMessage) -> None:
    """One SMTP session: connect, secure, authenticate, send."""
    context = ssl.create_default_context()
    if settings.smtp_use_ssl:
        client = smtplib.SMTP_SSL(
            settings.smtp_host,
            settings.smtp_port,
            timeout=settings.smtp_timeout_seconds,
            context=context,
        )
    else:
        client = smtplib.SMTP(
            settings.smtp_host,
            settings.smtp_port,
            timeout=settings.smtp_timeout_seconds,
        )

    with client as smtp:
        smtp.ehlo()
        if settings.smtp_use_tls and not settings.smtp_use_ssl:
            smtp.starttls(context=context)
            smtp.ehlo()
        if settings.smtp_user and settings.smtp_password:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)


def send_email_safely(to_email: str, subject: str, text: str, html: str | None = None) -> bool:
    """Best-effort delivery for notifications that must never block a request."""
    try:
        send_email(to_email, subject, text, html)
        return True
    except EmailDeliveryError:
        return False


# ======================================================================
# Templates
# ======================================================================

def _layout(title: str, body_html: str) -> str:
    return (
        "<!DOCTYPE html><html><body style=\"margin:0;padding:24px;background:#f3f5f9;"
        "font-family:Segoe UI,Arial,sans-serif;color:#0f172a;\">"
        "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\"><tr><td align=\"center\">"
        "<table role=\"presentation\" width=\"560\" cellspacing=\"0\" cellpadding=\"0\" "
        "style=\"max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;\">"
        "<tr><td style=\"background:#101e40;padding:20px 28px;color:#ffffff;\">"
        "<div style=\"font-size:18px;font-weight:700;\">Campus Capture</div>"
        "<div style=\"font-size:12px;opacity:.8;\">Swami Rama Himalayan University</div>"
        "</td></tr>"
        "<tr><td style=\"padding:28px;\">"
        f"<h1 style=\"margin:0 0 16px;font-size:20px;\">{escape(title)}</h1>"
        f"{body_html}"
        "</td></tr>"
        "<tr><td style=\"padding:16px 28px;background:#f8fafc;font-size:12px;color:#64748b;\">"
        "This message was sent automatically by Campus Capture SRHU."
        "</td></tr></table></td></tr></table></body></html>"
    )


def _button(url: str, label: str) -> str:
    return (
        f"<p style=\"margin:24px 0;\"><a href=\"{escape(url, quote=True)}\" "
        "style=\"display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;"
        "padding:12px 22px;border-radius:10px;font-weight:600;\">"
        f"{escape(label)}</a></p>"
    )


def _link_fallback(url: str, note: str) -> str:
    return (
        f"<p style=\"font-size:13px;color:#64748b;\">{escape(note)} "
        "If the button does not work, copy this address into your browser:<br>"
        f"<a href=\"{escape(url, quote=True)}\">{escape(url)}</a></p>"
    )


def send_verification_email(to_email: str, name: str, token: str) -> None:
    url = settings.email_verification_url(token)
    hours = settings.email_verification_expire_hours
    subject = "Confirm your Campus Capture account"
    text = (
        f"Hello {name},\n\n"
        "Thank you for registering with Campus Capture SRHU.\n"
        f"Please confirm your email address by opening this link:\n\n{url}\n\n"
        f"The link is valid for {hours} hours. If you did not create this account, "
        "you can ignore this email.\n"
    )
    html = _layout(
        "Confirm your email address",
        f"<p>Hello {escape(name)},</p>"
        "<p>Thank you for registering with Campus Capture SRHU. "
        "Please confirm your email address to activate your account.</p>"
        + _button(url, "Confirm email")
        + _link_fallback(url, f"The link is valid for {hours} hours."),
    )
    send_email(to_email, subject, text, html)


def send_password_reset_email(to_email: str, name: str, token: str) -> None:
    url = settings.password_reset_url(token)
    minutes = settings.password_reset_expire_minutes
    subject = "Reset your Campus Capture password"
    text = (
        f"Hello {name},\n\n"
        "We received a request to reset the password for your Campus Capture account.\n"
        f"Open this link to choose a new password:\n\n{url}\n\n"
        f"The link is valid for {minutes} minutes. If you did not request a reset, "
        "you can ignore this email and your password will stay the same.\n"
    )
    html = _layout(
        "Reset your password",
        f"<p>Hello {escape(name)},</p>"
        "<p>We received a request to reset the password for your Campus Capture account.</p>"
        + _button(url, "Choose a new password")
        + _link_fallback(
            url,
            f"The link is valid for {minutes} minutes. If you did not request a reset, ignore this email.",
        ),
    )
    send_email(to_email, subject, text, html)


def send_registration_attempt_email(to_email: str, name: str) -> None:
    """Tell a verified account holder that someone tried to register their address.

    /auth/register answers exactly as for a new account, so the attempt cannot
    be used to discover who has an account; the real owner learns of it here.
    """
    login_url = settings.login_url
    reset_url = settings.frontend_route("/forgot-password")
    subject = "Someone tried to register with your email"
    text = (
        f"Hello {name},\n\n"
        "Someone just tried to create a new Campus Capture account with this email "
        "address, but you already have one.\n\n"
        f"If it was you, sign in here: {login_url}\n"
        f"Forgot your password? Reset it here: {reset_url}\n\n"
        "If it wasn't you, you can ignore this email. Your account has not changed.\n"
    )
    html = _layout(
        "You already have an account",
        f"<p>Hello {escape(name)},</p>"
        "<p>Someone just tried to create a new Campus Capture account with this email "
        "address, but you already have one.</p>"
        + _button(login_url, "Sign in")
        + "<p style=\"font-size:13px;color:#64748b;\">Forgot your password? "
        f"<a href=\"{escape(reset_url, quote=True)}\">Reset it here</a>. "
        "If it wasn't you, you can ignore this email. Your account has not changed.</p>",
    )
    send_email(to_email, subject, text, html)


def send_dean_credentials_email(to_email: str, name: str, temporary_password: str) -> None:
    url = settings.login_url
    subject = "Your Campus Capture Dean account"
    text = (
        f"Hello {name},\n\n"
        "A Dean account has been created for you on Campus Capture SRHU.\n\n"
        f"Email: {to_email}\n"
        f"Temporary password: {temporary_password}\n\n"
        f"Sign in here: {url}\n\n"
        "Please change your password after your first login.\n"
    )
    html = _layout(
        "Your Dean account is ready",
        f"<p>Hello {escape(name)},</p>"
        "<p>A Dean account has been created for you on Campus Capture SRHU.</p>"
        "<table style=\"font-size:14px;border-collapse:collapse;\">"
        f"<tr><td style=\"padding:4px 12px 4px 0;color:#64748b;\">Email</td><td>{escape(to_email)}</td></tr>"
        "<tr><td style=\"padding:4px 12px 4px 0;color:#64748b;\">Temporary password</td>"
        f"<td><code style=\"background:#f1f5f9;padding:2px 6px;border-radius:6px;\">{escape(temporary_password)}</code></td></tr>"
        "</table>"
        + _button(url, "Sign in")
        + "<p style=\"font-size:13px;color:#64748b;\">Please change your password after your first login.</p>",
    )
    send_email(to_email, subject, text, html)


def send_event_status_email(
    to_email: str,
    name: str,
    event_name: str,
    status: str,
    remarks: str | None = None,
    *,
    event_id: str | None = None,
    stage: str | None = None,
) -> None:
    labels = {
        "approved": ("Event approved", "has been approved by the Dean."),
        "rejected": ("Event rejected", "was rejected by the Dean."),
        "needs_changes": ("Event needs changes", "needs changes before it can be approved."),
    }
    stage_labels = {
        "in_progress": ("Event in progress", "has been marked in progress by the Dean."),
        "completed": ("Event completed", "has been marked completed by the Dean."),
        "approved": ("Event status updated", "has been moved back to approved by the Dean."),
    }
    if status == "progress":
        heading, sentence = stage_labels.get(stage or "", ("Event update", "has been updated."))
    else:
        heading, sentence = labels.get(status, ("Event update", "has been updated."))

    # Straight to the event, where the teacher also finds its full history and
    # every remark the Dean has made — not the list they would have to search.
    url = settings.frontend_route(
        f"/teacher/events/{event_id}" if event_id else "/teacher/my-events"
    )

    remark_text = f"\nRemarks from the Dean:\n{remarks}\n" if remarks else ""
    text = (
        f"Hello {name},\n\n"
        f"Your event \"{event_name}\" {sentence}\n"
        f"{remark_text}\n"
        f"{'View the event' if event_id else 'View your events'}: {url}\n"
    )
    remark_html = (
        "<p style=\"padding:12px;background:#fff7ed;border-radius:10px;\">"
        f"<strong>Remarks from the Dean:</strong><br>{escape(remarks)}</p>"
        if remarks
        else ""
    )
    html = _layout(
        heading,
        f"<p>Hello {escape(name)},</p>"
        f"<p>Your event <strong>{escape(event_name)}</strong> {escape(sentence)}</p>"
        + remark_html
        + _button(url, "View this event" if event_id else "View my events"),
    )
    send_email(to_email, f"{heading}: {event_name}", text, html)
