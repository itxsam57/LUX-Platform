-- Register Crowd Demand discussion throttling as a first-class operational limit.
insert into public.operational_rate_limits(key,max_requests,window_seconds,enabled)
values ('demand_discussion_create',20,3600,true)
on conflict (key) do nothing;

notify pgrst,'reload schema';
