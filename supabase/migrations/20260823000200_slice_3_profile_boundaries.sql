create schema if not exists policy_internal;
revoke all on schema policy_internal from public, anon, authenticated;
grant usage on schema policy_internal to anon, authenticated;

create or replace function private.assert_adult_profile_action()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  perform private.assert_current_session();

  if not private.has_accepted_age_record(auth.uid()) then
    raise exception 'adult_access_required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.get_public_profile(profile_handle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  normalized_handle text := lower(trim(profile_handle));
  profile_row public.profiles%rowtype;
  viewer_id uuid := auth.uid();
  viewer_is_current boolean := false;
  base_result jsonb;
begin
  if normalized_handle is null or normalized_handle = '' then
    return null;
  end if;

  if viewer_id is not null then
    viewer_is_current := coalesce(private.session_is_current(viewer_id), false);
    if not viewer_is_current then
      viewer_id := null;
    end if;
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

  base_result := jsonb_build_object(
    'handle', profile_row.handle,
    'display_name', profile_row.display_name,
    'bio', profile_row.bio,
    'avatar_url', case
      when profile_row.avatar_path is null then null
      else '/profile-media/' || profile_row.handle || '/avatar'
    end,
    'banner_url', case
      when profile_row.banner_path is null then null
      else '/profile-media/' || profile_row.handle || '/banner'
    end,
    'links', profile_row.links,
    'language_code', profile_row.language_code,
    'visibility', profile_row.visibility,
    'follower_count', (
      select count(*)
      from public.profile_follows follow
      where follow.followed_user_id = profile_row.user_id
    ),
    'following_count', (
      select count(*)
      from public.profile_follows follow
      where follow.follower_user_id = profile_row.user_id
    ),
    'creator_capable', exists (
      select 1
      from public.workspace_memberships membership
      where membership.user_id = profile_row.user_id
        and membership.role = 'creator'
        and membership.status = 'approved'
    )
  );

  if viewer_id is not null then
    base_result := base_result || jsonb_build_object(
      'following', exists (
        select 1
        from public.profile_follows follow
        where follow.follower_user_id = viewer_id
          and follow.followed_user_id = profile_row.user_id
      ),
      'blocked_by_me', exists (
        select 1
        from public.profile_blocks block
        where block.blocker_user_id = viewer_id
          and block.blocked_user_id = profile_row.user_id
      ),
      'muted_by_me', exists (
        select 1
        from public.profile_mutes mute
        where mute.muter_user_id = viewer_id
          and mute.muted_user_id = profile_row.user_id
      )
    );
  end if;

  return base_result;
end;
$$;

create or replace function public.is_profile_discoverable(profile_handle text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  normalized_handle text := lower(trim(profile_handle));
  profile_user_id uuid;
  viewer_id uuid := auth.uid();
begin
  select profile.user_id
  into profile_user_id
  from public.profiles profile
  where profile.handle = normalized_handle
    and profile.visibility = 'public'
  limit 1;

  if profile_user_id is null then
    return false;
  end if;

  if viewer_id is not null
     and coalesce(private.session_is_current(viewer_id), false)
     and viewer_id <> profile_user_id
     and exists (
       select 1
       from public.profile_blocks block
       where (block.blocker_user_id = viewer_id and block.blocked_user_id = profile_user_id)
          or (block.blocker_user_id = profile_user_id and block.blocked_user_id = viewer_id)
     ) then
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.update_profile(
  requested_handle text,
  requested_display_name text,
  requested_bio text,
  requested_links jsonb,
  requested_language_code text,
  requested_visibility public.profile_visibility
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  normalized_handle text := lower(trim(requested_handle));
  normalized_display_name text := trim(requested_display_name);
  normalized_bio text := coalesce(requested_bio, '');
  normalized_links jsonb := '[]'::jsonb;
  normalized_language text := trim(requested_language_code);
  language_parts text[];
  language_index integer;
  link_item jsonb;
  link_label text;
  link_url text;
  link_authority text;
  existing_profile public.profiles%rowtype;
  changed_fields text[] := array[]::text[];
begin
  perform private.assert_adult_profile_action();

  select profile.*
  into existing_profile
  from public.profiles profile
  where profile.user_id = auth.uid()
  for update;

  if existing_profile.user_id is null then
    raise exception 'profile_not_found' using errcode = '22023';
  end if;

  if normalized_handle !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'invalid_profile_handle' using errcode = '22023';
  end if;

  if normalized_handle = any(array[
    'about', 'account', 'admin', 'administrator', 'agency', 'api', 'auth', 'callback',
    'creator', 'design-system', 'explore', 'feed', 'health', 'help', 'login', 'logout',
    'lux', 'moderator', 'notifications', 'privacy', 'settings', 'signup', 'staff',
    'support', 'terms', 'u', 'workspace'
  ]::text[]) then
    raise exception 'reserved_profile_handle' using errcode = '22023';
  end if;

  if normalized_display_name is null
     or normalized_display_name = ''
     or char_length(normalized_display_name) > 80
     or normalized_display_name ~ '[[:cntrl:]]' then
    raise exception 'invalid_profile_display_name' using errcode = '22023';
  end if;

  if char_length(normalized_bio) > 500 or normalized_bio ~ '[[:cntrl:]]' then
    raise exception 'invalid_profile_bio' using errcode = '22023';
  end if;

  if requested_links is null then
    requested_links := '[]'::jsonb;
  end if;

  if jsonb_typeof(requested_links) <> 'array' or jsonb_array_length(requested_links) > 5 then
    raise exception 'invalid_profile_links' using errcode = '22023';
  end if;

  for link_item in select value from jsonb_array_elements(requested_links)
  loop
    if jsonb_typeof(link_item) <> 'object'
       or jsonb_typeof(link_item -> 'label') <> 'string'
       or jsonb_typeof(link_item -> 'url') <> 'string' then
      raise exception 'invalid_profile_links' using errcode = '22023';
    end if;

    link_label := trim(link_item ->> 'label');
    link_url := trim(link_item ->> 'url');

    if link_label = ''
       or char_length(link_label) > 80
       or link_label ~ '[[:cntrl:]]' then
      raise exception 'invalid_profile_links' using errcode = '22023';
    end if;

    if link_url !~* '^https://'
       or link_url ~ '[[:space:][:cntrl:]]' then
      raise exception 'invalid_profile_links' using errcode = '22023';
    end if;

    link_authority := split_part(split_part(split_part(substr(link_url, 9), '/', 1), '?', 1), '#', 1);
    if link_authority = '' or position('@' in link_authority) > 0 then
      raise exception 'invalid_profile_links' using errcode = '22023';
    end if;

    normalized_links := normalized_links || jsonb_build_array(
      jsonb_build_object('label', link_label, 'url', link_url)
    );
  end loop;

  if normalized_language is null
     or char_length(normalized_language) > 16
     or normalized_language !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$' then
    raise exception 'invalid_profile_language' using errcode = '22023';
  end if;

  language_parts := string_to_array(normalized_language, '-');
  normalized_language := lower(language_parts[1]);
  if coalesce(array_length(language_parts, 1), 0) > 1 then
    for language_index in 2..array_length(language_parts, 1)
    loop
      normalized_language := normalized_language || '-' || case
        when char_length(language_parts[language_index]) = 2 then upper(language_parts[language_index])
        else language_parts[language_index]
      end;
    end loop;
  end if;

  if existing_profile.handle is distinct from normalized_handle then
    changed_fields := array_append(changed_fields, 'handle');
  end if;
  if existing_profile.display_name is distinct from normalized_display_name then
    changed_fields := array_append(changed_fields, 'display_name');
  end if;
  if existing_profile.bio is distinct from normalized_bio then
    changed_fields := array_append(changed_fields, 'bio');
  end if;
  if existing_profile.links is distinct from normalized_links then
    changed_fields := array_append(changed_fields, 'links');
  end if;
  if existing_profile.language_code is distinct from normalized_language then
    changed_fields := array_append(changed_fields, 'language_code');
  end if;
  if existing_profile.visibility is distinct from requested_visibility then
    changed_fields := array_append(changed_fields, 'visibility');
  end if;

  begin
    update public.profiles
    set handle = normalized_handle,
        display_name = normalized_display_name,
        bio = normalized_bio,
        links = normalized_links,
        language_code = normalized_language,
        visibility = requested_visibility,
        profile_revision = profile_revision + case when handle is distinct from normalized_handle then 1 else 0 end,
        updated_at = now()
    where user_id = auth.uid();
  exception
    when unique_violation then
      raise exception 'profile_handle_taken' using errcode = '23505';
  end;

  if existing_profile.handle is distinct from normalized_handle then
    update public.notifications
    set target_path = '/u/' || normalized_handle
    where actor_user_id = auth.uid()
      and type = 'new_follower';
  end if;

  if cardinality(changed_fields) > 0 then
    perform private.write_audit(
      auth.uid(),
      'profile_updated',
      'success',
      'profile-settings',
      null,
      jsonb_build_object('fields', changed_fields)
    );
  end if;

  if existing_profile.visibility is distinct from requested_visibility then
    perform private.write_audit(
      auth.uid(),
      'profile_visibility_changed',
      'success',
      'profile-settings',
      null,
      jsonb_build_object('field', 'visibility')
    );
  end if;

  return public.get_public_profile(normalized_handle);
end;
$$;

create or replace function public.set_profile_relationship(
  target_handle text,
  relationship_action text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  normalized_handle text := lower(trim(target_handle));
  normalized_action text := lower(trim(relationship_action));
  target_profile public.profiles%rowtype;
  actor_handle text;
  affected_rows integer := 0;
begin
  perform private.assert_current_session();

  if normalized_action not in ('follow', 'unfollow', 'block', 'unblock', 'mute', 'unmute') then
    raise exception 'invalid_profile_relationship_action' using errcode = '22023';
  end if;

  select profile.*
  into target_profile
  from public.profiles profile
  where profile.handle = normalized_handle
  limit 1;

  if target_profile.user_id is null or target_profile.user_id = auth.uid() then
    raise exception 'profile_not_found' using errcode = '22023';
  end if;

  select profile.handle
  into actor_handle
  from public.profiles profile
  where profile.user_id = auth.uid();

  if normalized_action in ('follow', 'unfollow', 'block', 'mute')
     and not private.has_accepted_age_record(auth.uid()) then
    raise exception 'adult_access_required' using errcode = '42501';
  end if;

  if normalized_action = 'follow' then
    if target_profile.visibility = 'private' then
      raise exception 'profile_not_found' using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.profile_blocks block
      where (block.blocker_user_id = auth.uid() and block.blocked_user_id = target_profile.user_id)
         or (block.blocker_user_id = target_profile.user_id and block.blocked_user_id = auth.uid())
    ) then
      raise exception 'profile_interaction_blocked' using errcode = '42501';
    end if;

    insert into public.profile_follows(follower_user_id, followed_user_id)
    values (auth.uid(), target_profile.user_id)
    on conflict do nothing;
    get diagnostics affected_rows = row_count;

    if affected_rows > 0 then
      insert into public.notifications(recipient_user_id, actor_user_id, type, target_path)
      values (target_profile.user_id, auth.uid(), 'new_follower', '/u/' || actor_handle)
      on conflict do nothing;

      perform private.write_audit(
        auth.uid(),
        'profile_followed',
        'success',
        'profile-relationship',
        null,
        jsonb_build_object('target_user_id', target_profile.user_id, 'relationship', 'follow')
      );
    end if;

  elsif normalized_action = 'unfollow' then
    delete from public.profile_follows
    where follower_user_id = auth.uid()
      and followed_user_id = target_profile.user_id;
    get diagnostics affected_rows = row_count;

    if affected_rows > 0 then
      perform private.write_audit(
        auth.uid(),
        'profile_unfollowed',
        'success',
        'profile-relationship',
        null,
        jsonb_build_object('target_user_id', target_profile.user_id, 'relationship', 'unfollow')
      );
    end if;

  elsif normalized_action = 'block' then
    insert into public.profile_blocks(blocker_user_id, blocked_user_id)
    values (auth.uid(), target_profile.user_id)
    on conflict do nothing;
    get diagnostics affected_rows = row_count;

    delete from public.profile_follows
    where (follower_user_id = auth.uid() and followed_user_id = target_profile.user_id)
       or (follower_user_id = target_profile.user_id and followed_user_id = auth.uid());

    if affected_rows > 0 then
      perform private.write_audit(
        auth.uid(),
        'profile_blocked',
        'success',
        'profile-relationship',
        null,
        jsonb_build_object('target_user_id', target_profile.user_id, 'relationship', 'block')
      );
    end if;

  elsif normalized_action = 'unblock' then
    delete from public.profile_blocks
    where blocker_user_id = auth.uid()
      and blocked_user_id = target_profile.user_id;
    get diagnostics affected_rows = row_count;

    if affected_rows > 0 then
      perform private.write_audit(
        auth.uid(),
        'profile_unblocked',
        'success',
        'profile-relationship',
        null,
        jsonb_build_object('target_user_id', target_profile.user_id, 'relationship', 'unblock')
      );
    end if;

  elsif normalized_action = 'mute' then
    insert into public.profile_mutes(muter_user_id, muted_user_id)
    values (auth.uid(), target_profile.user_id)
    on conflict do nothing;
    get diagnostics affected_rows = row_count;

    if affected_rows > 0 then
      perform private.write_audit(
        auth.uid(),
        'profile_muted',
        'success',
        'profile-relationship',
        null,
        jsonb_build_object('target_user_id', target_profile.user_id, 'relationship', 'mute')
      );
    end if;

  elsif normalized_action = 'unmute' then
    delete from public.profile_mutes
    where muter_user_id = auth.uid()
      and muted_user_id = target_profile.user_id;
    get diagnostics affected_rows = row_count;

    if affected_rows > 0 then
      perform private.write_audit(
        auth.uid(),
        'profile_unmuted',
        'success',
        'profile-relationship',
        null,
        jsonb_build_object('target_user_id', target_profile.user_id, 'relationship', 'unmute')
      );
    end if;
  end if;

  return jsonb_build_object(
    'following', exists (
      select 1 from public.profile_follows follow
      where follow.follower_user_id = auth.uid()
        and follow.followed_user_id = target_profile.user_id
    ),
    'blocked_by_me', exists (
      select 1 from public.profile_blocks block
      where block.blocker_user_id = auth.uid()
        and block.blocked_user_id = target_profile.user_id
    ),
    'muted_by_me', exists (
      select 1 from public.profile_mutes mute
      where mute.muter_user_id = auth.uid()
        and mute.muted_user_id = target_profile.user_id
    ),
    'follower_count', (
      select count(*) from public.profile_follows follow
      where follow.followed_user_id = target_profile.user_id
    ),
    'following_count', (
      select count(*) from public.profile_follows follow
      where follow.follower_user_id = target_profile.user_id
    )
  );
end;
$$;

create or replace function public.set_supporter_privacy(anonymous_by_default boolean)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  previous_value boolean;
begin
  perform private.assert_current_session();

  select profile.supporter_anonymity_default
  into previous_value
  from public.profiles profile
  where profile.user_id = auth.uid()
  for update;

  if previous_value is null then
    raise exception 'profile_not_found' using errcode = '22023';
  end if;

  update public.profiles
  set supporter_anonymity_default = anonymous_by_default,
      updated_at = now()
  where user_id = auth.uid();

  if previous_value is distinct from anonymous_by_default then
    perform private.write_audit(
      auth.uid(),
      'supporter_privacy_changed',
      'success',
      'privacy-settings',
      null,
      jsonb_build_object('field', 'supporter_anonymity_default')
    );
  end if;

  return anonymous_by_default;
end;
$$;

create or replace function public.submit_account_deletion_request()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  request_id uuid;
  inserted_request boolean := false;
begin
  perform private.assert_current_session();

  insert into public.privacy_requests(user_id, request_type, status)
  values (auth.uid(), 'deletion', 'submitted')
  on conflict (user_id, request_type)
    where status in ('submitted', 'processing')
  do nothing
  returning id into request_id;

  if request_id is not null then
    inserted_request := true;
  else
    select request.id
    into request_id
    from public.privacy_requests request
    where request.user_id = auth.uid()
      and request.request_type = 'deletion'
      and request.status in ('submitted', 'processing')
    order by request.requested_at desc
    limit 1;
  end if;

  if inserted_request then
    perform private.write_audit(
      auth.uid(),
      'account_deletion_requested',
      'success',
      'privacy-settings',
      null,
      jsonb_build_object('request_type', 'deletion')
    );
  end if;

  return request_id;
end;
$$;

create or replace function public.cancel_account_deletion_request()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  cancelled_rows integer := 0;
begin
  perform private.assert_current_session();

  update public.privacy_requests
  set status = 'cancelled',
      updated_at = now()
  where user_id = auth.uid()
    and request_type = 'deletion'
    and status = 'submitted';
  get diagnostics cancelled_rows = row_count;

  if cancelled_rows > 0 then
    perform private.write_audit(
      auth.uid(),
      'account_deletion_request_cancelled',
      'success',
      'privacy-settings',
      null,
      jsonb_build_object('request_type', 'deletion')
    );
  end if;

  return cancelled_rows > 0;
end;
$$;

create or replace function public.mark_notification_read(notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  updated_rows integer := 0;
begin
  perform private.assert_adult_profile_action();

  update public.notifications notification
  set read_at = coalesce(notification.read_at, now())
  where notification.id = notification_id
    and notification.recipient_user_id = auth.uid()
    and (
      notification.actor_user_id is null
      or not exists (
        select 1
        from public.profile_blocks block
        where block.blocker_user_id = auth.uid()
          and block.blocked_user_id = notification.actor_user_id
      )
    );
  get diagnostics updated_rows = row_count;

  return updated_rows > 0;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  updated_rows integer := 0;
begin
  perform private.assert_adult_profile_action();

  update public.notifications notification
  set read_at = coalesce(notification.read_at, now())
  where notification.recipient_user_id = auth.uid()
    and notification.read_at is null
    and (
      notification.actor_user_id is null
      or not exists (
        select 1
        from public.profile_blocks block
        where block.blocker_user_id = auth.uid()
          and block.blocked_user_id = notification.actor_user_id
      )
    );
  get diagnostics updated_rows = row_count;

  return updated_rows;
end;
$$;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = recipient_user_id
    and (
      actor_user_id is null
      or not exists (
        select 1
        from public.profile_blocks block
        where block.blocker_user_id = (select auth.uid())
          and block.blocked_user_id = actor_user_id
      )
    )
  );

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-media',
  'profile-media',
  false,
  10485760,
  array['image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

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
    and (storage.foldername(object_name))[1] = auth.uid()::text
    and storage.filename(object_name) ~ '^(avatar|banner)(-[A-Za-z0-9_-]+)?\.webp$';
$$;

create or replace function policy_internal.profile_media_can_read(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  viewer_id uuid := auth.uid();
  attached_profile public.profiles%rowtype;
begin
  if viewer_id is not null and not coalesce(private.session_is_current(viewer_id), false) then
    viewer_id := null;
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

revoke all on function policy_internal.profile_media_owner_can_write(text) from public, anon, authenticated;
revoke all on function policy_internal.profile_media_can_read(text) from public, anon, authenticated;
grant execute on function policy_internal.profile_media_owner_can_write(text) to authenticated;
grant execute on function policy_internal.profile_media_can_read(text) to anon, authenticated;

drop policy if exists profile_media_insert_owner on storage.objects;
create policy profile_media_insert_owner
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-media'
    and policy_internal.profile_media_owner_can_write(name)
  );

drop policy if exists profile_media_update_owner on storage.objects;
create policy profile_media_update_owner
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-media'
    and policy_internal.profile_media_owner_can_write(name)
  )
  with check (
    bucket_id = 'profile-media'
    and policy_internal.profile_media_owner_can_write(name)
  );

drop policy if exists profile_media_delete_owner on storage.objects;
create policy profile_media_delete_owner
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-media'
    and policy_internal.profile_media_owner_can_write(name)
  );

drop policy if exists profile_media_read_viewable on storage.objects;
create policy profile_media_read_viewable
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'profile-media'
    and policy_internal.profile_media_can_read(name)
  );

revoke all on function private.assert_adult_profile_action() from public, anon, authenticated;

revoke all on function public.get_public_profile(text) from public, anon, authenticated;
revoke all on function public.is_profile_discoverable(text) from public, anon, authenticated;
revoke all on function public.update_profile(text, text, text, jsonb, text, public.profile_visibility) from public, anon, authenticated;
revoke all on function public.set_profile_relationship(text, text) from public, anon, authenticated;
revoke all on function public.set_supporter_privacy(boolean) from public, anon, authenticated;
revoke all on function public.submit_account_deletion_request() from public, anon, authenticated;
revoke all on function public.cancel_account_deletion_request() from public, anon, authenticated;
revoke all on function public.mark_notification_read(uuid) from public, anon, authenticated;
revoke all on function public.mark_all_notifications_read() from public, anon, authenticated;

grant execute on function public.get_public_profile(text) to anon, authenticated;
grant execute on function public.is_profile_discoverable(text) to anon, authenticated;
grant execute on function public.update_profile(text, text, text, jsonb, text, public.profile_visibility) to authenticated;
grant execute on function public.set_profile_relationship(text, text) to authenticated;
grant execute on function public.set_supporter_privacy(boolean) to authenticated;
grant execute on function public.submit_account_deletion_request() to authenticated;
grant execute on function public.cancel_account_deletion_request() to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

notify pgrst, 'reload schema';
