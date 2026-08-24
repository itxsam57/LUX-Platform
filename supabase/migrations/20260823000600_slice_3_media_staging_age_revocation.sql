create or replace function policy_internal.profile_media_can_read(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth, storage
as $$
declare
  viewer_id uuid := auth.uid();
  attached_profile public.profiles%rowtype;
begin
  if viewer_id is not null and not coalesce(private.session_is_current(viewer_id), false) then
    viewer_id := null;
  end if;

  if viewer_id is not null
     and private.has_accepted_age_record(viewer_id)
     and (storage.foldername(object_name))[1] = private.profile_media_namespace(viewer_id)
     and storage.filename(object_name) ~ '^(avatar|banner)\.webp$' then
    return true;
  end if;

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

create or replace function public.revoke_age_assurance(target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  revoked_rows integer := 0;
begin
  update public.age_assurance_records
  set status = 'revoked'
  where user_id = target_user_id
    and status = 'accepted';
  get diagnostics revoked_rows = row_count;

  if revoked_rows > 0 then
    perform private.write_audit(
      null,
      'adult_access_revoked',
      'success',
      'age-assurance-service',
      null,
      jsonb_build_object('target_user_id', target_user_id)
    );
  end if;

  return revoked_rows;
end;
$$;

revoke all on function public.revoke_age_assurance(uuid) from public, anon, authenticated;
grant execute on function public.revoke_age_assurance(uuid) to service_role;

notify pgrst, 'reload schema';
