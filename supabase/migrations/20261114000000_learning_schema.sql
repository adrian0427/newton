-- Unapplied C01 schema. Apply before the access/constraints migration.
begin;

create table public.student_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text,
  preferred_tutor_mode text not null default 'student-requested',
  created_at timestamptz not null default now()
);

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (id, user_id)
);

create table public.learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null,
  source_revision_id uuid not null,
  concept text not null,
  misconception text,
  outcome text not null,
  evidence text not null,
  created_at timestamptz not null default now()
);

-- Fail closed even between migrations, including projects with legacy grants.
alter table public.student_profiles enable row level security;
alter table public.study_sessions enable row level security;
alter table public.learning_events enable row level security;
revoke all on public.student_profiles, public.study_sessions, public.learning_events
  from public, anon, authenticated;

commit;
