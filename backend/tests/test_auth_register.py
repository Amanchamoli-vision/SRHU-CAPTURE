from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


class RegisterEndpointTests(unittest.TestCase):
    """Registration must delegate email delivery to Supabase Auth.

    Nothing here may open an SMTP connection: the confirmation email is sent by
    Supabase, which is what lets the service run on hosts that block outbound SMTP.
    """

    def setUp(self) -> None:
        self.client = TestClient(app)
        self.payload = {
            "name": " Asha Rana ",
            "email": "Asha@Example.COM",
            "password": "secret1",
        }

    @patch("app.routers.auth.supabase_public")
    def test_signup_receives_normalized_email_and_redirect(
        self,
        supabase_public: MagicMock,
    ) -> None:
        response = self.client.post("/auth/register", json=self.payload)

        self.assertEqual(response.status_code, 201)
        credentials = supabase_public.auth.sign_up.call_args[0][0]
        self.assertEqual(credentials["email"], "asha@example.com")
        self.assertEqual(credentials["password"], "secret1")
        self.assertEqual(
            credentials["options"]["email_redirect_to"],
            settings.signup_confirmation_redirect_url,
        )
        self.assertEqual(credentials["options"]["data"], {"name": "Asha Rana"})

    @patch("app.routers.auth.supabase_public")
    def test_signup_failure_returns_400_without_provider_detail(
        self,
        supabase_public: MagicMock,
    ) -> None:
        supabase_public.auth.sign_up.side_effect = Exception(
            "AuthApiError: password is too weak"
        )

        response = self.client.post("/auth/register", json=self.payload)

        self.assertEqual(response.status_code, 400)
        self.assertNotIn("AuthApiError", response.text)
        self.assertNotIn("too weak", response.text)

    def test_blank_name_is_rejected_before_signup(self) -> None:
        with patch("app.routers.auth.supabase_public") as supabase_public:
            response = self.client.post(
                "/auth/register",
                json={**self.payload, "name": "   "},
            )

            self.assertEqual(response.status_code, 422)
            supabase_public.auth.sign_up.assert_not_called()


if __name__ == "__main__":
    unittest.main()
