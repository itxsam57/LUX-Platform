begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(
  exists(
    select 1 from public.operational_rate_limits
    where key='demand_discussion_create' and max_requests=20 and window_seconds=3600 and enabled
  ),
  'Crowd Demand discussion has an explicit operational rate limit'
);
select * from finish();
rollback;
