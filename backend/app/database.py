from supabase import create_client, Client, ClientOptions
import httpx

from app.config import settings

http_client = httpx.Client(timeout=30.0)

supabase: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key,
    options=ClientOptions(httpx_client=http_client)
)