from supabase import create_client, Client, ClientOptions
import httpx

from app.config import settings

http_client = httpx.Client(timeout=30.0)

supabase: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key,
    options=ClientOptions(httpx_client=http_client)
)

# Separate anon-key client for user-facing auth. Signup must not be a service-role
# request: Supabase Auth only sends its confirmation email for an ordinary signup.
# This gets its own httpx client because the SDK closes the one it is handed.
#
# Stays None when SUPABASE_ANON_KEY is unset, so the service starts and serves every
# other route. /auth/register checks for None and reports 503.
supabase_public: Client | None = None

if settings.supabase_anon_key:
    auth_http_client = httpx.Client(timeout=30.0)
    supabase_public = create_client(
        settings.supabase_url,
        settings.supabase_anon_key,
        options=ClientOptions(httpx_client=auth_http_client)
    )
