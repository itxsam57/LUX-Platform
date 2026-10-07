-- Finish discovery preference wiring and event notifications.

create or replace function public.get_discovery_feed(
  feed_mode text,
  page_size integer default 20,
  page_cursor timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare
  normalized_mode text:=lower(trim(feed_mode));
begin
  perform private.assert_adult_profile_action();

  if normalized_mode not in ('following','for_you') then
    raise exception 'invalid_feed_mode' using errcode='22023';
  end if;
  if page_size is null or page_size<1 or page_size>50 then
    raise exception 'invalid_page_size' using errcode='22023';
  end if;

  return coalesce((
    select jsonb_agg(payload order by updated_at desc,handle asc)
    from (
      select
        profile.updated_at,
        profile.handle,
        jsonb_build_object(
          'kind','profile',
          'publicKey',profile.handle,
          'creatorKey',profile.handle,
          'handle',profile.handle,
          'displayName',profile.display_name,
          'bio',coalesce(profile.bio,''),
          'avatarUrl',case when profile.avatar_path is null then null else '/profile-media/'||profile.handle||'/avatar' end,
          'createdAt',profile.updated_at,
          'followed',exists(
            select 1 from public.profile_follows follow
            where follow.follower_user_id=auth.uid() and follow.followed_user_id=profile.user_id
          ),
          'interestMatch',exists(
            select 1
            from public.account_interests interest
            where interest.user_id=auth.uid()
              and (
                exists(
                  select 1 from public.creator_offers offer
                  where offer.owner_user_id=profile.user_id
                    and offer.state='active'
                    and offer.category=interest.interest_slug
                )
                or exists(
                  select 1
                  from public.projects project
                  join public.project_versions version
                    on version.project_id=project.id and version.revision=project.current_revision
                  where project.owner_user_id=profile.user_id
                    and version.category=interest.interest_slug
                )
              )
          ),
          'engagement',(select count(*) from public.profile_follows follower where follower.followed_user_id=profile.user_id),
          'creatorCapable',exists(
            select 1 from public.workspace_memberships membership
            where membership.user_id=profile.user_id
              and membership.role in ('creator','performer')
              and membership.status='approved'
          ),
          'followerCount',(select count(*) from public.profile_follows follower where follower.followed_user_id=profile.user_id)
        ) payload
      from public.profiles profile
      where profile.user_id<>auth.uid()
        and (page_cursor is null or profile.updated_at<page_cursor)
        and not private.users_blocked(auth.uid(),profile.user_id)
        and not private.marketplace_item_hidden(auth.uid(),'profile',profile.handle)
        and not exists(
          select 1
          from public.hidden_topics hidden
          where hidden.user_id=auth.uid()
            and (
              exists(
                select 1 from public.creator_offers offer
                where offer.owner_user_id=profile.user_id
                  and offer.state='active'
                  and offer.category=hidden.topic_slug
              )
              or exists(
                select 1
                from public.projects project
                join public.project_versions version
                  on version.project_id=project.id and version.revision=project.current_revision
                where project.owner_user_id=profile.user_id
                  and version.category=hidden.topic_slug
              )
            )
        )
        and (
          (normalized_mode='for_you' and profile.visibility='public')
          or (
            normalized_mode='following'
            and profile.visibility in ('public','unlisted')
            and exists(
              select 1 from public.profile_follows follow
              where follow.follower_user_id=auth.uid() and follow.followed_user_id=profile.user_id
            )
          )
        )
      order by profile.updated_at desc,profile.handle asc
      limit page_size
    ) page
  ),'[]'::jsonb);
end;
$$;

create or replace function private.notify_campaign_state_change()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare supporter_id uuid;
begin
  if tg_op='UPDATE' and old.state is not distinct from new.state then return new; end if;

  for supporter_id in
    select distinct commitment.supporter_user_id
    from public.campaign_term_versions terms
    join public.funding_commitments commitment on commitment.campaign_term_version_id=terms.id
    where terms.campaign_id=new.id
  loop
    perform private.emit_notification(
      supporter_id,null,'campaign_updated'::public.notification_type,'/app/funding'
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists campaign_state_notification on public.campaigns;
create trigger campaign_state_notification
after update of state on public.campaigns
for each row execute function private.notify_campaign_state_change();

create or replace function private.notify_funding_change_request()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare supporter_id uuid;
declare funding_public_id text;
begin
  select commitment.supporter_user_id,commitment.public_id
  into supporter_id,funding_public_id
  from public.funding_commitments commitment
  where commitment.id=new.funding_commitment_id;

  perform private.emit_notification(
    supporter_id,null,
    case when new.kind='material_change' then 'campaign_updated'::public.notification_type else 'funding_updated'::public.notification_type end,
    '/app/funding/'||funding_public_id
  );
  return new;
end;
$$;

drop trigger if exists funding_change_request_notification on public.funding_change_requests;
create trigger funding_change_request_notification
after insert on public.funding_change_requests
for each row execute function private.notify_funding_change_request();

create or replace function private.notify_agency_representation_change()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
begin
  if tg_op='INSERT' or old.status is distinct from new.status then
    perform private.emit_notification(
      new.performer_user_id,
      case when new.proposed_by_user_id=new.performer_user_id then null else new.proposed_by_user_id end,
      'agency_update'::public.notification_type,
      '/app/representation'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists agency_representation_notification on public.agency_representation_agreements;
create trigger agency_representation_notification
after insert or update of status on public.agency_representation_agreements
for each row execute function private.notify_agency_representation_change();

create or replace function private.notify_agency_opportunity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare performer_id uuid;
begin
  select agreement.performer_user_id into performer_id
  from public.agency_representation_agreements agreement
  where agreement.id=new.agreement_id;

  perform private.emit_notification(
    performer_id,new.created_by_user_id,'agency_update'::public.notification_type,'/app/representation'
  );
  return new;
end;
$$;

drop trigger if exists agency_opportunity_notification on public.agency_opportunities;
create trigger agency_opportunity_notification
after insert on public.agency_opportunities
for each row execute function private.notify_agency_opportunity();

revoke all on function private.notify_campaign_state_change() from public,anon,authenticated;
revoke all on function private.notify_funding_change_request() from public,anon,authenticated;
revoke all on function private.notify_agency_representation_change() from public,anon,authenticated;
revoke all on function private.notify_agency_opportunity() from public,anon,authenticated;

notify pgrst,'reload schema';
