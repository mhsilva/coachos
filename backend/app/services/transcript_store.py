"""Supabase Storage persistence for finalized chat transcripts.

Path: `{type}/{student_id}/{YYYY-MM-DD}/{chat_id}.json.gz`
Payload: compact JSON, gzip level 9. ~5-10x reduction on typical chats.
"""
from __future__ import annotations

import gzip
import json
from datetime import datetime, timezone

from app.config import settings
from app.supabase_client import get_supabase


def build_path(chat_type: str, student_id: str, chat_id: str) -> str:
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return f"{chat_type}/{student_id}/{date}/{chat_id}.json.gz"


def save(
    *,
    chat_type: str,
    chat_id: str,
    student_id: str,
    coach_id: str,
    messages: list[dict],
    created_at: str,
    closed_at: str,
) -> str:
    """Serialize + gzip + upload. Returns the storage path."""
    # Compact keys for minimal size (gzip still runs on top).
    compact_messages = [
        {
            "r": m["role"][0],  # 'u' or 'a'
            "c": m["content"],
            "at": m.get("at"),
        }
        for m in messages
    ]
    payload = {
        "v": 1,
        "type": chat_type,
        "chat_id": chat_id,
        "student_id": student_id,
        "coach_id": coach_id,
        "created_at": created_at,
        "closed_at": closed_at,
        "messages": compact_messages,
    }
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    gz = gzip.compress(raw, compresslevel=9)

    path = build_path(chat_type, student_id, chat_id)
    sb = get_supabase()
    sb.storage.from_(settings.supabase_chats_bucket).upload(
        path,
        gz,
        file_options={"content-type": "application/gzip", "upsert": "true"},
    )
    return path


def load(path: str) -> dict:
    """Download + gunzip + parse. Returns the expanded payload (role restored to 'user'/'assistant')."""
    sb = get_supabase()
    raw_gz = sb.storage.from_(settings.supabase_chats_bucket).download(path)
    # supabase-py returns bytes directly for .download()
    raw = gzip.decompress(raw_gz)
    payload = json.loads(raw.decode("utf-8"))
    payload["messages"] = [
        {
            "role": "user" if m["r"] == "u" else "assistant",
            "content": m["c"],
            "at": m.get("at"),
        }
        for m in payload.get("messages", [])
    ]
    return payload
