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

create table if not exists exercises (
  id           uuid primary key default gen_random_uuid(),
  workout_id   uuid references workouts(id) on delete cascade,
  name         text not null,
  sets         int not null,
  reps_min     int not null,
  reps_max     int,
  order_index  int not null,
  demo_url     text,
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

alter table profiles         enable row level security;
alter table coaches          enable row level security;
alter table students         enable row level security;
alter table workout_plans    enable row level security;
alter table workouts         enable row level security;
alter table exercises        enable row level security;
alter table workout_sessions enable row level security;
alter table set_logs         enable row level security;

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
  id           uuid primary key default gen_random_uuid(),
  type         text not null,
  student_id   uuid not null references students(id) on delete cascade,
  coach_id     uuid not null references coaches(id) on delete cascade,
  status       text not null default 'open' check (status in ('open', 'closed')),
  storage_path text,
  created_at   timestamptz default now(),
  closed_at    timestamptz
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
-- HELPER: assign role to a user (run in SQL Editor)
-- ──────────────────────────────────────────────
-- update auth.users
-- set raw_app_meta_data = raw_app_meta_data || '{"role": "coach"}'
-- where email = 'coach@exemplo.com';
