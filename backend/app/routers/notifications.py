from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.dependencies import get_current_user
from app.supabase_client import get_supabase
from app.models.user import MarkReadRequest

router = APIRouter()


class DeviceTokenRequest(BaseModel):
    token: str
    platform: str = "ios"  # "ios" | "android"


@router.get("", status_code=200)
async def list_notifications(
    unread_only: bool = False,
    limit: int = 20,
    offset: int = 0,
    user: dict = Depends(get_current_user),
) -> list:
    """Return notifications for the current user."""
    sb = get_supabase()
    query = sb.table("notifications").select("*").eq("user_id", user["sub"])
    if unread_only:
        query = query.eq("is_read", False)
    result = (
        query
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return result.data


@router.get("/unread-count", status_code=200)
async def unread_count(
    user: dict = Depends(get_current_user),
) -> dict:
    """Return the count of unread notifications (lightweight polling endpoint)."""
    sb = get_supabase()
    result = (
        sb.table("notifications")
        .select("id")
        .eq("user_id", user["sub"])
        .eq("is_read", False)
        .execute()
    )
    return {"count": len(result.data)}


@router.patch("/read", status_code=200)
async def mark_read(
    body: MarkReadRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """Mark notifications as read (by IDs or all)."""
    sb = get_supabase()
    if body.all:
        sb.table("notifications").update({"is_read": True}).eq(
            "user_id", user["sub"]
        ).eq("is_read", False).execute()
    elif body.notification_ids:
        sb.table("notifications").update({"is_read": True}).in_(
            "id", [str(nid) for nid in body.notification_ids]
        ).eq("user_id", user["sub"]).execute()
    return {"detail": "ok"}


@router.post("/register-device", status_code=200)
async def register_device(
    body: DeviceTokenRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """Register an FCM device token for push notifications."""
    sb = get_supabase()
    # Upsert: if this token already exists for this user, update it
    sb.table("device_tokens").upsert(
        {
            "user_id": user["sub"],
            "token": body.token,
            "platform": body.platform,
        },
        on_conflict="token",
    ).execute()
    return {"detail": "ok"}


@router.post("/unregister-device", status_code=200)
async def unregister_device(
    body: DeviceTokenRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """Remove an FCM device token (on logout)."""
    sb = get_supabase()
    sb.table("device_tokens").delete().eq("token", body.token).eq(
        "user_id", user["sub"]
    ).execute()
    return {"detail": "ok"}
