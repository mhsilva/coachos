from upstash_redis import Redis
from app.config import settings

_client: Redis | None = None


def get_redis() -> Redis:
    """Return a singleton Upstash Redis client (REST, HTTPS)."""
    global _client
    if _client is None:
        if not settings.upstash_redis_rest_url or not settings.upstash_redis_rest_token:
            raise RuntimeError(
                "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN não configurados"
            )
        _client = Redis(
            url=settings.upstash_redis_rest_url,
            token=settings.upstash_redis_rest_token,
        )
    return _client
