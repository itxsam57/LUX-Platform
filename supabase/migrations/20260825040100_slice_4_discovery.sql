create table if not exists public.discovery_interests (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9_-]{1,47}$'),
  label text not null check (char_length(trim(label)) between 2 and 80 and label !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now()
);

create table if not exists public.account_interests (
  user_id uuid not null references auth.users(id) on delete cascade,
  interest_slug text not null references public.discovery_interests(slug) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, interest_slug)
);

create table if not exists public.hidden_topics (
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_slug text not null check (topic_slug ~ '^[a-z0-9][a-z0-9_-]{1,47}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, topic_slug)
);

alter table public.discovery_interests enable row level security;
alter table public.account_interests enable row level security;
alter table public.hidden_topics enable row level security;

revoke all on public.discovery_interests from public, anon, authenticated;
revoke all on public.account_interests from public, anon, authenticated;
revoke all on public.hidden_topics from public, anon, authenticated;

grant select on public.discovery_interests to authenticated;
grant select on public.account_interests to authenticated;
grant select on public.hidden_topics to authenticated;

drop policy if exists discovery_interests_authenticated_read on public.discovery_interests;
create policy discovery_interests_authenticated_read
  on public.discovery_interests for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists account_interests_own_read on public.account_interests;
create policy account_interests_own_read
  on public.account_interests for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists hidden_topics_own_read on public.hidden_topics;
create policy hidden_topics_own_read
  on public.hidden_topics for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.set_account_interest(
  requested_interest_slug text,
  enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  normalized_slug text := lower(trim(requested_interest_slug));
begin
  perform private.assert_adult_profile_action();

  if not exists (select 1 from public.discovery_interests where slug = normalized_slug) then
    raise exception 'interest_not_found' using errcode = '22023';
  end if;

  if enabled then
    insert into public.account_interests(user_id, interest_slug)
    values (auth.uid(), normalized_slug)
    on conflict do nothing;
  else
    delete from public.account_interests
    where user_id = auth.uid() and interest_slug = normalized_slug;
  end if;

  return enabled;
end;
$$;

create or replace function public.set_hidden_topic(
  requested_topic_slug text,
  hidden boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  normalized_slug text := lower(trim(requested_topic_slug));
begin
  perform private.assert_adult_profile_action();

  if normalized_slug !~ '^[a-z0-9][a-z0-9_-]{1,47}$' then
    raise exception 'invalid_topic_slug' using errcode = '22023';
  end if;

  if hidden then
    insert into public.hidden_topics(user_id, topic_slug)
    values (auth.uid(), normalized_slug)
    on conflict do nothing;
  else
    delete from public.hidden_topics
    where user_id = auth.uid() and topic_slug = normalized_slug;
  end if;

  return hidden;
end;
$$;

create or replace function public.get_discovery_feed(
  feed_mode text,
  page_size integer default 20,
  page_cursor timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  normalized_mode text := lower(trim(feed_mode));
  result jsonb;
begin
  perform private.assert_adult_profile_action();

  if normalized_mode not in ('following', 'for_you') then
    raise exception 'invalid_feed_mode' using errcode = '22023';
  end if;
  if page_size is null or page_size < 1 or page_size > 50 then
    raise exception 'invalid_page_size' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(item.payload order by item.updated_at desc, item.handle asc), '[]'::jsonb)
  into result
  from (
    select
      profile.updated_at,
      profile.handle,
      jsonb_build_object(
        'kind', 'profile',
        'publicKey', profile.handle,
        'creatorKey', profile.handle,
        'handle', profile.handle,
        'displayName', profile.display_name,
        'bio', profile.bio,
        'avatarUrl', case when profile.avatar_path is null then null else '/profile-media/' || profile.handle || '/avatar' end,
        'createdAt', profile.updated_at,
        'followed', exists (
          select 1 from public.profile_follows follow
          where follow.follower_user_id = auth.uid()
            and follow.followed_user_id = profile.user_id
        ),
        'interestMatch', false,
        'engagement', (
          select count(*) from public.profile_follows follower
          where follower.followed_user_id = profile.user_id
        ),
        'creatorCapable', exists (
          select 1 from public.workspace_memberships membership
          where membership.user_id = profile.user_id
            and membership.role = 'creator'
            and membership.status = 'approved'
        ),
        'followerCount', (
          select count(*) from public.profile_follows follower
          where follower.followed_user_id = profile.user_id
        )
      ) as payload
    from public.profiles profile
    where profile.user_id <> auth.uid()
      and (page_cursor is null or profile.updated_at < page_cursor)
      and not exists (
        select 1 from public.profile_blocks block
        where (block.blocker_user_id = auth.uid() and block.blocked_user_id = profile.user_id)
           or (block.blocker_user_id = profile.user_id and block.blocked_user_id = auth.uid())
      )
      and (
        (normalized_mode = 'for_you' and profile.visibility = 'public')
        or (
          normalized_mode = 'following'
          and profile.visibility in ('public', 'unlisted')
          and exists (
            select 1 from public.profile_follows follow
            where follow.follower_user_id = auth.uid()
              and follow.followed_user_id = profile.user_id
          )
        )
      )
    order by profile.updated_at desc, profile.handle asc
    limit page_size
  ) item;

  return result;
end;
$$;

create or replace function public.search_discovery(
  search_query text,
  page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  normalized_query text := lower(trim(search_query));
  escaped_query text;
  result jsonb;
begin
  perform private.assert_adult_profile_action();

  if char_length(normalized_query) < 2 or char_length(normalized_query) > 80 or normalized_query ~ '[[:cntrl:]]' then
    raise exception 'invalid_search_query' using errcode = '22023';
  end if;
  if page_size is null or page_size < 1 or page_size > 50 then
    raise exception 'invalid_page_size' using errcode = '22023';
  end if;

  escaped_query := replace(replace(replace(normalized_query, '\\', '\\\\'), '%', '\\%'), '_', '\\_');

  select coalesce(jsonb_agg(item.payload order by item.handle asc), '[]'::jsonb)
  into result
  from (
    select
      profile.handle,
      jsonb_build_object(
        'kind', 'profile',
        'publicKey', profile.handle,
        'creatorKey', profile.handle,
        'handle', profile.handle,
        'displayName', profile.display_name,
        'bio', profile.bio,
        'avatarUrl', case when profile.avatar_path is null then null else '/profile-media/' || profile.handle || '/avatar' end,
        'createdAt', profile.updated_at,
        'followed', exists (
          select 1 from public.profile_follows follow
          where follow.follower_user_id = auth.uid()
            and follow.followed_user_id = profile.user_id
        ),
        'interestMatch', false,
        'engagement', (
          select count(*) from public.profile_follows follower
          where follower.followed_user_id = profile.user_id
        ),
        'creatorCapable', exists (
          select 1 from public.workspace_memberships membership
          where membership.user_id = profile.user_id
            and membership.role = 'creator'
            and membership.status = 'approved'
        ),
        'followerCount', (
          select count(*) from public.profile_follows follower
          where follower.followed_user_id = profile.user_id
        )
      ) as payload
    from public.profiles profile
    where profile.user_id <> auth.uid()
      and profile.visibility = 'public'
      and not exists (
        select 1 from public.profile_blocks block
        where (block.blocker_user_id = auth.uid() and block.blocked_user_id = profile.user_id)
           or (block.blocker_user_id = profile.user_id and block.blocked_user_id = auth.uid())
      )
      and (
        lower(profile.handle) like '%' || escaped_query || '%' escape '\\'
        or lower(profile.display_name) like '%' || escaped_query || '%' escape '\\'
      )
    order by profile.handle asc
    limit page_size
  ) item;

  return result;
end;
$$;

revoke all on function public.set_account_interest(text, boolean) from public, anon;
revoke all on function public.set_hidden_topic(text, boolean) from public, anon;
revoke all on function public.get_discovery_feed(text, integer, timestamptz) from public, anon;
revoke all on function public.search_discovery(text, integer) from public, anon;

grant execute on function public.set_account_interest(text, boolean) to authenticated;
grant execute on function public.set_hidden_topic(text, boolean) to authenticated;
grant execute on function public.get_discovery_feed(text, integer, timestamptz) to authenticated;
grant execute on function public.search_discovery(text, integer) to authenticated;
