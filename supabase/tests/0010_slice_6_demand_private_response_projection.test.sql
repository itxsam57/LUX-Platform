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
  private.build_demand_projection(
    (select id from public.demands where public_id = 'demAAAAAAAAAAAAAAAAAAAAAAAA'),
    '10000000-0000-0000-0000-000000000072'
  ) ? 'viewerCreatorResponse',
  'suggested creator private projection includes the viewer response key'
);

select is(
  private.build_demand_projection(
    (select id from public.demands where public_id = 'demAAAAAAAAAAAAAAAAAAAAAAAA'),
    '10000000-0000-0000-0000-000000000072'
  ) ->> 'viewerCreatorResponse',
  'declined',
  'suggested creator sees their durable private decline response'
);

select ok(
  not (
    private.build_demand_projection(
      (select id from public.demands where public_id = 'demAAAAAAAAAAAAAAAAAAAAAAAA'),
      '10000000-0000-0000-0000-000000000071'
    ) ? 'viewerCreatorResponse'
  ),
  'demand author projection omits the creator private response key'
);

select ok(
  not (
    private.build_demand_projection(
      (select id from public.demands where public_id = 'demAAAAAAAAAAAAAAAAAAAAAAAA'),
      '10000000-0000-0000-0000-000000000073'
    ) ? 'viewerCreatorResponse'
  ),
  'unrelated observer projection omits the creator private response key'
);

select * from finish();
rollback;
