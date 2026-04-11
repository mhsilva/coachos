from fastapi import APIRouter, HTTPException, status, Depends
from app.dependencies import require_role
from app.supabase_client import get_supabase
from app.models.user import SetRoleRequest, LinkStudentRequest

router = APIRouter()


@router.get("/users", status_code=200)
async def list_users(
    _user: dict = Depends(require_role("admin")),
) -> list:
    """Admin: list all users with their profiles."""
    sb = get_supabase()
    result = (
        sb.table("profiles")
        .select("id, role, full_name, avatar_url, is_active, created_at")
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.post("/set-role", status_code=200)
async def set_role(
    body: SetRoleRequest,
    _user: dict = Depends(require_role("admin")),
) -> dict:
    """Admin sets or changes a user's role.

    Updates profiles.role, auth.users.app_metadata, and creates the
    role-specific record (coaches / students) if it doesn't exist yet.
    """
    sb = get_supabase()
    user_id = str(body.user_id)

    # 1. Update profiles table
    sb.table("profiles").update({"role": body.role}).eq("id", user_id).execute()

    # 2. Update app_metadata so the JWT carries the new role on next login
    sb.auth.admin.update_user_by_id(
        user_id,
        {"app_metadata": {"role": body.role}},
    )

    # 3. Ensure role-specific record exists
    if body.role == "coach":
        sb.table("coaches").upsert({"user_id": user_id}, on_conflict="user_id").execute()
        # Remove from students if switching roles
        sb.table("students").delete().eq("user_id", user_id).execute()

    elif body.role == "student":
        sb.table("students").upsert({"user_id": user_id}, on_conflict="user_id").execute()
        # Remove from coaches if switching roles
        sb.table("coaches").delete().eq("user_id", user_id).execute()

    return {"detail": f"Role atualizada para {body.role}"}


@router.post("/link-student", status_code=200)
async def link_student(
    body: LinkStudentRequest,
    user: dict = Depends(require_role("coach")),
) -> dict:
    """Coach links an existing student account by email."""
    sb = get_supabase()

    users_response = sb.auth.admin.list_users()
    student_auth = next(
        (u for u in users_response if u.email == body.student_email), None
    )
    if not student_auth:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno não encontrado")

    coach_result = sb.table("coaches").select("id").eq("user_id", user["sub"]).execute()
    if not coach_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coach não encontrado")
    coach_id = coach_result.data[0]["id"]

    student_result = (
        sb.table("students").select("id").eq("user_id", student_auth.id).execute()
    )
    if not student_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aluno não tem perfil de student",
        )

    sb.table("students").update({"coach_id": coach_id}).eq("user_id", student_auth.id).execute()

    return {"detail": "Aluno vinculado com sucesso"}
