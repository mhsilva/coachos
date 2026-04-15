from fastapi import APIRouter, HTTPException, status, Depends, Query
from datetime import datetime, timezone
from app.dependencies import get_current_user, require_role
from app.supabase_client import get_supabase
from app.models.workout import ExerciseCatalogCreate, ExerciseCatalogUpdate

router = APIRouter()


def _coach_id(sb, user: dict) -> str:
    res = sb.table("coaches").select("id").eq("user_id", user["sub"]).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coach não encontrado")
    return res.data[0]["id"]


def _student_coach_id(sb, user: dict) -> str | None:
    res = sb.table("students").select("coach_id").eq("user_id", user["sub"]).execute()
    if not res.data:
        return None
    return res.data[0].get("coach_id")


@router.get("")
async def list_catalog(
    q: str | None = Query(default=None, description="Busca case-insensitive por nome"),
    user: dict = Depends(get_current_user),
) -> list:
    """List the caller's catalog (coach) or their coach's catalog (student).

    Returns only the fields needed by autocomplete/list UIs.
    """
    sb = get_supabase()

    role = (user.get("app_metadata") or {}).get("role")
    if role == "coach":
        coach_id = _coach_id(sb, user)
    elif role == "student":
        coach_id = _student_coach_id(sb, user)
        if not coach_id:
            return []
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")

    query = (
        sb.table("exercise_catalog")
        .select("id, name, demo_url, updated_at")
        .eq("coach_id", coach_id)
    )
    if q and q.strip():
        query = query.ilike("name", f"%{q.strip()}%")
    result = query.order("name").limit(50).execute()
    return result.data


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_catalog_entry(
    body: ExerciseCatalogCreate,
    user: dict = Depends(require_role("coach")),
) -> dict:
    sb = get_supabase()
    coach_id = _coach_id(sb, user)

    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome obrigatório")

    # Case-insensitive duplicate check (matches the unique index)
    existing = (
        sb.table("exercise_catalog")
        .select("id")
        .eq("coach_id", coach_id)
        .ilike("name", name)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Exercício já existe no catálogo")

    result = sb.table("exercise_catalog").insert({
        "coach_id": coach_id,
        "name": name,
        "demo_url": body.demo_url,
    }).execute()
    return result.data[0]


@router.patch("/{catalog_id}")
async def update_catalog_entry(
    catalog_id: str,
    body: ExerciseCatalogUpdate,
    user: dict = Depends(require_role("coach")),
) -> dict:
    sb = get_supabase()
    coach_id = _coach_id(sb, user)

    owned = (
        sb.table("exercise_catalog")
        .select("id")
        .eq("id", catalog_id)
        .eq("coach_id", coach_id)
        .execute()
    )
    if not owned.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercício não encontrado")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum campo para atualizar")

    if "name" in updates:
        new_name = updates["name"].strip()
        if not new_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome obrigatório")
        # Check duplicate (excluding self)
        dup = (
            sb.table("exercise_catalog")
            .select("id")
            .eq("coach_id", coach_id)
            .ilike("name", new_name)
            .neq("id", catalog_id)
            .execute()
        )
        if dup.data:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe um exercício com esse nome")
        updates["name"] = new_name

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = sb.table("exercise_catalog").update(updates).eq("id", catalog_id).execute()
    return result.data[0]


@router.get("/{catalog_id}/usage")
async def catalog_usage(
    catalog_id: str,
    user: dict = Depends(require_role("coach")),
) -> dict:
    """Return where this catalog entry is in use (plan names via workouts)."""
    sb = get_supabase()
    coach_id = _coach_id(sb, user)

    owned = (
        sb.table("exercise_catalog")
        .select("id")
        .eq("id", catalog_id)
        .eq("coach_id", coach_id)
        .execute()
    )
    if not owned.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercício não encontrado")

    # Walk up: exercises → workouts → workout_plans (name)
    rows = (
        sb.table("exercises")
        .select("id, workouts(workout_plans(id, name))")
        .eq("catalog_id", catalog_id)
        .execute()
    )
    plans: dict[str, str] = {}
    for r in rows.data or []:
        plan = (r.get("workouts") or {}).get("workout_plans")
        if plan and plan.get("id"):
            plans[plan["id"]] = plan.get("name") or ""

    return {
        "in_use_count": len(rows.data or []),
        "plans": [{"id": pid, "name": pname} for pid, pname in plans.items()],
    }


@router.delete("/{catalog_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_catalog_entry(
    catalog_id: str,
    user: dict = Depends(require_role("coach")),
) -> None:
    sb = get_supabase()
    coach_id = _coach_id(sb, user)

    owned = (
        sb.table("exercise_catalog")
        .select("id")
        .eq("id", catalog_id)
        .eq("coach_id", coach_id)
        .execute()
    )
    if not owned.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercício não encontrado")

    # Block deletion if still referenced by any workout exercise
    usage = (
        sb.table("exercises")
        .select("id", count="exact")
        .eq("catalog_id", catalog_id)
        .limit(1)
        .execute()
    )
    if usage.count and usage.count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Exercício em uso em {usage.count} treino(s). Remova dos treinos antes de excluir.",
        )

    sb.table("exercise_catalog").delete().eq("id", catalog_id).execute()
