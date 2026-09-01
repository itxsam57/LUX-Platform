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
  result jsonb;
begin
  perform private.assert_adult_profile_action();

  if char_length(normalized_query) < 2 or char_length(normalized_query) > 80 or normalized_query ~ '[[:cntrl:]]' then
    raise exception 'invalid_search_query' using errcode = '22023';
  end if;
  if page_size is null or page_size < 1 or page_size > 50 then
    raise exception 'invalid_page_size' using errcode = '22023';
  end if;

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
        position(normalized_query in lower(profile.handle)) > 0
        or position(normalized_query in lower(profile.display_name)) > 0
      )
    order by profile.handle asc
    limit page_size
  ) item;

  return result;
end;
$$;

revoke all on function public.search_discovery(text, integer) from public, anon;
grant execute on function public.search_discovery(text, integer) to authenticated;
