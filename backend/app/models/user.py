from pydantic import BaseModel, EmailStr
from uuid import UUID
from datetime import datetime


class UserProfile(BaseModel):
    id: UUID
    role: str
    full_name: str | None = None
    avatar_url: str | None = None
    is_active: bool
    created_at: datetime


class ApproveCoachRequest(BaseModel):
    user_id: UUID


class LinkStudentRequest(BaseModel):
    student_email: EmailStr
