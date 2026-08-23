begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

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
  '10000000-0000-0000-0000-000000000041',
  'authenticated',
  'authenticated',
  'profile-media-owner@lux.test',
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
  '10000000-0000-0000-0000-000000000041',
  'self_attestation',
  'accepted',
  'PK',
  'slice-3-media-test',
  now() + interval '1 year'
);

select has_function(
  'public',
  'set_profile_media_path',
  array['text', 'text'],
  'constrained profile media attachment RPC exists'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000041',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000041',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);

select lives_ok(
  $$ select public.set_profile_media_path('avatar', '10000000-0000-0000-0000-000000000041/avatar.webp') $$,
  'adult-assured owner can attach sanitized avatar path'
);
select is(
  (select avatar_path from public.profiles where user_id = auth.uid()),
  '10000000-0000-0000-0000-000000000041/avatar.webp',
  'avatar path persists only on the owner profile'
);
select throws_ok(
  $$ select public.set_profile_media_path('banner', '10000000-0000-0000-0000-000000000099/banner.webp') $$,
  '22023',
  'invalid_profile_media_path',
  'cross-owner media path is rejected'
);
select throws_ok(
  $$ select public.set_profile_media_path('portrait', '10000000-0000-0000-0000-000000000041/portrait.webp') $$,
  '22023',
  'invalid_profile_media_kind',
  'unsupported media kind is rejected'
);

reset role;
select * from finish();
rollback;
