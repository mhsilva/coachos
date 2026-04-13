from fastapi import APIRouter, HTTPException, status, Depends
from app.dependencies import require_role
from app.supabase_client import get_supabase
from app.models.workout import (
    WorkoutPlanCreate, WorkoutPlanUpdate,
    WorkoutCreate, WorkoutUpdate,
    ExerciseCreate, ExerciseUpdate,
)

router = APIRouter()


@router.get("/mine")
async def get_my_workouts(user: dict = Depends(require_role("student"))) -> list:
    """Return all workout plans (with workouts) for the student, grouped by plan, with execution stats."""
    sb = get_supabase()

    student = sb.table("students").select("id").eq("user_id", user["sub"]).execute()
    if not student.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno não encontrado")
    student_id = student.data[0]["id"]

    plans = (
        sb.table("workout_plans")
        .select("id, name, notes, start_date, end_date, schedule_type, workouts(*)")
        .eq("student_id", student_id)
        .order("created_at", desc=True)
        .execute()
    )
    if not plans.data:
        return []

    # Collect all workout ids to batch-fetch session stats
    all_workout_ids: list[str] = []
    for plan in plans.data:
        for workout in plan.get("workouts") or []:
            all_workout_ids.append(workout["id"])

    if not all_workout_ids:
        return [
            {
                "plan": {
                    "id": p["id"],
                    "name": p["name"],
                    "notes": p.get("notes"),
                    "start_date": p.get("start_date"),
                    "end_date": p.get("end_date"),
                    "schedule_type": p.get("schedule_type"),
                },
                "workouts": [],
            }
            for p in plans.data
        ]

    # Fetch all finished sessions for these workouts
    sessions = (
        sb.table("workout_sessions")
        .select("workout_id, finished_at")
        .eq("student_id", student_id)
        .in_("workout_id", all_workout_ids)
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
    for plan in plans.data:
        workouts_out = []
        for w in plan.get("workouts") or []:
            wid = w["id"]
            ws = stats.get(wid, {"times_executed": 0, "last_executed_at": None})
            workouts_out.append({
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
        result.append({
            "plan": {
                "id": plan["id"],
                "name": plan["name"],
                "notes": plan.get("notes"),
                "start_date": plan.get("start_date"),
                "end_date": plan.get("end_date"),
                "schedule_type": plan.get("schedule_type"),
            },
            "workouts": workouts_out,
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
        .select("*, workout_plans!inner(id, student_id, name, notes, start_date, end_date)")
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
        "plan": {
            "id": plan_data.get("id", ""),
            "name": plan_data.get("name", ""),
            "notes": plan_data.get("notes"),
            "start_date": plan_data.get("start_date"),
            "end_date": plan_data.get("end_date"),
        },
        "workout": {
            "id": w["id"],
            "name": w["name"],
            "format": w.get("format", "structured"),
            "content": w.get("content"),
            "notes": w.get("notes"),
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


@router.get("/plans/{plan_id}")
async def get_plan(
    plan_id: str,
    user: dict = Depends(require_role("coach")),
) -> dict:
    """Return a single plan with nested workouts and exercises for editing."""
    sb = get_supabase()

    coach = sb.table("coaches").select("id").eq("user_id", user["sub"]).execute()
    if not coach.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coach não encontrado")

    plan = (
        sb.table("workout_plans")
        .select("*, workouts(*, exercises(*))")
        .eq("id", plan_id)
        .eq("coach_id", coach.data[0]["id"])
        .execute()
    )
    if not plan.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plano não encontrado")

    result = plan.data[0]
    for workout in result.get("workouts") or []:
        workout["exercises"] = sorted(
            workout.get("exercises") or [],
            key=lambda e: e.get("order_index", 0),
        )

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
        "notes": body.notes,
        "start_date": body.start_date.isoformat() if body.start_date else None,
        "end_date": body.end_date.isoformat() if body.end_date else None,
    }).execute()

    return plan.data[0]


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan(
    plan_id: str,
    user: dict = Depends(require_role("coach")),
) -> None:
    sb = get_supabase()

    coach = sb.table("coaches").select("id").eq("user_id", user["sub"]).execute()
    if not coach.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coach não encontrado")

    plan = (
        sb.table("workout_plans")
        .select("id")
        .eq("id", plan_id)
        .eq("coach_id", coach.data[0]["id"])
        .execute()
    )
    if not plan.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plano não encontrado")

    sb.table("workout_plans").delete().eq("id", plan_id).execute()


@router.patch("/plans/{plan_id}")
async def update_plan(
    plan_id: str,
    body: WorkoutPlanUpdate,
    user: dict = Depends(require_role("coach")),
) -> dict:
    sb = get_supabase()
    coach = sb.table("coaches").select("id").eq("user_id", user["sub"]).execute()
    if not coach.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coach não encontrado")

    plan = (
        sb.table("workout_plans")
        .select("id")
        .eq("id", plan_id)
        .eq("coach_id", coach.data[0]["id"])
        .execute()
    )
    if not plan.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plano não encontrado")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum campo para atualizar")

    result = sb.table("workout_plans").update(updates).eq("id", plan_id).execute()
    return result.data[0]


@router.patch("/workouts/{workout_id}")
async def update_workout(
    workout_id: str,
    body: WorkoutUpdate,
    user: dict = Depends(require_role("coach")),
) -> dict:
    sb = get_supabase()

    workout = (
        sb.table("workouts")
        .select("id, workout_plans!inner(coach_id, coaches!inner(user_id))")
        .eq("id", workout_id)
        .execute()
    )
    if not workout.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treino não encontrado")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum campo para atualizar")

    result = sb.table("workouts").update(updates).eq("id", workout_id).execute()
    return result.data[0]


@router.delete("/workouts/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workout(
    workout_id: str,
    user: dict = Depends(require_role("coach")),
) -> None:
    sb = get_supabase()

    workout = (
        sb.table("workouts")
        .select("id, workout_plans!inner(coach_id, coaches!inner(user_id))")
        .eq("id", workout_id)
        .execute()
    )
    if not workout.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treino não encontrado")

    sb.table("workouts").delete().eq("id", workout_id).execute()


@router.patch("/exercises/{exercise_id}")
async def update_exercise(
    exercise_id: str,
    body: ExerciseUpdate,
    user: dict = Depends(require_role("coach")),
) -> dict:
    sb = get_supabase()

    exercise = (
        sb.table("exercises")
        .select("id, workouts!inner(workout_plans!inner(coach_id, coaches!inner(user_id)))")
        .eq("id", exercise_id)
        .execute()
    )
    if not exercise.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercício não encontrado")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum campo para atualizar")

    result = sb.table("exercises").update(updates).eq("id", exercise_id).execute()
    return result.data[0]


@router.delete("/exercises/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exercise(
    exercise_id: str,
    user: dict = Depends(require_role("coach")),
) -> None:
    sb = get_supabase()

    exercise = (
        sb.table("exercises")
        .select("id, workouts!inner(workout_plans!inner(coach_id, coaches!inner(user_id)))")
        .eq("id", exercise_id)
        .execute()
    )
    if not exercise.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercício não encontrado")

    sb.table("exercises").delete().eq("id", exercise_id).execute()


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
        "format": body.format,
        "content": body.content,
        "weekday": body.weekday,
        "sequence_position": body.sequence_position,
        "estimated_duration_min": body.estimated_duration_min,
        "notes": body.notes,
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
        "rest_seconds": body.rest_seconds,
        "warmup_type": body.warmup_type,
        "warmup_sets": body.warmup_sets,
        "warmup_reps": body.warmup_reps,
        "notes": body.notes,
    }).execute()

    return exercise.data[0]
