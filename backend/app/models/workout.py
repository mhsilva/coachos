from pydantic import BaseModel, model_validator
from uuid import UUID
from datetime import datetime, date
from typing import Literal


# ── Exercise catalog (per-coach library of movements) ─────────

class ExerciseCatalogCreate(BaseModel):
    name: str
    demo_url: str | None = None


class ExerciseCatalogUpdate(BaseModel):
    name: str | None = None
    demo_url: str | None = None


class ExerciseCatalogOut(BaseModel):
    id: UUID
    coach_id: UUID
    name: str
    demo_url: str | None = None
    created_at: datetime
    updated_at: datetime | None = None


# ── Exercises (prescription inside a workout) ─────────────────

class ExerciseCreate(BaseModel):
    # Either a pre-existing catalog entry or a free-text name (auto-upserts)
    catalog_id: UUID | None = None
    name: str | None = None
    demo_url: str | None = None  # only used when auto-creating from name
    sets: int
    reps_min: int
    reps_max: int | None = None
    order_index: int
    rest_seconds: int | None = None
    warmup_type: Literal["aquecimento", "reconhecimento"] | None = None
    warmup_sets: int | None = None
    warmup_reps: int | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def _require_catalog_or_name(self) -> "ExerciseCreate":
        if not self.catalog_id and not (self.name and self.name.strip()):
            raise ValueError("Informe catalog_id ou name")
        return self


class ExerciseUpdate(BaseModel):
    # Prescription-only; to change the movement, remove and re-add with another catalog_id
    sets: int | None = None
    reps_min: int | None = None
    reps_max: int | None = None
    order_index: int | None = None
    rest_seconds: int | None = None
    warmup_type: Literal["aquecimento", "reconhecimento"] | None = None
    warmup_sets: int | None = None
    warmup_reps: int | None = None
    notes: str | None = None


class ExerciseOut(BaseModel):
    id: UUID
    workout_id: UUID
    catalog_id: UUID
    name: str       # joined from catalog
    demo_url: str | None = None  # joined from catalog
    sets: int
    reps_min: int
    reps_max: int | None = None
    order_index: int
    rest_seconds: int | None = None
    warmup_type: Literal["aquecimento", "reconhecimento"] | None = None
    warmup_sets: int | None = None
    warmup_reps: int | None = None
    notes: str | None = None
    created_at: datetime


# ── Workouts / Plans ──────────────────────────────────────────

class WorkoutCreate(BaseModel):
    name: str
    format: Literal["structured", "freeform"] = "structured"
    content: str | None = None           # markdown body for freeform workouts
    weekday: int | None = None           # 0=Mon … 6=Sun; None when schedule=sequence
    sequence_position: int | None = None # None when schedule=fixed_days
    estimated_duration_min: int | None = None
    notes: str | None = None


class WorkoutUpdate(BaseModel):
    name: str | None = None
    content: str | None = None
    weekday: int | None = None
    sequence_position: int | None = None
    estimated_duration_min: int | None = None
    notes: str | None = None


class WorkoutPlanCreate(BaseModel):
    student_id: UUID
    name: str
    schedule_type: Literal["fixed_days", "sequence"]
    notes: str | None = None
    start_date: date | None = None
    end_date: date | None = None


class WorkoutPlanUpdate(BaseModel):
    name: str | None = None
    notes: str | None = None
    start_date: date | None = None
    end_date: date | None = None


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
    notes: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    workouts: list[WorkoutOut] = []
    created_at: datetime
