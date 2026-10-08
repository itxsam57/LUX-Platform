begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function(
  'public','provision_staff_role',
  array['uuid','public.app_role'],
  'service-role staff provisioning boundary exists'
);

select ok(
  not has_function_privilege('authenticated','public.provision_staff_role(uuid,public.app_role)','EXECUTE'),
  'authenticated users cannot provision restricted staff roles'
);

select ok(
  has_function_privilege('service_role','public.provision_staff_role(uuid,public.app_role)','EXECUTE'),
  'service role can execute the staff provisioning boundary'
);

select ok(
  position('service_role' in lower(pg_get_functiondef('public.provision_staff_role(uuid,public.app_role)'::regprocedure)))>0
  and position('reviewer' in lower(pg_get_functiondef('public.provision_staff_role(uuid,public.app_role)'::regprocedure)))>0
  and position('moderator' in lower(pg_get_functiondef('public.provision_staff_role(uuid,public.app_role)'::regprocedure)))>0
  and position('finance' in lower(pg_get_functiondef('public.provision_staff_role(uuid,public.app_role)'::regprocedure)))>0
  and position('copyright' in lower(pg_get_functiondef('public.provision_staff_role(uuid,public.app_role)'::regprocedure)))>0
  and position('support' in lower(pg_get_functiondef('public.provision_staff_role(uuid,public.app_role)'::regprocedure)))>0,
  'staff provisioning is fail-closed and allowlists only scoped staff roles'
);

select ok(
  position('super_admin' in lower(pg_get_functiondef('public.provision_staff_role(uuid,public.app_role)'::regprocedure)))=0,
  'super-admin bootstrap remains on its separate service-only boundary'
);

select * from finish();
rollback;
