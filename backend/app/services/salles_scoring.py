"""Salles (2021) training-level classification — deterministic scoring.

All pure functions: given the fields extracted from an anamnese, compute
P1-P5, the final average, the classification level and the pyramid stage.
Any missing input propagates as None so the UI can show "incomplete".

Reference tables (men). Women get roughly 20% lower cutoffs; we scale
with SEX_RELATIVE_FACTOR.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


# ── Types ──────────────────────────────────────────────────────

Exercise = Literal["supino", "agachamento", "terra", "puxada"]
Level = Literal[
    "iniciante_absoluto",
    "iniciante",
    "intermediario",
    "avancado",
    "extremamente_avancado",
]


@dataclass
class StrengthInput:
    """One exercise's raw input from the anamnese."""
    exercise: Exercise
    technique_score: int | None = None       # 1-4, self/coach-reported
    load_kg: float | None = None             # for puxada: extra load beyond body weight (0 = bodyweight only)
    reps: int | None = None


@dataclass
class StrengthComputed:
    exercise: Exercise
    technique_score: int | None
    load_kg: float | None
    reps: int | None
    estimated_1rm: float | None
    relative_strength_pct: float | None
    strength_score: int | None


@dataclass
class SallesResult:
    p1: int | None = None
    p2: int | None = None
    p3: int | None = None
    p4_avg: float | None = None
    p5_avg: float | None = None
    final_score: float | None = None
    level: Level | None = None
    pyramid_stage: int | None = None
    strength: list[StrengthComputed] = field(default_factory=list)


# ── Constants ──────────────────────────────────────────────────

SEX_RELATIVE_FACTOR_F = 0.80  # women's cutoffs ~20% lower than men's


# ── P1: current continuous training time ───────────────────────

def score_p1(current_training: bool | None, continuous_months: float | None) -> int | None:
    if current_training is False:
        return 1
    if current_training is None and continuous_months is None:
        return None
    m = continuous_months or 0
    if m < 2:
        return 1
    if m < 12:
        return 2
    if m < 36:
        return 3
    return 4


# ── P2: detraining status ──────────────────────────────────────

def score_p2(current_training: bool | None, continuous_months: float | None, detraining_months: float | None) -> int | None:
    # If currently training, P2 mirrors P1
    if current_training is True:
        return score_p1(current_training, continuous_months)
    if current_training is None and detraining_months is None:
        return None
    m = detraining_months or 0
    # Gap 2-4 months not explicit in the prompt; interpret as 3 (closer to "ainda quase voltando")
    if m <= 4:
        return 3
    if m <= 8:
        return 2
    return 1


# ── P3: total lifetime experience ──────────────────────────────

def score_p3(total_experience_months: float | None) -> int | None:
    if total_experience_months is None:
        return None
    m = total_experience_months
    if m < 2:
        return 1
    if m < 12:
        return 2
    if m < 36:
        return 3
    return 4


# ── Strength: 1RM via Epley + score cutoffs ────────────────────

def epley_1rm(load_kg: float, reps: int) -> float:
    """Epley formula: 1RM = load / (1.0278 - 0.0278 * reps)."""
    if reps <= 0:
        return 0.0
    # Cap reps at 15 to avoid the denominator going negative (Epley is unreliable past ~12 reps)
    r = min(reps, 15)
    denom = 1.0278 - 0.0278 * r
    if denom <= 0:
        return 0.0
    return round(load_kg / denom, 2)


def _strength_cutoffs(exercise: Exercise, sex: str | None) -> list[float]:
    """Return the 3 cutoffs (between scores 1|2, 2|3, 3|4) as % of body weight."""
    # Men (from the Salles 2021 table)
    base: dict[Exercise, list[float]] = {
        "supino":      [60.0, 100.0, 120.0],
        "agachamento": [80.0, 120.0, 150.0],
        "terra":       [100.0, 150.0, 180.0],
        "puxada":      [0.0, 0.0, 0.0],  # handled separately
    }
    cuts = base[exercise]
    if sex == "F":
        return [c * SEX_RELATIVE_FACTOR_F for c in cuts]
    return cuts


def score_strength_by_pct(exercise: Exercise, pct: float, sex: str | None) -> int:
    cuts = _strength_cutoffs(exercise, sex)
    if pct < cuts[0]:
        return 1
    if pct < cuts[1]:
        return 2
    if pct < cuts[2]:
        return 3
    return 4


def score_puxada(load_kg: float | None, reps: int | None) -> int | None:
    """Puxada uses a distinct rubric based on assisted/bodyweight/weighted pull-ups.

    load_kg is interpreted as EXTRA load beyond body weight. 0 means bodyweight only.
    A missing (None) load with a positive reps count is also treated as bodyweight.
    """
    if reps is None and load_kg is None:
        return None
    r = reps or 0
    if r < 1:
        return 1  # cannot do a single rep
    extra = load_kg or 0
    if extra < 5:        # bodyweight only (small tolerance)
        return 2
    if extra < 25:       # ~+15kg
        return 3
    return 4             # +30kg+


def compute_strength_row(item: StrengthInput, body_weight_kg: float | None, sex: str | None) -> StrengthComputed:
    one_rm: float | None = None
    pct: float | None = None
    score: int | None = None

    if item.load_kg is not None and item.reps is not None and item.reps > 0:
        one_rm = epley_1rm(item.load_kg, item.reps)

    if item.exercise == "puxada":
        score = score_puxada(item.load_kg, item.reps)
    else:
        if one_rm is not None and body_weight_kg and body_weight_kg > 0:
            pct = round(one_rm / body_weight_kg * 100, 1)
            score = score_strength_by_pct(item.exercise, pct, sex)

    return StrengthComputed(
        exercise=item.exercise,
        technique_score=item.technique_score,
        load_kg=item.load_kg,
        reps=item.reps,
        estimated_1rm=one_rm,
        relative_strength_pct=pct,
        strength_score=score,
    )


# ── Averages and final classification ──────────────────────────

def _avg_or_none(values: list[int | None]) -> float | None:
    vals = [v for v in values if v is not None]
    if not vals:
        return None
    return round(sum(vals) / len(vals), 2)


def classify_level(final_score: float | None) -> Level | None:
    if final_score is None:
        return None
    s = final_score
    if s < 1.5:
        return "iniciante_absoluto"
    if s < 2.4:
        return "iniciante"
    if s < 3.0:
        return "intermediario"
    if s < 3.5:
        return "avancado"
    return "extremamente_avancado"


def classify_pyramid_stage(p4_per_exercise: list[int | None], p4_avg: float | None, p5_avg: float | None, level: Level | None) -> int | None:
    """Degrau da pirâmide de Salles.

    1 (Técnica): qualquer P4 < 2 em algum exercício.
    2 (Força): todos P4 ≥ 3 mas P5_avg ≤ 2.
    3 (Volume): técnica e força adequadas.
    4 (Variação): avançado/extremo com sinal de estagnação — não detectável
      só pela anamnese, então sempre cai em 3 até termos esse sinal.
    """
    if p4_avg is None or p5_avg is None:
        return None
    # Degrau 1 — priority: any weak technique
    has_p4 = any(s is not None for s in p4_per_exercise)
    if has_p4 and any((s is not None and s < 2) for s in p4_per_exercise):
        return 1
    # Degrau 2 — decent technique but relative strength lagging
    all_techniques_ok = all((s is None or s >= 3) for s in p4_per_exercise)
    if all_techniques_ok and p5_avg <= 2.0:
        return 2
    return 3


# ── Orchestrator ───────────────────────────────────────────────

def compute_salles(
    *,
    sex: str | None,
    body_weight_kg: float | None,
    current_training: bool | None,
    continuous_months: float | None,
    detraining_months: float | None,
    total_experience_months: float | None,
    strength_inputs: list[StrengthInput],
) -> SallesResult:
    """Compute the full Salles classification from extracted inputs.

    Any missing piece stays None; we never make up numbers.
    """
    strength = [compute_strength_row(s, body_weight_kg, sex) for s in strength_inputs]

    p1 = score_p1(current_training, continuous_months)
    p2 = score_p2(current_training, continuous_months, detraining_months)
    p3 = score_p3(total_experience_months)

    p4_list = [s.technique_score for s in strength]
    p5_list = [s.strength_score for s in strength]
    p4_avg = _avg_or_none(p4_list)
    p5_avg = _avg_or_none(p5_list)

    # Final = average of P1..P5, requires all 5 to be present
    parts = [p1, p2, p3, p4_avg, p5_avg]
    if any(p is None for p in parts):
        final_score: float | None = None
    else:
        # mypy: all parts are not None after the check
        total = sum(float(p) for p in parts if p is not None)
        final_score = round(total / 5, 2)

    level = classify_level(final_score)
    pyramid_stage = classify_pyramid_stage(p4_list, p4_avg, p5_avg, level)

    return SallesResult(
        p1=p1,
        p2=p2,
        p3=p3,
        p4_avg=p4_avg,
        p5_avg=p5_avg,
        final_score=final_score,
        level=level,
        pyramid_stage=pyramid_stage,
        strength=strength,
    )
