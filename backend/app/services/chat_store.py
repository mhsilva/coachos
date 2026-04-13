"""Redis-backed in-flight chat storage.

Keys:
  - `agent_prompt:{agent_id}` — cached system prompt (24h TTL)
  - `chat:{chat_id}`          — JSON {"messages":[{role,content,at}]} (24h TTL, renewed on write)

When a chat closes we DEL the `chat:{id}` key; the transcript lives in Supabase Storage.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from app.services.redis_client import get_redis

CHAT_TTL_SECONDS = 60 * 60 * 24  # 24h
PROMPT_TTL_SECONDS = 60 * 60 * 24  # 24h


def _chat_key(chat_id: str) -> str:
    return f"chat:{chat_id}"


def _prompt_key(agent_id: str) -> str:
    return f"agent_prompt:{agent_id}"


def get_cached_system_prompt(agent_id: str) -> str | None:
    r = get_redis()
    return r.get(_prompt_key(agent_id))


def cache_system_prompt(agent_id: str, prompt: str) -> None:
    r = get_redis()
    r.set(_prompt_key(agent_id), prompt, ex=PROMPT_TTL_SECONDS)


def get_messages(chat_id: str) -> list[dict]:
    r = get_redis()
    raw = r.get(_chat_key(chat_id))
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return data.get("messages", [])
    except (ValueError, TypeError):
        return []


def set_messages(chat_id: str, messages: list[dict]) -> None:
    r = get_redis()
    payload = json.dumps({"messages": messages}, ensure_ascii=False)
    r.set(_chat_key(chat_id), payload, ex=CHAT_TTL_SECONDS)


def append_message(chat_id: str, role: str, content: str) -> list[dict]:
    """Append a message and return the new messages list."""
    messages = get_messages(chat_id)
    messages.append({
        "role": role,
        "content": content,
        "at": datetime.now(timezone.utc).isoformat(),
    })
    set_messages(chat_id, messages)
    return messages


def delete_chat(chat_id: str) -> None:
    r = get_redis()
    r.delete(_chat_key(chat_id))
