-- Complete Crowd Demand authoring without changing historical demand records.
-- Existing create_demand remains canonical for core validation; this wrapper adds
-- the optional structured script outline in the same transaction.

alter table public.demands
  add column if not exists script_outline text;

alter table public.demands
  drop constraint if exists demands_script_outline_check;

alter table public.demands
  add constraint demands_script_outline_check
  check (
    script_outline is null
    or (
      char_length(trim(script_outline)) between 20 and 4000
      and script_outline !~ '[[:cntrl:]]'
    )
  );

create or replace function public.create_demand_complete(demand_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare
  result_value jsonb;
  demand_row public.demands%rowtype;
  normalized_outline text:=nullif(trim(coalesce(demand_input->>'scriptOutline','')),'');
begin
  perform private.assert_adult_profile_action();

  if normalized_outline is not null
     and (
       char_length(normalized_outline) not between 20 and 4000
       or normalized_outline ~ '[[:cntrl:]]'
     ) then
    raise exception 'invalid_demand_script_outline' using errcode='22023';
  end if;

  result_value:=public.create_demand(demand_input - 'scriptOutline');

  select * into demand_row
  from public.demands
  where public_id=result_value->>'publicId'
    and author_user_id=auth.uid()
  for update;

  if demand_row.id is null then
    raise exception 'demand_create_incomplete' using errcode='40001';
  end if;

  update public.demands
  set script_outline=normalized_outline,
      updated_at=case when normalized_outline is null then updated_at else now() end
  where id=demand_row.id;

  return result_value;
end;
$$;

create or replace function public.get_demand_complete(requested_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare
  base_value jsonb;
  outline_value text;
begin
  base_value:=public.get_demand(requested_public_id);
  if base_value is null then return null; end if;

  select demand.script_outline into outline_value
  from public.demands demand
  where demand.public_id=trim(coalesce(requested_public_id,''));

  return base_value || jsonb_build_object('scriptOutline',outline_value);
end;
$$;

revoke all on function public.create_demand_complete(jsonb) from public,anon,authenticated;
revoke all on function public.get_demand_complete(text) from public,anon,authenticated;
grant execute on function public.create_demand_complete(jsonb) to authenticated;
grant execute on function public.get_demand_complete(text) to authenticated;

notify pgrst,'reload schema';
