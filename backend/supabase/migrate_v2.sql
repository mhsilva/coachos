-- ============================================================
-- CoachOS — Migration v2
-- Run this in the Supabase SQL Editor on an existing database
-- ============================================================

-- workout_plans: add notes, start_date, end_date
alter table workout_plans add column if not exists notes text;
alter table workout_plans add column if not exists start_date date;
alter table workout_plans add column if not exists end_date date;

-- workouts: add notes
alter table workouts add column if not exists notes text;

-- exercises: add all missing columns
alter table exercises add column if not exists rest_seconds int;
alter table exercises add column if not exists warmup_type text check (warmup_type in ('aquecimento', 'reconhecimento'));
alter table exercises add column if not exists warmup_sets int;
alter table exercises add column if not exists warmup_reps int;
alter table exercises add column if not exists notes text;
