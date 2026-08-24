begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

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
  '10000000-0000-0000-0000-000000000061',
  'authenticated',
  'authenticated',
  'slice3-boundary@lux.test',
  crypt('LuxTestPassword1', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.age_assurance_records (
  user_id,
  method,
  status,
  jurisdiction_code,
  policy_version,
  expires_at
) values (
  '10000000-0000-0000-0000-000000000061',
  'self_attestation',
  'accepted',
  'PK',
  'slice-3-browser-boundary-test',
  now() + interval '1 year'
);

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
select lives_ok(
  $$ insert into storage.objects(bucket_id, name) values ('profile-media', public.get_profile_media_upload_path('avatar')) $$,
  'adult-assured owner can stage processed media in the opaque owner namespace'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'profile-media'),
  1::bigint,
  'adult-assured owner can select staged own media before profile attachment for Storage upsert semantics'
);
reset role;

set local role anon;
select set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
select is(
  (select count(*) from storage.objects where bucket_id = 'profile-media'),
  0::bigint,
  'anonymous callers cannot read staged unattached profile media'
);
reset role;

select has_function(
  'public',
  'revoke_age_assurance',
  'trusted age-assurance revocation RPC exists'
);

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
  $$ select public.revoke_age_assurance('10000000-0000-0000-0000-000000000061') $$,
  '42501',
  null,
  'authenticated users cannot revoke age assurance through the trusted service boundary'
);
reset role;

set local role service_role;
select lives_ok(
  $$ select public.revoke_age_assurance('10000000-0000-0000-0000-000000000061') $$,
  'service role can revoke accepted age assurance through the constrained RPC'
);
reset role;

select is(
  (select status::text from public.age_assurance_records where user_id = '10000000-0000-0000-0000-000000000061' order by assured_at desc limit 1),
  'revoked',
  'trusted revocation persists the revoked state'
);
select is(
  (select count(*) from public.age_assurance_records where user_id = '10000000-0000-0000-0000-000000000061' and status = 'accepted'),
  0::bigint,
  'trusted revocation leaves no accepted assurance record active'
);

select * from finish();
rollback;
