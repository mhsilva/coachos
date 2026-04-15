"""Chats router.

Handles the lifecycle of LLM-powered chats between a student and an Anthropic
agent. Currently only the 'anamnese' type is supported but the design is
generic (future: session feedback, etc.).

Endpoints:
  POST   /chats                        — coach creates a new chat for a student
  GET    /chats?student_id=&type=      — list chats (coach: own students, student: own)
  GET    /chats/{id}                   — fetch metadata + messages
  POST   /chats/{id}/messages          — student sends a message (SSE streaming reply)
"""
from __future__ import annotations

import json
import logging
import re
import threading
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.config import settings
from app.dependencies import get_current_user, require_role
from app.models.chat import CreateChatRequest, SendMessageRequest
from app.services import anamnese_processor, anthropic_client, chat_store, transcript_store
from app.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_MESSAGES_PER_CHAT = 40  # naive rate-limit: avoid runaway costs
END_TAG = "[[FIM_ANAMNESE]]"
END_TAG_REGEX = re.compile(r"\[\[\s*FIM[_ ]ANAMNESE\s*\]\]", re.IGNORECASE)


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _get_coach_id(sb, user_id: str) -> str:
    result = sb.table("coaches").select("id").eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coach não encontrado")
    return result.data[0]["id"]


def _get_student_id(sb, user_id: str) -> str:
    result = sb.table("students").select("id").eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aluno não encontrado")
    return result.data[0]["id"]


def _student_user_id(sb, student_id: str) -> str:
    result = sb.table("students").select("user_id").eq("id", student_id).execute()
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aluno não encontrado")
    return result.data[0]["user_id"]


def _coach_user_id(sb, coach_id: str) -> str:
    result = sb.table("coaches").select("user_id").eq("id", coach_id).execute()
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coach não encontrado")
    return result.data[0]["user_id"]


def _profile_name(sb, user_id: str, fallback: str = "") -> str:
    result = sb.table("profiles").select("full_name").eq("id", user_id).execute()
    if result.data and result.data[0].get("full_name"):
        return result.data[0]["full_name"]
    return fallback


def _fetch_chat(sb, chat_id: str) -> dict:
    result = sb.table("chats").select("*").eq("id", chat_id).execute()
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chat não encontrado")
    return result.data[0]


# ─────────────────────────────────────────────
# Opening greeting — seeded so the student sees a message on first open
# without having to type first. Mirrors the instructions the agent would
# follow per the anamnese system prompt, but hardcoded so there's zero
# latency / LLM cost to bootstrap the chat.
# ─────────────────────────────────────────────

def _build_greeting(first_name: str | None) -> str:
    hi = f"Opa {first_name}, tudo bem?" if first_name else "Opa, tudo bem?"
    return (
        f"{hi} Sou seu assistente pra anamnese.\n\n"
        "Vou fazer algumas perguntas pra entender seu perfil e te conhecer melhor — "
        "assim seu coach consegue montar um treino que faça sentido pra você.\n\n"
        "Pra começar, se apresenta: me conta a sua idade, peso e percentual de gordura "
        "(se souber), um pouco sobre você, seus objetivos com o treino, suas experiências "
        "com atividades físicas no geral até aqui, e como são seus hábitos do dia a dia "
        "(fuma, bebe, se tem acompanhamento nutricional, etc).\n\n"
        "Pode mandar tudo num texto só, no que faltar a gente vai explorando."
    )


def _seed_greeting_if_empty(sb, chat: dict) -> None:
    """Idempotent: if this open anamnese chat has no messages yet, append a greeting.

    Called on chat creation AND as a fallback on first student GET (in case
    Redis TTL expired before the student opened the chat).
    """
    if chat.get("type") != "anamnese" or chat.get("status") != "open":
        return
    if chat_store.get_messages(chat["id"]):
        return  # already has messages — nothing to do

    student_user_id = _student_user_id(sb, chat["student_id"])
    full_name = _profile_name(sb, student_user_id, fallback="")
    first_name = full_name.split(" ")[0] if full_name else None
    greeting = _build_greeting(first_name)
    chat_store.append_message(chat["id"], "assistant", greeting)


def _assert_participant(chat: dict, user: dict, sb) -> str:
    """Return 'student' or 'coach' based on which side the caller is. 403 if neither."""
    user_id = user["sub"]
    # Check student side
    student = sb.table("students").select("id").eq("user_id", user_id).execute()
    if student.data and student.data[0]["id"] == chat["student_id"]:
        return "student"
    # Check coach side
    coach = sb.table("coaches").select("id").eq("user_id", user_id).execute()
    if coach.data and coach.data[0]["id"] == chat["coach_id"]:
        return "coach"
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Sem permissão neste chat")


# ─────────────────────────────────────────────
# POST /chats — coach creates a new chat
# ─────────────────────────────────────────────

@router.post("", status_code=201)
async def create_chat(
    body: CreateChatRequest,
    user: dict = Depends(require_role("coach")),
) -> dict:
    if body.type != "anamnese":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tipo de chat não suportado")
    if not settings.anamnese_agent_id:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Agent de anamnese não configurado")

    sb = get_supabase()
    coach_id = _get_coach_id(sb, user["sub"])

    # Verify the student belongs to this coach
    student_id = str(body.student_id)
    student_res = (
        sb.table("students")
        .select("id, coach_id, user_id")
        .eq("id", student_id)
        .execute()
    )
    if not student_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aluno não encontrado")
    student = student_res.data[0]
    if student.get("coach_id") != coach_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Aluno não é seu")

    # Prevent starting a new anamnese if there's an open one
    open_res = (
        sb.table("chats")
        .select("id")
        .eq("student_id", student_id)
        .eq("coach_id", coach_id)
        .eq("type", body.type)
        .eq("status", "open")
        .execute()
    )
    if open_res.data:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Já existe uma anamnese em andamento para este aluno",
        )

    chat = sb.table("chats").insert({
        "type": body.type,
        "student_id": student_id,
        "coach_id": coach_id,
    }).execute()
    chat_id = chat.data[0]["id"]

    # Seed the opening greeting so the student sees a message on first open
    _seed_greeting_if_empty(sb, chat.data[0])

    # Notify the student
    coach_name = _profile_name(sb, user["sub"], fallback=user.get("email", "Coach"))
    sb.table("notifications").insert({
        "user_id": student["user_id"],
        "type": "anamnese_request",
        "title": "Anamnese solicitada",
        "body": f"{coach_name} quer que você responda uma anamnese",
        "payload": {"chat_id": chat_id, "coach_name": coach_name},
    }).execute()

    return chat.data[0]


# ─────────────────────────────────────────────
# GET /chats — list (filtered)
# ─────────────────────────────────────────────

@router.get("", status_code=200)
async def list_chats(
    student_id: str | None = None,
    type: str | None = None,
    user: dict = Depends(get_current_user),
) -> list:
    sb = get_supabase()
    user_role = (user.get("app_metadata") or {}).get("role")

    query = sb.table("chats").select("*")

    if user_role == "coach":
        coach_id = _get_coach_id(sb, user["sub"])
        query = query.eq("coach_id", coach_id)
        if student_id:
            query = query.eq("student_id", student_id)
    elif user_role == "student":
        my_student_id = _get_student_id(sb, user["sub"])
        query = query.eq("student_id", my_student_id)
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Permissão insuficiente")

    if type:
        query = query.eq("type", type)

    result = query.order("created_at", desc=True).execute()
    return result.data


# ─────────────────────────────────────────────
# GET /chats/{id}
# ─────────────────────────────────────────────

@router.get("/{chat_id}", status_code=200)
async def get_chat(
    chat_id: str,
    user: dict = Depends(get_current_user),
) -> dict:
    sb = get_supabase()
    chat = _fetch_chat(sb, chat_id)
    side = _assert_participant(chat, user, sb)

    messages: list[dict] = []
    if chat["status"] == "open":
        # Student sees their open chat; coach is allowed to read metadata but
        # not the live transcript (agreed UX: coach reads only after close).
        if side == "student":
            # Fallback seed: if Redis TTL expired before the student ever
            # opened the chat, re-seed the opening greeting now.
            _seed_greeting_if_empty(sb, chat)
            messages = chat_store.get_messages(chat_id)
    else:
        # Closed: both sides read from storage
        if chat.get("storage_path"):
            payload = transcript_store.load(chat["storage_path"])
            messages = payload.get("messages", [])

    return {
        "id": chat["id"],
        "type": chat["type"],
        "status": chat["status"],
        "student_id": chat["student_id"],
        "coach_id": chat["coach_id"],
        "created_at": chat["created_at"],
        "closed_at": chat.get("closed_at"),
        "storage_path": chat.get("storage_path"),
        "extraction_status": chat.get("extraction_status"),
        "messages": [
            {"role": m["role"], "content": m["content"], "at": m.get("at")}
            for m in messages
        ],
    }


# ─────────────────────────────────────────────
# POST /chats/{id}/messages — student sends a message, SSE response
# ─────────────────────────────────────────────

def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/{chat_id}/messages")
async def send_message(
    chat_id: str,
    body: SendMessageRequest,
    user: dict = Depends(require_role("student")),
):
    sb = get_supabase()
    chat = _fetch_chat(sb, chat_id)

    # Ownership
    my_student_id = _get_student_id(sb, user["sub"])
    if chat["student_id"] != my_student_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chat não é seu")

    if chat["status"] != "open":
        raise HTTPException(status.HTTP_409_CONFLICT, "Chat já finalizado")

    if chat["type"] != "anamnese":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tipo de chat não suportado")

    # Budget check
    history = chat_store.get_messages(chat_id)
    if len(history) >= MAX_MESSAGES_PER_CHAT * 2:  # user + assistant per turn
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Limite de mensagens atingido")

    # Append user message to Redis before streaming
    chat_store.append_message(chat_id, "user", body.content)

    # Load system prompt (cached) and strip 'at' field before passing to Anthropic
    try:
        system_prompt = anthropic_client.get_agent_system_prompt(settings.anamnese_agent_id)
    except Exception as e:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Erro ao buscar prompt do agent: {e}",
        )

    messages_for_api = [
        {"role": m["role"], "content": m["content"]}
        for m in chat_store.get_messages(chat_id)
    ]
    # Anthropic's Messages API requires the first message to be 'user'. When
    # we seed the conversation with an assistant greeting (so the student
    # sees a message without having to type first), the API sequence starts
    # with assistant — prepend an invisible user marker to keep the API happy.
    if messages_for_api and messages_for_api[0]["role"] == "assistant":
        messages_for_api.insert(
            0,
            {"role": "user", "content": "[O aluno acabou de abrir o chat da anamnese.]"},
        )

    chat_id_local = chat_id
    chat_meta = chat

    def event_stream():
        accumulated: list[str] = []
        try:
            with anthropic_client.stream_chat(system_prompt, messages_for_api) as stream:
                for text in stream.text_stream:
                    accumulated.append(text)
                    yield _sse({"type": "delta", "text": text})
        except Exception as e:
            yield _sse({"type": "error", "message": str(e)})
            return

        full_text = "".join(accumulated)
        has_end_tag = bool(END_TAG_REGEX.search(full_text))
        cleaned = END_TAG_REGEX.sub("", full_text).rstrip()

        try:
            if has_end_tag:
                # Append final assistant message (cleaned) to messages then persist
                chat_store.append_message(chat_id_local, "assistant", cleaned)
                all_messages = chat_store.get_messages(chat_id_local)

                closed_at = datetime.now(timezone.utc).isoformat()
                path = transcript_store.save(
                    chat_type=chat_meta["type"],
                    chat_id=chat_id_local,
                    student_id=chat_meta["student_id"],
                    coach_id=chat_meta["coach_id"],
                    messages=all_messages,
                    created_at=chat_meta["created_at"],
                    closed_at=closed_at,
                )

                sb_inner = get_supabase()
                sb_inner.table("chats").update({
                    "status": "closed",
                    "storage_path": path,
                    "closed_at": closed_at,
                    "extraction_status": "pending",
                }).eq("id", chat_id_local).execute()

                # Notify coach
                coach_user_id = _coach_user_id(sb_inner, chat_meta["coach_id"])
                student_user_id = _student_user_id(sb_inner, chat_meta["student_id"])
                student_name = _profile_name(sb_inner, student_user_id, fallback="Aluno")
                sb_inner.table("notifications").insert({
                    "user_id": coach_user_id,
                    "type": "anamnese_completed",
                    "title": "Anamnese concluída",
                    "body": f"{student_name} concluiu a anamnese",
                    "payload": {
                        "chat_id": chat_id_local,
                        "student_id": chat_meta["student_id"],
                    },
                }).execute()

                chat_store.delete_chat(chat_id_local)

                # Fire-and-forget extraction → scoring → persistence.
                # Runs in a daemon thread so the SSE generator can return
                # immediately and the aluno sees the "finished" badge.
                _spawn_extraction(
                    chat_id=chat_id_local,
                    student_id=chat_meta["student_id"],
                    storage_path=path,
                )

                yield _sse({
                    "type": "done",
                    "closed": True,
                    "final_content": cleaned,
                })
            else:
                chat_store.append_message(chat_id_local, "assistant", full_text)
                yield _sse({"type": "done", "closed": False})
        except Exception as e:
            yield _sse({"type": "error", "message": f"Erro ao finalizar: {e}"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable buffering on nginx-like proxies
        },
    )


# ─────────────────────────────────────────────
# Background extraction: thread runner + retry endpoint
# ─────────────────────────────────────────────

def _spawn_extraction(*, chat_id: str, student_id: str, storage_path: str) -> None:
    """Run the anamnese processor in a daemon thread so the caller is not blocked."""
    def _runner() -> None:
        try:
            anamnese_processor.process_closed_anamnese(
                chat_id=chat_id,
                student_id=student_id,
                storage_path=storage_path,
            )
        except Exception:  # pragma: no cover — processor already swallows
            logger.exception("Extraction runner crashed for chat %s", chat_id)

    threading.Thread(target=_runner, daemon=True).start()


@router.post("/{chat_id}/reextract", status_code=202)
async def reextract_chat(
    chat_id: str,
    user: dict = Depends(require_role("coach")),
) -> dict:
    """Coach manually retries the structured extraction of a closed anamnese."""
    sb = get_supabase()
    chat = _fetch_chat(sb, chat_id)

    # Ownership check — coach must own the chat
    coach_id = _get_coach_id(sb, user["sub"])
    if chat["coach_id"] != coach_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chat não é seu")

    if chat["status"] != "closed" or not chat.get("storage_path"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Chat ainda não finalizado")

    sb.table("chats").update({"extraction_status": "pending"}).eq("id", chat_id).execute()

    _spawn_extraction(
        chat_id=chat_id,
        student_id=chat["student_id"],
        storage_path=chat["storage_path"],
    )
    return {"detail": "Reextração iniciada"}
