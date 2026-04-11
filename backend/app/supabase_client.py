from supabase import create_client, Client
from app.config import settings

_client: Client | None = None


def get_supabase() -> Client:
    """Return a singleton Supabase client using the service role key.

    The service role key bypasses RLS — use only on the backend, never expose it.
    """
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _client
