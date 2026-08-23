begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

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
) values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000031',
  'authenticated',
  'authenticated',
  'profile-default@lux.test',
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

select * from finish();
rollback;
