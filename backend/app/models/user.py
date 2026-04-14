from pydantic import BaseModel, EmailStr
from uuid import UUID
from datetime import datetime
from typing import Literal


class UserProfile(BaseModel):
    id: UUID
    role: str
    full_name: str | None = None
    avatar_url: str | None = None
    is_active: bool
    created_at: datetime


class SetRoleRequest(BaseModel):
    user_id: UUID
    role: Literal["admin", "coach", "student"]


class LinkStudentRequest(BaseModel):
    student_email: EmailStr


class InviteStudentRequest(BaseModel):
    student_email: EmailStr


class InviteActionRequest(BaseModel):
    invite_id: UUID
    action: Literal["accept", "reject"]


class NotificationOut(BaseModel):
    id: UUID
    type: str
    title: str
    body: str
    payload: dict
    is_read: bool
    created_at: datetime


class MarkReadRequest(BaseModel):
    notification_ids: list[UUID] | None = None
    all: bool = False


class UpdateStudentProfileRequest(BaseModel):
    birth_date: str | None = None  # ISO date string YYYY-MM-DD
    weight_kg: float | None = None
