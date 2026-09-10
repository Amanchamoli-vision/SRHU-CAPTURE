from __future__ import annotations

from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

from app.config import Settings
from app.services import email_service


class EmailServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = SimpleNamespace(
            smtp_host="smtp.example.test",
            smtp_port=587,
            smtp_user="sender@example.test",
            smtp_password=SimpleNamespace(get_secret_value=lambda: "app-password"),
            smtp_from_email="sender@example.test",
        )

    def _smtp_client(self) -> MagicMock:
        client = MagicMock()
        client.__enter__.return_value = client
        client.__exit__.return_value = False
        return client

    @patch("app.services.email_service.settings")
    @patch("app.services.email_service.smtplib.SMTP_SSL")
    @patch("app.services.email_service.smtplib.SMTP")
    def test_port_587_uses_starttls(
        self,
        smtp: MagicMock,
        smtp_ssl: MagicMock,
        settings: MagicMock,
    ) -> None:
        client = self._smtp_client()
        smtp.return_value = client
        settings.smtp_host = self.settings.smtp_host
        settings.smtp_port = 587
        settings.smtp_user = self.settings.smtp_user
        settings.smtp_password = self.settings.smtp_password
        settings.smtp_from_email = self.settings.smtp_from_email

        email_service.send_email("recipient@example.test", "Subject", "Text")

        smtp.assert_called_once_with("smtp.example.test", 587, timeout=15)
        smtp_ssl.assert_not_called()
        client.starttls.assert_called_once()
        client.login.assert_called_once_with("sender@example.test", "app-password")
        client.send_message.assert_called_once()

    @patch("app.services.email_service.settings")
    @patch("app.services.email_service.smtplib.SMTP_SSL")
    @patch("app.services.email_service.smtplib.SMTP")
    def test_port_465_uses_implicit_tls(
        self,
        smtp: MagicMock,
        smtp_ssl: MagicMock,
        settings: MagicMock,
    ) -> None:
        client = self._smtp_client()
        smtp_ssl.return_value = client
        settings.smtp_host = self.settings.smtp_host
        settings.smtp_port = 465
        settings.smtp_user = self.settings.smtp_user
        settings.smtp_password = self.settings.smtp_password
        settings.smtp_from_email = self.settings.smtp_from_email

        email_service.send_email("recipient@example.test", "Subject", "Text")

        smtp.assert_not_called()
        smtp_ssl.assert_called_once()
        client.starttls.assert_not_called()
        client.login.assert_called_once_with("sender@example.test", "app-password")
        client.send_message.assert_called_once()

    @patch("app.services.email_service.settings")
    @patch("app.services.email_service.smtplib.SMTP")
    def test_diagnostic_authenticates_without_sending(
        self,
        smtp: MagicMock,
        settings: MagicMock,
    ) -> None:
        client = self._smtp_client()
        smtp.return_value = client
        settings.smtp_host = self.settings.smtp_host
        settings.smtp_port = 587
        settings.smtp_user = self.settings.smtp_user
        settings.smtp_password = self.settings.smtp_password

        state = email_service.check_smtp_connection()

        self.assertTrue(state.connection_succeeded)
        self.assertTrue(state.tls_succeeded)
        self.assertTrue(state.authentication_succeeded)
        self.assertFalse(state.send_message_succeeded)
        client.send_message.assert_not_called()

    def test_settings_rejects_unsupported_smtp_port(self) -> None:
        with self.assertRaisesRegex(ValueError, "SMTP_PORT must be 465"):
            Settings(
                supabase_url="https://project.supabase.co",
                supabase_service_role_key="service-role-key",
                smtp_host="smtp.example.test",
                smtp_port=2525,
                smtp_user="sender@example.com",
                smtp_password="app-password",
                smtp_from_email="sender@example.com",
                frontend_url="https://frontend.example.test",
            )


if __name__ == "__main__":
    unittest.main()
