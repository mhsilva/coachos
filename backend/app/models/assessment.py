from pydantic import BaseModel
from uuid import UUID
from typing import Literal


# Metric fields that can be charted over time. Kept in sync with the assessments table.
ASSESSMENT_METRICS: tuple[str, ...] = (
    "weight_kg",
    "body_fat_pct",
    "chest_cm",
    "waist_narrow_cm",
    "waist_navel_cm",
    "hip_cm",
    "biceps_r_cm",
    "forearm_r_cm",
    "thigh_r_cm",
    "calf_r_cm",
)

AssessmentMetric = Literal[
    "weight_kg",
    "body_fat_pct",
    "chest_cm",
    "waist_narrow_cm",
    "waist_navel_cm",
    "hip_cm",
    "biceps_r_cm",
    "forearm_r_cm",
    "thigh_r_cm",
    "calf_r_cm",
]


class RequestAssessmentBody(BaseModel):
    student_id: UUID
