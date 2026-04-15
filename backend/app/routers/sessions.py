from fastapi import APIRouter, HTTPException, status, Depends
from app.dependencies import require_role
from app.supabase_client import get_supabase
from app.models.session import SessionStart, SetLogCreate
from datetime import datetime, timezone

router = APIRouter()


def _get_student_id(sb, user_sub: str) -> str:
    result = sb.table("students").select("id").eq("user_id", user_sub).execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno não encontrado")
    return result.data[0]["id"]


@router.get("/mine")
async def get_my_sessions(user: dict = Depends(require_role("student"))) -> list:
    """Return all finished sessions for the student with set logs."""
    sb = get_supabase()
    student_id = _get_student_id(sb, user["sub"])

    sessions = (
        sb.table("workout_sessions")
        .select("id, started_at, finished_at, workout_id, workout_name, workouts(name), set_logs(*)")
        .eq("student_id", student_id)
        .not_.is_("finished_at", "null")
        .order("started_at", desc=True)
        .limit(50)
        .execute()
    )

    return sessions.data


@router.get("/last-logs/{workout_id}")
async def get_last_logs(
    workout_id: str,
    user: dict = Depends(require_role("student")),
) -> list:
    """Return set_logs from the student's most recent finished session for this workout."""
    sb = get_supabase()
    student_id = _get_student_id(sb, user["sub"])

    # Find the most recent finished session
    last_session = (
        sb.table("workout_sessions")
        .select("id")
        .eq("student_id", student_id)
        .eq("workout_id", workout_id)
        .not_.is_("finished_at", "null")
        .order("finished_at", desc=True)
        .limit(1)
        .execute()
    )
    if not last_session.data:
        return []

    logs = (
        sb.table("set_logs")
        .select("exercise_id, set_number, weight_kg, reps_done")
        .eq("session_id", last_session.data[0]["id"])
        .order("set_number")
        .execute()
    )

    return logs.data


@router.post("/start", status_code=status.HTTP_201_CREATED)
async def start_session(
    body: SessionStart,
    user: dict = Depends(require_role("student")),
) -> dict:
    """Student starts a workout session."""
    sb = get_supabase()
    student_id = _get_student_id(sb, user["sub"])

    # Snapshot workout name so history survives plan deletion
    workout = sb.table("workouts").select("name").eq("id", str(body.workout_id)).execute()
    workout_name = workout.data[0]["name"] if workout.data else None

    session = sb.table("workout_sessions").insert({
        "student_id": student_id,
        "workout_id": str(body.workout_id),
        "workout_name": workout_name,
    }).execute()

    return session.data[0]


@router.post("/{session_id}/log", status_code=status.HTTP_201_CREATED)
async def log_set(
    session_id: str,
    body: SetLogCreate,
    user: dict = Depends(require_role("student")),
) -> dict:
    """Student logs a completed set."""
    sb = get_supabase()
    student_id = _get_student_id(sb, user["sub"])

    # Verify session belongs to this student
    session = (
        sb.table("workout_sessions")
        .select("id")
        .eq("id", session_id)
        .eq("student_id", student_id)
        .execute()
    )
    if not session.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sessão não encontrada")

    # Snapshot exercise name (resolved via catalog) so history survives deletion
    exercise = (
        sb.table("exercises")
        .select("exercise_catalog(name)")
        .eq("id", str(body.exercise_id))
        .execute()
    )
    exercise_name = None
    if exercise.data:
        cat = exercise.data[0].get("exercise_catalog") or {}
        exercise_name = cat.get("name")

    log = sb.table("set_logs").insert({
        "session_id": session_id,
        "exercise_id": str(body.exercise_id),
        "exercise_name": exercise_name,
        "set_number": body.set_number,
        "reps_done": body.reps_done,
        "weight_kg": body.weight_kg,
    }).execute()

    return log.data[0]


@router.patch("/{session_id}/finish")
async def finish_session(
    session_id: str,
    user: dict = Depends(require_role("student")),
) -> dict:
    """Student marks a session as finished."""
    sb = get_supabase()
    student_id = _get_student_id(sb, user["sub"])

    result = (
        sb.table("workout_sessions")
        .update({"finished_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", session_id)
        .eq("student_id", student_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sessão não encontrada")

    return result.data[0]
