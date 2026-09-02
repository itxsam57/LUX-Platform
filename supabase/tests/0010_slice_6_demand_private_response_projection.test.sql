begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000071',
  'authenticated', 'authenticated', 'demand-private-author@lux.test', crypt('LuxTestPassword1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
),
(
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000072',
  'authenticated', 'authenticated', 'demand-private-creator@lux.test', crypt('LuxTestPassword1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
),
(
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000073',
  'authenticated', 'authenticated', 'demand-private-observer@lux.test', crypt('LuxTestPassword1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

update public.profiles
set handle = case user_id
  when '10000000-0000-0000-0000-000000000071' then 'private_demand_author'
  when '10000000-0000-0000-0000-000000000072' then 'private_demand_creator'
  when '10000000-0000-0000-0000-000000000073' then 'private_demand_observer'
end,
display_name = case user_id
  when '10000000-0000-0000-0000-000000000071' then 'Private Demand Author'
  when '10000000-0000-0000-0000-000000000072' then 'Private Demand Creator'
  when '10000000-0000-0000-0000-000000000073' then 'Private Demand Observer'
end,
visibility = 'public'
where user_id in (
  '10000000-0000-0000-0000-000000000071',
  '10000000-0000-0000-0000-000000000072',
  '10000000-0000-0000-0000-000000000073'
);

insert into public.age_assurance_records(user_id, method, status, jurisdiction_code, policy_version, expires_at)
select id, 'self_attestation', 'accepted', 'PK', 'slice-6-private-response-test', now() + interval '1 year'
from auth.users
where id in (
  '10000000-0000-0000-0000-000000000071',
  '10000000-0000-0000-0000-000000000072',
  '10000000-0000-0000-0000-000000000073'
);

insert into public.workspace_memberships(user_id, role, status, reviewed_at, reviewed_by)
values (
  '10000000-0000-0000-0000-000000000072',
  'creator',
  'approved',
  now(),
  '10000000-0000-0000-0000-000000000072'
);

update public.active_workspaces active
set membership_id = membership.id, updated_at = now()
from public.workspace_memberships membership
where active.user_id = '10000000-0000-0000-0000-000000000072'
  and membership.user_id = active.user_id
  and membership.role = 'creator'
  and membership.status = 'approved';

insert into public.demands (
  public_id,
  author_user_id,
  title,
  brief,
  category,
  format,
  suggested_creator_user_id
) values (
  'demAAAAAAAAAAAAAAAAAAAAAAAA',
  '10000000-0000-0000-0000-000000000071',
  'Private decline projection',
  'A valid demand used only to prove that the creator private response never leaks to unrelated viewers.',
  'creator_idea',
  'short_film',
  '10000000-0000-0000-0000-000000000072'
);

insert into public.demand_creator_responses (
  demand_id,
  creator_user_id,
  response
)
select
  demand.id,
  '10000000-0000-0000-0000-000000000072',
  'declined'
from public.demands demand
where demand.public_id = 'demAAAAAAAAAAAAAAAAAAAAAAAA';

select ok(
  not (
    private.build_demand_projection(
      (select id from public.demands where public_id = 'demAAAAAAAAAAAAAAAAAAAAAAAA'),
      '10000000-0000-0000-0000-000000000072'
    ) ? 'viewerCreatorResponse'
  ),
  'general demand projection never carries creator private response state'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000072',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000072',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select is(
  public.get_my_demand_creator_responses() -> 0 ->> 'response',
  'declined',
  'active approved creator sees their durable private decline through the creator-only RPC'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000071',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000071',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select throws_ok(
  $$ select public.get_my_demand_creator_responses() $$,
  '42501', 'creator_workspace_required',
  'demand author cannot read the creator-private response RPC'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000073',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000073',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);
select throws_ok(
  $$ select public.get_my_demand_creator_responses() $$,
  '42501', 'creator_workspace_required',
  'unrelated viewer cannot read the creator-private response RPC'
);
reset role;

select * from finish();
rollback;
