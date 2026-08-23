create or replace function private.profile_media_namespace(subject_user_id uuid)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, public, private
as $$
  select encode(extensions.digest(subject_user_id::text, 'sha256'), 'hex');
$$;

create or replace function public.get_profile_media_upload_path(media_kind text)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  normalized_kind text := lower(trim(media_kind));
begin
  perform private.assert_adult_profile_action();

  if normalized_kind not in ('avatar', 'banner') then
    raise exception 'invalid_profile_media_kind' using errcode = '22023';
  end if;

  return private.profile_media_namespace(auth.uid()) || '/' || normalized_kind || '.webp';
end;
$$;

create or replace function public.commit_profile_media(media_kind text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, storage
as $$
declare
  normalized_kind text := lower(trim(media_kind));
  object_path text;
  previous_path text;
begin
  perform private.assert_adult_profile_action();

  if normalized_kind not in ('avatar', 'banner') then
    raise exception 'invalid_profile_media_kind' using errcode = '22023';
  end if;

  object_path := private.profile_media_namespace(auth.uid()) || '/' || normalized_kind || '.webp';

  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'profile-media'
      and object.name = object_path
  ) then
    raise exception 'profile_media_object_missing' using errcode = '22023';
  end if;

  if normalized_kind = 'avatar' then
    select profile.avatar_path into previous_path
    from public.profiles profile
    where profile.user_id = auth.uid()
    for update;

    update public.profiles
    set avatar_path = object_path,
        updated_at = now()
    where user_id = auth.uid();
  else
    select profile.banner_path into previous_path
    from public.profiles profile
    where profile.user_id = auth.uid()
    for update;

    update public.profiles
    set banner_path = object_path,
        updated_at = now()
    where user_id = auth.uid();
  end if;

  if previous_path is distinct from object_path then
    perform private.write_audit(
      auth.uid(),
      'profile_media_updated',
      'success',
      'profile-settings',
      null,
      jsonb_build_object('kind', normalized_kind)
    );
  end if;

  return object_path;
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
  viewer_id uuid := auth.uid();
begin
  if normalized_kind not in ('avatar', 'banner') then
    return null;
  end if;

  if viewer_id is not null and not coalesce(private.session_is_current(viewer_id), false) then
    viewer_id := null;
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

create or replace function public.get_private_profile_relationships()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  block_rows jsonb;
  mute_rows jsonb;
begin
  perform private.assert_current_session();

  select coalesce(
    jsonb_agg(jsonb_build_object('handle', profile.handle, 'display_name', profile.display_name) order by profile.handle),
    '[]'::jsonb
  )
  into block_rows
  from public.profile_blocks block
  join public.profiles profile on profile.user_id = block.blocked_user_id
  where block.blocker_user_id = auth.uid();

  select coalesce(
    jsonb_agg(jsonb_build_object('handle', profile.handle, 'display_name', profile.display_name) order by profile.handle),
    '[]'::jsonb
  )
  into mute_rows
  from public.profile_mutes mute
  join public.profiles profile on profile.user_id = mute.muted_user_id
  where mute.muter_user_id = auth.uid();

  return jsonb_build_object('blocks', block_rows, 'mutes', mute_rows);
end;
$$;

create or replace function policy_internal.profile_media_owner_can_write(object_name text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth, storage
as $$
  select
    auth.uid() is not null
    and coalesce(private.session_is_current(auth.uid()), false)
    and private.has_accepted_age_record(auth.uid())
    and (storage.foldername(object_name))[1] = private.profile_media_namespace(auth.uid())
    and storage.filename(object_name) ~ '^(avatar|banner)\.webp$';
$$;

revoke all on function private.profile_media_namespace(uuid) from public, anon, authenticated;
revoke all on function public.get_profile_media_upload_path(text) from public, anon, authenticated;
revoke all on function public.commit_profile_media(text) from public, anon, authenticated;
revoke all on function public.resolve_profile_media(text, text) from public, anon, authenticated;
revoke all on function public.get_private_profile_relationships() from public, anon, authenticated;

grant execute on function public.get_profile_media_upload_path(text) to authenticated;
grant execute on function public.commit_profile_media(text) to authenticated;
grant execute on function public.resolve_profile_media(text, text) to anon, authenticated;
grant execute on function public.get_private_profile_relationships() to authenticated;

notify pgrst, 'reload schema';
