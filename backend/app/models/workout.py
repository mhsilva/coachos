from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Literal


class ExerciseCreate(BaseModel):
    name: str
    sets: int
    reps_min: int
    reps_max: int | None = None
    order_index: int
    demo_url: str | None = None
    rest_seconds: int | None = None
    warmup_type: Literal["aquecimento", "reconhecimento"] | None = None
    warmup_sets: int | None = None
    warmup_reps: int | None = None


class WorkoutCreate(BaseModel):
    name: str
    format: Literal["structured", "freeform"] = "structured"
    content: str | None = None           # markdown body for freeform workouts
    weekday: int | None = None           # 0=Mon … 6=Sun; None when schedule=sequence
    sequence_position: int | None = None # None when schedule=fixed_days
    estimated_duration_min: int | None = None
    notes: str | None = None


class WorkoutPlanCreate(BaseModel):
    student_id: UUID
    name: str
    schedule_type: Literal["fixed_days", "sequence"]
    notes: str | None = None


class WorkoutPlanUpdate(BaseModel):
    name: str | None = None
    notes: str | None = None


class WorkoutUpdate(BaseModel):
    name: str | None = None
    content: str | None = None
    weekday: int | None = None
    sequence_position: int | None = None
    estimated_duration_min: int | None = None
    notes: str | None = None


class ExerciseUpdate(BaseModel):
    name: str | None = None
    sets: int | None = None
    reps_min: int | None = None
    reps_max: int | None = None
    order_index: int | None = None
    demo_url: str | None = None
    rest_seconds: int | None = None
    warmup_type: Literal["aquecimento", "reconhecimento"] | None = None
    warmup_sets: int | None = None
    warmup_reps: int | None = None


class ExerciseOut(ExerciseCreate):
    id: UUID
    workout_id: UUID
    created_at: datetime


class WorkoutOut(BaseModel):
    id: UUID
    plan_id: UUID
    name: str
    weekday: int | None
    sequence_position: int | None
    estimated_duration_min: int | None
    exercises: list[ExerciseOut] = []
    created_at: datetime


class WorkoutPlanOut(BaseModel):
    id: UUID
    coach_id: UUID
    student_id: UUID
    name: str
    schedule_type: str
    workouts: list[WorkoutOut] = []
    created_at: datetime
