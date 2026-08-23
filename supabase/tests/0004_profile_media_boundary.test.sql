begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

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
  '10000000-0000-0000-0000-000000000041',
  'authenticated',
  'authenticated',
  'media-a@lux.test',
  crypt('LuxTestPassword1', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000042',
  'authenticated',
  'authenticated',
  'media-b@lux.test',
  crypt('LuxTestPassword1', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000043',
  'authenticated',
  'authenticated',
  'media-c@lux.test',
  crypt('LuxTestPassword1', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

update public.profiles
set handle = case user_id
  when '10000000-0000-0000-0000-000000000041' then 'media_alpha'
  when '10000000-0000-0000-0000-000000000042' then 'media_bravo'
  when '10000000-0000-0000-0000-000000000043' then 'media_charlie'
end,
display_name = case user_id
  when '10000000-0000-0000-0000-000000000041' then 'Media Alpha'
  when '10000000-0000-0000-0000-000000000042' then 'Media Bravo'
  when '10000000-0000-0000-0000-000000000043' then 'Media Charlie'
end
where user_id in (
  '10000000-0000-0000-0000-000000000041',
  '10000000-0000-0000-0000-000000000042',
  '10000000-0000-0000-0000-000000000043'
);

insert into public.age_assurance_records (
  user_id,
  method,
  status,
  jurisdiction_code,
  policy_version,
  expires_at
) values
(
  '10000000-0000-0000-0000-000000000041',
  'self_attestation',
  'accepted',
  'PK',
  'slice-3-media-test',
  now() + interval '1 year'
),
(
  '10000000-0000-0000-0000-000000000042',
  'self_attestation',
  'accepted',
  'PK',
  'slice-3-media-test',
  now() + interval '1 year'
);

select has_function('public', 'get_profile_media_upload_path', 'owner media upload-path RPC exists');
select has_function('public', 'commit_profile_media', 'owner media commit RPC exists');
select has_function('public', 'resolve_profile_media', 'guarded public media resolver RPC exists');

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

select is(
  public.get_profile_media_upload_path('avatar'),
  '839f8bd9e8c76591193bd530fb7f1366c6a45f9eaebeb830a3dc2c60ce60149c/avatar.webp',
  'upload path uses a non-reversible SHA-256 namespace rather than the account UUID'
);
select ok(
  position('10000000-0000-0000-0000-000000000041' in public.get_profile_media_upload_path('avatar')) = 0,
  'owner upload path does not contain the internal UUID'
);
select throws_ok(
  $$ select public.get_profile_media_upload_path('profile-photo') $$,
  '22023',
  'invalid_profile_media_kind',
  'upload path RPC rejects unknown media kinds'
);
select lives_ok(
  $$ insert into storage.objects(bucket_id, name) values ('profile-media', '839f8bd9e8c76591193bd530fb7f1366c6a45f9eaebeb830a3dc2c60ce60149c/avatar.webp') $$,
  'adult-assured owner can insert only inside the opaque media namespace'
);
select throws_ok(
  $$ insert into storage.objects(bucket_id, name) values ('profile-media', '3ce8076f31299b1b1eb433ac1076aa2e3f2528c3ef6cd5849e762214322a4d43/banner.webp') $$,
  '42501',
  null,
  'owner cannot write another account opaque media namespace'
);
select lives_ok(
  $$ select public.commit_profile_media('avatar') $$,
  'media commit succeeds only after the processed storage object exists'
);
select is(
  (select avatar_path from public.profiles where user_id = auth.uid()),
  '839f8bd9e8c76591193bd530fb7f1366c6a45f9eaebeb830a3dc2c60ce60149c/avatar.webp',
  'media commit stores only the opaque object path'
);
select is(
  public.get_public_profile('media_alpha') ->> 'avatar_url',
  '/profile-media/media_alpha/avatar',
  'public projection exposes only the guarded handle-based media URL'
);
reset role;

set local role anon;
select is(
  public.resolve_profile_media('media_alpha', 'avatar'),
  '839f8bd9e8c76591193bd530fb7f1366c6a45f9eaebeb830a3dc2c60ce60149c/avatar.webp',
  'anonymous media resolver returns the opaque object path only for a public profile'
);
select ok(
  position('10000000-0000-0000-0000-000000000041' in coalesce(public.resolve_profile_media('media_alpha', 'avatar'), '')) = 0,
  'anonymous media resolver never returns the internal UUID'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'profile-media' and name = '839f8bd9e8c76591193bd530fb7f1366c6a45f9eaebeb830a3dc2c60ce60149c/avatar.webp'),
  1::bigint,
  'anonymous storage read sees attached media for a public profile'
);
reset role;

update public.profiles set visibility = 'private' where user_id = '10000000-0000-0000-0000-000000000041';
set local role anon;
select is(public.resolve_profile_media('media_alpha', 'avatar'), null::text, 'private profile media resolver is anonymous-safe');
select is(
  (select count(*) from storage.objects where bucket_id = 'profile-media' and name = '839f8bd9e8c76591193bd530fb7f1366c6a45f9eaebeb830a3dc2c60ce60149c/avatar.webp'),
  0::bigint,
  'private profile media is not directly readable by anonymous storage callers'
);
reset role;

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
select is(
  public.resolve_profile_media('media_alpha', 'avatar'),
  '839f8bd9e8c76591193bd530fb7f1366c6a45f9eaebeb830a3dc2c60ce60149c/avatar.webp',
  'profile owner can resolve own media while private'
);
reset role;

update public.profiles set visibility = 'public' where user_id = '10000000-0000-0000-0000-000000000041';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000042',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000042',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select lives_ok(
  $$ select public.set_profile_relationship('media_alpha', 'block') $$,
  'adult-assured viewer can create a block used by the media boundary'
);
select is(public.resolve_profile_media('media_alpha', 'avatar'), null::text, 'blocked authenticated caller cannot resolve profile media');
select is(
  (select count(*) from storage.objects where bucket_id = 'profile-media' and name = '839f8bd9e8c76591193bd530fb7f1366c6a45f9eaebeb830a3dc2c60ce60149c/avatar.webp'),
  0::bigint,
  'blocked authenticated caller cannot bypass the media resolver through Storage RLS'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000043',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000043',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select throws_ok(
  $$ select public.get_profile_media_upload_path('avatar') $$,
  '42501',
  'adult_access_required',
  'new profile-media upload remains adult-gated'
);
select throws_ok(
  $$ select public.commit_profile_media('avatar') $$,
  '42501',
  'adult_access_required',
  'profile-media commit remains adult-gated'
);
reset role;

select * from finish();
rollback;
