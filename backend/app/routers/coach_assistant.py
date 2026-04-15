"""Coach assistant — an LLM chat scoped to a single student.

Layout:
  GET    /coach-assistant/{student_id}           — load current Redis history
  POST   /coach-assistant/{student_id}/summary   — SSE: generate opening summary
  POST   /coach-assistant/{student_id}/messages  — SSE: coach sends a question
  DELETE /coach-assistant/{student_id}           — reset (flush Redis key)

Storage is 100% Redis (see `coach_assistant_store`). Context is rebuilt
on every LLM call so the coach always sees fresh data after an edit.

Prompt-cache strategy: the student context goes as the FIRST user message
with `cache_control: ephemeral`. On the initial /summary turn, the same
message also carries a second (uncached) content block with the "please
summarize" instruction. Follow-up /messages turns keep the cached prefix
identical so the cache hits consistently.
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.config import settings
from app.dependencies import require_role
from app.models.chat import SendMessageRequest
from app.services import anthropic_client, coach_assistant_context, coach_assistant_store
from app.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()

# Naive runaway guard — same spirit as the anamnese limit.
MAX_COACH_TURNS = 30

# Minimal trigger — the actual summary format and content are defined
# in the agent's system prompt. We only need a marker that says "this
# is the opening turn, no coach question yet" so the model knows to
# generate the structured initial summary instead of answering a question.
SUMMARY_INSTRUCTION = "[Início do painel — gere o resumo inicial deste aluno.]"


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _get_coach_id(sb, user_sub: str) -> str:
    result = sb.table("coaches").select("id").eq("user_id", user_sub).execute()
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coach não encontrado")
    return result.data[0]["id"]


def _assert_coach_owns_student(sb, coach_id: str, student_id: str) -> None:
    res = (
        sb.table("students").select("coach_id").eq("id", student_id).execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aluno não encontrado")
    if res.data[0].get("coach_id") != coach_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Aluno não é seu")


def _require_agent_configured() -> None:
    if not settings.coach_assistant_agent_id:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Coach assistant agent não configurado",
        )


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _cached_context_message(context: str, extra_instruction: str | None = None) -> dict:
    """Build the first user message carrying the (cacheable) student context.

    If `extra_instruction` is given, it goes as a second, uncached content
    block so the cache prefix stays identical across calls.
    """
    content: list[dict] = [
        {
            "type": "text",
            "text": context,
            "cache_control": {"type": "ephemeral"},
        }
    ]
    if extra_instruction:
        content.append({"type": "text", "text": extra_instruction})
    return {"role": "user", "content": content}


# ─────────────────────────────────────────────
# GET — list current Redis messages
# ─────────────────────────────────────────────

@router.get("/{student_id}", status_code=200)
async def get_assistant_chat(
    student_id: str,
    user: dict = Depends(require_role("coach")),
) -> dict:
    sb = get_supabase()
    coach_id = _get_coach_id(sb, user["sub"])
    _assert_coach_owns_student(sb, coach_id, student_id)

    messages = coach_assistant_store.get_messages(coach_id, student_id)
    return {
        "student_id": student_id,
        "messages": [
            {"role": m["role"], "content": m["content"], "at": m.get("at")}
            for m in messages
        ],
    }


# ─────────────────────────────────────────────
# DELETE — reset
# ─────────────────────────────────────────────

@router.delete("/{student_id}", status_code=200)
async def reset_assistant_chat(
    student_id: str,
    user: dict = Depends(require_role("coach")),
) -> dict:
    sb = get_supabase()
    coach_id = _get_coach_id(sb, user["sub"])
    _assert_coach_owns_student(sb, coach_id, student_id)
    coach_assistant_store.reset(coach_id, student_id)
    return {"detail": "Conversa resetada"}


# ─────────────────────────────────────────────
# POST /summary — generate the opening summary (SSE)
# ─────────────────────────────────────────────

@router.post("/{student_id}/summary")
async def generate_summary(
    student_id: str,
    user: dict = Depends(require_role("coach")),
):
    sb = get_supabase()
    coach_id = _get_coach_id(sb, user["sub"])
    _assert_coach_owns_student(sb, coach_id, student_id)
    _require_agent_configured()

    # Idempotency: if there are already messages, don't regenerate.
    if coach_assistant_store.get_messages(coach_id, student_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Conversa já iniciada — faça reset antes de gerar um novo resumo",
        )

    try:
        system_prompt = anthropic_client.get_agent_system_prompt(
            settings.coach_assistant_agent_id
        )
    except Exception as e:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Erro ao buscar prompt do agent: {e}",
        )

    try:
        context = coach_assistant_context.build_context(student_id)
    except Exception as e:
        logger.exception("Failed to build context for student %s", student_id)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Erro ao montar contexto: {e}",
        )

    messages_for_api = [_cached_context_message(context, SUMMARY_INSTRUCTION)]

    def event_stream():
        accumulated: list[str] = []
        try:
            with anthropic_client.stream_chat(system_prompt, messages_for_api) as stream:
                for text in stream.text_stream:
                    accumulated.append(text)
                    yield _sse({"type": "delta", "text": text})
        except Exception as e:
            logger.exception("Summary stream failed for student %s", student_id)
            yield _sse({"type": "error", "message": str(e)})
            return

        full = "".join(accumulated).strip()
        if full:
            coach_assistant_store.append_message(coach_id, student_id, "assistant", full)
        yield _sse({"type": "done"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─────────────────────────────────────────────
# POST /messages — coach sends a question (SSE)
# ─────────────────────────────────────────────

@router.post("/{student_id}/messages")
async def send_message(
    student_id: str,
    body: SendMessageRequest,
    user: dict = Depends(require_role("coach")),
):
    sb = get_supabase()
    coach_id = _get_coach_id(sb, user["sub"])
    _assert_coach_owns_student(sb, coach_id, student_id)
    _require_agent_configured()

    history = coach_assistant_store.get_messages(coach_id, student_id)
    if not history:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Gere o resumo inicial antes de enviar perguntas",
        )

    # Simple runaway guard: count user turns only.
    user_turns = sum(1 for m in history if m.get("role") == "user")
    if user_turns >= MAX_COACH_TURNS:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Limite de mensagens atingido — faça reset para continuar",
        )

    # Append coach message to Redis before streaming
    coach_assistant_store.append_message(coach_id, student_id, "user", body.content)

    try:
        system_prompt = anthropic_client.get_agent_system_prompt(
            settings.coach_assistant_agent_id
        )
    except Exception as e:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Erro ao buscar prompt do agent: {e}",
        )

    try:
        context = coach_assistant_context.build_context(student_id)
    except Exception as e:
        logger.exception("Failed to build context for student %s", student_id)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Erro ao montar contexto: {e}",
        )

    # Full sequence for the API: [cached context user msg, ...history, new user msg already appended above]
    turns = [
        {"role": m["role"], "content": m["content"]}
        for m in coach_assistant_store.get_messages(coach_id, student_id)
    ]
    messages_for_api = [_cached_context_message(context), *turns]

    def event_stream():
        accumulated: list[str] = []
        try:
            with anthropic_client.stream_chat(system_prompt, messages_for_api) as stream:
                for text in stream.text_stream:
                    accumulated.append(text)
                    yield _sse({"type": "delta", "text": text})
        except Exception as e:
            logger.exception("Chat stream failed for student %s", student_id)
            yield _sse({"type": "error", "message": str(e)})
            return

        full = "".join(accumulated).strip()
        if full:
            coach_assistant_store.append_message(coach_id, student_id, "assistant", full)
        yield _sse({"type": "done"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
