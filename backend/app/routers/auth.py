from fastapi import APIRouter, HTTPException, status, Depends
from app.dependencies import get_current_user, require_role
from app.supabase_client import get_supabase
from app.models.user import SetRoleRequest, LinkStudentRequest, InviteStudentRequest, InviteActionRequest
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
        # Prefer role from app_metadata (canonical), fallback to profiles table
        auth_role = (u.app_metadata or {}).get("role")
        profile_role = p.get("role", "student") if p else "student"
        result.append({
            "id": u.id,
            "email": u.email,
            "full_name": p.get("full_name") or (u.user_metadata or {}).get("full_name"),
            "avatar_url": p.get("avatar_url") or (u.user_metadata or {}).get("avatar_url"),
            "role": auth_role or profile_role,
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


@router.delete("/users/{user_id}", status_code=200)
async def delete_user(
    user_id: str,
    _user: dict = Depends(require_role("admin")),
) -> dict:
    """Admin deletes a user entirely (auth + cascade deletes profiles, coaches, students, etc.)."""
    sb = get_supabase()
    try:
        sb.auth.admin.delete_user(user_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Erro ao deletar usuário: {str(e)}",
        )
    return {"detail": "Usuário deletado com sucesso"}


@router.post("/invite-student", status_code=201)
async def invite_student(
    body: InviteStudentRequest,
    user: dict = Depends(require_role("coach")),
) -> dict:
    """Coach sends an invite to a student by email."""
    sb = get_supabase()

    # Find student auth record by email
    users_response = sb.auth.admin.list_users()
    student_auth = next(
        (u for u in users_response if u.email == body.student_email), None
    )
    if not student_auth:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno não encontrado")

    # Get coach record
    coach_result = sb.table("coaches").select("id").eq("user_id", user["sub"]).execute()
    if not coach_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coach não encontrado")
    coach_id = coach_result.data[0]["id"]

    # Get student record
    student_result = (
        sb.table("students").select("id, coach_id").eq("user_id", student_auth.id).execute()
    )
    if not student_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aluno não tem perfil de student",
        )
    student_id = student_result.data[0]["id"]

    # Check if student is already linked to this coach
    if student_result.data[0].get("coach_id") == coach_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Aluno já vinculado a você")

    # Check if a pending invite already exists
    existing = (
        sb.table("invites")
        .select("id")
        .eq("coach_id", coach_id)
        .eq("student_id", student_id)
        .eq("status", "pending")
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Convite pendente já existe")

    # Create invite
    invite = sb.table("invites").insert({
        "coach_id": coach_id,
        "student_id": student_id,
    }).execute()

    # Get coach name for notification
    coach_profile = sb.table("profiles").select("full_name").eq("id", user["sub"]).execute()
    coach_name = user.get("email", "Coach")
    if coach_profile.data:
        coach_name = coach_profile.data[0].get("full_name") or coach_name

    # Create notification for the student
    sb.table("notifications").insert({
        "user_id": student_auth.id,
        "type": "invite_received",
        "title": "Convite de treinador",
        "body": f"{coach_name} quer ser seu treinador",
        "payload": {"invite_id": invite.data[0]["id"]},
    }).execute()

    return invite.data[0]


@router.post("/respond-invite", status_code=200)
async def respond_invite(
    body: InviteActionRequest,
    user: dict = Depends(require_role("student")),
) -> dict:
    """Student accepts or rejects a coach invite."""
    sb = get_supabase()

    # Get student record
    student_result = sb.table("students").select("id").eq("user_id", user["sub"]).execute()
    if not student_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno não encontrado")
    student_id = student_result.data[0]["id"]

    # Fetch the invite
    invite_result = (
        sb.table("invites")
        .select("*, coaches(user_id)")
        .eq("id", str(body.invite_id))
        .eq("student_id", student_id)
        .execute()
    )
    if not invite_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Convite não encontrado")

    invite_data = invite_result.data[0]

    if invite_data["status"] != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Convite já respondido")

    coach_user_id = invite_data["coaches"]["user_id"]
    now = datetime.now(timezone.utc).isoformat()

    # Get student name for coach notification
    student_profile_result = sb.table("profiles").select("full_name").eq("id", user["sub"]).execute()
    student_name = user.get("email", "Aluno")
    if student_profile_result.data:
        student_name = student_profile_result.data[0].get("full_name") or student_name

    if body.action == "accept":
        # Accept this invite
        sb.table("invites").update({
            "status": "accepted",
            "resolved_at": now,
        }).eq("id", str(body.invite_id)).execute()

        # Link student to coach
        sb.table("students").update({
            "coach_id": invite_data["coach_id"],
        }).eq("id", student_id).execute()

        # Reject all other pending invites for this student
        sb.table("invites").update({
            "status": "rejected",
            "resolved_at": now,
        }).eq("student_id", student_id).eq("status", "pending").execute()

        # Notify coach
        sb.table("notifications").insert({
            "user_id": coach_user_id,
            "type": "invite_accepted",
            "title": "Convite aceito",
            "body": f"{student_name} aceitou seu convite",
            "payload": {"invite_id": str(body.invite_id)},
        }).execute()

        return {"detail": "Convite aceito com sucesso"}

    else:
        # Reject this invite
        sb.table("invites").update({
            "status": "rejected",
            "resolved_at": now,
        }).eq("id", str(body.invite_id)).execute()

        # Notify coach
        sb.table("notifications").insert({
            "user_id": coach_user_id,
            "type": "invite_rejected",
            "title": "Convite recusado",
            "body": f"{student_name} recusou seu convite",
            "payload": {"invite_id": str(body.invite_id)},
        }).execute()

        return {"detail": "Convite recusado"}


@router.get("/invites/sent", status_code=200)
async def get_sent_invites(
    user: dict = Depends(require_role("coach")),
) -> list:
    """Coach: list all invites sent, with student profile info."""
    sb = get_supabase()

    coach_result = sb.table("coaches").select("id").eq("user_id", user["sub"]).execute()
    if not coach_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coach não encontrado")
    coach_id = coach_result.data[0]["id"]

    invites = (
        sb.table("invites")
        .select("*, students(user_id, profiles(full_name, avatar_url, email:id))")
        .eq("coach_id", coach_id)
        .order("created_at", desc=True)
        .execute()
    )
    return invites.data


@router.delete("/invites/{invite_id}", status_code=200)
async def delete_invite(
    invite_id: str,
    user: dict = Depends(require_role("coach")),
) -> dict:
    """Coach cancels a pending invite."""
    sb = get_supabase()

    coach_result = sb.table("coaches").select("id").eq("user_id", user["sub"]).execute()
    if not coach_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coach não encontrado")
    coach_id = coach_result.data[0]["id"]

    # Verify invite belongs to this coach and is still pending
    invite_result = (
        sb.table("invites")
        .select("id, student_id, students(user_id)")
        .eq("id", invite_id)
        .eq("coach_id", coach_id)
        .eq("status", "pending")
        .execute()
    )
    if not invite_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Convite não encontrado")

    # Remove the invite
    sb.table("invites").delete().eq("id", invite_id).execute()

    # Remove the notification for the student
    student_user_id = invite_result.data[0]["students"]["user_id"]
    sb.table("notifications").delete().eq(
        "user_id", student_user_id
    ).eq("type", "invite_received").execute()

    return {"detail": "Convite cancelado"}


@router.post("/link-student", status_code=200)
async def link_student(
    body: LinkStudentRequest,
    user: dict = Depends(require_role("coach")),
) -> dict:
    """Coach links an existing student account by email (legacy, direct link)."""
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
