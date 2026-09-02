create or replace function private.require_demand_conversion_provenance(
  requested_public_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  demand_row public.demands%rowtype;
  actor_user_id uuid := auth.uid();
begin
  perform private.assert_adult_profile_action();

  select demand.*
  into demand_row
  from public.demands demand
  where demand.public_id = trim(requested_public_id)
  limit 1;

  if demand_row.id is null
     or actor_user_id is null
     or demand_row.visibility <> 'public'
     or private.demand_effective_state(demand_row.state, demand_row.expires_at) <> 'creator_interested'
     or demand_row.suggested_creator_user_id is distinct from actor_user_id
     or private.current_active_role(actor_user_id) is distinct from 'creator'::public.app_role
     or private.demand_relationship_blocked(actor_user_id, demand_row.author_user_id)
     or not exists (
       select 1
       from public.demand_creator_responses response_row
       where response_row.demand_id = demand_row.id
         and response_row.creator_user_id = actor_user_id
         and response_row.response = 'interested'
     ) then
    raise exception 'demand_conversion_not_allowed' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'sourceDemandId', demand_row.id,
    'sourceDemandPublicId', demand_row.public_id,
    'projectOwnerUserId', actor_user_id
  );
end;
$$;

revoke all on function private.require_demand_conversion_provenance(text)
from public, anon, authenticated;
