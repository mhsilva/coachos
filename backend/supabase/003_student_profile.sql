-- ============================================================
-- Migration 003 — Structured student profile (anamnese extraction)
-- Run this ONCE in the Supabase SQL Editor after 001/002.
-- Idempotent: safe to re-run.
-- ============================================================

-- ── chats: track extraction status ─────────────────────────────
alter table chats
  add column if not exists extraction_status text
  check (extraction_status in ('pending', 'done', 'failed'));

-- ── students: add height (birth_date + weight already exist) ───
alter table students
  add column if not exists height_cm numeric(5,1);

-- ──────────────────────────────────────────────────────────────
-- student_profile (1:1 with student) — upserted after each anamnese
-- Everything "slowly changing" about the student lives here.
-- ──────────────────────────────────────────────────────────────
create table if not exists student_profile (
  student_id uuid primary key references students(id) on delete cascade,

  -- Identification extras (weight/height/birth stay on students)
  sex char(1) check (sex in ('M', 'F')),

  -- Health clearance flag (PAR-Q triage)
  health_clearance_required boolean default false,

  -- Objective
  primary_goal text,                -- 'hipertrofia'|'emagrecimento'|'forca_maxima'|'performance_esportiva'|'saude'|'reabilitacao'|'condicionamento'
  primary_goal_detail text,         -- freeform
  body_focus_areas text[],          -- ex: ['bracos','peito','gluteo']
  aesthetic_reference text,

  -- Secondary sport (modalidade complementar)
  has_secondary_sport boolean default false,
  secondary_sport text,
  secondary_sport_months numeric(5,1),
  secondary_sport_days_per_week int,
  secondary_sport_session_minutes int,
  secondary_sport_has_competition boolean,
  secondary_sport_competition_note text,
  secondary_sport_objective text,
  same_day_training boolean,
  same_day_order text check (same_day_order in ('antes', 'depois')),
  is_sport_cycle boolean,           -- true=ciclo de preparação; false=manter em paralelo

  -- Availability / routine
  total_days_per_week int,
  strength_days_per_week int,
  max_session_minutes int,
  preferred_period text check (preferred_period in ('manha', 'tarde', 'noite')),
  fixed_rest_days text[],           -- ['segunda','domingo',...]

  -- Training history
  current_strength_training boolean,
  continuous_months numeric(5,1),     -- null se não está treinando
  detraining_months numeric(5,1),     -- null se está treinando
  total_experience_months numeric(5,1),
  sports_history text,

  -- Life habits
  sleep_hours numeric(3,1),
  sleep_quality text check (sleep_quality in ('ruim', 'razoavel', 'boa')),
  work_type text check (work_type in ('sedentario', 'moderado', 'fisico')),
  stress_level text check (stress_level in ('baixo', 'moderado', 'alto')),
  smokes boolean,
  smoke_details text,
  drinks boolean,
  drink_details text,

  -- Nutrition
  has_nutritionist boolean,
  uses_supplements boolean,
  supplements text[],
  protein_intake_perception text check (protein_intake_perception in ('baixa', 'adequada', 'alta')),

  -- Salles classification (computed from extracted data)
  p1_score int check (p1_score between 1 and 4),
  p2_score int check (p2_score between 1 and 4),
  p3_score int check (p3_score between 1 and 4),
  p4_avg numeric(3,2) check (p4_avg >= 0 and p4_avg <= 4),
  p5_avg numeric(3,2) check (p5_avg >= 0 and p5_avg <= 4),
  final_score numeric(3,2) check (final_score >= 0 and final_score <= 4),
  level text check (level in ('iniciante_absoluto', 'iniciante', 'intermediario', 'avancado', 'extremamente_avancado')),
  pyramid_stage int check (pyramid_stage between 1 and 4),

  -- Provenance
  source_chat_id uuid references chats(id) on delete set null,
  extracted_at timestamptz,
  updated_at timestamptz default now(),
  manually_edited_fields text[] default '{}'   -- list of field names edited by the coach after extraction
);

create index if not exists idx_student_profile_chat on student_profile (source_chat_id);

-- ──────────────────────────────────────────────────────────────
-- student_strength_assessment — one row per (exercise, anamnese)
-- Supino / Agachamento / Terra / Puxada
-- ──────────────────────────────────────────────────────────────
create table if not exists student_strength_assessment (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  exercise text not null check (exercise in ('supino', 'agachamento', 'terra', 'puxada')),
  technique_score int check (technique_score between 1 and 4),
  load_kg numeric(6,2),
  reps int,
  estimated_1rm numeric(6,2),          -- computed via Epley
  relative_strength_pct numeric(5,1),  -- 1RM / body weight * 100
  strength_score int check (strength_score between 1 and 4),
  source_chat_id uuid references chats(id) on delete set null,
  recorded_at timestamptz default now()
);

create index if not exists idx_strength_student on student_strength_assessment (student_id, recorded_at desc);
create index if not exists idx_strength_chat    on student_strength_assessment (source_chat_id);

-- ──────────────────────────────────────────────────────────────
-- Append-only histories: injuries, health conditions, meds, surgeries
-- `source` marks where the entry came from so future agents
-- (workout feedback, manual edits) can plug in.
-- ──────────────────────────────────────────────────────────────
create table if not exists student_injuries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  body_part text,
  description text not null,
  severity text check (severity in ('leve', 'moderada', 'grave') or severity is null),
  active boolean default true,
  occurred_at date,
  source text not null default 'manual' check (source in ('anamnese', 'workout_feedback', 'manual')),
  source_chat_id uuid references chats(id) on delete set null,
  recorded_at timestamptz default now()
);
create index if not exists idx_injuries_student on student_injuries (student_id, recorded_at desc);
create index if not exists idx_injuries_active  on student_injuries (student_id, active) where active = true;

create table if not exists student_health_conditions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  condition text not null,
  notes text,
  active boolean default true,
  source text not null default 'manual' check (source in ('anamnese', 'manual')),
  source_chat_id uuid references chats(id) on delete set null,
  recorded_at timestamptz default now()
);
create index if not exists idx_health_conditions_student on student_health_conditions (student_id, recorded_at desc);

create table if not exists student_medications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  medication text not null,
  dosage text,
  active boolean default true,
  source text not null default 'manual' check (source in ('anamnese', 'manual')),
  source_chat_id uuid references chats(id) on delete set null,
  recorded_at timestamptz default now()
);
create index if not exists idx_medications_student on student_medications (student_id, recorded_at desc);

create table if not exists student_surgeries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  procedure_name text not null,
  occurred_at date,
  notes text,
  source text not null default 'manual' check (source in ('anamnese', 'manual')),
  source_chat_id uuid references chats(id) on delete set null,
  recorded_at timestamptz default now()
);
create index if not exists idx_surgeries_student on student_surgeries (student_id, recorded_at desc);

-- ──────────────────────────────────────────────────────────────
-- RLS: coach reads own students' data
-- Students don't see structured profile (visibility is coach-only for now).
-- Backend API uses service role → all writes go through the API, not RLS.
-- ──────────────────────────────────────────────────────────────
alter table student_profile              enable row level security;
alter table student_strength_assessment  enable row level security;
alter table student_injuries             enable row level security;
alter table student_health_conditions    enable row level security;
alter table student_medications          enable row level security;
alter table student_surgeries            enable row level security;

-- Drop & recreate policies so re-running is idempotent
drop policy if exists "student_profile: coach reads own" on student_profile;
create policy "student_profile: coach reads own"
  on student_profile for select using (
    student_id in (
      select s.id from students s
      join coaches c on s.coach_id = c.id
      where c.user_id = auth.uid()
    )
  );

drop policy if exists "strength: coach reads own" on student_strength_assessment;
create policy "strength: coach reads own"
  on student_strength_assessment for select using (
    student_id in (
      select s.id from students s
      join coaches c on s.coach_id = c.id
      where c.user_id = auth.uid()
    )
  );

drop policy if exists "injuries: coach reads own" on student_injuries;
create policy "injuries: coach reads own"
  on student_injuries for select using (
    student_id in (
      select s.id from students s
      join coaches c on s.coach_id = c.id
      where c.user_id = auth.uid()
    )
  );

drop policy if exists "health_conditions: coach reads own" on student_health_conditions;
create policy "health_conditions: coach reads own"
  on student_health_conditions for select using (
    student_id in (
      select s.id from students s
      join coaches c on s.coach_id = c.id
      where c.user_id = auth.uid()
    )
  );

drop policy if exists "medications: coach reads own" on student_medications;
create policy "medications: coach reads own"
  on student_medications for select using (
    student_id in (
      select s.id from students s
      join coaches c on s.coach_id = c.id
      where c.user_id = auth.uid()
    )
  );

drop policy if exists "surgeries: coach reads own" on student_surgeries;
create policy "surgeries: coach reads own"
  on student_surgeries for select using (
    student_id in (
      select s.id from students s
      join coaches c on s.coach_id = c.id
      where c.user_id = auth.uid()
    )
  );
