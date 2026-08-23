begin;

create extension if not exists pgtap with schema extensions;

select plan(76);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'profile_follows', 'profile follows table exists');
select has_table('public', 'profile_blocks', 'profile blocks table exists');
select has_table('public', 'profile_mutes', 'profile mutes table exists');
select has_table('public', 'privacy_requests', 'privacy requests table exists');
select has_table('public', 'notifications', 'notifications table exists');

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
  '10000000-0000-0000-0000-000000000031',
  'authenticated',
  'authenticated',
  'profile-a@lux.test',
  crypt('LuxTestPassword1', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000032',
  'authenticated',
  'authenticated',
  'profile-b@lux.test',
  crypt('LuxTestPassword1', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000033',
  'authenticated',
  'authenticated',
  'profile-c@lux.test',
  crypt('LuxTestPassword1', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

select is(
  (select count(*) from public.profiles where user_id = '10000000-0000-0000-0000-000000000031'),
  1::bigint,
  'new auth user receives exactly one profile row'
);

select ok(
  (select handle ~ '^lux_[a-f0-9]{10,26}$' from public.profiles where user_id = '10000000-0000-0000-0000-000000000031'),
  'generated handle is non-email-derived and valid under the public handle policy'
);

update public.profiles
set handle = case user_id
  when '10000000-0000-0000-0000-000000000031' then 'alpha'
  when '10000000-0000-0000-0000-000000000032' then 'bravo'
  when '10000000-0000-0000-0000-000000000033' then 'charlie'
end,
display_name = case user_id
  when '10000000-0000-0000-0000-000000000031' then 'Alpha'
  when '10000000-0000-0000-0000-000000000032' then 'Bravo'
  when '10000000-0000-0000-0000-000000000033' then 'Charlie'
end
where user_id in (
  '10000000-0000-0000-0000-000000000031',
  '10000000-0000-0000-0000-000000000032',
  '10000000-0000-0000-0000-000000000033'
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
  '10000000-0000-0000-0000-000000000031',
  'self_attestation',
  'accepted',
  'PK',
  'slice-3-db-test',
  now() + interval '1 year'
),
(
  '10000000-0000-0000-0000-000000000032',
  'self_attestation',
  'accepted',
  'PK',
  'slice-3-db-test',
  now() + interval '1 year'
);

select has_function('public', 'get_public_profile', 'public profile projection RPC exists');
select has_function('public', 'is_profile_discoverable', 'profile discoverability RPC exists');
select has_function('public', 'update_profile', 'profile update RPC exists');
select has_function('public', 'set_profile_relationship', 'profile relationship RPC exists');
select has_function('public', 'set_supporter_privacy', 'supporter privacy RPC exists');
select has_function('public', 'submit_account_deletion_request', 'deletion request RPC exists');
select has_function('public', 'cancel_account_deletion_request', 'deletion cancellation RPC exists');
select has_function('public', 'mark_notification_read', 'single notification read RPC exists');
select has_function('public', 'mark_all_notifications_read', 'all notifications read RPC exists');

set local role anon;
select throws_ok(
  $$ select * from public.profiles $$,
  '42501',
  null,
  'anonymous callers cannot select full profile rows'
);
select ok(public.get_public_profile('alpha') is not null, 'anonymous caller can read an explicitly public profile projection');
select ok(not (public.get_public_profile('alpha') ? 'user_id'), 'public profile projection never contains the internal user UUID');
select set_eq(
  $$ select jsonb_object_keys(public.get_public_profile('alpha')) $$,
  array[
    'avatar_url',
    'banner_url',
    'bio',
    'creator_capable',
    'display_name',
    'follower_count',
    'following_count',
    'handle',
    'language_code',
    'links',
    'visibility'
  ]::text[],
  'anonymous public profile projection contains only allowlisted public keys'
);
select is(public.is_profile_discoverable('alpha'), true, 'public profile is discoverable');
reset role;

update public.profiles set visibility = 'unlisted' where handle = 'bravo';
set local role anon;
select ok(public.get_public_profile('bravo') is not null, 'unlisted profile remains directly addressable');
select is(public.is_profile_discoverable('bravo'), false, 'unlisted profile is excluded from discovery');
reset role;

update public.profiles set visibility = 'private' where handle = 'bravo';
set local role anon;
select is(public.get_public_profile('bravo'), null::jsonb, 'private profile is hidden from anonymous callers');
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000032',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000032',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select ok(public.get_public_profile('bravo') is not null, 'private profile remains visible to its owner');
reset role;

update public.profiles set visibility = 'public' where handle = 'bravo';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000031',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000031',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select throws_ok(
  $$ update public.profiles set display_name = 'Hacked' where handle = 'bravo' $$,
  '42501',
  null,
  'authenticated account cannot directly update another profile'
);
select lives_ok(
  $$ select public.update_profile('alpha2', 'Alpha Updated', 'Plain text bio', '[]'::jsonb, 'en-US', 'public') $$,
  'adult-assured owner can update own profile through the constrained RPC'
);
select is((select handle from public.profiles where user_id = auth.uid()), 'alpha2', 'profile update changes the normalized owner handle');
select is((select profile_revision from public.profiles where user_id = auth.uid()), 2::bigint, 'handle change increments profile revision');
select throws_ok(
  $$ select public.update_profile('alpha2', 'Alpha Updated', 'Plain text bio', '[{"label":"Bad","url":"javascript:alert(1)"}]'::jsonb, 'en', 'public') $$,
  '22023',
  'invalid_profile_links',
  'profile RPC rejects unsafe links at the database boundary'
);
select throws_ok(
  $$ select public.update_profile('admin', 'Alpha Updated', 'Plain text bio', '[]'::jsonb, 'en', 'public') $$,
  '22023',
  'reserved_profile_handle',
  'profile RPC rejects reserved handles at the database boundary'
);
select lives_ok(
  $$ select public.set_profile_relationship('bravo', 'follow') $$,
  'adult-assured account can follow another public profile'
);
select lives_ok(
  $$ select public.set_profile_relationship('bravo', 'follow') $$,
  'duplicate follow is idempotent'
);
select is(
  (select count(*) from public.profile_follows where follower_user_id = auth.uid() and followed_user_id = '10000000-0000-0000-0000-000000000032'),
  1::bigint,
  'duplicate follow creates only one relationship row'
);
select is(
  (select count(*) from public.notifications where recipient_user_id = '10000000-0000-0000-0000-000000000032' and actor_user_id = auth.uid()),
  0::bigint,
  'non-recipient cannot read another account notification through RLS'
);
select is(
  (public.get_public_profile('bravo') ->> 'following')::boolean,
  true,
  'authenticated projection reports viewer follow state'
);
reset role;

select is(
  (select count(*) from public.notifications where recipient_user_id = '10000000-0000-0000-0000-000000000032' and actor_user_id = '10000000-0000-0000-0000-000000000031'),
  1::bigint,
  'duplicate follow creates only one follower notification'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000032',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000032',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select is((select count(*) from public.notifications), 1::bigint, 'notification recipient can read own follower notification');
select lives_ok(
  $$ select public.mark_notification_read((select id from public.notifications order by created_at desc limit 1)) $$,
  'recipient can mark one notification read'
);
select ok((select bool_and(read_at is not null) from public.notifications), 'single notification read timestamp is persisted');
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000033',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000033',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select is((select count(*) from public.notifications), 0::bigint, 'unrelated account cannot read another recipient notification');
reset role;

update public.notifications
set read_at = null
where recipient_user_id = '10000000-0000-0000-0000-000000000032';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000032',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000032',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select lives_ok($$ select public.mark_all_notifications_read() $$, 'recipient can mark all notifications read');
select ok((select bool_and(read_at is not null) from public.notifications), 'mark-all persists read timestamps');
select lives_ok(
  $$ select public.set_profile_relationship('alpha2', 'follow') $$,
  'second adult-assured account can create the reverse follow edge'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000031',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000031',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select lives_ok(
  $$ select public.set_profile_relationship('bravo', 'block') $$,
  'adult-assured account can block another profile'
);
select is(
  (select count(*) from public.profile_follows where
    (follower_user_id = '10000000-0000-0000-0000-000000000031' and followed_user_id = '10000000-0000-0000-0000-000000000032')
    or
    (follower_user_id = '10000000-0000-0000-0000-000000000032' and followed_user_id = '10000000-0000-0000-0000-000000000031')
  ),
  0::bigint,
  'blocking removes follow edges in both directions atomically'
);
select lives_ok(
  $$ select public.set_profile_relationship('bravo', 'unblock') $$,
  'adult-assured blocker can remove own block'
);
select lives_ok(
  $$ select public.set_profile_relationship('bravo', 'mute') $$,
  'adult-assured account can privately mute another profile'
);
select is((select count(*) from public.profile_mutes), 1::bigint, 'muting account can read own mute row');
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000032',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000032',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select is((select count(*) from public.profile_mutes), 0::bigint, 'muted account cannot read who muted it');
select lives_ok(
  $$ select public.set_profile_relationship('alpha2', 'follow') $$,
  'follow works again after the opposing block is removed'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000031',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000031',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select lives_ok(
  $$ select public.set_profile_relationship('bravo', 'block') $$,
  'block can be recreated after a fresh follow'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000032',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000032',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select throws_ok(
  $$ select public.set_profile_relationship('alpha2', 'follow') $$,
  '42501',
  'profile_interaction_blocked',
  'follow cannot cross an active block in either direction'
);
reset role;

insert into public.profile_blocks(blocker_user_id, blocked_user_id)
values ('10000000-0000-0000-0000-000000000033', '10000000-0000-0000-0000-000000000031')
on conflict do nothing;
insert into public.profile_mutes(muter_user_id, muted_user_id)
values ('10000000-0000-0000-0000-000000000033', '10000000-0000-0000-0000-000000000031')
on conflict do nothing;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000033',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000033',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select lives_ok($$ select public.set_supporter_privacy(false) $$, 'supporter privacy remains changeable without adult assurance');
select is((select supporter_anonymity_default from public.profiles where user_id = auth.uid()), false, 'supporter privacy preference persists');
select lives_ok($$ select public.submit_account_deletion_request() $$, 'deletion request remains available without adult assurance');
select lives_ok($$ select public.submit_account_deletion_request() $$, 'duplicate deletion request is idempotent');
select is((select count(*) from public.privacy_requests where status in ('submitted', 'processing')), 1::bigint, 'duplicate deletion request creates only one active request');
select lives_ok($$ select public.cancel_account_deletion_request() $$, 'deletion request can be cancelled without adult assurance');
select is((select status::text from public.privacy_requests order by requested_at desc limit 1), 'cancelled', 'deletion cancellation persists');
select throws_ok(
  $$ select public.update_profile('charlie2', 'Charlie', '', '[]'::jsonb, 'en', 'public') $$,
  '42501',
  'adult_access_required',
  'profile publication/edit remains denied without adult assurance'
);
select throws_ok(
  $$ select public.set_profile_relationship('bravo', 'follow') $$,
  '42501',
  'adult_access_required',
  'new social interaction remains denied without adult assurance'
);
select lives_ok(
  $$ select public.set_profile_relationship('alpha2', 'unblock') $$,
  'existing block can be removed without adult assurance'
);
select is((select count(*) from public.profile_blocks where blocker_user_id = auth.uid() and blocked_user_id = '10000000-0000-0000-0000-000000000031'), 0::bigint, 'no-age unblock removes only the owner block');
select lives_ok(
  $$ select public.set_profile_relationship('alpha2', 'unmute') $$,
  'existing mute can be removed without adult assurance'
);
select is((select count(*) from public.profile_mutes where muter_user_id = auth.uid() and muted_user_id = '10000000-0000-0000-0000-000000000031'), 0::bigint, 'no-age unmute removes only the owner mute');
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000032',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000032',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select lives_ok(
  $$ select public.set_profile_relationship('alpha2', 'block') $$,
  'notification recipient can block the follower actor'
);
select is((select count(*) from public.notifications), 0::bigint, 'notifications from an actor blocked by the recipient are suppressed from reads');
reset role;

select ok(not has_table_privilege('authenticated', 'public.audit_events', 'INSERT'), 'authenticated users cannot forge audit events directly');
select ok(exists(select 1 from storage.buckets where id = 'profile-media'), 'private profile-media bucket exists');
select is((select public from storage.buckets where id = 'profile-media'), false, 'profile-media bucket is not public');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000031',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000031',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select lives_ok(
  $$ insert into storage.objects(bucket_id, name) values ('profile-media', '10000000-0000-0000-0000-000000000031/avatar.webp') $$,
  'adult-assured owner can write only to own profile-media namespace'
);
reset role;

update public.profiles
set avatar_path = '10000000-0000-0000-0000-000000000031/avatar.webp', visibility = 'public'
where user_id = '10000000-0000-0000-0000-000000000031';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000033',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000033',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select throws_ok(
  $$ insert into storage.objects(bucket_id, name) values ('profile-media', '10000000-0000-0000-0000-000000000031/banner.webp') $$,
  '42501',
  null,
  'account cannot write another owner profile-media namespace'
);
select throws_ok(
  $$ insert into storage.objects(bucket_id, name) values ('profile-media', '10000000-0000-0000-0000-000000000033/avatar.webp') $$,
  '42501',
  null,
  'profile-media write remains adult-gated even inside the owner namespace'
);
reset role;

set local role anon;
select is(
  (select count(*) from storage.objects where bucket_id = 'profile-media' and name = '10000000-0000-0000-0000-000000000031/avatar.webp'),
  1::bigint,
  'anonymous storage read is allowed only for media attached to a public profile'
);
reset role;

update public.profiles set visibility = 'private' where user_id = '10000000-0000-0000-0000-000000000031';

set local role anon;
select is(
  (select count(*) from storage.objects where bucket_id = 'profile-media' and name = '10000000-0000-0000-0000-000000000031/avatar.webp'),
  0::bigint,
  'private-profile media is hidden from anonymous storage reads'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000031',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000031',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select is(
  (select count(*) from storage.objects where bucket_id = 'profile-media' and name = '10000000-0000-0000-0000-000000000031/avatar.webp'),
  1::bigint,
  'profile owner can read own media while profile is private'
);
reset role;

select ok(
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'profile_media_%') >= 4,
  'profile-media storage boundary is enforced by explicit RLS policies'
);

select * from finish();
rollback;
