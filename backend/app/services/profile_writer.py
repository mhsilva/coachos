"""Writes an ExtractedAnamnese + SallesResult into the database.

This is the glue between the LLM extractor, the scoring engine and Supabase.
Runs inside a BackgroundTask — no FastAPI deps leak here.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.models.student_profile import ExtractedAnamnese
from app.services.salles_scoring import SallesResult, StrengthInput, compute_salles
from app.supabase_client import get_supabase


def persist(
    *,
    student_id: str,
    chat_id: str,
    extracted: ExtractedAnamnese,
) -> SallesResult:
    """Persist the extracted data + computed Salles scores.

    Steps:
      1. Update students.birth_date / weight_kg / height_cm (from identification)
      2. Compute Salles scores from the extracted fields
      3. Upsert student_profile (preserving coach-edited fields)
      4. Insert student_strength_assessment rows (one per discussed exercise)
      5. Insert health/meds/injuries/surgeries (append-only)

    Returns the computed SallesResult.
    """
    sb = get_supabase()
    now = datetime.now(timezone.utc).isoformat()

    # ── 1. Basic student fields ─────────────────────────────────
    ident = extracted.identification
    student_updates: dict[str, Any] = {}
    if ident.birth_date:
        student_updates["birth_date"] = ident.birth_date.isoformat()
    if ident.weight_kg is not None:
        student_updates["weight_kg"] = ident.weight_kg
    if ident.height_cm is not None:
        student_updates["height_cm"] = ident.height_cm
    if student_updates:
        sb.table("students").update(student_updates).eq("id", student_id).execute()

    # ── 2. Compute Salles classification ────────────────────────
    strength_inputs = [
        StrengthInput(
            exercise=item.exercise,
            technique_score=item.technique_score,
            load_kg=item.load_kg,
            reps=item.reps,
        )
        for item in extracted.technique_and_strength
    ]
    salles = compute_salles(
        sex=ident.sex,
        body_weight_kg=ident.weight_kg,
        current_training=extracted.training_history.current_strength_training,
        continuous_months=extracted.training_history.continuous_months,
        detraining_months=extracted.training_history.detraining_months,
        total_experience_months=extracted.training_history.total_experience_months,
        strength_inputs=strength_inputs,
    )

    # ── 3. Upsert student_profile ───────────────────────────────
    #  Preserve any field the coach has already manually edited: we fetch the
    #  existing row, read `manually_edited_fields`, and drop those keys from
    #  the incoming payload so we don't clobber coach work.
    existing = (
        sb.table("student_profile")
        .select("manually_edited_fields")
        .eq("student_id", student_id)
        .execute()
    )
    preserved: set[str] = set()
    if existing.data:
        preserved = set(existing.data[0].get("manually_edited_fields") or [])

    payload = _build_profile_payload(
        student_id=student_id,
        chat_id=chat_id,
        extracted=extracted,
        salles=salles,
        now=now,
    )
    for field_name in preserved:
        payload.pop(field_name, None)
    # Keep the manually_edited_fields list intact if a row already exists
    if existing.data:
        payload["manually_edited_fields"] = list(preserved)

    sb.table("student_profile").upsert(payload, on_conflict="student_id").execute()

    # ── 4. Strength assessment rows (append — history grows) ────
    for row in salles.strength:
        sb.table("student_strength_assessment").insert({
            "student_id": student_id,
            "exercise": row.exercise,
            "technique_score": row.technique_score,
            "load_kg": row.load_kg,
            "reps": row.reps,
            "estimated_1rm": row.estimated_1rm,
            "relative_strength_pct": row.relative_strength_pct,
            "strength_score": row.strength_score,
            "source_chat_id": chat_id,
        }).execute()

    # ── 5. Append-only histories ────────────────────────────────
    for c in extracted.health.conditions:
        sb.table("student_health_conditions").insert({
            "student_id": student_id,
            "condition": c.condition,
            "notes": c.notes,
            "active": c.active,
            "source": "anamnese",
            "source_chat_id": chat_id,
        }).execute()

    for m in extracted.health.medications:
        sb.table("student_medications").insert({
            "student_id": student_id,
            "medication": m.medication,
            "dosage": m.dosage,
            "active": m.active,
            "source": "anamnese",
            "source_chat_id": chat_id,
        }).execute()

    for i in extracted.health.injuries:
        sb.table("student_injuries").insert({
            "student_id": student_id,
            "body_part": i.body_part,
            "description": i.description,
            "severity": i.severity,
            "active": i.active,
            "occurred_at": i.occurred_at.isoformat() if i.occurred_at else None,
            "source": "anamnese",
            "source_chat_id": chat_id,
        }).execute()

    for s in extracted.health.surgeries:
        sb.table("student_surgeries").insert({
            "student_id": student_id,
            "procedure_name": s.procedure_name,
            "occurred_at": s.occurred_at.isoformat() if s.occurred_at else None,
            "notes": s.notes,
            "source": "anamnese",
            "source_chat_id": chat_id,
        }).execute()

    return salles


def _build_profile_payload(
    *,
    student_id: str,
    chat_id: str,
    extracted: ExtractedAnamnese,
    salles: SallesResult,
    now: str,
) -> dict[str, Any]:
    """Flatten the nested extracted model into the student_profile columns."""
    obj = extracted.objective
    sport = extracted.secondary_sport
    avail = extracted.availability
    hist = extracted.training_history
    hab = extracted.habits
    nut = extracted.nutrition

    return {
        "student_id": student_id,
        "sex": extracted.identification.sex,
        "health_clearance_required": extracted.health_clearance_required,

        "primary_goal": obj.primary_goal,
        "primary_goal_detail": obj.primary_goal_detail,
        "body_focus_areas": obj.body_focus_areas or None,
        "aesthetic_reference": obj.aesthetic_reference,

        "has_secondary_sport": sport.has_secondary_sport,
        "secondary_sport": sport.secondary_sport,
        "secondary_sport_months": sport.secondary_sport_months,
        "secondary_sport_days_per_week": sport.secondary_sport_days_per_week,
        "secondary_sport_session_minutes": sport.secondary_sport_session_minutes,
        "secondary_sport_has_competition": sport.secondary_sport_has_competition,
        "secondary_sport_competition_note": sport.secondary_sport_competition_note,
        "secondary_sport_objective": sport.secondary_sport_objective,
        "same_day_training": sport.same_day_training,
        "same_day_order": sport.same_day_order,
        "is_sport_cycle": sport.is_sport_cycle,

        "total_days_per_week": avail.total_days_per_week,
        "strength_days_per_week": avail.strength_days_per_week,
        "max_session_minutes": avail.max_session_minutes,
        "preferred_period": avail.preferred_period,
        "fixed_rest_days": avail.fixed_rest_days or None,

        "current_strength_training": hist.current_strength_training,
        "continuous_months": hist.continuous_months,
        "detraining_months": hist.detraining_months,
        "total_experience_months": hist.total_experience_months,
        "sports_history": hist.sports_history,

        "sleep_hours": hab.sleep_hours,
        "sleep_quality": hab.sleep_quality,
        "work_type": hab.work_type,
        "stress_level": hab.stress_level,
        "smokes": hab.smokes,
        "smoke_details": hab.smoke_details,
        "drinks": hab.drinks,
        "drink_details": hab.drink_details,

        "has_nutritionist": nut.has_nutritionist,
        "uses_supplements": nut.uses_supplements,
        "supplements": nut.supplements or None,
        "protein_intake_perception": nut.protein_intake_perception,

        "p1_score": salles.p1,
        "p2_score": salles.p2,
        "p3_score": salles.p3,
        "p4_avg": salles.p4_avg,
        "p5_avg": salles.p5_avg,
        "final_score": salles.final_score,
        "level": salles.level,
        "pyramid_stage": salles.pyramid_stage,

        "source_chat_id": chat_id,
        "extracted_at": now,
        "updated_at": now,
    }
