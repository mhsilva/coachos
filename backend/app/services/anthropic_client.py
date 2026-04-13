"""Anthropic API client + helpers.

Design choice: we use the Messages API (not Managed Agents Sessions). For anamnese
the agent has no tools — just a system prompt — so the container/session overhead
of Managed Agents is unwarranted. We fetch the agent's system prompt once via the
Agents Beta API and then use `client.messages.stream(...)` for the actual chat.
When we add MCP/tools (step 2), migrate to Sessions.
"""
from __future__ import annotations

import anthropic
from app.config import settings
from app.services import chat_store

_client: anthropic.Anthropic | None = None

MODEL = "claude-haiku-4-5"
MAX_TOKENS = 16000


def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY não configurado")
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _client


def get_agent_system_prompt(agent_id: str) -> str:
    """Fetch the agent's system prompt. Cached in Redis (24h TTL)."""
    cached = chat_store.get_cached_system_prompt(agent_id)
    if cached:
        return cached
    client = get_client()
    # Managed Agents API: /v1/agents/{id}. SDK sets the required beta header.
    agent = client.beta.agents.retrieve(agent_id)
    system_prompt = (getattr(agent, "system", None) or "").strip()
    if not system_prompt:
        raise RuntimeError(
            f"Agent {agent_id} não tem system prompt configurado"
        )
    chat_store.cache_system_prompt(agent_id, system_prompt)
    return system_prompt


def stream_chat(system_prompt: str, messages: list[dict]):
    """Return the streaming context manager.

    `messages` must be a list of {role, content} dicts (no `at` field — strip that
    before calling). System prompt goes as a single cacheable text block so the
    stable preamble hits the prompt cache on every turn after the first.

    Note: Haiku 4.5 doesn't support adaptive thinking — we skip `thinking` here.
    For a chat/anamnese flow the model doesn't need extended reasoning.
    """
    client = get_client()
    return client.messages.stream(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=[
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=messages,
    )
