begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(
  position('rolein(''creator''::public.app_role,''performer''::public.app_role)' in replace(lower(pg_get_functiondef('public.invite_performer_representation(text,jsonb)'::regprocedure)),' ',''))>0,
  'agency representation accepts the dedicated performer workspace while preserving legacy creator-backed performers'
);

select * from finish();
rollback;
