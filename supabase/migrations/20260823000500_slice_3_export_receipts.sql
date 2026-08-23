create or replace function public.get_profile_export_relationships()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  following_rows jsonb;
  follower_rows jsonb;
  block_rows jsonb;
  mute_rows jsonb;
begin
  perform private.assert_current_session();

  select coalesce(
    jsonb_agg(jsonb_build_object('handle', profile.handle, 'display_name', profile.display_name) order by profile.handle),
    '[]'::jsonb
  )
  into following_rows
  from public.profile_follows follow
  join public.profiles profile on profile.user_id = follow.followed_user_id
  where follow.follower_user_id = auth.uid();

  select coalesce(
    jsonb_agg(jsonb_build_object('handle', profile.handle, 'display_name', profile.display_name) order by profile.handle),
    '[]'::jsonb
  )
  into follower_rows
  from public.profile_follows follow
  join public.profiles profile on profile.user_id = follow.follower_user_id
  where follow.followed_user_id = auth.uid();

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

  return jsonb_build_object(
    'following', following_rows,
    'followers', follower_rows,
    'blocks', block_rows,
    'mutes', mute_rows
  );
end;
$$;

create or replace function public.record_account_export_generated()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  perform private.assert_current_session();
  perform private.write_audit(
    auth.uid(),
    'account_export_generated',
    'success',
    'privacy-settings-export',
    null,
    '{}'::jsonb
  );
end;
$$;

revoke all on function public.get_profile_export_relationships() from public, anon, authenticated;
revoke all on function public.record_account_export_generated() from public, anon, authenticated;
grant execute on function public.get_profile_export_relationships() to authenticated;
grant execute on function public.record_account_export_generated() to authenticated;

notify pgrst, 'reload schema';
