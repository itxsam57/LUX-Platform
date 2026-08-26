create or replace function private.build_demand_projection(
  demand_row_id uuid,
  viewer_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  demand_row public.demands%rowtype;
  author_row public.profiles%rowtype;
  creator_row public.profiles%rowtype;
  public_supporters jsonb;
  support_count integer;
  viewer_supported boolean := false;
  effective_state public.demand_state;
  suggested_creator jsonb := null;
  budget jsonb := null;
  viewer_creator_response text := null;
  projection jsonb;
begin
  select demand.*
  into demand_row
  from public.demands demand
  where demand.id = demand_row_id
  limit 1;

  if demand_row.id is null then
    return null;
  end if;

  if viewer_user_id is not null
     and private.demand_relationship_blocked(viewer_user_id, demand_row.author_user_id) then
    return null;
  end if;

  select profile.*
  into author_row
  from public.profiles profile
  where profile.user_id = demand_row.author_user_id
  limit 1;

  if author_row.user_id is null then
    return null;
  end if;

  select count(*)::integer
  into support_count
  from public.demand_supports support
  where support.demand_id = demand_row.id;

  if viewer_user_id is not null then
    select exists (
      select 1
      from public.demand_supports support
      where support.demand_id = demand_row.id
        and support.supporter_user_id = viewer_user_id
    ) into viewer_supported;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'handle', supporter_profile.handle,
        'displayName', supporter_profile.display_name
      )
      order by support.created_at asc, supporter_profile.handle asc
    ),
    '[]'::jsonb
  )
  into public_supporters
  from public.demand_supports support
  join public.profiles supporter_profile
    on supporter_profile.user_id = support.supporter_user_id
  where support.demand_id = demand_row.id
    and support.publicly_attributed = true
    and supporter_profile.visibility <> 'private'
    and not private.demand_relationship_blocked(support.supporter_user_id, demand_row.author_user_id);

  if demand_row.suggested_creator_user_id is not null then
    select profile.*
    into creator_row
    from public.profiles profile
    where profile.user_id = demand_row.suggested_creator_user_id
    limit 1;

    if creator_row.user_id is not null then
      suggested_creator := jsonb_build_object(
        'handle', creator_row.handle,
        'displayName', creator_row.display_name,
        'relationship', case
          when private.demand_effective_state(demand_row.state, demand_row.expires_at) = 'creator_interested'
            then 'interested'
          else 'suggested'
        end
      );
    end if;
  end if;

  if viewer_user_id is not null
     and viewer_user_id = demand_row.suggested_creator_user_id then
    select response.response
    into viewer_creator_response
    from public.demand_creator_responses response
    where response.demand_id = demand_row.id
      and response.creator_user_id = viewer_user_id
    limit 1;
  end if;

  if demand_row.budget_min_minor is not null then
    budget := jsonb_build_object(
      'minMinor', demand_row.budget_min_minor,
      'maxMinor', demand_row.budget_max_minor,
      'currency', demand_row.budget_currency
    );
  end if;

  effective_state := private.demand_effective_state(demand_row.state, demand_row.expires_at);

  projection := jsonb_build_object(
    'publicId', demand_row.public_id,
    'title', demand_row.title,
    'brief', demand_row.brief,
    'category', demand_row.category,
    'format', demand_row.format,
    'state', effective_state,
    'author', jsonb_build_object(
      'handle', author_row.handle,
      'displayName', author_row.display_name
    ),
    'suggestedCreator', suggested_creator,
    'budget', budget,
    'safetyLabels', to_jsonb(demand_row.safety_labels),
    'supportCount', support_count,
    'viewerSupported', viewer_supported,
    'publicSupporters', public_supporters,
    'expiresAt', demand_row.expires_at,
    'createdAt', demand_row.created_at
  );

  if viewer_user_id is not null
     and viewer_user_id = demand_row.suggested_creator_user_id then
    projection := projection || jsonb_build_object(
      'viewerCreatorResponse',
      viewer_creator_response
    );
  end if;

  return projection;
end;
$$;
