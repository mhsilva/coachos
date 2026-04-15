"""Physical assessments: coach requests, student submits photos + measurements.

Flow:
  1. Coach: POST /request           -> creates pending row + notifies student
  2. Student: GET /mine/pending     -> list pending assessments to fill
  3. Student: POST /{id}/submit     -> multipart with 3 photos + measurements
  4. Coach:  GET /student/{sid}     -> last N submitted (default 5)
  5. Coach:  GET /student/{sid}/series?metric=weight_kg  -> chart data
  6. Either: GET /{id}              -> detail with signed photo URLs
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.config import settings
from app.dependencies import get_current_user, require_role
from app.models.assessment import (
    ASSESSMENT_METRICS,
    AssessmentMetric,
    RequestAssessmentBody,
)
from app.supabase_client import get_supabase

router = APIRouter()

# How long a signed URL for a photo stays valid (seconds).
PHOTO_URL_TTL = 60 * 60  # 1 hour


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def _get_coach_id(sb, user_sub: str) -> str:
    result = sb.table("coaches").select("id").eq("user_id", user_sub).execute()
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coach não encontrado")
    return result.data[0]["id"]


def _get_student_id(sb, user_sub: str) -> str:
    result = sb.table("students").select("id").eq("user_id", user_sub).execute()
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aluno não encontrado")
    return result.data[0]["id"]


def _signed_url(sb, path: str | None) -> str | None:
    if not path:
        return None
    try:
        res = sb.storage.from_(settings.supabase_assessments_bucket).create_signed_url(
            path, PHOTO_URL_TTL
        )
        # supabase-py returns {"signedURL": "..."} or {"signedUrl": "..."}; handle both
        return res.get("signedURL") or res.get("signedUrl")
    except Exception:
        return None


def _upload_photo(sb, path: str, content: bytes, content_type: str) -> None:
    sb.storage.from_(settings.supabase_assessments_bucket).upload(
        path,
        content,
        file_options={"content-type": content_type, "upsert": "true"},
    )


# ──────────────────────────────────────────────
# Coach: request a new assessment
# ──────────────────────────────────────────────

@router.post("/request", status_code=201)
async def request_assessment(
    body: RequestAssessmentBody,
    user: dict = Depends(require_role("coach")),
) -> dict:
    """Create a pending assessment and notify the student.

    Blocks (409) if a pending assessment already exists for this (coach, student).
    """
    sb = get_supabase()
    coach_id = _get_coach_id(sb, user["sub"])
    student_id = str(body.student_id)

    # Verify the student belongs to this coach
    student = (
        sb.table("students")
        .select("id, user_id, coach_id, profiles(full_name)")
        .eq("id", student_id)
        .execute()
    )
    if not student.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aluno não encontrado")
    if student.data[0]["coach_id"] != coach_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Aluno não é seu")

    # Block duplicate pending
    pending = (
        sb.table("assessments")
        .select("id")
        .eq("coach_id", coach_id)
        .eq("student_id", student_id)
        .eq("status", "pending")
        .execute()
    )
    if pending.data:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Já existe uma avaliação pendente para este aluno",
        )

    # Create the assessment
    inserted = (
        sb.table("assessments")
        .insert({"coach_id": coach_id, "student_id": student_id})
        .execute()
    )
    assessment = inserted.data[0]

    # Coach name for the notification
    coach_profile = (
        sb.table("profiles").select("full_name").eq("id", user["sub"]).execute()
    )
    coach_name = "Seu coach"
    if coach_profile.data:
        coach_name = coach_profile.data[0].get("full_name") or coach_name

    # Notify the student
    sb.table("notifications").insert({
        "user_id": student.data[0]["user_id"],
        "type": "assessment_requested",
        "title": "Avaliação física solicitada",
        "body": f"{coach_name} pediu uma nova avaliação física",
        "payload": {"assessment_id": assessment["id"]},
    }).execute()

    return assessment


# ──────────────────────────────────────────────
# Student: list my pending assessments
# ──────────────────────────────────────────────

@router.get("/mine/pending", status_code=200)
async def my_pending_assessments(
    user: dict = Depends(require_role("student")),
) -> list:
    """Return all pending assessments for the current student."""
    sb = get_supabase()
    student_id = _get_student_id(sb, user["sub"])
    result = (
        sb.table("assessments")
        .select("id, coach_id, requested_at, coaches(profiles(full_name))")
        .eq("student_id", student_id)
        .eq("status", "pending")
        .order("requested_at", desc=True)
        .execute()
    )
    return result.data


# ──────────────────────────────────────────────
# Student: submit the assessment
# ──────────────────────────────────────────────

@router.post("/{assessment_id}/submit", status_code=200)
async def submit_assessment(
    assessment_id: str,
    photo_front: Annotated[UploadFile, File()],
    photo_back: Annotated[UploadFile, File()],
    photo_side: Annotated[UploadFile, File()],
    weight_kg: Annotated[float, Form()],
    body_fat_pct: Annotated[float | None, Form()] = None,
    chest_cm: Annotated[float | None, Form()] = None,
    waist_narrow_cm: Annotated[float | None, Form()] = None,
    waist_navel_cm: Annotated[float | None, Form()] = None,
    hip_cm: Annotated[float | None, Form()] = None,
    biceps_r_cm: Annotated[float | None, Form()] = None,
    forearm_r_cm: Annotated[float | None, Form()] = None,
    thigh_r_cm: Annotated[float | None, Form()] = None,
    calf_r_cm: Annotated[float | None, Form()] = None,
    user: dict = Depends(require_role("student")),
) -> dict:
    """Submit the assessment: 3 photos (required) + weight (required) + optional measurements."""
    sb = get_supabase()
    student_id = _get_student_id(sb, user["sub"])

    # Load the assessment and verify ownership + status
    assessment = (
        sb.table("assessments")
        .select("id, student_id, status")
        .eq("id", assessment_id)
        .execute()
    )
    if not assessment.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Avaliação não encontrada")
    row = assessment.data[0]
    if row["student_id"] != student_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Avaliação não é sua")
    if row["status"] != "pending":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Avaliação já enviada ou cancelada",
        )

    # Upload the 3 photos. Bucket path: {student_id}/{assessment_id}/{slot}.<ext>
    photo_slots: dict[str, UploadFile] = {
        "front": photo_front,
        "back": photo_back,
        "side": photo_side,
    }
    path_updates: dict[str, str] = {}
    for slot, upload in photo_slots.items():
        content = await upload.read()
        if not content:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Foto '{slot}' está vazia",
            )
        ext = _extension_from_upload(upload)
        path = f"{student_id}/{assessment_id}/{slot}.{ext}"
        _upload_photo(sb, path, content, upload.content_type or "image/jpeg")
        path_updates[f"photo_{slot}_path"] = path

    updates: dict = {
        **path_updates,
        "status": "submitted",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "weight_kg": weight_kg,
        "body_fat_pct": body_fat_pct,
        "chest_cm": chest_cm,
        "waist_narrow_cm": waist_narrow_cm,
        "waist_navel_cm": waist_navel_cm,
        "hip_cm": hip_cm,
        "biceps_r_cm": biceps_r_cm,
        "forearm_r_cm": forearm_r_cm,
        "thigh_r_cm": thigh_r_cm,
        "calf_r_cm": calf_r_cm,
    }

    sb.table("assessments").update(updates).eq("id", assessment_id).execute()

    # Notify the coach that the assessment has been submitted
    full_row = (
        sb.table("assessments")
        .select("coach_id, coaches(user_id), students(profiles(full_name))")
        .eq("id", assessment_id)
        .execute()
    )
    if full_row.data:
        coach_user_id = full_row.data[0]["coaches"]["user_id"]
        student_name = (
            full_row.data[0]["students"]["profiles"].get("full_name") or "Seu aluno"
        )
        sb.table("notifications").insert({
            "user_id": coach_user_id,
            "type": "assessment_submitted",
            "title": "Avaliação preenchida",
            "body": f"{student_name} enviou a avaliação",
            "payload": {
                "assessment_id": assessment_id,
                "student_id": student_id,
            },
        }).execute()

    return {"detail": "Avaliação enviada"}


def _extension_from_upload(upload: UploadFile) -> str:
    """Pick a file extension. Prefer filename; fall back to content-type."""
    name = upload.filename or ""
    if "." in name:
        ext = name.rsplit(".", 1)[-1].lower()
        # guard against weird strings
        if ext.isalnum() and len(ext) <= 5:
            return ext
    ct = (upload.content_type or "").lower()
    if "png" in ct:
        return "png"
    if "webp" in ct:
        return "webp"
    if "heic" in ct:
        return "heic"
    return "jpg"


# ──────────────────────────────────────────────
# Coach: list submitted assessments for a student
# ──────────────────────────────────────────────

@router.get("/student/{student_id}", status_code=200)
async def list_student_assessments(
    student_id: str,
    limit: int = 5,
    user: dict = Depends(require_role("coach")),
) -> list:
    """Coach: last N submitted assessments for one of their students."""
    sb = get_supabase()
    coach_id = _get_coach_id(sb, user["sub"])
    _assert_coach_owns_student(sb, coach_id, student_id)

    result = (
        sb.table("assessments")
        .select("*")
        .eq("coach_id", coach_id)
        .eq("student_id", student_id)
        .eq("status", "submitted")
        .order("submitted_at", desc=True)
        .limit(max(1, min(limit, 50)))
        .execute()
    )
    return result.data


@router.get("/student/{student_id}/series", status_code=200)
async def assessment_series(
    student_id: str,
    metric: AssessmentMetric,
    user: dict = Depends(require_role("coach")),
) -> list:
    """Time series of a single metric across all submitted assessments (oldest first)."""
    sb = get_supabase()
    coach_id = _get_coach_id(sb, user["sub"])
    _assert_coach_owns_student(sb, coach_id, student_id)

    # metric is validated by Literal; still guard the allow-list before string-interp
    if metric not in ASSESSMENT_METRICS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Métrica inválida")

    result = (
        sb.table("assessments")
        .select(f"submitted_at, {metric}")
        .eq("coach_id", coach_id)
        .eq("student_id", student_id)
        .eq("status", "submitted")
        .order("submitted_at", desc=False)
        .execute()
    )
    # Drop rows where the metric is null so the chart stays clean
    return [
        {"submitted_at": row["submitted_at"], "value": row[metric]}
        for row in result.data
        if row.get(metric) is not None
    ]


def _assert_coach_owns_student(sb, coach_id: str, student_id: str) -> None:
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


# ──────────────────────────────────────────────
# Detail — both coach (owner) and student (self)
# ──────────────────────────────────────────────

@router.get("/{assessment_id}", status_code=200)
async def get_assessment(
    assessment_id: str,
    user: dict = Depends(get_current_user),
) -> dict:
    """Full assessment detail, including signed URLs for the 3 photos.

    Accessible to the coach who requested it and the student who owns it.
    """
    sb = get_supabase()
    result = (
        sb.table("assessments")
        .select("*, coaches(user_id), students(user_id, profiles(full_name, avatar_url))")
        .eq("id", assessment_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Avaliação não encontrada")
    row = result.data[0]

    viewer = user["sub"]
    if row["coaches"]["user_id"] != viewer and row["students"]["user_id"] != viewer:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sem acesso a esta avaliação")

    row["photo_front_url"] = _signed_url(sb, row.get("photo_front_path"))
    row["photo_back_url"] = _signed_url(sb, row.get("photo_back_path"))
    row["photo_side_url"] = _signed_url(sb, row.get("photo_side_path"))
    return row
