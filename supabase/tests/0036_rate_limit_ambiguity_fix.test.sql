begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.operational_rate_limits(key,max_requests,window_seconds,enabled)
values('test_rate_limit_ambiguity',10,60,true)
on conflict(key) do update
set max_requests=excluded.max_requests,window_seconds=excluded.window_seconds,enabled=true;

select lives_ok(
  $q$select private.consume_operational_rate_limit('test_rate_limit_ambiguity','36000000-0000-0000-0000-000000000001'::uuid)$q$,
  'operational rate limiter resolves its configured key without PL/pgSQL ambiguity'
);

select lives_ok(
  $q$select private.consume_operational_rate_limit('test_rate_limit_ambiguity','36000000-0000-0000-0000-000000000001'::uuid)$q$,
  'operational rate limiter updates the existing subject bucket without conflict-target ambiguity'
);

select is(
  (
    select request_count
    from public.operational_rate_limit_buckets
    where limit_key='test_rate_limit_ambiguity'
      and subject_hash=encode(extensions.digest('36000000-0000-0000-0000-000000000001','sha256'),'hex')
  ),
  2,
  'repeated requests increment one hashed subject bucket'
);

select * from finish();
rollback;
