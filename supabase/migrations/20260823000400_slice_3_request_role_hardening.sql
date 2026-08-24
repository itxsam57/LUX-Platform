create or replace function private.profile_request_viewer_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  viewer_id uuid;
begin
  if current_setting('role', true) is distinct from 'authenticated' then
    return null;
  end if;

  viewer_id := auth.uid();
  if viewer_id is null or not coalesce(private.session_is_current(viewer_id), false) then
    return null;
  end if;

  return viewer_id;
end;
$$;

create or replace function public.resolve_profile_media(profile_handle text, media_kind text)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  normalized_handle text := lower(trim(profile_handle));
  normalized_kind text := lower(trim(media_kind));
  profile_row public.profiles%rowtype;
  viewer_id uuid := private.profile_request_viewer_id();
begin
  if normalized_kind not in ('avatar', 'banner') then
    return null;
  end if;

  select profile.*
  into profile_row
  from public.profiles profile
  where profile.handle = normalized_handle
  limit 1;

  if profile_row.user_id is null then
    return null;
  end if;

  if profile_row.visibility = 'private' and viewer_id is distinct from profile_row.user_id then
    return null;
  end if;

  if viewer_id is not null
     and viewer_id <> profile_row.user_id
     and exists (
       select 1
       from public.profile_blocks block
       where (block.blocker_user_id = viewer_id and block.blocked_user_id = profile_row.user_id)
          or (block.blocker_user_id = profile_row.user_id and block.blocked_user_id = viewer_id)
     ) then
    return null;
  end if;

  if normalized_kind = 'avatar' then
    return profile_row.avatar_path;
  end if;
  return profile_row.banner_path;
end;
$$;

create or replace function policy_internal.profile_media_can_read(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  viewer_id uuid := private.profile_request_viewer_id();
  attached_profile public.profiles%rowtype;
begin
  select profile.*
  into attached_profile
  from public.profiles profile
  where profile.avatar_path = object_name
     or profile.banner_path = object_name
  limit 1;

  if attached_profile.user_id is null then
    return false;
  end if;

  if viewer_id = attached_profile.user_id then
    return true;
  end if;

  if attached_profile.visibility not in ('public', 'unlisted') then
    return false;
  end if;

  if viewer_id is not null and exists (
    select 1
    from public.profile_blocks block
    where (block.blocker_user_id = viewer_id and block.blocked_user_id = attached_profile.user_id)
       or (block.blocker_user_id = attached_profile.user_id and block.blocked_user_id = viewer_id)
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function private.profile_request_viewer_id() from public, anon, authenticated;
revoke all on function public.resolve_profile_media(text, text) from public, anon, authenticated;
revoke all on function policy_internal.profile_media_can_read(text) from public, anon, authenticated;
grant execute on function public.resolve_profile_media(text, text) to anon, authenticated;
grant execute on function policy_internal.profile_media_can_read(text) to anon, authenticated;

notify pgrst, 'reload schema';
