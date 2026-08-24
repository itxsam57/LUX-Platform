begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select has_column(
  'public',
  'account_security_state',
  'sessions_revoked_before',
  'security state stores a precise revocation timestamp'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000004',
  'authenticated',
  'authenticated',
  'session-boundary@lux.test',
  crypt('LuxTestPassword1', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into auth.sessions (id, user_id, created_at, updated_at)
values (
  '20000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000004',
  clock_timestamp() - interval '1 minute',
  clock_timestamp() - interval '1 minute'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000004',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000010',
    'iat', extract(epoch from now())::bigint - 60
  )::text,
  true
);

select is(
  (public.get_viewer_context() ->> 'session_valid')::boolean,
  true,
  'existing session starts valid'
);

select lives_ok(
  $$ select public.revoke_all_app_sessions() $$,
  'global logout records the precise revocation boundary'
);

select is(
  (public.get_viewer_context() ->> 'session_valid')::boolean,
  false,
  'session created before the revocation boundary is rejected'
);

reset role;

insert into auth.sessions (id, user_id, created_at, updated_at)
select
  '20000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000004',
  sessions_revoked_before + interval '1 microsecond',
  sessions_revoked_before + interval '1 microsecond'
from public.account_security_state
where user_id = '10000000-0000-0000-0000-000000000004';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000004',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000011',
    'iat', (
      select floor(extract(epoch from sessions_revoked_before))::bigint
      from public.account_security_state
      where user_id = '10000000-0000-0000-0000-000000000004'
    )
  )::text,
  true
);

select is(
  (public.get_viewer_context() ->> 'session_valid')::boolean,
  true,
  'a newly created session is valid immediately even when JWT iat shares the revocation second'
);

select * from finish();
rollback;
