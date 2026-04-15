"""LLM-powered extractor that turns an anamnese transcript into structured data.

Uses Claude's Messages API with a forced tool call. We define the whole target
schema inline so the LLM output is validated by Anthropic's server-side tool-use
constraint system, and then re-validated by Pydantic on our side.
"""
from __future__ import annotations

import json
from typing import Any

from app.config import settings
from app.models.student_profile import ExtractedAnamnese
from app.services import anthropic_client

EXTRACTOR_MODEL = "claude-haiku-4-5"
EXTRACTOR_MAX_TOKENS = 4000

SYSTEM_PROMPT = (
    "Você é um extrator de dados estruturados. Vai receber a transcrição completa "
    "de uma anamnese física conduzida por outro agente com um aluno de musculação. "
    "Seu trabalho é identificar os fatos declarados e chamar a tool "
    "`save_anamnese_profile` com esses dados.\n\n"
    "REGRAS CRÍTICAS:\n"
    "1. Extraia APENAS o que o aluno declarou ou que ficou claramente implicado. "
    "Se algo não foi abordado ou ficou vago, OMITA o campo — nunca invente valores.\n"
    "2. Normalize números e termos. Ex.: 'treino 3x na semana' → 3; 'fumo social' "
    "→ smokes=true com smoke_details preenchido.\n"
    "3. Use os enums quando se aplicarem. Para o objetivo principal, categorize o "
    "texto do aluno em uma das opções (hipertrofia, emagrecimento, forca_maxima, "
    "performance_esportiva, saude, reabilitacao, condicionamento).\n"
    "4. Para technique_and_strength: inclua UMA entrada por exercício-base "
    "(supino, agachamento, terra, puxada) apenas se o aluno mencionou algo sobre ele. "
    "technique_score é 1-4 baseado no que o aluno descreveu sobre sua execução. "
    "load_kg e reps são a carga atual perto da falha. Para puxada, load_kg é o "
    "lastro ADICIONAL ao peso corporal (0 = só o peso do corpo).\n"
    "5. Chame a tool `save_anamnese_profile` exatamente UMA vez. Não responda em texto."
)


# ── Tool schema — one big input_schema that mirrors the Pydantic model ──

_STRING_ARRAY = {"type": "array", "items": {"type": "string"}}

TOOL_SCHEMA: dict[str, Any] = {
    "name": "save_anamnese_profile",
    "description": "Salva os dados estruturados extraídos da anamnese física de um aluno.",
    "input_schema": {
        "type": "object",
        "required": [
            "identification",
            "health_clearance_required",
            "objective",
            "secondary_sport",
            "availability",
            "training_history",
            "technique_and_strength",
            "health",
            "habits",
            "nutrition",
        ],
        "properties": {
            "identification": {
                "type": "object",
                "properties": {
                    "full_name": {"type": "string"},
                    "sex": {"type": "string", "enum": ["M", "F"]},
                    "birth_date": {"type": "string", "description": "ISO date YYYY-MM-DD"},
                    "age": {"type": "integer"},
                    "weight_kg": {"type": "number"},
                    "height_cm": {"type": "number"},
                },
            },
            "health_clearance_required": {
                "type": "boolean",
                "description": "true se o aluno relatou condição que exige liberação médica.",
            },
            "objective": {
                "type": "object",
                "properties": {
                    "primary_goal": {
                        "type": "string",
                        "enum": [
                            "hipertrofia",
                            "emagrecimento",
                            "forca_maxima",
                            "performance_esportiva",
                            "saude",
                            "reabilitacao",
                            "condicionamento",
                        ],
                    },
                    "primary_goal_detail": {"type": "string"},
                    "body_focus_areas": {
                        **_STRING_ARRAY,
                        "description": "Áreas do corpo que o aluno quer enfatizar. Ex.: ['bracos','peito','gluteo'].",
                    },
                    "aesthetic_reference": {"type": "string"},
                },
            },
            "secondary_sport": {
                "type": "object",
                "properties": {
                    "has_secondary_sport": {"type": "boolean"},
                    "secondary_sport": {"type": "string"},
                    "secondary_sport_months": {"type": "number"},
                    "secondary_sport_days_per_week": {"type": "integer"},
                    "secondary_sport_session_minutes": {"type": "integer"},
                    "secondary_sport_has_competition": {"type": "boolean"},
                    "secondary_sport_competition_note": {"type": "string"},
                    "secondary_sport_objective": {"type": "string"},
                    "same_day_training": {"type": "boolean"},
                    "same_day_order": {"type": "string", "enum": ["antes", "depois"]},
                    "is_sport_cycle": {
                        "type": "boolean",
                        "description": "true = musculação é ciclo de preparação; false = manter em paralelo indefinidamente.",
                    },
                },
            },
            "availability": {
                "type": "object",
                "properties": {
                    "total_days_per_week": {"type": "integer"},
                    "strength_days_per_week": {"type": "integer"},
                    "max_session_minutes": {"type": "integer"},
                    "preferred_period": {"type": "string", "enum": ["manha", "tarde", "noite"]},
                    "fixed_rest_days": {
                        **_STRING_ARRAY,
                        "description": "Dias fixos de descanso. Ex.: ['domingo','quarta'].",
                    },
                },
            },
            "training_history": {
                "type": "object",
                "properties": {
                    "current_strength_training": {"type": "boolean"},
                    "continuous_months": {
                        "type": "number",
                        "description": "Meses treinando continuamente AGORA. Null/omitido se parado.",
                    },
                    "detraining_months": {
                        "type": "number",
                        "description": "Meses parado atualmente. Null/omitido se está treinando.",
                    },
                    "total_experience_months": {
                        "type": "number",
                        "description": "Soma total de meses que já treinou musculação na vida.",
                    },
                    "sports_history": {
                        "type": "string",
                        "description": "Resumo livre de outros esportes/atividades físicas já praticados.",
                    },
                },
            },
            "technique_and_strength": {
                "type": "array",
                "description": "Uma entrada por exercício-base discutido. Omita exercícios não abordados.",
                "items": {
                    "type": "object",
                    "required": ["exercise"],
                    "properties": {
                        "exercise": {"type": "string", "enum": ["supino", "agachamento", "terra", "puxada"]},
                        "technique_score": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 4,
                            "description": "1=não executa/erros graves; 2=moderado/inconsistente; 3=boa técnica; 4=excelente.",
                        },
                        "load_kg": {
                            "type": "number",
                            "description": "Carga usada nas séries próximas da falha. Para puxada: LASTRO adicional (0 = só peso corporal).",
                        },
                        "reps": {"type": "integer", "description": "Repetições próximas da falha com essa carga."},
                    },
                },
            },
            "health": {
                "type": "object",
                "required": ["conditions", "medications", "injuries", "surgeries"],
                "properties": {
                    "conditions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["condition"],
                            "properties": {
                                "condition": {"type": "string"},
                                "notes": {"type": "string"},
                                "active": {"type": "boolean"},
                            },
                        },
                    },
                    "medications": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["medication"],
                            "properties": {
                                "medication": {"type": "string"},
                                "dosage": {"type": "string"},
                                "active": {"type": "boolean"},
                            },
                        },
                    },
                    "injuries": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["description"],
                            "properties": {
                                "body_part": {"type": "string"},
                                "description": {"type": "string"},
                                "severity": {"type": "string", "enum": ["leve", "moderada", "grave"]},
                                "active": {"type": "boolean"},
                                "occurred_at": {"type": "string", "description": "ISO date YYYY-MM-DD"},
                            },
                        },
                    },
                    "surgeries": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["procedure_name"],
                            "properties": {
                                "procedure_name": {"type": "string"},
                                "occurred_at": {"type": "string", "description": "ISO date YYYY-MM-DD"},
                                "notes": {"type": "string"},
                            },
                        },
                    },
                },
            },
            "habits": {
                "type": "object",
                "properties": {
                    "sleep_hours": {"type": "number"},
                    "sleep_quality": {"type": "string", "enum": ["ruim", "razoavel", "boa"]},
                    "work_type": {"type": "string", "enum": ["sedentario", "moderado", "fisico"]},
                    "stress_level": {"type": "string", "enum": ["baixo", "moderado", "alto"]},
                    "smokes": {"type": "boolean"},
                    "smoke_details": {"type": "string"},
                    "drinks": {"type": "boolean"},
                    "drink_details": {"type": "string"},
                },
            },
            "nutrition": {
                "type": "object",
                "properties": {
                    "has_nutritionist": {"type": "boolean"},
                    "uses_supplements": {"type": "boolean"},
                    "supplements": _STRING_ARRAY,
                    "protein_intake_perception": {
                        "type": "string",
                        "enum": ["baixa", "adequada", "alta"],
                    },
                },
            },
        },
    },
}


# ── Main entry point ────────────────────────────────────────────


def extract(transcript: list[dict]) -> ExtractedAnamnese:
    """Run the extractor on a full transcript.

    transcript: list of {role: 'user'|'assistant', content: str}. The 'at'
      field (if present) is ignored.

    Returns an ExtractedAnamnese (raises on LLM failure or malformed output).
    """
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY não configurado")

    # Render the transcript as a human-readable conversation. The labels help
    # the model attribute each fact to the student vs. the interviewer agent.
    rendered = _render_transcript(transcript)

    client = anthropic_client.get_client()
    response = client.messages.create(
        model=EXTRACTOR_MODEL,
        max_tokens=EXTRACTOR_MAX_TOKENS,
        system=SYSTEM_PROMPT,
        tools=[TOOL_SCHEMA],
        tool_choice={"type": "tool", "name": "save_anamnese_profile"},
        messages=[
            {
                "role": "user",
                "content": (
                    "Transcrição da anamnese abaixo. Extraia os dados estruturados "
                    "e chame a tool `save_anamnese_profile`.\n\n"
                    f"{rendered}"
                ),
            }
        ],
    )

    tool_input = _first_tool_input(response)
    if tool_input is None:
        raise RuntimeError("Extrator não retornou chamada da tool")

    return ExtractedAnamnese.model_validate(tool_input)


def _render_transcript(transcript: list[dict]) -> str:
    """Render as 'Entrevistador: ...' / 'Aluno: ...' lines for clarity."""
    lines: list[str] = []
    for msg in transcript:
        role = msg.get("role")
        content = (msg.get("content") or "").strip()
        if not content:
            continue
        label = "Aluno" if role == "user" else "Entrevistador"
        lines.append(f"{label}: {content}")
    return "\n\n".join(lines)


def _first_tool_input(response: Any) -> dict | None:
    """Find the first tool_use block in the response and return its input dict."""
    for block in getattr(response, "content", []) or []:
        btype = getattr(block, "type", None)
        if btype == "tool_use":
            raw = getattr(block, "input", None)
            if isinstance(raw, dict):
                return raw
            # Some SDK versions may hand back a JSON string
            if isinstance(raw, str):
                try:
                    return json.loads(raw)
                except json.JSONDecodeError:
                    return None
    return None
