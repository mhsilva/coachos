from fastapi import APIRouter, HTTPException, status, Depends
from app.dependencies import require_role
from app.supabase_client import get_supabase
from app.models.workout import WorkoutPlanCreate, WorkoutCreate, ExerciseCreate
from datetime import date

router = APIRouter()


@router.get("/today")
async def get_today_workout(user: dict = Depends(require_role("student"))) -> list:
    """Return the workout(s) scheduled for today for the authenticated student."""
    sb = get_supabase()

    student = sb.table("students").select("id").eq("user_id", user["sub"]).execute()
    if not student.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno não encontrado")
    student_id = student.data[0]["id"]

    plans = sb.table("workout_plans").select("*, workouts(*)").eq("student_id", student_id).execute()
    if not plans.data:
        return []

    today_weekday = date.today().weekday()  # 0=Monday, 6=Sunday
    result = []

    for plan in plans.data:
        if plan["schedule_type"] == "fixed_days":
            for workout in plan.get("workouts") or []:
                if workout.get("weekday") == today_weekday:
                    exercises = (
                        sb.table("exercises")
                        .select("*")
                        .eq("workout_id", workout["id"])
                        .order("order_index")
                        .execute()
                    )
                    workout["exercises"] = exercises.data
                    result.append({"plan": plan["name"], "workout": workout})

        elif plan["schedule_type"] == "sequence":
            workouts_sorted = sorted(
                plan.get("workouts") or [],
                key=lambda w: w.get("sequence_position") or 0,
            )
            if not workouts_sorted:
                continue

            workout_ids = [w["id"] for w in workouts_sorted]
            last_session = (
                sb.table("workout_sessions")
                .select("workout_id, finished_at")
                .eq("student_id", student_id)
                .in_("workout_id", workout_ids)
                .not_.is_("finished_at", "null")
                .order("finished_at", desc=True)
                .limit(1)
                .execute()
            )

            if not last_session.data:
                next_workout = workouts_sorted[0]
            else:
                last_id = last_session.data[0]["workout_id"]
                try:
                    last_pos = workout_ids.index(last_id)
                    next_workout = workouts_sorted[(last_pos + 1) % len(workouts_sorted)]
                except ValueError:
                    next_workout = workouts_sorted[0]

            exercises = (
                sb.table("exercises")
                .select("*")
                .eq("workout_id", next_workout["id"])
                .order("order_index")
                .execute()
            )
            next_workout["exercises"] = exercises.data
            result.append({"plan": plan["name"], "workout": next_workout})

    return result


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
