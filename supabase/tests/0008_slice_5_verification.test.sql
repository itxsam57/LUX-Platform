begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

select has_type('public', 'verification_level', 'verification level enum exists');
select has_type('public', 'verification_status', 'verification status enum exists');
select has_table('public', 'verification_subjects', 'verification subjects table exists');
select has_table('public', 'verification_sessions', 'verification sessions table exists');
select has_table('public', 'performer_records', 'performer records table exists');
select has_table('public', 'consent_education_acknowledgements', 'consent education acknowledgement table exists');

select has_function('public', 'start_verification', array['verification_level', 'text', 'text', 'timestamp with time zone', 'boolean'], 'verification start RPC exists');
select has_function('public', 'apply_verification_result', array['uuid', 'verification_status', 'timestamp with time zone', 'boolean', 'boolean', 'text'], 'reviewer result RPC exists');
select has_function('public', 'set_performer_verification_prerequisites', array['uuid', 'boolean', 'timestamp with time zone', 'boolean'], 'performer prerequisite reviewer RPC exists');
select has_function('public', 'acknowledge_consent_education', array['text'], 'consent education acknowledgement RPC exists');
select has_function('public', 'review_verification_state', array['uuid', 'verification_level', 'verification_status', 'text'], 'verification revoke/expiry reviewer RPC exists');
select has_function('public', 'get_my_verification_summary', 'private verification summary RPC exists');
select has_function('public', 'get_public_verification_badge', array['text'], 'safe public verification badge RPC exists');

select is((select relrowsecurity from pg_class where oid = to_regclass('public.verification_subjects')), true, 'verification subjects have RLS');
select is((select relrowsecurity from pg_class where oid = to_regclass('public.verification_sessions')), true, 'verification sessions have RLS');
select is((select relrowsecurity from pg_class where oid = to_regclass('public.performer_records')), true, 'performer records have RLS');
select is((select relrowsecurity from pg_class where oid = to_regclass('public.consent_education_acknowledgements')), true, 'consent acknowledgements have RLS');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000051',
  'authenticated', 'authenticated', 'verify-subject@lux.test', crypt('LuxTestPassword1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
),
(
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000052',
  'authenticated', 'authenticated', 'verify-reviewer@lux.test', crypt('LuxTestPassword1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
),
(
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000053',
  'authenticated', 'authenticated', 'verify-moderator@lux.test', crypt('LuxTestPassword1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
),
(
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000054',
  'authenticated', 'authenticated', 'verify-admin@lux.test', crypt('LuxTestPassword1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

update public.profiles
set handle = case user_id
  when '10000000-0000-0000-0000-000000000051' then 'verify_subject'
  when '10000000-0000-0000-0000-000000000052' then 'verify_reviewer'
  when '10000000-0000-0000-0000-000000000053' then 'verify_moderator'
  when '10000000-0000-0000-0000-000000000054' then 'verify_admin'
end,
display_name = case user_id
  when '10000000-0000-0000-0000-000000000051' then 'Verify Subject'
  when '10000000-0000-0000-0000-000000000052' then 'Verify Reviewer'
  when '10000000-0000-0000-0000-000000000053' then 'Verify Moderator'
  when '10000000-0000-0000-0000-000000000054' then 'Verify Admin'
end
where user_id in (
  '10000000-0000-0000-0000-000000000051',
  '10000000-0000-0000-0000-000000000052',
  '10000000-0000-0000-0000-000000000053',
  '10000000-0000-0000-0000-000000000054'
);

insert into public.age_assurance_records(user_id, method, status, jurisdiction_code, policy_version, expires_at)
select id, 'self_attestation', 'accepted', 'PK', 'slice-5-db-test', now() + interval '1 year'
from auth.users
where id in (
  '10000000-0000-0000-0000-000000000051',
  '10000000-0000-0000-0000-000000000052',
  '10000000-0000-0000-0000-000000000053',
  '10000000-0000-0000-0000-000000000054'
);

insert into public.workspace_memberships(user_id, role, status, reviewed_at, reviewed_by)
values
('10000000-0000-0000-0000-000000000051', 'creator', 'approved', now(), '10000000-0000-0000-0000-000000000054'),
('10000000-0000-0000-0000-000000000052', 'reviewer', 'approved', now(), '10000000-0000-0000-0000-000000000054'),
('10000000-0000-0000-0000-000000000053', 'moderator', 'approved', now(), '10000000-0000-0000-0000-000000000054'),
('10000000-0000-0000-0000-000000000054', 'super_admin', 'approved', now(), '10000000-0000-0000-0000-000000000054');

update public.active_workspaces active
set membership_id = membership.id, updated_at = now()
from public.workspace_memberships membership
where active.user_id = membership.user_id
  and membership.user_id in (
    '10000000-0000-0000-0000-000000000051',
    '10000000-0000-0000-0000-000000000052',
    '10000000-0000-0000-0000-000000000053',
    '10000000-0000-0000-0000-000000000054'
  )
  and membership.role = case membership.user_id
    when '10000000-0000-0000-0000-000000000051' then 'creator'::public.app_role
    when '10000000-0000-0000-0000-000000000052' then 'reviewer'::public.app_role
    when '10000000-0000-0000-0000-000000000053' then 'moderator'::public.app_role
    when '10000000-0000-0000-0000-000000000054' then 'super_admin'::public.app_role
  end;

set local role anon;
select set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
select throws_ok($$ select * from public.verification_subjects $$, '42501', null, 'anonymous callers cannot read verification subject rows');
select throws_ok($$ select * from public.verification_sessions $$, '42501', null, 'anonymous callers cannot read provider session rows');
select throws_ok($$ select * from public.performer_records $$, '42501', null, 'anonymous callers cannot read performer verification rows');
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000051',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000051',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select lives_ok(
  $$ select public.start_verification('v2', 'synthetic', 'synthetic:v2:subject', now() + interval '15 minutes', true) $$,
  'adult-assured subject can start a V2 verification session'
);
select is((public.get_my_verification_summary() -> 'v2' ->> 'status'), 'pending', 'private summary reports V2 pending state');
select throws_ok(
  $$ update public.verification_subjects set status = 'verified' where user_id = auth.uid() and level = 'v2' $$,
  '42501', null,
  'subject cannot self-promote verification through direct table writes'
);
select throws_ok(
  $$ insert into public.performer_records(user_id, active, payout_ownership_verified) values (auth.uid(), true, true) $$,
  '42501', null,
  'subject cannot self-assert performer or payout verification prerequisites'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000053',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000053',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select throws_ok(
  $$ select public.apply_verification_result(
    (select id from public.verification_sessions where user_id = '10000000-0000-0000-0000-000000000051' and target_level = 'v2' order by created_at desc limit 1),
    'verified', now() + interval '1 year', true, true, null
  ) $$,
  '42501', 'verification_reviewer_required',
  'moderator cannot apply identity verification results'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000052',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000052',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select lives_ok(
  $$ select public.apply_verification_result(
    (select id from public.verification_sessions where user_id = '10000000-0000-0000-0000-000000000051' and target_level = 'v2' order by created_at desc limit 1),
    'verified', now() + interval '1 year', true, true, null
  ) $$,
  'authorized reviewer can apply a V2 verification result'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000051',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000051',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select is((public.get_my_verification_summary() -> 'v2' ->> 'current')::boolean, true, 'successful V2 result is current in the private summary');
select lives_ok(
  $$ select public.start_verification('v3', 'synthetic', 'synthetic:v3:subject', now() + interval '15 minutes', true) $$,
  'V2-verified subject can start V3 verification'
);
reset role;

update public.verification_subjects
set expires_at = now() - interval '1 second'
where user_id = '10000000-0000-0000-0000-000000000051' and level = 'v2';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000052',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000052',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select throws_ok(
  $$ select public.apply_verification_result(
    (select id from public.verification_sessions where user_id = '10000000-0000-0000-0000-000000000051' and target_level = 'v3' order by created_at desc limit 1),
    'verified', now() + interval '1 year', true, true, null
  ) $$,
  '42501', 'v2_verification_required',
  'expired V2 blocks V3 promotion'
);
reset role;

update public.verification_subjects
set status = 'verified', expires_at = now() + interval '1 year'
where user_id = '10000000-0000-0000-0000-000000000051' and level = 'v2';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000052',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000052',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select throws_ok(
  $$ select public.apply_verification_result(
    (select id from public.verification_sessions where user_id = '10000000-0000-0000-0000-000000000051' and target_level = 'v3' order by created_at desc limit 1),
    'verified', now() + interval '1 year', true, true, null
  ) $$,
  '42501', 'v3_prerequisites_incomplete',
  'V3 promotion fails until every performer prerequisite is complete'
);
select lives_ok(
  $$ select public.set_performer_verification_prerequisites(
    '10000000-0000-0000-0000-000000000051', true, now() + interval '1 year', true
  ) $$,
  'reviewer can record performer liveness and payout-ownership prerequisites'
);
select throws_ok(
  $$ select public.apply_verification_result(
    (select id from public.verification_sessions where user_id = '10000000-0000-0000-0000-000000000051' and target_level = 'v3' order by created_at desc limit 1),
    'verified', now() + interval '1 year', true, true, null
  ) $$,
  '42501', 'v3_prerequisites_incomplete',
  'performer record alone cannot replace personal consent-education acknowledgement'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000051',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000051',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select lives_ok($$ select public.acknowledge_consent_education('slice-5-consent-v1') $$, 'subject can personally acknowledge consent education');
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000052',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000052',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select lives_ok(
  $$ select public.apply_verification_result(
    (select id from public.verification_sessions where user_id = '10000000-0000-0000-0000-000000000051' and target_level = 'v3' order by created_at desc limit 1),
    'verified', now() + interval '1 year', true, true, null
  ) $$,
  'V3 promotion succeeds only after every canonical prerequisite exists'
);
reset role;

set local role anon;
select set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
select is(public.get_public_verification_badge('verify_subject') ->> 'level', 'v3', 'public badge exposes only the highest current safe verification level');
select set_eq(
  $$ select jsonb_object_keys(public.get_public_verification_badge('verify_subject')) $$,
  array['level', 'verified']::text[],
  'public verification badge contains only allowlisted safe keys'
);
select ok(not (public.get_public_verification_badge('verify_subject') ? 'user_id'), 'public badge omits internal user UUID');
select ok(not (public.get_public_verification_badge('verify_subject') ? 'provider_reference'), 'public badge omits provider/evidence references');
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000054',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000054',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select lives_ok(
  $$ select public.review_verification_state('10000000-0000-0000-0000-000000000051', 'v3', 'revoked', 'manual_test_revocation') $$,
  'super-admin can revoke a current verification state with an audited reason'
);
reset role;

set local role anon;
select set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
select is(public.get_public_verification_badge('verify_subject') ->> 'level', 'v2', 'revoked V3 safely falls back to still-current V2 badge');
reset role;

select is(
  (select count(*) from public.audit_events where event_type in ('verification_started', 'verification_result_applied', 'verification_state_reviewed') and actor_user_id is not null),
  5::bigint,
  'material verification transitions write purpose-specific audit events'
);

select * from finish();
rollback;
