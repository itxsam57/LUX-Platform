create or replace function public.get_my_demand_creator_responses()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  result jsonb;
begin
  perform private.assert_adult_profile_action();

  if not exists (
    select 1
    from public.active_workspaces active
    join public.workspace_memberships membership
      on membership.id = active.membership_id
    where active.user_id = auth.uid()
      and membership.user_id = auth.uid()
      and membership.role = 'creator'
      and membership.status = 'approved'
  ) then
    raise exception 'creator_workspace_required' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'publicId', demand.public_id,
        'response', response_row.response
      )
      order by response_row.updated_at desc, demand.public_id asc
    ),
    '[]'::jsonb
  )
  into result
  from public.demand_creator_responses response_row
  join public.demands demand
    on demand.id = response_row.demand_id
  where response_row.creator_user_id = auth.uid()
    and demand.suggested_creator_user_id = auth.uid()
    and demand.visibility = 'public'
    and not private.demand_relationship_blocked(auth.uid(), demand.author_user_id)
    and private.demand_effective_state(demand.state, demand.expires_at) in ('open', 'creator_interested');

  return result;
end;
$$;

revoke all on function public.get_my_demand_creator_responses() from public, anon, authenticated;
grant execute on function public.get_my_demand_creator_responses() to authenticated;
