begin;

alter table public.student_profiles
  add constraint profile_name_valid check (
    display_name is null or (char_length(display_name) <= 100 and display_name !~ '^[[:space:]]*$')
  ),
  add constraint tutor_mode_valid check (preferred_tutor_mode in ('student-requested', 'proactive'));

alter table public.study_sessions
  add constraint session_end_valid check (ended_at is null or ended_at >= started_at);

alter table public.learning_events
  add constraint event_session_owner_fk foreign key (session_id, user_id)
    references public.study_sessions(id, user_id) on delete cascade,
  add constraint event_identity_unique unique (user_id, session_id, source_revision_id, concept, outcome),
  add constraint event_concept_valid check (concept = 'algebra.distributive-property'),
  add constraint event_misconception_valid check (misconception is null or misconception = 'distribution.missed-term'),
  add constraint event_outcome_valid check (outcome in (
    'practiced', 'misconception-observed', 'self-corrected', 'corrected-with-guidance'
  )),
  add constraint event_evidence_valid check (char_length(evidence) between 1 and 500 and evidence !~ '^[[:space:]]*$'),
  add constraint misconception_requires_detail check (outcome <> 'misconception-observed' or misconception is not null);

create index study_sessions_user_started_idx on public.study_sessions(user_id, started_at desc);
create index learning_events_user_concept_created_idx
  on public.learning_events(user_id, concept, created_at desc, id desc);
create index learning_events_session_owner_idx on public.learning_events(session_id, user_id);

create policy profiles_read_own on public.student_profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy profiles_insert_own on public.student_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_update_own on public.student_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy sessions_read_own on public.study_sessions for select to authenticated
  using (user_id = (select auth.uid()));
create policy sessions_insert_own on public.study_sessions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy sessions_update_own on public.study_sessions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy events_read_own on public.learning_events for select to authenticated
  using (user_id = (select auth.uid()));
create policy events_insert_own on public.learning_events for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Normal clients cannot choose owners/creation timestamps or rewrite evidence.
-- C's server generates session IDs; events get a database-generated ID.
grant select on public.student_profiles, public.study_sessions, public.learning_events to authenticated;
grant insert (display_name, preferred_tutor_mode), update (display_name, preferred_tutor_mode)
  on public.student_profiles to authenticated;
grant insert (id), update (ended_at) on public.study_sessions to authenticated;
grant insert (session_id, source_revision_id, concept, misconception, outcome, evidence)
  on public.learning_events to authenticated;

-- RLS isolates accounts, not AI provenance. Application writers must separately
-- validate A's eligible observations; retrieved memory remains advisory data.
commit;
