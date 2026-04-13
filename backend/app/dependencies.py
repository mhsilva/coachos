import time
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.supabase_client import get_supabase

bearer = HTTPBearer()

# ─────────────────────────────────────────────
# Token → user dict cache
# ─────────────────────────────────────────────
# sb.auth.get_user(token) is a network round-trip to Supabase Auth. We cache
# the validated user for a short TTL to avoid paying that latency on every
# request. Tradeoff: a revoked token stays valid for up to _TOKEN_TTL_SECONDS.
_TOKEN_TTL_SECONDS = 120  # 2 min
_CACHE_MAX_ENTRIES = 1000
_token_cache: dict[str, tuple[float, dict]] = {}


def _get_cached_user(token: str) -> dict | None:
    entry = _token_cache.get(token)
    if entry is None:
        return None
    expires_at, user = entry
    if time.time() > expires_at:
        _token_cache.pop(token, None)
        return None
    return user


def _cache_user(token: str, user: dict) -> None:
    # Lazy eviction of expired entries when cache grows
    if len(_token_cache) >= _CACHE_MAX_ENTRIES:
        now = time.time()
        for k in [k for k, (exp, _) in _token_cache.items() if exp < now]:
            _token_cache.pop(k, None)
        # If still full after evicting expired, drop the oldest
        if len(_token_cache) >= _CACHE_MAX_ENTRIES:
            oldest_key = min(_token_cache.items(), key=lambda kv: kv[1][0])[0]
            _token_cache.pop(oldest_key, None)
    _token_cache[token] = (time.time() + _TOKEN_TTL_SECONDS, user)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> dict:
    """Validate token via Supabase Auth API and return the user object.

    Uses supabase.auth.get_user() because newer Supabase projects sign tokens
    with ES256 (asymmetric), not HS256 — decoding locally would require JWKS
    fetching. Validated results are cached for 2 min to cut the RTT.
    """
    token = credentials.credentials
    cached = _get_cached_user(token)
    if cached is not None:
        return cached

    try:
        sb = get_supabase()
        response = sb.auth.get_user(token)
        if not response or not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido ou expirado",
            )
        user = response.user
        app_metadata = user.app_metadata or {}

        # Resolve role: prefer app_metadata, fallback to profiles table
        if not app_metadata.get("role"):
            profile = (
                sb.table("profiles")
                .select("role")
                .eq("id", str(user.id))
                .execute()
            )
            if profile.data:
                app_metadata = {**app_metadata, "role": profile.data[0]["role"]}

        user_dict = {
            "sub": str(user.id),
            "email": user.email,
            "app_metadata": app_metadata,
            "user_metadata": user.user_metadata or {},
        }
        _cache_user(token, user_dict)
        return user_dict
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
        )


def require_role(*roles: str):
    """Dependency factory that enforces one of the given roles."""

    async def checker(user: dict = Depends(get_current_user)) -> dict:
        app_meta: dict = user.get("app_metadata") or {}
        user_role: str | None = app_meta.get("role")
        if user_role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permissão insuficiente",
            )
        return user

    return checker
