-- Remove PL/pgSQL ambiguity in the operational rate-limit bucket upsert.
-- Keep the original function signature/parameter names stable because PostgreSQL does not
-- permit CREATE OR REPLACE FUNCTION to rename an existing input parameter.

create or replace function private.consume_operational_rate_limit(
  limit_key text,
  subject_user_id uuid
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private,extensions
as $$
declare allowed_requests integer;
declare configured_window integer;
declare configured_enabled boolean;
declare normalized_subject_hash text;
declare bucket_window timestamptz;
declare bucket_count integer;
begin
  if subject_user_id is null then
    raise exception 'rate_limit_subject_required' using errcode='22023';
  end if;

  select config.max_requests,config.window_seconds,config.enabled
  into allowed_requests,configured_window,configured_enabled
  from public.operational_rate_limits config
  where config.key=limit_key;

  if not found or not configured_enabled then
    return;
  end if;

  normalized_subject_hash:=encode(extensions.digest(subject_user_id::text,'sha256'),'hex');
  bucket_window:=to_timestamp(
    floor(extract(epoch from clock_timestamp()) / configured_window) * configured_window
  );

  insert into public.operational_rate_limit_buckets(
    limit_key,subject_hash,window_started_at,request_count,updated_at
  ) values (
    limit_key,normalized_subject_hash,bucket_window,1,now()
  )
  on conflict on constraint operational_rate_limit_buckets_pkey do update
  set window_started_at=excluded.window_started_at,
      request_count=case
        when public.operational_rate_limit_buckets.window_started_at=excluded.window_started_at
          then public.operational_rate_limit_buckets.request_count+1
        else 1
      end,
      updated_at=now()
  returning request_count into bucket_count;

  if bucket_count>allowed_requests then
    raise exception 'rate_limit_exceeded' using errcode='42501';
  end if;
end;
$$;

revoke all on function private.consume_operational_rate_limit(text,uuid) from public,anon,authenticated;

notify pgrst,'reload schema';
