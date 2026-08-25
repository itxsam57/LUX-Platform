begin;

create extension if not exists pgtap with schema extensions;

select plan(66);

select has_type('public', 'demand_state', 'demand state enum exists');
select is(
  (
    select string_agg(enum_value.enumlabel, ',' order by enum_value.enumsortorder)
    from pg_type type_row
    join pg_namespace namespace_row on namespace_row.oid = type_row.typnamespace
    join pg_enum enum_value on enum_value.enumtypid = type_row.oid
    where namespace_row.nspname = 'public' and type_row.typname = 'demand_state'
  ),
  'open,creator_interested,converted,expired,closed',
  'demand state enum contains only the canonical Slice 6 states'
);
select has_table('public', 'demands', 'demands table exists');
select has_table('public', 'demand_supports', 'demand support integrity table exists');
select has_table('public', 'demand_creator_responses', 'private creator response table exists');
select has_function('public', 'create_demand', array['jsonb'], 'create demand RPC exists');
select has_function('public', 'set_demand_support', array['text', 'boolean', 'boolean'], 'support toggle RPC exists');
select has_function('public', 'respond_to_demand', array['text', 'text'], 'creator response RPC exists');
select has_function('public', 'get_demand', array['text'], 'safe demand detail RPC exists');
select has_function('public', 'list_demands', array['integer', 'timestamp with time zone'], 'safe demand list RPC exists');
select is((select relrowsecurity from pg_class where oid = to_regclass('public.demands')), true, 'demands have RLS');
select is((select relrowsecurity from pg_class where oid = to_regclass('public.demand_supports')), true, 'demand supports have RLS');
select is((select relrowsecurity from pg_class where oid = to_regclass('public.demand_creator_responses')), true, 'creator responses have RLS');

create temp table slice6_ids (
  label text primary key,
  public_id text
);
create temp table slice6_json (
  label text primary key,
  payload jsonb
);
create temp table slice6_text (
  label text primary key,
  value text
);

set local role anon;
select set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
select throws_ok($$ select * from public.demands $$, '42501', null, 'anonymous callers cannot read internal demand rows');
select throws_ok($$ select * from public.demand_supports $$, '42501', null, 'anonymous callers cannot read internal demand support rows');
select throws_ok($$ select * from public.demand_creator_responses $$, '42501', null, 'anonymous callers cannot read private creator responses');
reset role;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000061',
  'authenticated', 'authenticated', 'demand-author@lux.test', crypt('LuxTestPassword1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
),
(
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000062',
  'authenticated', 'authenticated', 'demand-supporter@lux.test', crypt('LuxTestPassword1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
),
(
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000063',
  'authenticated', 'authenticated', 'demand-creator@lux.test', crypt('LuxTestPassword1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
),
(
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000064',
  'authenticated', 'authenticated', 'demand-observer@lux.test', crypt('LuxTestPassword1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

update public.profiles
set handle = case user_id
  when '10000000-0000-0000-0000-000000000061' then 'demand_author'
  when '10000000-0000-0000-0000-000000000062' then 'demand_supporter'
  when '10000000-0000-0000-0000-000000000063' then 'demand_creator'
  when '10000000-0000-0000-0000-000000000064' then 'demand_observer'
end,
display_name = case user_id
  when '10000000-0000-0000-0000-000000000061' then 'Demand Author'
  when '10000000-0000-0000-0000-000000000062' then 'Demand Supporter'
  when '10000000-0000-0000-0000-000000000063' then 'Demand Creator'
  when '10000000-0000-0000-0000-000000000064' then 'Demand Observer'
end,
visibility = 'public'
where user_id in (
  '10000000-0000-0000-0000-000000000061',
  '10000000-0000-0000-0000-000000000062',
  '10000000-0000-0000-0000-000000000063',
  '10000000-0000-0000-0000-000000000064'
);

insert into public.age_assurance_records(user_id, method, status, jurisdiction_code, policy_version, expires_at)
select id, 'self_attestation', 'accepted', 'PK', 'slice-6-db-test', now() + interval '1 year'
from auth.users
where id in (
  '10000000-0000-0000-0000-000000000061',
  '10000000-0000-0000-0000-000000000062',
  '10000000-0000-0000-0000-000000000063',
  '10000000-0000-0000-0000-000000000064'
);

insert into public.workspace_memberships(user_id, role, status, reviewed_at, reviewed_by)
values (
  '10000000-0000-0000-0000-000000000063',
  'creator',
  'approved',
  now(),
  '10000000-0000-0000-0000-000000000063'
);

update public.active_workspaces active
set membership_id = membership.id, updated_at = now()
from public.workspace_memberships membership
where active.user_id = '10000000-0000-0000-0000-000000000063'
  and membership.user_id = active.user_id
  and membership.role = 'creator'
  and membership.status = 'approved';

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
  $$
    insert into pg_temp.slice6_ids(label, public_id)
    select 'primary', public.create_demand(jsonb_build_object(
      'title', 'A private rooftop scene',
      'brief', 'A consensual adult creator concept with a clear short brief and no implied commitment.',
      'category', 'creator_idea',
      'format', 'short_film',
      'suggestedCreatorHandle', 'demand_creator',
      'budget', jsonb_build_object('minMinor', 25000, 'maxMinor', 75000, 'currency', 'USD'),
      'safetyLabels', jsonb_build_array('boundaries', 'adult_only'),
      'expiresAt', to_char(now() + interval '30 days', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )) ->> 'publicId'
  $$,
  'adult-assured fan can create a demand without implying creator commitment'
);
select like((select public_id from pg_temp.slice6_ids where label = 'primary'), 'dem________________________', 'demand uses an opaque prefixed public identifier');
select lives_ok(
  $$
    insert into pg_temp.slice6_ids(label, public_id)
    select 'secondary', public.create_demand(jsonb_build_object(
      'title', 'Second creator request',
      'brief', 'A second valid creator request reserved for creator response privacy and block-boundary tests.',
      'category', 'concept',
      'format', 'video',
      'suggestedCreatorHandle', 'demand_creator'
    )) ->> 'publicId'
  $$,
  'author can create a second independent demand'
);
select lives_ok(
  $$
    insert into pg_temp.slice6_json(label, payload)
    select 'author_detail', public.get_demand((select public_id from pg_temp.slice6_ids where label = 'primary'))
  $$,
  'author can read the safe demand detail projection'
);
select is((select payload ->> 'state' from pg_temp.slice6_json where label = 'author_detail'), 'open', 'new demand starts open');
select is((select payload -> 'suggestedCreator' ->> 'relationship' from pg_temp.slice6_json where label = 'author_detail'), 'suggested', 'named creator is publicly described only as suggested');
select unlike((select payload::text from pg_temp.slice6_json where label = 'author_detail'), '%10000000-0000-0000-0000-000000000061%', 'public demand projection hides author internal UUID');
select unlike((select payload::text from pg_temp.slice6_json where label = 'author_detail'), '%10000000-0000-0000-0000-000000000063%', 'public demand projection hides suggested creator internal UUID');
select throws_ok(
  $$ select public.create_demand(jsonb_build_object('title', 'x', 'brief', 'A sufficiently detailed brief for validation.', 'category', 'concept', 'format', 'video')) $$,
  '22023', 'invalid_demand_title',
  'database repeats demand title validation'
);
select throws_ok(
  $$ select public.create_demand(jsonb_build_object(
    'title', 'Invalid budget request',
    'brief', 'A sufficiently detailed brief with a deliberately inverted budget range.',
    'category', 'concept',
    'format', 'video',
    'budget', jsonb_build_object('minMinor', 20000, 'maxMinor', 10000, 'currency', 'USD')
  )) $$,
  '22023', 'invalid_demand_budget',
  'database rejects inverted budget ranges'
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
  $$ select public.set_demand_support((select public_id from pg_temp.slice6_ids where label = 'primary'), true, true) $$,
  'supporter can add one publicly attributed support edge'
);
select lives_ok(
  $$
    insert into pg_temp.slice6_json(label, payload)
    select 'public_support', public.get_demand((select public_id from pg_temp.slice6_ids where label = 'primary'))
  $$,
  'supporter can read the demand after supporting it'
);
select is((select (payload ->> 'supportCount')::integer from pg_temp.slice6_json where label = 'public_support'), 1, 'one support edge produces support count one');
select is((select (payload ->> 'viewerSupported')::boolean from pg_temp.slice6_json where label = 'public_support'), true, 'viewer projection reports its own active support');
select like((select payload::text from pg_temp.slice6_json where label = 'public_support'), '%demand_supporter%', 'public attribution exposes only the safe supporter handle');
select lives_ok(
  $$ select public.set_demand_support((select public_id from pg_temp.slice6_ids where label = 'primary'), true, true) $$,
  'repeating the same support action is idempotent'
);
select lives_ok(
  $$
    insert into pg_temp.slice6_json(label, payload)
    select 'repeat_support', public.get_demand((select public_id from pg_temp.slice6_ids where label = 'primary'))
  $$,
  'repeated support remains readable'
);
select is((select (payload ->> 'supportCount')::integer from pg_temp.slice6_json where label = 'repeat_support'), 1, 'repeated support does not inflate support count');
reset role;

select lives_ok(
  $$
    insert into pg_temp.slice6_text(label, value)
    select 'support_row_count', count(*)::text
    from public.demand_supports support
    join public.demands demand on demand.id = support.demand_id
    where demand.public_id = (select public_id from pg_temp.slice6_ids where label = 'primary')
      and support.supporter_user_id = '10000000-0000-0000-0000-000000000062'
  $$,
  'internal support integrity row can be inspected by the database test owner'
);
select is((select value from pg_temp.slice6_text where label = 'support_row_count'), '1', 'one account has only one support row per demand');

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
  $$ select public.set_demand_support((select public_id from pg_temp.slice6_ids where label = 'primary'), true, false) $$,
  'supporter can switch existing support attribution to anonymous without creating another edge'
);
select lives_ok(
  $$
    insert into pg_temp.slice6_json(label, payload)
    select 'anonymous_support', public.get_demand((select public_id from pg_temp.slice6_ids where label = 'primary'))
  $$,
  'anonymous supporter can read the updated projection'
);
select is((select (payload ->> 'supportCount')::integer from pg_temp.slice6_json where label = 'anonymous_support'), 1, 'anonymous attribution preserves the truthful support count');
select unlike((select payload::text from pg_temp.slice6_json where label = 'anonymous_support'), '%demand_supporter%', 'anonymous attribution hides supporter identity from the safe projection');
select lives_ok(
  $$ select public.set_demand_support((select public_id from pg_temp.slice6_ids where label = 'primary'), false, false) $$,
  'supporter can remove its own support edge'
);
select lives_ok(
  $$
    insert into pg_temp.slice6_json(label, payload)
    select 'support_removed', public.get_demand((select public_id from pg_temp.slice6_ids where label = 'primary'))
  $$,
  'demand remains readable after support removal'
);
select is((select (payload ->> 'supportCount')::integer from pg_temp.slice6_json where label = 'support_removed'), 0, 'support removal returns the truthful count to zero');
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
  $$ select public.respond_to_demand((select public_id from pg_temp.slice6_ids where label = 'primary'), 'interested') $$,
  '42501', 'suggested_creator_required',
  'fan author cannot manufacture creator interest'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000063',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000063',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select lives_ok(
  $$ select public.respond_to_demand((select public_id from pg_temp.slice6_ids where label = 'primary'), 'declined') $$,
  'suggested creator may quietly decline without public commitment state'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000064',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000064',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select lives_ok(
  $$
    insert into pg_temp.slice6_json(label, payload)
    select 'after_decline', public.get_demand((select public_id from pg_temp.slice6_ids where label = 'primary'))
  $$,
  'unrelated adult viewer can read the public-safe demand after private decline'
);
select is((select payload ->> 'state' from pg_temp.slice6_json where label = 'after_decline'), 'open', 'private decline does not publish a rejected state');
select unlike((select payload::text from pg_temp.slice6_json where label = 'after_decline'), '%declined%', 'public projection never exposes creator decline status or reason');
reset role;

select lives_ok(
  $$
    insert into pg_temp.slice6_text(label, value)
    select 'private_creator_response', response
    from public.demand_creator_responses response_row
    join public.demands demand on demand.id = response_row.demand_id
    where demand.public_id = (select public_id from pg_temp.slice6_ids where label = 'primary')
      and response_row.creator_user_id = '10000000-0000-0000-0000-000000000063'
  $$,
  'database preserves the private creator response for integrity and audit'
);
select is((select value from pg_temp.slice6_text where label = 'private_creator_response'), 'declined', 'quiet decline is durable privately');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000063',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000063',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select lives_ok(
  $$ select public.respond_to_demand((select public_id from pg_temp.slice6_ids where label = 'primary'), 'interested') $$,
  'suggested creator can personally replace a private decline with explicit interest while demand remains open'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000064',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000064',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select lives_ok(
  $$
    insert into pg_temp.slice6_json(label, payload)
    select 'after_interest', public.get_demand((select public_id from pg_temp.slice6_ids where label = 'primary'))
  $$,
  'public-safe detail remains readable after creator interest'
);
select is((select payload ->> 'state' from pg_temp.slice6_json where label = 'after_interest'), 'creator_interested', 'only the creator-owned interest action changes public demand state');
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000063',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000063',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select throws_ok(
  $$ select public.respond_to_demand((select public_id from pg_temp.slice6_ids where label = 'primary'), 'converted') $$,
  '22023', 'invalid_demand_response',
  'creator response endpoint cannot fabricate project conversion state'
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
  $$ update public.demands set state = 'converted' where public_id = (select public_id from pg_temp.slice6_ids where label = 'primary') $$,
  '42501', null,
  'fan cannot directly force a demand into converted state'
);
reset role;

insert into public.profile_blocks(blocker_user_id, blocked_user_id)
values ('10000000-0000-0000-0000-000000000062', '10000000-0000-0000-0000-000000000061');

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
  $$
    insert into pg_temp.slice6_json(label, payload)
    select 'blocked_get', public.get_demand((select public_id from pg_temp.slice6_ids where label = 'primary'))
  $$,
  'blocked viewer request resolves through the safe detail boundary'
);
select is((select payload is null from pg_temp.slice6_json where label = 'blocked_get'), true, 'block in either direction suppresses demand detail visibility');
select lives_ok(
  $$
    insert into pg_temp.slice6_json(label, payload)
    select 'blocked_list', public.list_demands(20, null)
  $$,
  'blocked viewer can request the filtered demand list'
);
select unlike((select payload::text from pg_temp.slice6_json where label = 'blocked_list'), '%' || coalesce((select public_id from pg_temp.slice6_ids where label = 'primary'), 'missing') || '%', 'blocked viewer list omits the blocked author demand');
select throws_ok(
  $$ select public.set_demand_support((select public_id from pg_temp.slice6_ids where label = 'primary'), true, false) $$,
  '42501', 'demand_unavailable',
  'blocked viewer cannot support the hidden demand'
);
reset role;

insert into public.profile_blocks(blocker_user_id, blocked_user_id)
values ('10000000-0000-0000-0000-000000000063', '10000000-0000-0000-0000-000000000061');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000063',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000063',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select throws_ok(
  $$ select public.respond_to_demand((select public_id from pg_temp.slice6_ids where label = 'secondary'), 'interested') $$,
  '42501', 'demand_unavailable',
  'creator block suppresses creator-response access to the author demand'
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
  $$ select public.create_demand(jsonb_build_object(
    'title', 'Blocked creator request',
    'brief', 'A valid demand cannot create a new matching request toward a creator who blocks the author.',
    'category', 'concept',
    'format', 'video',
    'suggestedCreatorHandle', 'demand_creator'
  )) $$,
  '42501', 'creator_unavailable',
  'new suggested-creator demand fails closed when the creator blocks the author'
);
reset role;

select ok(
  exists (
    select 1 from public.audit_events
    where actor_user_id = '10000000-0000-0000-0000-000000000061'
      and event_type = 'demand_created'
      and outcome = 'success'
  ),
  'demand creation writes a durable audit event'
);
select ok(
  exists (
    select 1 from public.audit_events
    where actor_user_id = '10000000-0000-0000-0000-000000000062'
      and event_type = 'demand_support_changed'
      and outcome = 'success'
  ),
  'support changes write a durable audit event'
);
select ok(
  exists (
    select 1 from public.audit_events
    where actor_user_id = '10000000-0000-0000-0000-000000000063'
      and event_type = 'demand_creator_declined'
      and outcome = 'success'
  ),
  'private decline writes a durable audit event'
);
select ok(
  exists (
    select 1 from public.audit_events
    where actor_user_id = '10000000-0000-0000-0000-000000000063'
      and event_type = 'demand_creator_interested'
      and outcome = 'success'
  ),
  'creator interest writes a durable audit event'
);

select * from finish();
rollback;
