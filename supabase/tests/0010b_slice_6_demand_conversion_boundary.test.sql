begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select has_function(
  'private',
  'require_demand_conversion_provenance',
  array['text'],
  'Slice 6 exposes an internal demand conversion provenance boundary'
);
select ok(
  coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure('private.require_demand_conversion_provenance(text)'),
      'EXECUTE'
    ),
    false
  ) = false,
  'authenticated clients cannot execute the internal conversion precursor directly'
);

create temp table slice6_conversion_json (
  label text primary key,
  payload jsonb
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000081',
  'authenticated', 'authenticated', 'conversion-author@lux.test', crypt('LuxTestPassword1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
),
(
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000082',
  'authenticated', 'authenticated', 'conversion-creator@lux.test', crypt('LuxTestPassword1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
),
(
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000083',
  'authenticated', 'authenticated', 'conversion-other-creator@lux.test', crypt('LuxTestPassword1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

update public.profiles
set handle = case user_id
  when '10000000-0000-0000-0000-000000000081' then 'conversion_author'
  when '10000000-0000-0000-0000-000000000082' then 'conversion_creator'
  when '10000000-0000-0000-0000-000000000083' then 'conversion_other'
end,
display_name = case user_id
  when '10000000-0000-0000-0000-000000000081' then 'Conversion Author'
  when '10000000-0000-0000-0000-000000000082' then 'Conversion Creator'
  when '10000000-0000-0000-0000-000000000083' then 'Conversion Other Creator'
end,
visibility = 'public'
where user_id in (
  '10000000-0000-0000-0000-000000000081',
  '10000000-0000-0000-0000-000000000082',
  '10000000-0000-0000-0000-000000000083'
);

insert into public.workspace_memberships(user_id, role, status, reviewed_at, reviewed_by)
values
(
  '10000000-0000-0000-0000-000000000082',
  'creator',
  'approved',
  now(),
  '10000000-0000-0000-0000-000000000082'
),
(
  '10000000-0000-0000-0000-000000000083',
  'creator',
  'approved',
  now(),
  '10000000-0000-0000-0000-000000000083'
);

insert into public.demands (
  public_id,
  author_user_id,
  title,
  brief,
  category,
  format,
  suggested_creator_user_id,
  state,
  created_at,
  updated_at
) values (
  'demconversionboundary000001',
  '10000000-0000-0000-0000-000000000081',
  'Creator-owned conversion boundary',
  'A valid demand used only to prove creator-owned conversion provenance before project tables exist.',
  'concept',
  'video',
  '10000000-0000-0000-0000-000000000082',
  'open',
  now() - interval '2 days',
  now() - interval '2 days'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000081',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$ select private.require_demand_conversion_provenance('demconversionboundary000001') $$,
  '42501', 'demand_conversion_not_allowed',
  'original fan author cannot acquire project conversion control'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000082',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$ select private.require_demand_conversion_provenance('demconversionboundary000001') $$,
  '42501', 'demand_conversion_not_allowed',
  'suggested creator cannot convert before explicit interest'
);

update public.demands
set state = 'creator_interested', updated_at = now()
where public_id = 'demconversionboundary000001';

select throws_ok(
  $$ select private.require_demand_conversion_provenance('demconversionboundary000001') $$,
  '42501', 'demand_conversion_not_allowed',
  'public interested state alone is insufficient without the actor-owned durable response'
);

insert into public.demand_creator_responses(demand_id, creator_user_id, response)
select id, '10000000-0000-0000-0000-000000000082', 'interested'
from public.demands
where public_id = 'demconversionboundary000001';

select lives_ok(
  $$
    insert into pg_temp.slice6_conversion_json(label, payload)
    select 'eligible', private.require_demand_conversion_provenance('demconversionboundary000001')
  $$,
  'interested approved suggested creator can obtain conversion provenance'
);
select is(
  (select payload ->> 'sourceDemandPublicId' from pg_temp.slice6_conversion_json where label = 'eligible'),
  'demconversionboundary000001',
  'conversion provenance preserves the opaque source demand identifier'
);
select is(
  (select payload ->> 'projectOwnerUserId' from pg_temp.slice6_conversion_json where label = 'eligible'),
  '10000000-0000-0000-0000-000000000082',
  'conversion provenance assigns project ownership only to the interested creator'
);
select ok(
  position(
    '10000000-0000-0000-0000-000000000081'
    in coalesce((select payload::text from pg_temp.slice6_conversion_json where label = 'eligible'), '')
  ) = 0,
  'conversion provenance does not project the original fan as an owner or controller'
);
select is(
  (select state::text from public.demands where public_id = 'demconversionboundary000001'),
  'creator_interested',
  'Slice 6 precursor does not fabricate converted state before a Slice 7 project exists'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000083',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$ select private.require_demand_conversion_provenance('demconversionboundary000001') $$,
  '42501', 'demand_conversion_not_allowed',
  'unrelated approved creator cannot take over another creator interest'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000082',
    'role', 'authenticated'
  )::text,
  true
);
delete from public.workspace_memberships
where user_id = '10000000-0000-0000-0000-000000000082'
  and role = 'creator';
select throws_ok(
  $$ select private.require_demand_conversion_provenance('demconversionboundary000001') $$,
  '42501', 'demand_conversion_not_allowed',
  'creator loses conversion eligibility when approved creator membership is absent'
);

insert into public.workspace_memberships(user_id, role, status, reviewed_at, reviewed_by)
values (
  '10000000-0000-0000-0000-000000000082',
  'creator',
  'approved',
  now(),
  '10000000-0000-0000-0000-000000000082'
);
insert into public.profile_blocks(blocker_user_id, blocked_user_id)
values ('10000000-0000-0000-0000-000000000081', '10000000-0000-0000-0000-000000000082');
select throws_ok(
  $$ select private.require_demand_conversion_provenance('demconversionboundary000001') $$,
  '42501', 'demand_conversion_not_allowed',
  'a new block closes the conversion boundary even after interest'
);

delete from public.profile_blocks
where blocker_user_id = '10000000-0000-0000-0000-000000000081'
  and blocked_user_id = '10000000-0000-0000-0000-000000000082';
update public.demand_creator_responses
set response = 'declined', updated_at = now()
where creator_user_id = '10000000-0000-0000-0000-000000000082'
  and demand_id = (select id from public.demands where public_id = 'demconversionboundary000001');
select throws_ok(
  $$ select private.require_demand_conversion_provenance('demconversionboundary000001') $$,
  '42501', 'demand_conversion_not_allowed',
  'a durable decline cannot be converted even if stale public state says interested'
);

update public.demand_creator_responses
set response = 'interested', updated_at = now()
where creator_user_id = '10000000-0000-0000-0000-000000000082'
  and demand_id = (select id from public.demands where public_id = 'demconversionboundary000001');
update public.demands
set expires_at = now() - interval '1 minute', updated_at = now()
where public_id = 'demconversionboundary000001';
select throws_ok(
  $$ select private.require_demand_conversion_provenance('demconversionboundary000001') $$,
  '42501', 'demand_conversion_not_allowed',
  'expired demand cannot cross the conversion boundary'
);

select * from finish();
rollback;
