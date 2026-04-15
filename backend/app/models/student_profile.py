"""Pydantic models for the structured anamnese output + profile API.

These mirror the JSON Schema of the `save_anamnese_profile` tool used
by `anamnese_extractor`, so the extractor can hand back a typed object
to the persistence layer.
"""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


# ── Enums as literals ──────────────────────────────────────────

Sex = Literal["M", "F"]
PrimaryGoal = Literal[
    "hipertrofia",
    "emagrecimento",
    "forca_maxima",
    "performance_esportiva",
    "saude",
    "reabilitacao",
    "condicionamento",
]
SameDayOrder = Literal["antes", "depois"]
PreferredPeriod = Literal["manha", "tarde", "noite"]
SleepQuality = Literal["ruim", "razoavel", "boa"]
WorkType = Literal["sedentario", "moderado", "fisico"]
StressLevel = Literal["baixo", "moderado", "alto"]
ProteinIntake = Literal["baixa", "adequada", "alta"]
InjurySeverity = Literal["leve", "moderada", "grave"]
ExerciseName = Literal["supino", "agachamento", "terra", "puxada"]


# ── Nested sections (extracted by the LLM) ─────────────────────

class Identification(BaseModel):
    full_name: str | None = None
    sex: Sex | None = None
    birth_date: date | None = None
    age: int | None = None
    weight_kg: float | None = None
    height_cm: float | None = None


class Objective(BaseModel):
    primary_goal: PrimaryGoal | None = None
    primary_goal_detail: str | None = None
    body_focus_areas: list[str] = Field(default_factory=list)
    aesthetic_reference: str | None = None


class SecondarySport(BaseModel):
    has_secondary_sport: bool = False
    secondary_sport: str | None = None
    secondary_sport_months: float | None = None
    secondary_sport_days_per_week: int | None = None
    secondary_sport_session_minutes: int | None = None
    secondary_sport_has_competition: bool | None = None
    secondary_sport_competition_note: str | None = None
    secondary_sport_objective: str | None = None
    same_day_training: bool | None = None
    same_day_order: SameDayOrder | None = None
    is_sport_cycle: bool | None = None


class Availability(BaseModel):
    total_days_per_week: int | None = None
    strength_days_per_week: int | None = None
    max_session_minutes: int | None = None
    preferred_period: PreferredPeriod | None = None
    fixed_rest_days: list[str] = Field(default_factory=list)


class TrainingHistory(BaseModel):
    current_strength_training: bool | None = None
    continuous_months: float | None = None
    detraining_months: float | None = None
    total_experience_months: float | None = None
    sports_history: str | None = None


class StrengthItem(BaseModel):
    exercise: ExerciseName
    technique_score: int | None = None     # 1-4
    load_kg: float | None = None           # for puxada: extra load beyond body weight (0 = bodyweight)
    reps: int | None = None


class HealthCondition(BaseModel):
    condition: str
    notes: str | None = None
    active: bool = True


class Medication(BaseModel):
    medication: str
    dosage: str | None = None
    active: bool = True


class Injury(BaseModel):
    body_part: str | None = None
    description: str
    severity: InjurySeverity | None = None
    active: bool = True
    occurred_at: date | None = None


class Surgery(BaseModel):
    procedure_name: str
    occurred_at: date | None = None
    notes: str | None = None


class Health(BaseModel):
    conditions: list[HealthCondition] = Field(default_factory=list)
    medications: list[Medication] = Field(default_factory=list)
    injuries: list[Injury] = Field(default_factory=list)
    surgeries: list[Surgery] = Field(default_factory=list)


class Habits(BaseModel):
    sleep_hours: float | None = None
    sleep_quality: SleepQuality | None = None
    work_type: WorkType | None = None
    stress_level: StressLevel | None = None
    smokes: bool | None = None
    smoke_details: str | None = None
    drinks: bool | None = None
    drink_details: str | None = None


class Nutrition(BaseModel):
    has_nutritionist: bool | None = None
    uses_supplements: bool | None = None
    supplements: list[str] = Field(default_factory=list)
    protein_intake_perception: ProteinIntake | None = None


class ExtractedAnamnese(BaseModel):
    """What the extractor LLM returns (minus the computed Salles scores)."""
    identification: Identification = Field(default_factory=Identification)
    health_clearance_required: bool = False
    objective: Objective = Field(default_factory=Objective)
    secondary_sport: SecondarySport = Field(default_factory=SecondarySport)
    availability: Availability = Field(default_factory=Availability)
    training_history: TrainingHistory = Field(default_factory=TrainingHistory)
    technique_and_strength: list[StrengthItem] = Field(default_factory=list)
    health: Health = Field(default_factory=Health)
    habits: Habits = Field(default_factory=Habits)
    nutrition: Nutrition = Field(default_factory=Nutrition)


# ── API read/write models (used by router) ─────────────────────

class PatchStudentProfileRequest(BaseModel):
    """Fields the coach can edit. Any subset of these can be sent."""
    sex: Sex | None = None
    health_clearance_required: bool | None = None

    primary_goal: PrimaryGoal | None = None
    primary_goal_detail: str | None = None
    body_focus_areas: list[str] | None = None
    aesthetic_reference: str | None = None

    has_secondary_sport: bool | None = None
    secondary_sport: str | None = None
    secondary_sport_months: float | None = None
    secondary_sport_days_per_week: int | None = None
    secondary_sport_session_minutes: int | None = None
    secondary_sport_has_competition: bool | None = None
    secondary_sport_competition_note: str | None = None
    secondary_sport_objective: str | None = None
    same_day_training: bool | None = None
    same_day_order: SameDayOrder | None = None
    is_sport_cycle: bool | None = None

    total_days_per_week: int | None = None
    strength_days_per_week: int | None = None
    max_session_minutes: int | None = None
    preferred_period: PreferredPeriod | None = None
    fixed_rest_days: list[str] | None = None

    current_strength_training: bool | None = None
    continuous_months: float | None = None
    detraining_months: float | None = None
    total_experience_months: float | None = None
    sports_history: str | None = None

    sleep_hours: float | None = None
    sleep_quality: SleepQuality | None = None
    work_type: WorkType | None = None
    stress_level: StressLevel | None = None
    smokes: bool | None = None
    smoke_details: str | None = None
    drinks: bool | None = None
    drink_details: str | None = None

    has_nutritionist: bool | None = None
    uses_supplements: bool | None = None
    supplements: list[str] | None = None
    protein_intake_perception: ProteinIntake | None = None


class CreateInjuryRequest(BaseModel):
    body_part: str | None = None
    description: str = Field(..., min_length=1)
    severity: InjurySeverity | None = None
    active: bool = True
    occurred_at: date | None = None


class PatchInjuryRequest(BaseModel):
    body_part: str | None = None
    description: str | None = None
    severity: InjurySeverity | None = None
    active: bool | None = None
    occurred_at: date | None = None


class CreateHealthConditionRequest(BaseModel):
    condition: str = Field(..., min_length=1)
    notes: str | None = None
    active: bool = True


class CreateMedicationRequest(BaseModel):
    medication: str = Field(..., min_length=1)
    dosage: str | None = None
    active: bool = True


class CreateSurgeryRequest(BaseModel):
    procedure_name: str = Field(..., min_length=1)
    occurred_at: date | None = None
    notes: str | None = None
