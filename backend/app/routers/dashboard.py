from fastapi import APIRouter, HTTPException, status, Depends
from app.dependencies import require_role
from app.supabase_client import get_supabase
from datetime import date

router = APIRouter()


@router.get("/coach")
async def coach_dashboard(user: dict = Depends(require_role("coach"))) -> dict:
    """Return KPIs and recent load updates for the authenticated coach."""
    sb = get_supabase()

    coach = sb.table("coaches").select("id").eq("user_id", user["sub"]).execute()
    if not coach.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coach não encontrado")
    coach_id = coach.data[0]["id"]

    students = (
        sb.table("students")
        .select("id, user_id, profiles(full_name, avatar_url, is_active)")
        .eq("coach_id", coach_id)
        .execute()
    )
    student_ids = [s["id"] for s in students.data]
    active_students = len(students.data)

    sessions_today = 0
    sessions_done_today: list = []
    recent_loads: list = []

    if student_ids:
        today_str = date.today().isoformat()

        # Sessions finished today with student name + workout name
        today_done = (
            sb.table("workout_sessions")
            .select(
                "id, started_at, finished_at, workout_name,"
                "workouts(name),"
                "students!inner(profiles(full_name))"
            )
            .in_("student_id", student_ids)
            .gte("started_at", today_str)
            .not_.is_("finished_at", "null")
            .order("finished_at", desc=True)
            .execute()
        )
        sessions_today = len(today_done.data)
        sessions_done_today = today_done.data

        # Recent set logs with exercise name and student name
        recent = (
            sb.table("set_logs")
            .select(
                "id, weight_kg, reps_done, logged_at, set_number,"
                "exercises(name),"
                "workout_sessions!inner(student_id, students!inner(profiles(full_name)))"
            )
            .in_("workout_sessions.student_id", student_ids)
            .not_.is_("weight_kg", "null")
            .order("logged_at", desc=True)
            .limit(20)
            .execute()
        )
        recent_loads = recent.data

    return {
        "active_students": active_students,
        "sessions_today": sessions_today,
        "students": students.data,
        "recent_loads": recent_loads,
        "sessions_done_today": sessions_done_today,
    }


@router.get("/student/{student_id}")
async def student_detail(
    student_id: str,
    user: dict = Depends(require_role("coach")),
) -> dict:
    """Return session history (light) + progression logs (recent only) for one student.

    Split into two queries to avoid pulling every set_log for every session up-front.
    - `sessions`: last 20 sessions with sets_count only (for the history list)
    - `progression_logs`: flat list of (exercise_name, weight_kg, started_at) for
      the last 15 sessions (enough for a usable chart).
    """
    sb = get_supabase()

    coach = sb.table("coaches").select("id").eq("user_id", user["sub"]).execute()
    if not coach.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coach não encontrado")

    # Verify student belongs to this coach
    student = (
        sb.table("students")
        .select("id, user_id, profiles(full_name, avatar_url)")
        .eq("id", student_id)
        .eq("coach_id", coach.data[0]["id"])
        .execute()
    )
    if not student.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno não encontrado")

    SESSIONS_LIMIT = 20
    PROGRESSION_SESSIONS = 15

    sessions_result = (
        sb.table("workout_sessions")
        .select("id, started_at, finished_at, workout_name, workouts(name)")
        .eq("student_id", student_id)
        .order("started_at", desc=True)
        .limit(SESSIONS_LIMIT)
        .execute()
    )
    sessions_data: list[dict] = sessions_result.data
    session_ids = [s["id"] for s in sessions_data]

    # Count set_logs per session (single query, no payload beyond session ids)
    counts: dict[str, int] = {}
    if session_ids:
        count_rows = (
            sb.table("set_logs")
            .select("session_id")
            .in_("session_id", session_ids)
            .execute()
        )
        for row in count_rows.data:
            counts[row["session_id"]] = counts.get(row["session_id"], 0) + 1
    for s in sessions_data:
        s["sets_count"] = counts.get(s["id"], 0)

    # Progression data: last N sessions' weighted logs only
    progression_sessions = session_ids[:PROGRESSION_SESSIONS]
    progression_logs: list[dict] = []
    if progression_sessions:
        logs = (
            sb.table("set_logs")
            .select("session_id, weight_kg, exercises(name)")
            .in_("session_id", progression_sessions)
            .not_.is_("weight_kg", "null")
            .execute()
        )
        session_dates = {s["id"]: s["started_at"] for s in sessions_data}
        for log in logs.data:
            exercise = log.get("exercises") or {}
            progression_logs.append({
                "exercise_name": exercise.get("name"),
                "weight_kg": log["weight_kg"],
                "started_at": session_dates.get(log["session_id"]),
            })

    return {
        "student": student.data[0],
        "sessions": sessions_data,
        "progression_logs": progression_logs,
    }
