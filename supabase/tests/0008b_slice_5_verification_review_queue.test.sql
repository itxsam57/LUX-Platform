begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select has_function(
  'public',
  'get_verification_review_queue',
  'reviewer verification queue RPC exists'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000061',
  'authenticated', 'authenticated', 'queue-subject@lux.test', crypt('LuxTestPassword1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
),
(
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000062',
  'authenticated', 'authenticated', 'queue-reviewer@lux.test', crypt('LuxTestPassword1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

update public.profiles
set handle = case user_id
  when '10000000-0000-0000-0000-000000000061' then 'queue_subject'
  when '10000000-0000-0000-0000-000000000062' then 'queue_reviewer'
end
where user_id in (
  '10000000-0000-0000-0000-000000000061',
  '10000000-0000-0000-0000-000000000062'
);

insert into public.workspace_memberships(user_id, role, status, reviewed_at, reviewed_by)
values (
  '10000000-0000-0000-0000-000000000062',
  'reviewer',
  'approved',
  now(),
  '10000000-0000-0000-0000-000000000062'
);

update public.active_workspaces active
set membership_id = membership.id, updated_at = now()
from public.workspace_memberships membership
where active.user_id = '10000000-0000-0000-0000-000000000062'
  and membership.user_id = active.user_id
  and membership.role = 'reviewer'
  and membership.status = 'approved';

insert into public.verification_subjects(user_id, level, status)
values ('10000000-0000-0000-0000-000000000061', 'v2', 'pending');

insert into public.verification_sessions(
  user_id,
  target_level,
  provider_key,
  provider_reference,
  status,
  synthetic,
  session_expires_at
) values (
  '10000000-0000-0000-0000-000000000061',
  'v2',
  'synthetic',
  'synthetic:queue-subject',
  'pending',
  true,
  now() + interval '15 minutes'
);

set local role anon;
select set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
select throws_ok(
  $$ select * from public.get_verification_review_queue() $$,
  '42501',
  null,
  'anonymous callers cannot execute the reviewer queue projection'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000061',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000061',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select throws_ok(
  $$ select * from public.get_verification_review_queue() $$,
  '42501',
  'verification_reviewer_required',
  'ordinary authenticated subjects cannot inspect the reviewer queue'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000062',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000062',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select lives_ok(
  $$ select * from public.get_verification_review_queue() $$,
  'authorized reviewer can read the constrained verification queue'
);
select is(
  (
    select handle || ':' || level::text || ':' || status::text
    from public.get_verification_review_queue()
    where handle = 'queue_subject'
    limit 1
  ),
  'queue_subject:v2:pending',
  'reviewer queue projects the expected handle, level, and pending state'
);
reset role;

select * from finish();
rollback;
