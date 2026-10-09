begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.operational_rate_limits(key,max_requests,window_seconds,enabled)
values('test_rate_limit_ambiguity',2,3600,true)
on conflict(key) do update set max_requests=2,window_seconds=3600,enabled=true;

select lives_ok(
  $$select private.consume_operational_rate_limit('test_rate_limit_ambiguity','36000000-0000-0000-0000-000000000001'::uuid)$$,
  'operational rate limiter executes without parameter/column ambiguity'
);

select is(
  (select request_count from public.operational_rate_limit_buckets where limit_key='test_rate_limit_ambiguity'),
  1,
  'operational rate limiter persists the first fixed-window bucket count'
);

select ok(
  position('on conflict on constraint operational_rate_limit_buckets_pkey' in lower(pg_get_functiondef('private.consume_operational_rate_limit(text,uuid)'::regprocedure)))>0,
  'rate-limit upsert uses the named primary-key constraint'
);

select * from finish();
rollback;
