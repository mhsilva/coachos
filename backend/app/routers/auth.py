from fastapi import APIRouter, HTTPException, status, Depends
from app.dependencies import require_role
from app.supabase_client import get_supabase
from app.models.user import ApproveCoachRequest, LinkStudentRequest
from datetime import datetime, timezone

router = APIRouter()


@router.post("/approve-coach", status_code=200)
async def approve_coach(
    body: ApproveCoachRequest,
    _user: dict = Depends(require_role("admin")),
) -> dict:
    """Admin activates a coach by setting approved_at and is_active=true."""
    sb = get_supabase()

    result = (
        sb.table("coaches")
        .update({"approved_at": datetime.now(timezone.utc).isoformat()})
        .eq("user_id", str(body.user_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coach não encontrado")

    sb.table("profiles").update({"is_active": True}).eq("id", str(body.user_id)).execute()

    return {"detail": "Coach aprovado com sucesso"}


@router.post("/link-student", status_code=200)
async def link_student(
    body: LinkStudentRequest,
    user: dict = Depends(require_role("coach")),
) -> dict:
    """Coach links an existing student account by email."""
    sb = get_supabase()

    # Locate the student user by email using the admin auth API
    users_response = sb.auth.admin.list_users()
    student_auth = next(
        (u for u in users_response if u.email == body.student_email), None
    )
    if not student_auth:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aluno não encontrado")

    # Get the requesting coach's record
    coach_result = sb.table("coaches").select("id").eq("user_id", user["sub"]).execute()
    if not coach_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coach não encontrado")
    coach_id = coach_result.data[0]["id"]

    # Get the student's record
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
