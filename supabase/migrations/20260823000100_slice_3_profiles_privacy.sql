create type public.profile_visibility as enum ('public', 'unlisted', 'private');
create type public.privacy_request_type as enum ('deletion');
create type public.privacy_request_status as enum ('submitted', 'cancelled', 'processing', 'completed', 'rejected');
create type public.notification_type as enum ('new_follower');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique,
  display_name text not null default 'LUX member',
  bio text not null default '',
  avatar_path text,
  banner_path text,
  links jsonb not null default '[]'::jsonb,
  language_code text not null default 'en',
  visibility public.profile_visibility not null default 'public',
  supporter_anonymity_default boolean not null default true,
  profile_revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_handle_format check (handle ~ '^[a-z0-9_]{3,30}$'),
  constraint profile_display_name_length check (char_length(trim(display_name)) between 1 and 80),
  constraint profile_display_name_plain_text check (display_name !~ '[[:cntrl:]]'),
  constraint profile_bio_length check (char_length(bio) <= 500),
  constraint profile_bio_plain_text check (bio !~ '[[:cntrl:]]'),
  constraint profile_avatar_path_length check (avatar_path is null or char_length(avatar_path) between 1 and 512),
  constraint profile_banner_path_length check (banner_path is null or char_length(banner_path) between 1 and 512),
  constraint profile_links_array check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 5),
  constraint profile_language_code check (
    char_length(language_code) <= 16
    and language_code ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$'
  ),
  constraint profile_revision_positive check (profile_revision > 0)
);

create table public.profile_follows (
  follower_user_id uuid not null references auth.users(id) on delete cascade,
  followed_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_user_id, followed_user_id),
  constraint profile_follow_not_self check (follower_user_id <> followed_user_id)
);

create table public.profile_blocks (
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  constraint profile_block_not_self check (blocker_user_id <> blocked_user_id)
);

create table public.profile_mutes (
  muter_user_id uuid not null references auth.users(id) on delete cascade,
  muted_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_user_id, muted_user_id),
  constraint profile_mute_not_self check (muter_user_id <> muted_user_id)
);

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_type public.privacy_request_type not null,
  status public.privacy_request_status not null default 'submitted',
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  type public.notification_type not null,
  target_path text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notification_target_path check (
    target_path is null
    or (
      char_length(target_path) between 1 and 512
      and target_path like '/%'
      and target_path not like '//%'
      and position(E'\\' in target_path) = 0
    )
  )
);

create index profiles_visibility_updated_idx
  on public.profiles(visibility, updated_at desc);
create index profile_follows_followed_created_idx
  on public.profile_follows(followed_user_id, created_at desc);
create index profile_follows_follower_created_idx
  on public.profile_follows(follower_user_id, created_at desc);
create index profile_blocks_blocked_idx
  on public.profile_blocks(blocked_user_id);
create index profile_mutes_muted_idx
  on public.profile_mutes(muted_user_id);
create index privacy_requests_user_requested_idx
  on public.privacy_requests(user_id, requested_at desc);
create unique index privacy_requests_one_active_deletion_idx
  on public.privacy_requests(user_id, request_type)
  where status in ('submitted', 'processing');
create index notifications_recipient_created_idx
  on public.notifications(recipient_user_id, created_at desc);
create unique index notifications_unique_new_follower_idx
  on public.notifications(recipient_user_id, actor_user_id, type)
  where type = 'new_follower' and actor_user_id is not null;

alter table public.profiles enable row level security;
alter table public.profile_follows enable row level security;
alter table public.profile_blocks enable row level security;
alter table public.profile_mutes enable row level security;
alter table public.privacy_requests enable row level security;
alter table public.notifications enable row level security;

create or replace function private.default_profile_handle(subject_user_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  digest_text text := encode(extensions.digest(subject_user_id::text, 'sha256'), 'hex');
  suffix_length integer := 10;
  candidate text;
begin
  loop
    candidate := 'lux_' || substr(digest_text, 1, suffix_length);
    if not exists (
      select 1
      from public.profiles profile
      where profile.handle = candidate
        and profile.user_id <> subject_user_id
    ) then
      return candidate;
    end if;

    suffix_length := suffix_length + 2;
    if suffix_length > 26 then
      raise exception 'profile_handle_collision' using errcode = '23505';
    end if;
  end loop;
end;
$$;

insert into public.profiles(user_id, handle)
select auth_user.id, private.default_profile_handle(auth_user.id)
from auth.users auth_user
on conflict (user_id) do nothing;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  fan_membership_id uuid;
begin
  insert into public.accounts(user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.account_security_state(user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.profiles(user_id, handle)
  values (new.id, private.default_profile_handle(new.id))
  on conflict (user_id) do nothing;

  insert into public.workspace_memberships (
    user_id,
    role,
    status,
    reviewed_at,
    reviewed_by
  ) values (
    new.id,
    'fan',
    'approved',
    now(),
    new.id
  )
  on conflict (user_id, role) do update
    set status = 'approved',
        reviewed_at = coalesce(public.workspace_memberships.reviewed_at, now()),
        updated_at = now()
  returning id into fan_membership_id;

  insert into public.active_workspaces(user_id, membership_id)
  values (new.id, fan_membership_id)
  on conflict (user_id) do nothing;

  perform private.write_audit(new.id, 'account_registered', 'success');
  return new;
end;
$$;

create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy follows_select_involving_self
  on public.profile_follows for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and ((select auth.uid()) = follower_user_id or (select auth.uid()) = followed_user_id)
  );

create policy blocks_select_own
  on public.profile_blocks for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = blocker_user_id);

create policy mutes_select_own
  on public.profile_mutes for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = muter_user_id);

create policy privacy_requests_select_own
  on public.privacy_requests for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy notifications_select_own
  on public.notifications for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = recipient_user_id);

revoke all on public.profiles from anon, authenticated;
revoke all on public.profile_follows from anon, authenticated;
revoke all on public.profile_blocks from anon, authenticated;
revoke all on public.profile_mutes from anon, authenticated;
revoke all on public.privacy_requests from anon, authenticated;
revoke all on public.notifications from anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.profile_follows to authenticated;
grant select on public.profile_blocks to authenticated;
grant select on public.profile_mutes to authenticated;
grant select on public.privacy_requests to authenticated;
grant select on public.notifications to authenticated;

revoke all on function private.default_profile_handle(uuid) from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

notify pgrst, 'reload schema';
