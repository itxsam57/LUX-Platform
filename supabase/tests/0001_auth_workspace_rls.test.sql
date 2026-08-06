begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

select has_table('public', 'accounts', 'accounts table exists');
select has_table('public', 'workspace_memberships', 'workspace memberships table exists');
select has_table('public', 'active_workspaces', 'active workspace table exists');
select has_table('public', 'account_security_state', 'security state table exists');
select has_table('public', 'age_assurance_records', 'age assurance table exists');
select has_table('public', 'audit_events', 'audit event table exists');

select is((select relrowsecurity from pg_class where oid = 'public.accounts'::regclass), true, 'accounts RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.workspace_memberships'::regclass), true, 'memberships RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.active_workspaces'::regclass), true, 'active workspace RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.account_security_state'::regclass), true, 'security state RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.age_assurance_records'::regclass), true, 'age assurance RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.audit_events'::regclass), true, 'audit RLS enabled');

select ok(not has_table_privilege('authenticated', 'public.workspace_memberships', 'INSERT'), 'memberships cannot be directly inserted');
select ok(not has_table_privilege('authenticated', 'public.workspace_memberships', 'UPDATE'), 'memberships cannot be directly updated');
select ok(not has_table_privilege('authenticated', 'public.age_assurance_records', 'INSERT'), 'age records cannot be directly inserted');
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'INSERT'), 'audit events cannot be directly inserted');

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
) values
(
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'fan-a@lux.test',
  crypt('LuxTestPassword1', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000002',
  'authenticated',
  'authenticated',
  'fan-b@lux.test',
  crypt('LuxTestPassword1', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000003',
  'authenticated',
  'authenticated',
  'admin@lux.test',
  crypt('LuxTestPassword1', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

select is((select count(*) from public.workspace_memberships where role = 'fan' and status = 'approved'), 3::bigint, 'new users receive approved fan membership');
select is((select count(*) from public.active_workspaces), 3::bigint, 'new users receive active fan workspace');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000001',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000001',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);

select is((select count(*) from public.accounts), 1::bigint, 'user sees only own account row');
select is((select count(*) from public.workspace_memberships), 1::bigint, 'user sees only own memberships');
select is((public.get_viewer_context() ->> 'active_role'), 'fan', 'default active role is fan');
select is((public.get_viewer_context() ->> 'email_verified')::boolean, true, 'confirmed email is reflected in viewer context');
select is((public.get_viewer_context() ->> 'session_valid')::boolean, true, 'fresh session is valid');

select lives_ok(
  $$ select public.confirm_adult_attestation('pk', 'viewer-policy-v1') $$,
  'verified user can record adult attestation'
);
select is((select count(*) from public.age_assurance_records), 1::bigint, 'user sees own age record');

select lives_ok(
  $$ select public.request_workspace_role('creator') $$,
  'creator role can be requested'
);
select is((select status::text from public.workspace_memberships where role = 'creator'), 'requested', 'creator request remains pending');
select throws_ok(
  $$ select public.activate_workspace((select id from public.workspace_memberships where role = 'creator')) $$,
  '42501',
  'workspace_not_approved',
  'pending role cannot be activated'
);
select throws_ok(
  $$ select public.request_workspace_role('moderator') $$,
  '42501',
  'role_not_requestable',
  'staff role cannot be self-requested'
);

reset role;
set local role service_role;
select lives_ok(
  $$ select public.bootstrap_super_admin('10000000-0000-0000-0000-000000000003') $$,
  'service role can bootstrap initial super admin'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000003',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000003',
    'iat', extract(epoch from now())::bigint - 5
  )::text,
  true
);
select lives_ok(
  $$ select public.confirm_adult_attestation('PK', 'viewer-policy-v1') $$,
  'super admin can complete viewer gate'
);
select is((public.get_viewer_context() ->> 'active_role'), 'super_admin', 'bootstrapped role is active');
select is((select count(*) from public.workspace_memberships where status = 'requested'), 1::bigint, 'super admin can see request queue');
select lives_ok(
  $$ select public.review_workspace_request(
    (select id from public.workspace_memberships where role = 'creator' and status = 'requested'),
    'approved'
  ) $$,
  'super admin can approve creator request'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000001',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000001',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select lives_ok(
  $$ select public.activate_workspace((select id from public.workspace_memberships where role = 'creator')) $$,
  'approved creator workspace can be activated'
);
select is((public.get_viewer_context() ->> 'active_role'), 'creator', 'active role changes without merging permissions');
select throws_ok(
  $$ select public.review_workspace_request(
    (select id from public.workspace_memberships where user_id = '10000000-0000-0000-0000-000000000002' and role = 'fan'),
    'approved'
  ) $$,
  '42501',
  'super_admin_required',
  'creator cannot perform staff review'
);

select lives_ok(
  $$ select public.revoke_all_app_sessions() $$,
  'logout-all advances app revocation epoch'
);
select is((public.get_viewer_context() ->> 'session_valid')::boolean, false, 'old token is rejected after global revocation');

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000001',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000004',
    'iat', extract(epoch from now())::bigint + 2
  )::text,
  true
);
select is((public.get_viewer_context() ->> 'session_valid')::boolean, true, 'newer token is accepted after revocation');
select ok((select count(*) from public.audit_events) > 0, 'user can read own sanitized audit events');

select * from finish();
rollback;
