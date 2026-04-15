"""Redis-backed ephemeral store for the coach-assistant chat.

Key:   `coach_assistant:{coach_id}:{student_id}`
Value: JSON `{"messages": [{"role": ..., "content": ..., "at": ...}]}`
TTL:   24h, renewed on every write.

Intentionally stateless (no DB row): these conversations are a helper
tool for the coach, not a clinical record. Flushing Redis resets them.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from app.services.redis_client import get_redis

TTL_SECONDS = 60 * 60 * 24  # 24h


def _key(coach_id: str, student_id: str) -> str:
    return f"coach_assistant:{coach_id}:{student_id}"


def get_messages(coach_id: str, student_id: str) -> list[dict]:
    r = get_redis()
    raw = r.get(_key(coach_id, student_id))
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return data.get("messages", [])
    except (ValueError, TypeError):
        return []


def set_messages(coach_id: str, student_id: str, messages: list[dict]) -> None:
    r = get_redis()
    payload = json.dumps({"messages": messages}, ensure_ascii=False)
    r.set(_key(coach_id, student_id), payload, ex=TTL_SECONDS)


def append_message(
    coach_id: str,
    student_id: str,
    role: str,
    content: str,
) -> list[dict]:
    """Append and return the updated list."""
    messages = get_messages(coach_id, student_id)
    messages.append({
        "role": role,
        "content": content,
        "at": datetime.now(timezone.utc).isoformat(),
    })
    set_messages(coach_id, student_id, messages)
    return messages


def reset(coach_id: str, student_id: str) -> None:
    r = get_redis()
    r.delete(_key(coach_id, student_id))
