"""Student self-service endpoints (own profile data) + coach-facing
structured profile endpoints (read / edit / manage sub-histories)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user, require_role
from app.models.student_profile import (
    CreateHealthConditionRequest,
    CreateInjuryRequest,
    CreateMedicationRequest,
    CreateSurgeryRequest,
    PatchInjuryRequest,
    PatchStudentProfileRequest,
)
from app.models.user import UpdateStudentProfileRequest
from app.supabase_client import get_supabase

router = APIRouter()


# ──────────────────────────────────────────────
# Student self-service
# ──────────────────────────────────────────────

@router.get("/me", status_code=200)
async def get_my_profile(user: dict = Depends(require_role("student"))) -> dict:
    """Return the student's own profile data (for the profile page)."""
    sb = get_supabase()
    result = (
        sb.table("students")
        .select("id, birth_date, weight_kg, user_id, profiles(full_name, avatar_url)")
        .eq("user_id", user["sub"])
        .execute()
    )
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aluno não encontrado")
    data = result.data[0]
    data["email"] = user.get("email")
    return data


@router.patch("/me", status_code=200)
async def update_my_profile(
    body: UpdateStudentProfileRequest,
    user: dict = Depends(require_role("student")),
) -> dict:
    """Student updates their own profile fields."""
    sb = get_supabase()

    student = (
        sb.table("students")
        .select("id")
        .eq("user_id", user["sub"])
        .execute()
    )
    if not student.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aluno não encontrado")
    student_id = student.data[0]["id"]

    updates: dict = {}
    if body.birth_date is not None:
        updates["birth_date"] = body.birth_date
    if body.weight_kg is not None:
        updates["weight_kg"] = body.weight_kg

    if not updates:
        return {"detail": "Nenhum campo alterado"}

    sb.table("students").update(updates).eq("id", student_id).execute()
    return {"detail": "Perfil atualizado"}


# ──────────────────────────────────────────────
# Coach-facing structured profile
# ──────────────────────────────────────────────

def _get_coach_id(sb, user_sub: str) -> str:
    result = sb.table("coaches").select("id").eq("user_id", user_sub).execute()
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coach não encontrado")
    return result.data[0]["id"]


def _assert_coach_owns(sb, coach_id: str, student_id: str) -> None:
    student = (
        sb.table("students")
        .select("id, coach_id")
        .eq("id", student_id)
        .execute()
    )
    if not student.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aluno não encontrado")
    if student.data[0]["coach_id"] != coach_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Aluno não é seu")


@router.get("/{student_id}/profile", status_code=200)
async def get_student_profile(
    student_id: str,
    user: dict = Depends(require_role("coach")),
) -> dict:
    """Full structured profile of a student: perfil + força + saúde histórica.

    Returns `None` for `profile` if no anamnese has been extracted yet.
    """
    sb = get_supabase()
    coach_id = _get_coach_id(sb, user["sub"])
    _assert_coach_owns(sb, coach_id, student_id)

    # Base student identity
    student_res = (
        sb.table("students")
        .select("id, birth_date, weight_kg, height_cm, profiles(full_name, avatar_url)")
        .eq("id", student_id)
        .execute()
    )
    if not student_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aluno não encontrado")
    student = student_res.data[0]

    # Structured profile row (may not exist)
    profile_res = (
        sb.table("student_profile")
        .select("*")
        .eq("student_id", student_id)
        .execute()
    )
    profile = profile_res.data[0] if profile_res.data else None

    # Latest strength row per exercise
    strength_res = (
        sb.table("student_strength_assessment")
        .select("*")
        .eq("student_id", student_id)
        .order("recorded_at", desc=True)
        .execute()
    )
    latest_by_exercise: dict[str, dict] = {}
    for row in strength_res.data or []:
        ex = row["exercise"]
        if ex not in latest_by_exercise:
            latest_by_exercise[ex] = row
    strength = list(latest_by_exercise.values())

    # Append-only histories
    def _list(table: str) -> list[dict]:
        res = (
            sb.table(table)
            .select("*")
            .eq("student_id", student_id)
            .order("recorded_at", desc=True)
            .execute()
        )
        return res.data or []

    return {
        "student": student,
        "profile": profile,
        "strength": strength,
        "injuries": _list("student_injuries"),
        "health_conditions": _list("student_health_conditions"),
        "medications": _list("student_medications"),
        "surgeries": _list("student_surgeries"),
    }


@router.patch("/{student_id}/profile", status_code=200)
async def patch_student_profile(
    student_id: str,
    body: PatchStudentProfileRequest,
    user: dict = Depends(require_role("coach")),
) -> dict:
    """Coach edits any field of the structured profile.

    Edited fields are added to `manually_edited_fields` so future anamnese
    extractions won't clobber the coach's judgment.
    """
    sb = get_supabase()
    coach_id = _get_coach_id(sb, user["sub"])
    _assert_coach_owns(sb, coach_id, student_id)

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return {"detail": "Nenhum campo alterado"}

    # Merge with any previously-edited fields (row may not exist yet → treat as empty)
    existing = (
        sb.table("student_profile")
        .select("manually_edited_fields")
        .eq("student_id", student_id)
        .execute()
    )
    edited: set[str] = set()
    if existing.data:
        edited = set(existing.data[0].get("manually_edited_fields") or [])
    edited.update(updates.keys())

    payload: dict[str, Any] = {
        "student_id": student_id,
        **updates,
        "manually_edited_fields": sorted(edited),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    sb.table("student_profile").upsert(payload, on_conflict="student_id").execute()

    return {"detail": "Perfil atualizado", "manually_edited_fields": sorted(edited)}


# ─────────────────────────────────────────────
# Append-only histories — CRUD for the coach
# ─────────────────────────────────────────────

@router.post("/{student_id}/injuries", status_code=201)
async def create_injury(
    student_id: str,
    body: CreateInjuryRequest,
    user: dict = Depends(require_role("coach")),
) -> dict:
    sb = get_supabase()
    coach_id = _get_coach_id(sb, user["sub"])
    _assert_coach_owns(sb, coach_id, student_id)

    inserted = sb.table("student_injuries").insert({
        "student_id": student_id,
        "body_part": body.body_part,
        "description": body.description,
        "severity": body.severity,
        "active": body.active,
        "occurred_at": body.occurred_at.isoformat() if body.occurred_at else None,
        "source": "manual",
    }).execute()
    return inserted.data[0]


@router.patch("/{student_id}/injuries/{injury_id}", status_code=200)
async def patch_injury(
    student_id: str,
    injury_id: str,
    body: PatchInjuryRequest,
    user: dict = Depends(require_role("coach")),
) -> dict:
    sb = get_supabase()
    coach_id = _get_coach_id(sb, user["sub"])
    _assert_coach_owns(sb, coach_id, student_id)

    updates = body.model_dump(exclude_unset=True)
    if "occurred_at" in updates and updates["occurred_at"] is not None:
        updates["occurred_at"] = updates["occurred_at"].isoformat()
    if not updates:
        return {"detail": "Nenhum campo alterado"}

    res = (
        sb.table("student_injuries")
        .update(updates)
        .eq("id", injury_id)
        .eq("student_id", student_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesão não encontrada")
    return res.data[0]


@router.delete("/{student_id}/injuries/{injury_id}", status_code=200)
async def delete_injury(
    student_id: str,
    injury_id: str,
    user: dict = Depends(require_role("coach")),
) -> dict:
    sb = get_supabase()
    coach_id = _get_coach_id(sb, user["sub"])
    _assert_coach_owns(sb, coach_id, student_id)

    sb.table("student_injuries").delete().eq("id", injury_id).eq("student_id", student_id).execute()
    return {"detail": "Lesão removida"}


@router.post("/{student_id}/health-conditions", status_code=201)
async def create_health_condition(
    student_id: str,
    body: CreateHealthConditionRequest,
    user: dict = Depends(require_role("coach")),
) -> dict:
    sb = get_supabase()
    coach_id = _get_coach_id(sb, user["sub"])
    _assert_coach_owns(sb, coach_id, student_id)

    inserted = sb.table("student_health_conditions").insert({
        "student_id": student_id,
        "condition": body.condition,
        "notes": body.notes,
        "active": body.active,
        "source": "manual",
    }).execute()
    return inserted.data[0]


@router.delete("/{student_id}/health-conditions/{hc_id}", status_code=200)
async def delete_health_condition(
    student_id: str,
    hc_id: str,
    user: dict = Depends(require_role("coach")),
) -> dict:
    sb = get_supabase()
    coach_id = _get_coach_id(sb, user["sub"])
    _assert_coach_owns(sb, coach_id, student_id)

    sb.table("student_health_conditions").delete().eq("id", hc_id).eq("student_id", student_id).execute()
    return {"detail": "Condição removida"}


@router.post("/{student_id}/medications", status_code=201)
async def create_medication(
    student_id: str,
    body: CreateMedicationRequest,
    user: dict = Depends(require_role("coach")),
) -> dict:
    sb = get_supabase()
    coach_id = _get_coach_id(sb, user["sub"])
    _assert_coach_owns(sb, coach_id, student_id)

    inserted = sb.table("student_medications").insert({
        "student_id": student_id,
        "medication": body.medication,
        "dosage": body.dosage,
        "active": body.active,
        "source": "manual",
    }).execute()
    return inserted.data[0]


@router.delete("/{student_id}/medications/{med_id}", status_code=200)
async def delete_medication(
    student_id: str,
    med_id: str,
    user: dict = Depends(require_role("coach")),
) -> dict:
    sb = get_supabase()
    coach_id = _get_coach_id(sb, user["sub"])
    _assert_coach_owns(sb, coach_id, student_id)

    sb.table("student_medications").delete().eq("id", med_id).eq("student_id", student_id).execute()
    return {"detail": "Medicamento removido"}


@router.post("/{student_id}/surgeries", status_code=201)
async def create_surgery(
    student_id: str,
    body: CreateSurgeryRequest,
    user: dict = Depends(require_role("coach")),
) -> dict:
    sb = get_supabase()
    coach_id = _get_coach_id(sb, user["sub"])
    _assert_coach_owns(sb, coach_id, student_id)

    inserted = sb.table("student_surgeries").insert({
        "student_id": student_id,
        "procedure_name": body.procedure_name,
        "occurred_at": body.occurred_at.isoformat() if body.occurred_at else None,
        "notes": body.notes,
        "source": "manual",
    }).execute()
    return inserted.data[0]


@router.delete("/{student_id}/surgeries/{surgery_id}", status_code=200)
async def delete_surgery(
    student_id: str,
    surgery_id: str,
    user: dict = Depends(require_role("coach")),
) -> dict:
    sb = get_supabase()
    coach_id = _get_coach_id(sb, user["sub"])
    _assert_coach_owns(sb, coach_id, student_id)

    sb.table("student_surgeries").delete().eq("id", surgery_id).eq("student_id", student_id).execute()
    return {"detail": "Cirurgia removida"}
