from fastapi import APIRouter, HTTPException, status, Depends
from app.dependencies import get_current_user, require_role
from app.supabase_client import get_supabase
from app.models.user import SetRoleRequest, LinkStudentRequest
from datetime import datetime, timezone

router = APIRouter()


@router.get("/users", status_code=200)
async def list_users(
    _user: dict = Depends(require_role("admin")),
) -> list:
    """Admin: list all users merged from auth.users (email) + profiles (role)."""
    sb = get_supabase()

    # auth.users has the email; profiles has the role and metadata
    auth_users = sb.auth.admin.list_users()
    profiles_result = sb.table("profiles").select("*").execute()
    profiles_by_id = {p["id"]: p for p in profiles_result.data}

    result = []
    for u in auth_users:
        p = profiles_by_id.get(u.id, {})
        result.append({
            "id": u.id,
            "email": u.email,
            "full_name": p.get("full_name") or (u.user_metadata or {}).get("full_name"),
            "avatar_url": p.get("avatar_url") or (u.user_metadata or {}).get("avatar_url"),
            "role": p.get("role", "student"),
            "is_active": p.get("is_active", True),
            "coach_requested_at": p.get("coach_requested_at"),
            "created_at": u.created_at,
        })

    return result


@router.post("/set-role", status_code=200)
async def set_role(
    body: SetRoleRequest,
    _user: dict = Depends(require_role("admin")),
) -> dict:
    """Admin sets or changes a user's role."""
    sb = get_supabase()
    user_id = str(body.user_id)

    # 1. Update profiles table (also clear coach request)
    sb.table("profiles").update({
        "role": body.role,
        "coach_requested_at": None,
    }).eq("id", user_id).execute()

    # 2. Update app_metadata so the JWT carries the new role
    sb.auth.admin.update_user_by_id(
        user_id,
        {"app_metadata": {"role": body.role}},
    )

    # 3. Ensure role-specific record exists
    if body.role == "coach":
        sb.table("coaches").upsert(
            {"user_id": user_id, "approved_at": datetime.now(timezone.utc).isoformat()},
            on_conflict="user_id",
        ).execute()
        sb.table("students").delete().eq("user_id", user_id).execute()
    elif body.role == "student":
        sb.table("students").upsert({"user_id": user_id}, on_conflict="user_id").execute()
        sb.table("coaches").delete().eq("user_id", user_id).execute()

    return {"detail": f"Role atualizada para {body.role}"}


@router.post("/request-coach", status_code=200)
async def request_coach(
    user: dict = Depends(get_current_user),
) -> dict:
    """Student requests promotion to coach. Admin will see it in the panel."""
    sb = get_supabase()

    # Verify user is currently a student
    profile = sb.table("profiles").select("role").eq("id", user["sub"]).single().execute()
    if not profile.data or profile.data["role"] != "student":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Apenas alunos podem solicitar")

    sb.table("profiles").update({
        "coach_requested_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", user["sub"]).execute()

    return {"detail": "Solicitação enviada com sucesso"}


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
