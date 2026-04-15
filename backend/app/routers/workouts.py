from fastapi import APIRouter, HTTPException, status, Depends
from app.dependencies import require_role
from app.supabase_client import get_supabase
from app.models.workout import (
    WorkoutPlanCreate, WorkoutPlanUpdate,
    WorkoutCreate, WorkoutUpdate,
    ExerciseCreate, ExerciseUpdate,
)

router = APIRouter()


# ── helpers ────────────────────────────────────────────────

# Keep the API shape backwards-compatible: merge catalog fields (name, demo_url)
# into the exercise row so the frontend keeps reading `name` / `demo_url`.
def _flatten_exercise(ex: dict) -> dict:
    cat = ex.pop("exercise_catalog", None) or {}
    ex["name"] = cat.get("name")
    ex["demo_url"] = cat.get("demo_url")
    return ex


def _resolve_catalog_id(sb, coach_id: str, body: ExerciseCreate) -> str:
    """Return a valid catalog_id owned by coach_id.

    - If body.catalog_id is given, verify it belongs to this coach.
    - Otherwise, match by case-insensitive name or create a new entry.
    """
    if body.catalog_id:
        owned = (
            sb.table("exercise_catalog")
            .select("id")
            .eq("id", str(body.catalog_id))
            .eq("coach_id", coach_id)
            .execute()
        )
        if not owned.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Exercício do catálogo não encontrado",
            )
        return owned.data[0]["id"]

    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome obrigatório")

    existing = (
        sb.table("exercise_catalog")
        .select("id")
        .eq("coach_id", coach_id)
        .ilike("name", name)
        .execute()
    )
    if existing.data:
        return existing.data[0]["id"]

    created = sb.table("exercise_catalog").insert({
        "coach_id": coach_id,
        "name": name,
        "demo_url": body.demo_url,
    }).execute()
    return created.data[0]["id"]


@router.get("/mine")
async def get_my_workouts(user: dict = Depends(require_role("student"))) -> dict:
    """Return coach info + all workout plans (with workouts) for the student, grouped by plan."""
    sb = get_supabase()

    student_res = (
        sb.table("students")
        .select("id, coach_id, coaches(bio, profiles(full_name, avatar_url))")
        .eq("user_id", user["sub"])
        .execute()
    )
    if not student_res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno não encontrado")

    student = student_res.data[0]
    student_id = student["id"]

    coach_info = None
    coach_data = student.get("coaches")
    if coach_data:
        coach_profile = coach_data.get("profiles") or {}
        coach_info = {
            "full_name": coach_profile.get("full_name"),
            "avatar_url": coach_profile.get("avatar_url"),
            "bio": coach_data.get("bio"),
        }

    plans = (
        sb.table("workout_plans")
        .select("id, name, notes, start_date, end_date, schedule_type, workouts(*)")
        .eq("student_id", student_id)
        .order("created_at", desc=True)
        .execute()
    )
    if not plans.data:
        return {"coach": coach_info, "plan_groups": []}

    # Collect all workout ids to batch-fetch session stats
    all_workout_ids: list[str] = []
    for plan in plans.data:
        for workout in plan.get("workouts") or []:
            all_workout_ids.append(workout["id"])

    if not all_workout_ids:
        return {
            "coach": coach_info,
            "plan_groups": [
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
            ],
        }

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

    return {"coach": coach_info, "plan_groups": result}


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
        .select("*, exercise_catalog(name, demo_url)")
        .eq("workout_id", workout_id)
        .order("order_index")
        .execute()
    )
    flat_exercises = [_flatten_exercise(ex) for ex in (exercises.data or [])]

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
            "exercises": flat_exercises,
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
        .select(
            "id, name, schedule_type, notes, created_at,"
            "workouts(id, name, weekday, sequence_position, exercises(id))"
        )
        .eq("student_id", student_id)
        .eq("coach_id", coach.data[0]["id"])
        .order("created_at", desc=True)
        .execute()
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
        .select("*, workouts(*, exercises(*, exercise_catalog(name, demo_url)))")
        .eq("id", plan_id)
        .eq("coach_id", coach.data[0]["id"])
        .execute()
    )
    if not plan.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plano não encontrado")

    result = plan.data[0]
    for workout in result.get("workouts") or []:
        flat = [_flatten_exercise(e) for e in (workout.get("exercises") or [])]
        flat.sort(key=lambda e: e.get("order_index", 0))
        workout["exercises"] = flat

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

    # Verify the workout belongs to this coach (via plan) and get coach_id
    workout = (
        sb.table("workouts")
        .select("id, workout_plans!inner(coach_id, coaches!inner(user_id))")
        .eq("id", workout_id)
        .execute()
    )
    if not workout.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout não encontrado")

    plan_data = workout.data[0].get("workout_plans") or {}
    coach_owner = (plan_data.get("coaches") or {}).get("user_id")
    if coach_owner != user["sub"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workout não pertence a você")

    coach_id = plan_data.get("coach_id")
    catalog_id = _resolve_catalog_id(sb, coach_id, body)

    exercise = sb.table("exercises").insert({
        "workout_id": workout_id,
        "catalog_id": catalog_id,
        "sets": body.sets,
        "reps_min": body.reps_min,
        "reps_max": body.reps_max,
        "order_index": body.order_index,
        "rest_seconds": body.rest_seconds,
        "warmup_type": body.warmup_type,
        "warmup_sets": body.warmup_sets,
        "warmup_reps": body.warmup_reps,
        "notes": body.notes,
    }).execute()

    # Return with catalog fields flattened so the frontend keeps its shape
    inserted_id = exercise.data[0]["id"]
    full = (
        sb.table("exercises")
        .select("*, exercise_catalog(name, demo_url)")
        .eq("id", inserted_id)
        .execute()
    )
    return _flatten_exercise(full.data[0])
