from fastapi import APIRouter, HTTPException, status, Depends
from app.dependencies import require_role
from app.supabase_client import get_supabase
from app.models.workout import WorkoutPlanCreate, WorkoutCreate, ExerciseCreate

router = APIRouter()


@router.get("/mine")
async def get_my_workouts(user: dict = Depends(require_role("student"))) -> list:
    """Return all workouts for the student with execution stats."""
    sb = get_supabase()

    student = sb.table("students").select("id").eq("user_id", user["sub"]).execute()
    if not student.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno não encontrado")
    student_id = student.data[0]["id"]

    plans = sb.table("workout_plans").select("*, workouts(*)").eq("student_id", student_id).execute()
    if not plans.data:
        return []

    # Collect all workout ids to batch-fetch session stats
    all_workouts: list[dict] = []
    for plan in plans.data:
        for workout in plan.get("workouts") or []:
            all_workouts.append({"plan_name": plan["name"], **workout})

    if not all_workouts:
        return []

    workout_ids = [w["id"] for w in all_workouts]

    # Fetch all finished sessions for these workouts
    sessions = (
        sb.table("workout_sessions")
        .select("workout_id, finished_at")
        .eq("student_id", student_id)
        .in_("workout_id", workout_ids)
        .not_.is_("finished_at", "null")
        .order("finished_at", desc=True)
        .execute()
    )

    # Build stats per workout
    stats: dict[str, dict] = {}
    for s in sessions.data:
        wid = s["workout_id"]
        if wid not in stats:
            stats[wid] = {"times_executed": 0, "last_executed_at": s["finished_at"]}
        stats[wid]["times_executed"] += 1

    result = []
    for w in all_workouts:
        wid = w["id"]
        ws = stats.get(wid, {"times_executed": 0, "last_executed_at": None})
        result.append({
            "plan": w["plan_name"],
            "workout": {
                "id": w["id"],
                "name": w["name"],
                "weekday": w.get("weekday"),
                "sequence_position": w.get("sequence_position"),
                "estimated_duration_min": w.get("estimated_duration_min"),
            },
            "times_executed": ws["times_executed"],
            "last_executed_at": ws["last_executed_at"],
        })

    return result


@router.get("/mine/{workout_id}")
async def get_workout_detail(
    workout_id: str,
    user: dict = Depends(require_role("student")),
) -> dict:
    """Return a single workout with its exercises for execution."""
    sb = get_supabase()

    student = sb.table("students").select("id").eq("user_id", user["sub"]).execute()
    if not student.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno não encontrado")

    # Verify the workout belongs to this student via plan
    workout = (
        sb.table("workouts")
        .select("*, workout_plans!inner(student_id, name)")
        .eq("id", workout_id)
        .execute()
    )
    if not workout.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treino não encontrado")

    plan_data = workout.data[0].get("workout_plans", {})
    if plan_data.get("student_id") != student.data[0]["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Treino não pertence a este aluno")

    exercises = (
        sb.table("exercises")
        .select("*")
        .eq("workout_id", workout_id)
        .order("order_index")
        .execute()
    )

    w = workout.data[0]
    return {
        "plan": plan_data.get("name", ""),
        "workout": {
            "id": w["id"],
            "name": w["name"],
            "estimated_duration_min": w.get("estimated_duration_min"),
            "exercises": exercises.data,
        },
    }


@router.get("/plans")
async def get_student_plans(
    student_id: str,
    user: dict = Depends(require_role("coach")),
) -> list:
    """Return all workout plans for a student, with nested workouts and exercises."""
    sb = get_supabase()

    coach = sb.table("coaches").select("id").eq("user_id", user["sub"]).execute()
    if not coach.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coach não encontrado")

    plans = (
        sb.table("workout_plans")
        .select("*, workouts(*, exercises(*))")
        .eq("student_id", student_id)
        .eq("coach_id", coach.data[0]["id"])
        .order("created_at", desc=True)
        .execute()
    )

    for plan in plans.data:
        for workout in plan.get("workouts") or []:
            workout["exercises"] = sorted(
                workout.get("exercises") or [],
                key=lambda e: e.get("order_index", 0),
            )

    return plans.data


@router.post("/plans", status_code=status.HTTP_201_CREATED)
async def create_plan(
    body: WorkoutPlanCreate,
    user: dict = Depends(require_role("coach")),
) -> dict:
    sb = get_supabase()

    coach = sb.table("coaches").select("id").eq("user_id", user["sub"]).execute()
    if not coach.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coach não encontrado")

    plan = sb.table("workout_plans").insert({
        "coach_id": coach.data[0]["id"],
        "student_id": str(body.student_id),
        "name": body.name,
        "schedule_type": body.schedule_type,
    }).execute()

    return plan.data[0]


@router.post("/plans/{plan_id}/workouts", status_code=status.HTTP_201_CREATED)
async def add_workout_to_plan(
    plan_id: str,
    body: WorkoutCreate,
    user: dict = Depends(require_role("coach")),
) -> dict:
    sb = get_supabase()

    coach = sb.table("coaches").select("id").eq("user_id", user["sub"]).execute()
    if not coach.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coach não encontrado")

    # Verify ownership
    plan = (
        sb.table("workout_plans")
        .select("id")
        .eq("id", plan_id)
        .eq("coach_id", coach.data[0]["id"])
        .execute()
    )
    if not plan.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plano não encontrado")

    workout = sb.table("workouts").insert({
        "plan_id": plan_id,
        "name": body.name,
        "weekday": body.weekday,
        "sequence_position": body.sequence_position,
        "estimated_duration_min": body.estimated_duration_min,
    }).execute()

    return workout.data[0]


@router.post("/{workout_id}/exercises", status_code=status.HTTP_201_CREATED)
async def add_exercise(
    workout_id: str,
    body: ExerciseCreate,
    user: dict = Depends(require_role("coach")),
) -> dict:
    sb = get_supabase()

    # Verify the workout belongs to this coach (via plan)
    workout = (
        sb.table("workouts")
        .select("id, workout_plans!inner(coach_id, coaches!inner(user_id))")
        .eq("id", workout_id)
        .execute()
    )
    if not workout.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout não encontrado")

    exercise = sb.table("exercises").insert({
        "workout_id": workout_id,
        "name": body.name,
        "sets": body.sets,
        "reps_min": body.reps_min,
        "reps_max": body.reps_max,
        "order_index": body.order_index,
        "demo_url": body.demo_url,
    }).execute()

    return exercise.data[0]
