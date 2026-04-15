from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime


class SessionStart(BaseModel):
    workout_id: UUID


class SetLogCreate(BaseModel):
    exercise_id: UUID
    set_number: int
    reps_done: int | None = None
    weight_kg: float | None = None


class SessionFeedback(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = None


class SetLogOut(SetLogCreate):
    id: UUID
    session_id: UUID
    logged_at: datetime


class WorkoutSessionOut(BaseModel):
    id: UUID
    student_id: UUID
    workout_id: UUID
    started_at: datetime
    finished_at: datetime | None = None
    set_logs: list[SetLogOut] = []
