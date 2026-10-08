begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(
  position('requested_limit_key' in lower(pg_get_functiondef('private.consume_operational_rate_limit(text,uuid)'::regprocedure)))>0
  and position('on conflict on constraint operational_rate_limit_buckets_pkey' in lower(pg_get_functiondef('private.consume_operational_rate_limit(text,uuid)'::regprocedure)))>0,
  'operational rate limiting avoids parameter/column ambiguity with the bucket primary key'
);

select * from finish();
rollback;
