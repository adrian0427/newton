-- Run as the local database owner after applying migrations. Synthetic fixtures
-- and all test changes are rolled back. Never run against production.
begin;

create function pg_temp.assert(ok boolean, message text) returns void
language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'Assertion failed: %', message; end if;
end;
$$;

create function pg_temp.expect_error(statement text, expected_state text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_state then return; end if;
    raise;
  end;
  raise exception 'Expected SQLSTATE % for %', expected_state, statement;
end;
$$;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');

insert into public.study_sessions(id, user_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002');

-- Synthetic fixtures do not exercise the validated-analysis writer. Same revision, different outcomes are legitimate.
insert into public.learning_events(user_id, session_id, source_revision_id, concept, outcome, evidence)
select user_id, id, '20000000-0000-4000-8000-000000000001', 'algebra.distributive-property', 'practiced', 'Practiced expansion.'
from public.study_sessions;
insert into public.learning_events(user_id, session_id, source_revision_id, concept, outcome, evidence)
values ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
  '20000000-0000-4000-8000-000000000001', 'algebra.distributive-property', 'corrected-with-guidance', 'Corrected expansion after a hint.');

select pg_temp.expect_error($sql$
  insert into public.learning_events(user_id, session_id, source_revision_id, concept, outcome, evidence)
  values ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002',
    '20000000-0000-4000-8000-000000000002', 'algebra.distributive-property', 'practiced', 'Cross-owner link')
$sql$, '23503');
select pg_temp.expect_error($sql$
  insert into public.learning_events(user_id, session_id, source_revision_id, concept, outcome, evidence)
  values ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    '20000000-0000-4000-8000-000000000002', 'algebra.distributive-property', 'misconception-observed', 'Missing misconception')
$sql$, '23514');
select pg_temp.expect_error($sql$
  insert into public.learning_events(user_id, session_id, source_revision_id, concept, outcome, evidence)
  values ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    '20000000-0000-4000-8000-000000000002', 'algebra.distributive-property', 'practiced', '   ')
$sql$, '23514');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
insert into public.student_profiles(display_name) values ('Test A');
select pg_temp.assert((select preferred_tutor_mode = 'student-requested' from public.student_profiles), 'safe tutor default');
insert into public.study_sessions(id) values (default);
select pg_temp.assert((select count(*) = 2 from public.study_sessions), 'A sees only own sessions');
select pg_temp.assert((select count(*) = 2 from public.learning_events), 'A sees only own events');
select pg_temp.assert((select count(*) = 1 from public.learning_events where outcome = 'corrected-with-guidance'), 'outcomes preserved');
select pg_temp.expect_error($sql$update public.student_profiles set user_id = '00000000-0000-0000-0000-000000000002'$sql$, '42501');
select pg_temp.expect_error($sql$insert into public.student_profiles(user_id) values ('00000000-0000-0000-0000-000000000002')$sql$, '42501');
select pg_temp.expect_error($sql$update public.study_sessions set started_at = now()$sql$, '42501');
select pg_temp.expect_error($sql$insert into public.study_sessions(id, user_id) values (default, '00000000-0000-0000-0000-000000000002')$sql$, '42501');
select pg_temp.expect_error($sql$update public.study_sessions set ended_at = started_at - interval '1 second'$sql$, '23514');
select pg_temp.expect_error($sql$update public.student_profiles set preferred_tutor_mode = 'invalid'$sql$, '23514');
select pg_temp.expect_error($sql$insert into public.learning_events(user_id) values ('00000000-0000-0000-0000-000000000001')$sql$, '42501');
select pg_temp.expect_error($sql$update public.learning_events set evidence = 'Forged'$sql$, '42501');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
insert into public.student_profiles(display_name) values ('Test B');
select pg_temp.assert((select count(*) = 1 from public.student_profiles), 'B cannot see A profile');
select pg_temp.assert((select count(*) = 1 from public.study_sessions), 'B cannot see A sessions');
select pg_temp.assert((select count(*) = 1 from public.learning_events), 'B cannot see A events');
with changed as (update public.student_profiles set display_name = 'Changed' where display_name = 'Test A' returning *)
select pg_temp.assert((select count(*) = 0 from changed), 'B cannot update A profile');
with changed as (update public.study_sessions set ended_at = now() where id = '10000000-0000-0000-0000-000000000001' returning *)
select pg_temp.assert((select count(*) = 0 from changed), 'B cannot end A session');
select pg_temp.expect_error('delete from public.learning_events', '42501');
select pg_temp.expect_error('delete from public.study_sessions', '42501');
select pg_temp.expect_error('delete from public.student_profiles', '42501');
update public.student_profiles set preferred_tutor_mode = 'proactive';
select pg_temp.assert((select preferred_tutor_mode = 'proactive' from public.student_profiles), 'B can edit own preferences');
-- Even the authenticated role without a valid identity sees nothing.
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.assert((select count(*) = 0 from public.study_sessions), 'missing identity sees nothing');
select pg_temp.expect_error('insert into public.study_sessions(id) values (default)', '42501');

reset role;
set local role anon;
select pg_temp.expect_error('select * from public.student_profiles', '42501');
select pg_temp.expect_error('select * from public.study_sessions', '42501');
select pg_temp.expect_error('select * from public.learning_events', '42501');
select pg_temp.expect_error('insert into public.study_sessions(id) values (default)', '42501');
select pg_temp.expect_error('delete from public.learning_events', '42501');
reset role;

delete from auth.users where id = '00000000-0000-0000-0000-000000000001';
select pg_temp.assert((select count(*) = 1 from public.learning_events), 'auth deletion cascades A history and preserves B');
select pg_temp.assert((select count(*) = 1 from public.study_sessions), 'auth deletion cascades A sessions and preserves B');
select pg_temp.assert((select count(*) = 0 from public.student_profiles where user_id = '00000000-0000-0000-0000-000000000001'), 'auth deletion cascades profile');

rollback;
