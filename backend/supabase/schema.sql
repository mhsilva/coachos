-- ============================================================
-- CoachOS — Database Schema
-- Run this in the Supabase SQL Editor after creating the project
-- ============================================================

-- ──────────────────────────────────────────────
-- TABLES
-- ──────────────────────────────────────────────

create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin', 'coach', 'student')),
  full_name  text,
  avatar_url text,
  is_active          boolean default true,
  coach_requested_at timestamptz,
  created_at         timestamptz default now()
);

create table if not exists coaches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references profiles(id) on delete cascade,
  bio         text,
  approved_at timestamptz,
  created_at  timestamptz default now()
);

create table if not exists students (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique references profiles(id) on delete cascade,
  coach_id   uuid references coaches(id) on delete set null,
  birth_date date,
  weight_kg  numeric(5,1),
  height_cm  numeric(5,1),
  created_at timestamptz default now()
);

create table if not exists workout_plans (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid references coaches(id) on delete cascade,
  student_id    uuid references students(id) on delete cascade,
  name          text not null,
  schedule_type text not null check (schedule_type in ('fixed_days', 'sequence')),
  notes         text,
  start_date    date,
  end_date      date,
  created_at    timestamptz default now()
);

create table if not exists workouts (
  id                     uuid primary key default gen_random_uuid(),
  plan_id                uuid references workout_plans(id) on delete cascade,
  name                   text not null,
  format                 text not null default 'structured' check (format in ('structured', 'freeform')),
  content                text,  -- markdown content for freeform workouts
  weekday                int check (weekday between 0 and 6),
  sequence_position      int,
  estimated_duration_min int,
  notes                  text,
  created_at             timestamptz default now()
);

-- Per-coach exercise catalog (source of truth for movement name + demo video)
create table if not exists exercise_catalog (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references coaches(id) on delete cascade,
  name       text not null,
  demo_url   text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists uq_exercise_catalog_coach_name
  on exercise_catalog (coach_id, lower(name));
create index if not exists idx_exercise_catalog_coach
  on exercise_catalog (coach_id);

create table if not exists exercises (
  id           uuid primary key default gen_random_uuid(),
  workout_id   uuid references workouts(id) on delete cascade,
  catalog_id   uuid not null references exercise_catalog(id) on delete restrict,
  sets         int not null,
  reps_min     int not null,
  reps_max     int,
  order_index  int not null,
  rest_seconds int,
  warmup_type  text check (warmup_type in ('aquecimento', 'reconhecimento')),
  warmup_sets  int,
  warmup_reps  int,
  notes        text,
  created_at   timestamptz default now()
);

create table if not exists workout_sessions (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid references students(id) on delete cascade,
  workout_id    uuid references workouts(id) on delete set null,
  workout_name  text,  -- snapshot so history survives plan deletion
  started_at    timestamptz default now(),
  finished_at   timestamptz
);

create table if not exists set_logs (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid references workout_sessions(id) on delete cascade,
  exercise_id   uuid references exercises(id) on delete set null,
  exercise_name text,  -- snapshot so history survives exercise deletion
  set_number    int not null,
  reps_done     int,
  weight_kg     numeric(6,2),
  logged_at     timestamptz default now()
);

create table if not exists invites (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references coaches(id) on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at  timestamptz default now(),
  resolved_at timestamptz
);

-- Prevent duplicate pending invites from same coach to same student
create unique index if not exists uq_invites_pending
  on invites (coach_id, student_id)
  where status = 'pending';

-- ──────────────────────────────────────────────
-- INDEXES — FK lookups and common filters
-- ──────────────────────────────────────────────

create index if not exists idx_students_coach        on students (coach_id);
create index if not exists idx_workout_plans_coach   on workout_plans (coach_id);
create index if not exists idx_workout_plans_student on workout_plans (student_id);
create index if not exists idx_workouts_plan         on workouts (plan_id);
create index if not exists idx_exercises_workout     on exercises (workout_id);
create index if not exists idx_exercises_catalog      on exercises (catalog_id);
create index if not exists idx_sessions_student      on workout_sessions (student_id, started_at desc);
create index if not exists idx_sessions_workout      on workout_sessions (workout_id);
create index if not exists idx_set_logs_session      on set_logs (session_id);
create index if not exists idx_set_logs_exercise     on set_logs (exercise_id);

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text not null,
  payload    jsonb default '{}'::jsonb,
  is_read    boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_notifications_user_unread
  on notifications (user_id, is_read, created_at desc)
  where is_read = false;

-- ──────────────────────────────────────────────
-- TRIGGERS — auto-create profile / coach / student on signup
-- ──────────────────────────────────────────────

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_app_meta_data->>'role', 'student'),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- When a profile is created, also create the role-specific record
create or replace function handle_new_profile()
returns trigger as $$
begin
  if new.role = 'coach' then
    insert into public.coaches (user_id) values (new.id);
  elsif new.role = 'student' then
    insert into public.students (user_id) values (new.id);
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_profile_created on profiles;
create trigger on_profile_created
  after insert on profiles
  for each row execute procedure handle_new_profile();

-- ──────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ──────────────────────────────────────────────

alter table profiles          enable row level security;
alter table coaches           enable row level security;
alter table students          enable row level security;
alter table workout_plans     enable row level security;
alter table workouts          enable row level security;
alter table exercise_catalog  enable row level security;
alter table exercises         enable row level security;
alter table workout_sessions  enable row level security;
alter table set_logs          enable row level security;

-- profiles
create policy "profiles: own read"
  on profiles for select using (auth.uid() = id);

create policy "profiles: own update"
  on profiles for update using (auth.uid() = id);

create policy "profiles: admin read all"
  on profiles for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- coaches
create policy "coaches: coach reads own"
  on coaches for select using (user_id = auth.uid());

create policy "coaches: admin reads all"
  on coaches for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- students
create policy "students: student reads own"
  on students for select using (user_id = auth.uid());

create policy "students: coach reads own students"
  on students for select using (
    coach_id in (select id from coaches where user_id = auth.uid())
  );

-- workout_plans
create policy "workout_plans: coach reads own"
  on workout_plans for select using (
    coach_id in (select id from coaches where user_id = auth.uid())
  );

create policy "workout_plans: student reads own"
  on workout_plans for select using (
    student_id in (select id from students where user_id = auth.uid())
  );

-- workouts & exercises: follow the plan ownership
create policy "workouts: coach reads own"
  on workouts for select using (
    plan_id in (
      select id from workout_plans
      where coach_id in (select id from coaches where user_id = auth.uid())
    )
  );

create policy "workouts: student reads own"
  on workouts for select using (
    plan_id in (
      select id from workout_plans
      where student_id in (select id from students where user_id = auth.uid())
    )
  );

create policy "exercises: coach reads own"
  on exercises for select using (
    workout_id in (
      select w.id from workouts w
      join workout_plans wp on w.plan_id = wp.id
      where wp.coach_id in (select id from coaches where user_id = auth.uid())
    )
  );

create policy "exercises: student reads own"
  on exercises for select using (
    workout_id in (
      select w.id from workouts w
      join workout_plans wp on w.plan_id = wp.id
      where wp.student_id in (select id from students where user_id = auth.uid())
    )
  );

-- exercise_catalog
create policy "catalog: coach manages own"
  on exercise_catalog for all
  using (coach_id in (select id from coaches where user_id = auth.uid()))
  with check (coach_id in (select id from coaches where user_id = auth.uid()));

create policy "catalog: student reads coach's"
  on exercise_catalog for select using (
    coach_id in (
      select coach_id from students
      where user_id = auth.uid() and coach_id is not null
    )
  );

-- workout_sessions
create policy "sessions: student reads own"
  on workout_sessions for select using (
    student_id in (select id from students where user_id = auth.uid())
  );

create policy "sessions: coach reads students"
  on workout_sessions for select using (
    student_id in (
      select s.id from students s
      join coaches c on s.coach_id = c.id
      where c.user_id = auth.uid()
    )
  );

-- set_logs
create policy "set_logs: student reads own"
  on set_logs for select using (
    session_id in (
      select ws.id from workout_sessions ws
      join students s on ws.student_id = s.id
      where s.user_id = auth.uid()
    )
  );

create policy "set_logs: coach reads students"
  on set_logs for select using (
    session_id in (
      select ws.id from workout_sessions ws
      join students s on ws.student_id = s.id
      join coaches c on s.coach_id = c.id
      where c.user_id = auth.uid()
    )
  );

-- invites
alter table invites enable row level security;

create policy "invites: coach reads own sent"
  on invites for select using (
    coach_id in (select id from coaches where user_id = auth.uid())
  );

create policy "invites: student reads own received"
  on invites for select using (
    student_id in (select id from students where user_id = auth.uid())
  );

-- notifications
alter table notifications enable row level security;

create policy "notifications: own read"
  on notifications for select using (user_id = auth.uid());

create policy "notifications: own update"
  on notifications for update using (user_id = auth.uid());

-- ──────────────────────────────────────────────
-- CHATS — generic chat container (anamnese, feedback, etc.)
-- Transcript while open: Upstash Redis. On close: Supabase Storage blob.
-- Only metadata lives here.
-- ──────────────────────────────────────────────

create table if not exists chats (
  id                uuid primary key default gen_random_uuid(),
  type              text not null,
  student_id        uuid not null references students(id) on delete cascade,
  coach_id          uuid not null references coaches(id) on delete cascade,
  status            text not null default 'open' check (status in ('open', 'closed')),
  storage_path      text,
  extraction_status text check (extraction_status in ('pending', 'done', 'failed')),
  created_at        timestamptz default now(),
  closed_at         timestamptz
);

create index if not exists idx_chats_student
  on chats (student_id, type, created_at desc);

create index if not exists idx_chats_coach
  on chats (coach_id, type, created_at desc);

alter table chats enable row level security;

create policy "chats: student reads own"
  on chats for select using (
    student_id in (select id from students where user_id = auth.uid())
  );

create policy "chats: coach reads own students"
  on chats for select using (
    coach_id in (select id from coaches where user_id = auth.uid())
  );

-- ──────────────────────────────────────────────
-- ASSESSMENTS — physical assessment requests + submissions
-- Coach requests; student fills (3 photos + weight/BF + body measurements).
-- Photos live in Supabase Storage bucket `assessments`;
-- only the storage path is kept here.
-- ──────────────────────────────────────────────

create table if not exists assessments (
  id             uuid primary key default gen_random_uuid(),
  coach_id       uuid not null references coaches(id) on delete cascade,
  student_id     uuid not null references students(id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending', 'submitted', 'cancelled')),
  requested_at   timestamptz default now(),
  submitted_at   timestamptz,

  -- Composition
  weight_kg      numeric(5,1),
  body_fat_pct   numeric(4,1),

  -- Body measurements (cm)
  chest_cm        numeric(5,1),
  waist_narrow_cm numeric(5,1),
  waist_navel_cm  numeric(5,1),
  hip_cm          numeric(5,1),
  biceps_r_cm     numeric(5,1),
  forearm_r_cm    numeric(5,1),
  thigh_r_cm      numeric(5,1),
  calf_r_cm       numeric(5,1),

  -- Storage paths (relative to the `assessments` bucket)
  photo_front_path text,
  photo_back_path  text,
  photo_side_path  text
);

-- Only one pending assessment per (coach, student) at a time
create unique index if not exists uq_assessments_pending
  on assessments (coach_id, student_id)
  where status = 'pending';

create index if not exists idx_assessments_student
  on assessments (student_id, submitted_at desc);

create index if not exists idx_assessments_coach_student
  on assessments (coach_id, student_id, submitted_at desc);

alter table assessments enable row level security;

create policy "assessments: coach reads own students"
  on assessments for select using (
    coach_id in (select id from coaches where user_id = auth.uid())
  );

create policy "assessments: student reads own"
  on assessments for select using (
    student_id in (select id from students where user_id = auth.uid())
  );

-- ──────────────────────────────────────────────
-- STUDENT PROFILE — structured anamnese data (coach-only visibility)
-- See migration 003_student_profile.sql for details.
-- ──────────────────────────────────────────────

create table if not exists student_profile (
  student_id uuid primary key references students(id) on delete cascade,

  sex char(1) check (sex in ('M', 'F')),
  health_clearance_required boolean default false,

  primary_goal text,
  primary_goal_detail text,
  body_focus_areas text[],
  aesthetic_reference text,

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
  is_sport_cycle boolean,

  total_days_per_week int,
  strength_days_per_week int,
  max_session_minutes int,
  preferred_period text check (preferred_period in ('manha', 'tarde', 'noite')),
  fixed_rest_days text[],

  current_strength_training boolean,
  continuous_months numeric(5,1),
  detraining_months numeric(5,1),
  total_experience_months numeric(5,1),
  sports_history text,

  sleep_hours numeric(3,1),
  sleep_quality text check (sleep_quality in ('ruim', 'razoavel', 'boa')),
  work_type text check (work_type in ('sedentario', 'moderado', 'fisico')),
  stress_level text check (stress_level in ('baixo', 'moderado', 'alto')),
  smokes boolean,
  smoke_details text,
  drinks boolean,
  drink_details text,

  has_nutritionist boolean,
  uses_supplements boolean,
  supplements text[],
  protein_intake_perception text check (protein_intake_perception in ('baixa', 'adequada', 'alta')),

  p1_score int check (p1_score between 1 and 4),
  p2_score int check (p2_score between 1 and 4),
  p3_score int check (p3_score between 1 and 4),
  p4_avg numeric(3,2) check (p4_avg >= 0 and p4_avg <= 4),
  p5_avg numeric(3,2) check (p5_avg >= 0 and p5_avg <= 4),
  final_score numeric(3,2) check (final_score >= 0 and final_score <= 4),
  level text check (level in ('iniciante_absoluto', 'iniciante', 'intermediario', 'avancado', 'extremamente_avancado')),
  pyramid_stage int check (pyramid_stage between 1 and 4),

  source_chat_id uuid references chats(id) on delete set null,
  extracted_at timestamptz,
  updated_at timestamptz default now(),
  manually_edited_fields text[] default '{}'
);

create table if not exists student_strength_assessment (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  exercise text not null check (exercise in ('supino', 'agachamento', 'terra', 'puxada')),
  technique_score int check (technique_score between 1 and 4),
  load_kg numeric(6,2),
  reps int,
  estimated_1rm numeric(6,2),
  relative_strength_pct numeric(5,1),
  strength_score int check (strength_score between 1 and 4),
  source_chat_id uuid references chats(id) on delete set null,
  recorded_at timestamptz default now()
);

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

create index if not exists idx_student_profile_chat   on student_profile (source_chat_id);
create index if not exists idx_strength_student       on student_strength_assessment (student_id, recorded_at desc);
create index if not exists idx_strength_chat          on student_strength_assessment (source_chat_id);
create index if not exists idx_injuries_student       on student_injuries (student_id, recorded_at desc);
create index if not exists idx_injuries_active        on student_injuries (student_id, active) where active = true;
create index if not exists idx_health_conditions_student on student_health_conditions (student_id, recorded_at desc);
create index if not exists idx_medications_student    on student_medications (student_id, recorded_at desc);
create index if not exists idx_surgeries_student      on student_surgeries (student_id, recorded_at desc);

alter table student_profile              enable row level security;
alter table student_strength_assessment  enable row level security;
alter table student_injuries             enable row level security;
alter table student_health_conditions    enable row level security;
alter table student_medications          enable row level security;
alter table student_surgeries            enable row level security;

create policy "student_profile: coach reads own"
  on student_profile for select using (
    student_id in (select s.id from students s join coaches c on s.coach_id = c.id where c.user_id = auth.uid())
  );

create policy "strength: coach reads own"
  on student_strength_assessment for select using (
    student_id in (select s.id from students s join coaches c on s.coach_id = c.id where c.user_id = auth.uid())
  );

create policy "injuries: coach reads own"
  on student_injuries for select using (
    student_id in (select s.id from students s join coaches c on s.coach_id = c.id where c.user_id = auth.uid())
  );

create policy "health_conditions: coach reads own"
  on student_health_conditions for select using (
    student_id in (select s.id from students s join coaches c on s.coach_id = c.id where c.user_id = auth.uid())
  );

create policy "medications: coach reads own"
  on student_medications for select using (
    student_id in (select s.id from students s join coaches c on s.coach_id = c.id where c.user_id = auth.uid())
  );

create policy "surgeries: coach reads own"
  on student_surgeries for select using (
    student_id in (select s.id from students s join coaches c on s.coach_id = c.id where c.user_id = auth.uid())
  );

-- ──────────────────────────────────────────────
-- HELPER: assign role to a user (run in SQL Editor)
-- ──────────────────────────────────────────────
-- update auth.users
-- set raw_app_meta_data = raw_app_meta_data || '{"role": "coach"}'
-- where email = 'coach@exemplo.com';
