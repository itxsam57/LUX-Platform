begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(
  position('on conflict on constraint operational_rate_limit_buckets_pkey' in lower(pg_get_functiondef('private.consume_operational_rate_limit(text,uuid)'::regprocedure)))>0,
  'operational rate limiting resolves the bucket conflict through the named primary-key constraint'
);

select * from finish();
rollback;
