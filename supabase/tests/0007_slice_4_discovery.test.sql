begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

select has_table('public', 'discovery_interests', 'discovery interests table exists');
select has_table('public', 'account_interests', 'account interests table exists');
select has_table('public', 'hidden_topics', 'hidden topics table exists');

select has_function('public', 'get_discovery_feed', array['text', 'integer', 'timestamp with time zone'], 'feed read RPC exists');
select has_function('public', 'search_discovery', array['text', 'integer'], 'search read RPC exists');

select has_column('public', 'discovery_interests', 'slug', 'interest taxonomy uses a public slug');
select has_column('public', 'account_interests', 'user_id', 'account interest ownership is internal');
select has_column('public', 'hidden_topics', 'user_id', 'hidden-topic ownership is internal');

select is(
  (select relrowsecurity from pg_class where oid = 'public.discovery_interests'::regclass),
  true,
  'discovery interests have RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.account_interests'::regclass),
  true,
  'account interests have RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.hidden_topics'::regclass),
  true,
  'hidden topics have RLS enabled'
);

select is(
  has_table_privilege('anon', 'public.account_interests', 'SELECT'),
  false,
  'anonymous callers cannot read private account-interest rows directly'
);

insert into auth.users(
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
  'slice4-search-viewer@lux.test',
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
  'slice4-search-public@lux.test',
  crypt('LuxTestPassword1', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

update public.profiles
set handle = case user_id
  when '10000000-0000-0000-0000-000000000041' then 'discover_viewer'
  else 'discover_public'
end,
display_name = case user_id
  when '10000000-0000-0000-0000-000000000041' then 'Discovery Viewer'
  else 'Discovery Public'
end,
visibility = 'public'
where user_id in (
  '10000000-0000-0000-0000-000000000041',
  '10000000-0000-0000-0000-000000000042'
);

insert into public.age_assurance_records(
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
  'slice-4-search-test',
  now() + interval '1 year'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000041',
    'role', 'authenticated'
  )::text,
  true
);

select lives_ok(
  $$select public.search_discovery('discover', 20)$$,
  'search executes for an adult viewer instead of failing on query escaping'
);

select * from finish();
rollback;