from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.supabase_client import get_supabase

bearer = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> dict:
    """Validate token via Supabase Auth API and return the user object.

    Uses supabase.auth.get_user() instead of local JWT decoding because
    newer Supabase projects sign tokens with ES256 (asymmetric), not HS256.
    """
    token = credentials.credentials
    try:
        sb = get_supabase()
        response = sb.auth.get_user(token)
        if not response or not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido ou expirado",
            )
        user = response.user
        # Normalise to a dict shape the rest of the app expects
        return {
            "sub": str(user.id),
            "email": user.email,
            "app_metadata": user.app_metadata or {},
            "user_metadata": user.user_metadata or {},
        }
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
