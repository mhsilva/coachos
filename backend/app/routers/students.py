"""Student self-service endpoints (profile data)."""
from fastapi import APIRouter, Depends, HTTPException, status
from app.dependencies import get_current_user, require_role
from app.supabase_client import get_supabase
from app.models.user import UpdateStudentProfileRequest

router = APIRouter()


@router.get("/me", status_code=200)
async def get_my_profile(user: dict = Depends(require_role("student"))) -> dict:
    """Return the student's own profile data (for the profile page)."""
    sb = get_supabase()
    result = (
        sb.table("students")
        .select("id, birth_date, weight_kg, user_id, profiles(full_name, avatar_url)")
        .eq("user_id", user["sub"])
        .execute()
    )
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aluno não encontrado")
    data = result.data[0]
    data["email"] = user.get("email")
    return data


@router.patch("/me", status_code=200)
async def update_my_profile(
    body: UpdateStudentProfileRequest,
    user: dict = Depends(require_role("student")),
) -> dict:
    """Student updates their own profile fields."""
    sb = get_supabase()

    student = (
        sb.table("students")
        .select("id")
        .eq("user_id", user["sub"])
        .execute()
    )
    if not student.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aluno não encontrado")
    student_id = student.data[0]["id"]

    updates: dict = {}
    if body.birth_date is not None:
        updates["birth_date"] = body.birth_date
    if body.weight_kg is not None:
        updates["weight_kg"] = body.weight_kg

    if not updates:
        return {"detail": "Nenhum campo alterado"}

    sb.table("students").update(updates).eq("id", student_id).execute()
    return {"detail": "Perfil atualizado"}
