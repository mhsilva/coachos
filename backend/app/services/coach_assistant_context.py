"""Builds the student-context blob injected into the coach assistant chat.

Pulls from four sources:
  1. Structured student profile (+ injuries, health conditions, meds, surgeries, strength)
  2. Last anamnese transcript from the chats bucket (full text)
  3. Last two submitted assessments (for delta)
  4. Last 15 session feedback JSONs from the session-feedbacks bucket

Returns a single XML-tagged string ready to be passed as the opening user
message. The shape is intentionally self-describing so the LLM can cite
sections back to the coach.

Context is rebuilt fresh on every turn — it's cached at the prompt-cache
layer, so re-sending it is ~free after the first hit and keeps the
assistant in sync with any mid-conversation edits (new injury, new
feedback, etc).
"""
from __future__ import annotations

import gzip
import json
import logging
from typing import Any

from app.config import settings
from app.services import transcript_store
from app.supabase_client import get_supabase

logger = logging.getLogger(__name__)

MAX_FEEDBACKS = 15
MAX_ASSESSMENTS = 2


def build_context(student_id: str) -> str:
    """Assemble the full XML-tagged context blob for one student."""
    sb = get_supabase()

    profile_block = _profile_block(sb, student_id)
    anamnese_block = _last_anamnese_block(sb, student_id)
    assessments_block = _assessments_block(sb, student_id)
    feedbacks_block = _feedbacks_block(sb, student_id)

    return "\n\n".join([
        "<student_context>",
        profile_block,
        anamnese_block,
        assessments_block,
        feedbacks_block,
        "</student_context>",
    ])


# ──────────────────────────────────────────────
# Profile (structured + histories)
# ──────────────────────────────────────────────

def _profile_block(sb, student_id: str) -> str:
    """Structured profile + append-only histories as JSON inside an XML tag."""
    student_res = (
        sb.table("students")
        .select("id, birth_date, weight_kg, height_cm, profiles(full_name)")
        .eq("id", student_id)
        .execute()
    )
    student = student_res.data[0] if student_res.data else {}

    profile_res = (
        sb.table("student_profile").select("*").eq("student_id", student_id).execute()
    )
    profile = profile_res.data[0] if profile_res.data else None

    # Keep only the latest strength row per exercise
    strength_res = (
        sb.table("student_strength_assessment")
        .select("*")
        .eq("student_id", student_id)
        .order("recorded_at", desc=True)
        .execute()
    )
    latest_by_exercise: dict[str, dict] = {}
    for row in strength_res.data or []:
        ex = row.get("exercise")
        if ex and ex not in latest_by_exercise:
            latest_by_exercise[ex] = row
    strength = list(latest_by_exercise.values())

    def _list(table: str) -> list[dict]:
        res = (
            sb.table(table)
            .select("*")
            .eq("student_id", student_id)
            .order("recorded_at", desc=True)
            .execute()
        )
        return res.data or []

    payload = {
        "student": student,
        "profile": profile,
        "strength": strength,
        "injuries": _list("student_injuries"),
        "health_conditions": _list("student_health_conditions"),
        "medications": _list("student_medications"),
        "surgeries": _list("student_surgeries"),
    }
    return (
        "<profile>\n"
        + json.dumps(payload, default=str, ensure_ascii=False, indent=2)
        + "\n</profile>"
    )


# ──────────────────────────────────────────────
# Last anamnese transcript
# ──────────────────────────────────────────────

def _last_anamnese_block(sb, student_id: str) -> str:
    """Full transcript of the most recent closed anamnese, or a stub if none."""
    chat_res = (
        sb.table("chats")
        .select("id, closed_at, storage_path")
        .eq("student_id", student_id)
        .eq("type", "anamnese")
        .eq("status", "closed")
        .order("closed_at", desc=True)
        .limit(1)
        .execute()
    )
    if not chat_res.data or not chat_res.data[0].get("storage_path"):
        return "<last_anamnese />"

    row = chat_res.data[0]
    try:
        payload = transcript_store.load(row["storage_path"])
        lines = [
            f"{m['role'].upper()}: {m['content']}"
            for m in payload.get("messages", [])
            if m.get("content")
        ]
        transcript = "\n\n".join(lines)
    except Exception:
        logger.exception("Failed to load anamnese transcript for %s", student_id)
        return "<last_anamnese error=\"load_failed\" />"

    return (
        f'<last_anamnese closed_at="{row.get("closed_at")}">\n'
        f"{transcript}\n"
        "</last_anamnese>"
    )


# ──────────────────────────────────────────────
# Recent assessments
# ──────────────────────────────────────────────

# Whitelist of measurement fields we want in the blob — the rest (status,
# photo paths, ids) is noise for the LLM.
_ASSESSMENT_FIELDS = [
    "submitted_at",
    "weight_kg",
    "body_fat_pct",
    "chest_cm",
    "waist_narrow_cm",
    "waist_navel_cm",
    "hip_cm",
    "biceps_r_cm",
    "forearm_r_cm",
    "thigh_r_cm",
    "calf_r_cm",
]


def _assessments_block(sb, student_id: str) -> str:
    res = (
        sb.table("assessments")
        .select(",".join(_ASSESSMENT_FIELDS))
        .eq("student_id", student_id)
        .eq("status", "submitted")
        .order("submitted_at", desc=True)
        .limit(MAX_ASSESSMENTS)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return "<recent_assessments />"

    pruned = [
        {k: row.get(k) for k in _ASSESSMENT_FIELDS if row.get(k) is not None}
        for row in rows
    ]
    return (
        f'<recent_assessments count="{len(pruned)}">\n'
        + json.dumps(pruned, default=str, ensure_ascii=False, indent=2)
        + "\n</recent_assessments>"
    )


# ──────────────────────────────────────────────
# Session feedbacks (from storage bucket)
# ──────────────────────────────────────────────

def _feedbacks_block(sb, student_id: str) -> str:
    """List the last MAX_FEEDBACKS feedback JSONs and expand them inline.

    Bucket layout: {student_id}/{YYYY-MM-DD}/{session_id}.json — we walk the
    date folders newest-first and pick the N most recent files.
    """
    bucket = sb.storage.from_(settings.supabase_feedbacks_bucket)

    # 1. List the date folders under {student_id}/
    try:
        date_folders = bucket.list(
            student_id,
            {"limit": 100, "sortBy": {"column": "name", "order": "desc"}},
        ) or []
    except Exception:
        logger.exception("Failed to list feedback date folders for %s", student_id)
        return "<session_feedbacks />"

    files_to_fetch: list[str] = []
    for folder in date_folders:
        name = folder.get("name")
        if not name:
            continue
        # Supabase Storage represents folders as rows with id=None
        try:
            day_files = bucket.list(
                f"{student_id}/{name}",
                {"limit": MAX_FEEDBACKS, "sortBy": {"column": "name", "order": "desc"}},
            ) or []
        except Exception:
            continue
        for f in day_files:
            fname = f.get("name")
            if fname and fname.endswith(".json"):
                files_to_fetch.append(f"{student_id}/{name}/{fname}")
                if len(files_to_fetch) >= MAX_FEEDBACKS:
                    break
        if len(files_to_fetch) >= MAX_FEEDBACKS:
            break

    if not files_to_fetch:
        return "<session_feedbacks />"

    parsed: list[dict[str, Any]] = []
    for path in files_to_fetch:
        try:
            raw = bucket.download(path)
        except Exception:
            logger.exception("Failed to download feedback %s", path)
            continue
        # Some bucket configurations return gzipped blobs; try both paths.
        try:
            try:
                text = gzip.decompress(raw).decode("utf-8")
            except (OSError, ValueError):
                text = raw.decode("utf-8")
            data = json.loads(text)
        except Exception:
            logger.exception("Failed to parse feedback %s", path)
            continue
        # Keep only the fields the LLM needs
        parsed.append({
            "submitted_at": data.get("submitted_at"),
            "workout_name": data.get("workout_name"),
            "rating": data.get("rating"),
            "comment": data.get("comment"),
        })

    return (
        f'<session_feedbacks count="{len(parsed)}">\n'
        + json.dumps(parsed, default=str, ensure_ascii=False, indent=2)
        + "\n</session_feedbacks>"
    )
