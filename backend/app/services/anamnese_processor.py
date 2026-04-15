"""Orchestrator: transcript → extraction → scoring → persistence → status update.

Runs as a FastAPI BackgroundTask after a chat is closed with [[FIM_ANAMNESE]].
Keeps chats.py free of heavy work.
"""
from __future__ import annotations

import logging

from app.services import anamnese_extractor, profile_writer, transcript_store
from app.supabase_client import get_supabase

logger = logging.getLogger(__name__)


def process_closed_anamnese(*, chat_id: str, student_id: str, storage_path: str) -> None:
    """Full pipeline for one closed anamnese chat.

    Never raises — updates chats.extraction_status to 'failed' and logs on error.
    The coach gets a fallback notification on failure so they can trigger
    a retry via POST /chats/{id}/reextract.
    """
    sb = get_supabase()
    try:
        # 1. Load transcript from Storage
        payload = transcript_store.load(storage_path)
        messages = payload.get("messages", [])

        # 2. LLM extraction
        extracted = anamnese_extractor.extract(messages)

        # 3. Compute + persist (writer returns the SallesResult; we don't need it here)
        profile_writer.persist(
            student_id=student_id,
            chat_id=chat_id,
            extracted=extracted,
        )

        # 4. Mark done
        sb.table("chats").update({"extraction_status": "done"}).eq("id", chat_id).execute()
        logger.info("Anamnese extraction done for chat %s", chat_id)

    except Exception as exc:
        logger.exception("Anamnese extraction failed for chat %s", chat_id)
        sb.table("chats").update({"extraction_status": "failed"}).eq("id", chat_id).execute()

        # Notify the coach so they can retry manually
        try:
            chat = sb.table("chats").select("coach_id, student_id").eq("id", chat_id).execute()
            if chat.data:
                coach_row = sb.table("coaches").select("user_id").eq("id", chat.data[0]["coach_id"]).execute()
                if coach_row.data:
                    sb.table("notifications").insert({
                        "user_id": coach_row.data[0]["user_id"],
                        "type": "anamnese_extraction_failed",
                        "title": "Falha ao processar anamnese",
                        "body": "Não foi possível extrair o perfil estruturado. Toque para tentar novamente.",
                        "payload": {
                            "chat_id": chat_id,
                            "student_id": chat.data[0]["student_id"],
                            "error": str(exc)[:200],
                        },
                    }).execute()
        except Exception:  # pragma: no cover — best-effort notification
            logger.exception("Failed to emit extraction-failed notification for chat %s", chat_id)
