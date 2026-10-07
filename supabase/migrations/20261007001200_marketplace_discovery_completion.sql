-- Unified marketplace discovery across public profiles, Crowd Demand, campaigns, and releases.
-- Private/block boundaries are applied before ranking. Cursor pagination is timestamp-based
-- and all returned paths are internal LUX routes.

create or replace function public.search_marketplace(
  search_query text,
  item_filter text default 'all',
  page_size integer default 30,
  page_cursor timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare
  q text:=lower(trim(coalesce(search_query,'')));
  filter_value text:=lower(trim(coalesce(item_filter,'all')));
begin
  perform private.assert_adult_profile_action();

  if char_length(q) not between 2 and 80
     or filter_value not in ('all','profile','demand','campaign','release')
     or page_size is null or page_size<1 or page_size>50 then
    raise exception 'invalid_marketplace_search' using errcode='22023';
  end if;

  return coalesce((
    with results as (
      select
        'profile'::text as item_type,
        profile.handle as public_id,
        profile.display_name as title,
        coalesce(profile.bio,'') as subtitle,
        '/u/'||profile.handle as path,
        profile.updated_at as created_at,
        case
          when lower(profile.handle)=q then 100
          when lower(profile.display_name)=q then 95
          when position(q in lower(profile.handle))=1 then 85
          when position(q in lower(profile.display_name))=1 then 80
          else 60
        end as relevance,
        jsonb_build_object('handle',profile.handle) as meta
      from public.profiles profile
      where filter_value in ('all','profile')
        and profile.visibility='public'
        and not private.marketplace_item_hidden(auth.uid(),'profile',profile.handle)
        and not private.users_blocked(auth.uid(),profile.user_id)
        and (
          position(q in lower(profile.handle))>0
          or position(q in lower(profile.display_name))>0
          or position(q in lower(coalesce(profile.bio,'')))>0
        )

      union all

      select
        'demand',demand.public_id,demand.title,demand.brief,
        '/demand/'||demand.public_id,demand.created_at,
        case when lower(demand.title)=q then 95 when position(q in lower(demand.title))=1 then 80 else 55 end,
        jsonb_build_object('category',demand.category,'format',demand.format,'supportCount',(
          select count(*) from public.demand_supports support where support.demand_id=demand.id
        ))
      from public.demands demand
      where filter_value in ('all','demand')
        and demand.visibility='public'
        and not private.marketplace_item_hidden(auth.uid(),'demand',demand.public_id)
        and private.demand_effective_state(demand.state,demand.expires_at) in ('open','creator_interested')
        and not private.users_blocked(auth.uid(),demand.author_user_id)
        and (position(q in lower(demand.title))>0 or position(q in lower(demand.brief))>0 or position(q in lower(demand.category))>0)

      union all

      select
        'campaign',campaign.public_id,version.title,version.public_synopsis,
        '/p/'||campaign.public_id,campaign.published_at,
        case when lower(version.title)=q then 95 when position(q in lower(version.title))=1 then 80 else 55 end,
        jsonb_build_object('projectPublicId',project.public_id,'state',campaign.state)
      from public.campaigns campaign
      join public.projects project on project.id=campaign.project_id
      join public.project_versions version on version.project_id=project.id and version.revision=project.current_revision
      where filter_value in ('all','campaign')
        and campaign.state in ('published','funding_closed')
        and not private.marketplace_item_hidden(auth.uid(),'campaign',campaign.public_id)
        and not private.users_blocked(auth.uid(),project.owner_user_id)
        and (position(q in lower(version.title))>0 or position(q in lower(version.public_synopsis))>0 or position(q in lower(version.category))>0)

      union all

      select
        'release',release.public_id,release.title,release.synopsis,
        '/releases/'||release.public_id,release.released_at,
        case when lower(release.title)=q then 95 when position(q in lower(release.title))=1 then 80 else 55 end,
        jsonb_build_object('projectPublicId',project.public_id)
      from public.releases release
      join public.projects project on project.id=release.project_id
      where filter_value in ('all','release')
        and not private.marketplace_item_hidden(auth.uid(),'release',release.public_id)
        and not private.users_blocked(auth.uid(),release.creator_user_id)
        and (position(q in lower(release.title))>0 or position(q in lower(release.synopsis))>0)
    )
    select jsonb_agg(jsonb_build_object(
      'type',item_type,'publicId',public_id,'title',title,'subtitle',subtitle,
      'path',path,'createdAt',created_at,'meta',meta
    ) order by relevance desc,created_at desc nulls last,public_id asc)
    from (
      select * from results
      where page_cursor is null or created_at<page_cursor
      order by relevance desc,created_at desc nulls last,public_id asc
      limit page_size
    ) page
  ),'[]'::jsonb);
end;
$$;

create or replace function public.explore_marketplace(
  item_filter text default 'all',
  page_size integer default 30,
  page_cursor timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare filter_value text:=lower(trim(coalesce(item_filter,'all')));
begin
  perform private.assert_adult_profile_action();
  if filter_value not in ('all','profile','demand','campaign','release')
     or page_size is null or page_size<1 or page_size>50 then
    raise exception 'invalid_marketplace_explore' using errcode='22023';
  end if;

  return coalesce((
    with results as (
      select 'profile'::text item_type,profile.handle public_id,profile.display_name title,coalesce(profile.bio,'') subtitle,
        '/u/'||profile.handle path,profile.updated_at created_at,jsonb_build_object('handle',profile.handle) meta
      from public.profiles profile
      where filter_value in ('all','profile') and profile.visibility='public'
        and not private.marketplace_item_hidden(auth.uid(),'profile',profile.handle)
        and not private.users_blocked(auth.uid(),profile.user_id)

      union all
      select 'demand',demand.public_id,demand.title,demand.brief,'/demand/'||demand.public_id,demand.created_at,
        jsonb_build_object('category',demand.category,'format',demand.format,'supportCount',(select count(*) from public.demand_supports support where support.demand_id=demand.id))
      from public.demands demand
      where filter_value in ('all','demand') and demand.visibility='public'
        and not private.marketplace_item_hidden(auth.uid(),'demand',demand.public_id)
        and private.demand_effective_state(demand.state,demand.expires_at) in ('open','creator_interested')
        and not private.users_blocked(auth.uid(),demand.author_user_id)

      union all
      select 'campaign',campaign.public_id,version.title,version.public_synopsis,'/p/'||campaign.public_id,campaign.published_at,
        jsonb_build_object('projectPublicId',project.public_id,'state',campaign.state)
      from public.campaigns campaign
      join public.projects project on project.id=campaign.project_id
      join public.project_versions version on version.project_id=project.id and version.revision=project.current_revision
      where filter_value in ('all','campaign') and campaign.state in ('published','funding_closed')
        and not private.marketplace_item_hidden(auth.uid(),'campaign',campaign.public_id)
        and not private.users_blocked(auth.uid(),project.owner_user_id)

      union all
      select 'release',release.public_id,release.title,release.synopsis,'/releases/'||release.public_id,release.released_at,
        jsonb_build_object('projectPublicId',project.public_id)
      from public.releases release
      join public.projects project on project.id=release.project_id
      where filter_value in ('all','release')
        and not private.marketplace_item_hidden(auth.uid(),'release',release.public_id)
        and not private.users_blocked(auth.uid(),release.creator_user_id)
    )
    select jsonb_agg(jsonb_build_object(
      'type',item_type,'publicId',public_id,'title',title,'subtitle',subtitle,
      'path',path,'createdAt',created_at,'meta',meta
    ) order by created_at desc nulls last,public_id asc)
    from (
      select * from results
      where page_cursor is null or created_at<page_cursor
      order by created_at desc nulls last,public_id asc
      limit page_size
    ) page
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.search_marketplace(text,text,integer,timestamptz) from public,anon,authenticated;
revoke all on function public.explore_marketplace(text,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.search_marketplace(text,text,integer,timestamptz) to authenticated;
grant execute on function public.explore_marketplace(text,integer,timestamptz) to authenticated;

notify pgrst,'reload schema';
