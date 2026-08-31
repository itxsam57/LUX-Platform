begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select has_function(
  'public',
  'set_project_funding_restriction',
  array['text','boolean'],
  'Slice 9 exposes a narrow internal funding-restriction boundary'
);
select ok(
  coalesce(has_function_privilege('service_role','public.set_project_funding_restriction(text,boolean)','EXECUTE'),false),
  'service_role can execute the internal funding restriction boundary'
);
select ok(
  coalesce(has_function_privilege('authenticated','public.set_project_funding_restriction(text,boolean)','EXECUTE'),false)=false,
  'authenticated clients cannot execute the internal funding restriction boundary'
);

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-0000000000d1',
  'authenticated','authenticated','s9-restriction-owner@lux.test',
  crypt('LuxTestPassword1',gen_salt('bf')),now(),
  '{"provider":"email","providers":["email"]}','{}',now(),now()
);
insert into public.projects(public_id,owner_user_id)
values('prj111111111111111111111111','10000000-0000-0000-0000-0000000000d1');

select lives_ok(
  $$select public.set_project_funding_restriction('prj111111111111111111111111',true)$$,
  'internal restriction boundary can place a project on funding hold'
);
select is(
  (select funding_restricted from public.projects where public_id='prj111111111111111111111111'),
  true,
  'internal restriction boundary changes only the canonical project hold state'
);

select * from finish();
rollback;
