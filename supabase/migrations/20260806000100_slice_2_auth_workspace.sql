create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum (
  'fan',
  'creator',
  'agency',
  'reviewer',
  'moderator',
  'finance',
  'copyright',
  'support',
  'super_admin'
);

create type public.membership_status as enum ('requested', 'approved', 'rejected', 'revoked');
create type public.age_assurance_method as enum ('self_attestation', 'provider');
create type public.age_assurance_status as enum ('accepted', 'rejected', 'revoked', 'expired');
create type public.audit_outcome as enum ('success', 'denied', 'failure');

create table public.accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  status public.membership_status not null default 'requested',
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role),
  unique (id, user_id),
  constraint membership_review_state check (
    (status = 'requested' and reviewed_at is null)
    or (status <> 'requested' and reviewed_at is not null)
    or role = 'fan'
  )
);

create table public.active_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  membership_id uuid not null,
  updated_at timestamptz not null default now(),
  foreign key (membership_id, user_id)
    references public.workspace_memberships(id, user_id)
    on delete cascade
);

create table public.account_security_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sessions_revoked_before_epoch bigint,
  updated_at timestamptz not null default now()
);

create table public.age_assurance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  method public.age_assurance_method not null,
  status public.age_assurance_status not null,
  jurisdiction_code text not null,
  policy_version text not null,
  assured_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint age_jurisdiction_code check (jurisdiction_code ~ '^[A-Z]{2}$'),
  constraint age_policy_version check (length(policy_version) between 1 and 64),
  constraint age_expiry_order check (expires_at is null or expires_at > assured_at)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  session_id uuid,
  event_type text not null,
  outcome public.audit_outcome not null,
  route_key text,
  target_role public.app_role,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_event_type_length check (length(event_type) between 3 and 80),
  constraint audit_route_key_length check (route_key is null or length(route_key) between 1 and 120),
  constraint audit_details_object check (jsonb_typeof(details) = 'object')
);

create index workspace_memberships_user_status_idx
  on public.workspace_memberships(user_id, status);
create index workspace_memberships_review_queue_idx
  on public.workspace_memberships(status, role, requested_at)
  where status = 'requested';
create index age_assurance_user_status_idx
  on public.age_assurance_records(user_id, status, assured_at desc);
create index audit_events_actor_created_idx
  on public.audit_events(actor_user_id, created_at desc);

alter table public.accounts enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.active_workspaces enable row level security;
alter table public.account_security_state enable row level security;
alter table public.age_assurance_records enable row level security;
alter table public.audit_events enable row level security;

create or replace function private.jwt_session_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'session_id', '')::uuid;
$$;

create or replace function private.jwt_issued_at_epoch()
returns bigint
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() ->> 'iat', '')::bigint, 0);
$$;

create or replace function private.is_staff_role(candidate public.app_role)
returns boolean
language sql
immutable
as $$
  select candidate in ('reviewer', 'moderator', 'finance', 'copyright', 'support', 'super_admin');
$$;

create or replace function private.current_active_role(subject_user_id uuid default auth.uid())
returns public.app_role
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
  select membership.role
  from public.active_workspaces active
  join public.workspace_memberships membership
    on membership.id = active.membership_id
   and membership.user_id = active.user_id
  where active.user_id = subject_user_id
    and membership.status = 'approved'
  limit 1;
$$;

create or replace function private.session_is_current(subject_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
  select case
    when subject_user_id is null then false
    when security.sessions_revoked_before_epoch is null then true
    else private.jwt_issued_at_epoch() > security.sessions_revoked_before_epoch
  end
  from public.account_security_state security
  where security.user_id = subject_user_id;
$$;

create or replace function private.assert_current_session()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if auth.uid() is null or not coalesce(private.session_is_current(auth.uid()), false) then
    raise exception 'session_not_current' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.has_accepted_age_record(subject_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
  select exists (
    select 1
    from public.age_assurance_records record
    where record.user_id = subject_user_id
      and record.status = 'accepted'
      and (record.expires_at is null or record.expires_at > now())
  );
$$;

create or replace function private.write_audit(
  audit_actor uuid,
  audit_event_type text,
  audit_outcome_value public.audit_outcome,
  audit_route_key text default null,
  audit_target_role public.app_role default null,
  audit_details jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  created_id bigint;
begin
  insert into public.audit_events (
    actor_user_id,
    session_id,
    event_type,
    outcome,
    route_key,
    target_role,
    details
  ) values (
    audit_actor,
    private.jwt_session_id(),
    audit_event_type,
    audit_outcome_value,
    left(audit_route_key, 120),
    audit_target_role,
    coalesce(audit_details, '{}'::jsonb)
  ) returning id into created_id;

  return created_id;
end;
$$;

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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

insert into public.accounts(user_id)
select id from auth.users
on conflict (user_id) do nothing;

insert into public.account_security_state(user_id)
select id from auth.users
on conflict (user_id) do nothing;

insert into public.workspace_memberships(user_id, role, status, reviewed_at, reviewed_by)
select id, 'fan', 'approved', now(), id
from auth.users
on conflict (user_id, role) do nothing;

insert into public.active_workspaces(user_id, membership_id)
select membership.user_id, membership.id
from public.workspace_memberships membership
where membership.role = 'fan' and membership.status = 'approved'
on conflict (user_id) do nothing;

create or replace function public.get_viewer_context()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'user_id', auth.uid(),
    'email_verified', exists (
      select 1 from auth.users auth_user
      where auth_user.id = auth.uid()
        and auth_user.email_confirmed_at is not null
    ),
    'session_valid', coalesce(private.session_is_current(auth.uid()), false),
    'active_role', private.current_active_role(auth.uid()),
    'age_assurance', (
      select jsonb_build_object(
        'method', record.method,
        'status', record.status,
        'jurisdiction_code', record.jurisdiction_code,
        'policy_version', record.policy_version,
        'assured_at', record.assured_at,
        'expires_at', record.expires_at
      )
      from public.age_assurance_records record
      where record.user_id = auth.uid()
      order by record.assured_at desc
      limit 1
    ),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', membership.id,
        'role', membership.role,
        'status', membership.status,
        'requested_at', membership.requested_at,
        'reviewed_at', membership.reviewed_at
      ) order by membership.created_at)
      from public.workspace_memberships membership
      where membership.user_id = auth.uid()
    ), '[]'::jsonb)
  ) end;
$$;

create or replace function public.confirm_adult_attestation(
  jurisdiction_code text,
  policy_version text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  created_id uuid;
  normalized_code text := upper(trim(jurisdiction_code));
begin
  perform private.assert_current_session();

  if not exists (
    select 1 from auth.users auth_user
    where auth_user.id = auth.uid()
      and auth_user.email_confirmed_at is not null
  ) then
    raise exception 'email_not_verified' using errcode = '42501';
  end if;

  if normalized_code !~ '^[A-Z]{2}$' then
    raise exception 'invalid_jurisdiction_code' using errcode = '22023';
  end if;

  insert into public.age_assurance_records (
    user_id,
    method,
    status,
    jurisdiction_code,
    policy_version,
    expires_at
  ) values (
    auth.uid(),
    'self_attestation',
    'accepted',
    normalized_code,
    left(trim(policy_version), 64),
    now() + interval '1 year'
  ) returning id into created_id;

  perform private.write_audit(
    auth.uid(),
    'adult_access_attested',
    'success',
    'age-assurance',
    null,
    jsonb_build_object('method', 'self_attestation', 'jurisdiction_code', normalized_code)
  );

  return created_id;
end;
$$;

create or replace function public.request_workspace_role(requested_role public.app_role)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  membership_id uuid;
begin
  perform private.assert_current_session();

  if requested_role not in ('creator', 'agency') then
    raise exception 'role_not_requestable' using errcode = '42501';
  end if;

  if not private.has_accepted_age_record(auth.uid()) then
    raise exception 'adult_access_required' using errcode = '42501';
  end if;

  insert into public.workspace_memberships(user_id, role, status)
  values (auth.uid(), requested_role, 'requested')
  on conflict (user_id, role) do update
    set status = case
      when public.workspace_memberships.status in ('rejected', 'revoked') then 'requested'
      else public.workspace_memberships.status
    end,
    requested_at = case
      when public.workspace_memberships.status in ('rejected', 'revoked') then now()
      else public.workspace_memberships.requested_at
    end,
    reviewed_at = case
      when public.workspace_memberships.status in ('rejected', 'revoked') then null
      else public.workspace_memberships.reviewed_at
    end,
    reviewed_by = case
      when public.workspace_memberships.status in ('rejected', 'revoked') then null
      else public.workspace_memberships.reviewed_by
    end,
    updated_at = now()
  returning id into membership_id;

  perform private.write_audit(
    auth.uid(),
    'workspace_role_requested',
    'success',
    'workspace-role-request',
    requested_role,
    jsonb_build_object('membership_id', membership_id)
  );

  return membership_id;
end;
$$;

create or replace function public.activate_workspace(target_membership_id uuid)
returns public.app_role
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  selected_role public.app_role;
begin
  perform private.assert_current_session();

  if not private.has_accepted_age_record(auth.uid()) then
    raise exception 'adult_access_required' using errcode = '42501';
  end if;

  select membership.role into selected_role
  from public.workspace_memberships membership
  where membership.id = target_membership_id
    and membership.user_id = auth.uid()
    and membership.status = 'approved';

  if selected_role is null then
    perform private.write_audit(
      auth.uid(),
      'workspace_activation_denied',
      'denied',
      'workspace-activation',
      null,
      jsonb_build_object('membership_id', target_membership_id)
    );
    raise exception 'workspace_not_approved' using errcode = '42501';
  end if;

  insert into public.active_workspaces(user_id, membership_id, updated_at)
  values (auth.uid(), target_membership_id, now())
  on conflict (user_id) do update
    set membership_id = excluded.membership_id,
        updated_at = now();

  perform private.write_audit(
    auth.uid(),
    'workspace_activated',
    'success',
    'workspace-activation',
    selected_role,
    jsonb_build_object('membership_id', target_membership_id)
  );

  return selected_role;
end;
$$;

create or replace function public.review_workspace_request(
  target_membership_id uuid,
  decision public.membership_status
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  target_role public.app_role;
begin
  perform private.assert_current_session();

  if private.current_active_role(auth.uid()) <> 'super_admin' then
    perform private.write_audit(auth.uid(), 'workspace_review_denied', 'denied', 'staff-role-requests');
    raise exception 'super_admin_required' using errcode = '42501';
  end if;

  if decision not in ('approved', 'rejected') then
    raise exception 'invalid_review_decision' using errcode = '22023';
  end if;

  select membership.role into target_role
  from public.workspace_memberships membership
  where membership.id = target_membership_id
    and membership.status = 'requested'
    and membership.role in ('creator', 'agency')
  for update;

  if target_role is null then
    raise exception 'request_not_reviewable' using errcode = '22023';
  end if;

  update public.workspace_memberships
  set status = decision,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      updated_at = now()
  where id = target_membership_id;

  perform private.write_audit(
    auth.uid(),
    'workspace_role_reviewed',
    'success',
    'staff-role-requests',
    target_role,
    jsonb_build_object('membership_id', target_membership_id, 'decision', decision)
  );
end;
$$;

create or replace function public.record_auth_event(
  auth_event_type text,
  auth_outcome public.audit_outcome default 'success'
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if auth_event_type not in (
    'login_succeeded',
    'login_failed',
    'logout_current_device',
    'logout_all_devices',
    'password_recovery_requested',
    'password_updated',
    'email_verified',
    'session_expired'
  ) then
    raise exception 'unsupported_auth_event' using errcode = '22023';
  end if;

  return private.write_audit(auth.uid(), auth_event_type, auth_outcome, 'auth');
end;
$$;

create or replace function public.record_access_denied(
  denied_route_key text,
  required_role public.app_role default null,
  denial_reason text default 'authorization_denied'
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  return private.write_audit(
    auth.uid(),
    'access_denied',
    'denied',
    denied_route_key,
    required_role,
    jsonb_build_object('reason', left(coalesce(denial_reason, 'authorization_denied'), 80))
  );
end;
$$;

create or replace function public.revoke_all_app_sessions()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  revoked_epoch bigint := extract(epoch from clock_timestamp())::bigint;
begin
  perform private.assert_current_session();

  update public.account_security_state
  set sessions_revoked_before_epoch = revoked_epoch,
      updated_at = now()
  where user_id = auth.uid();

  perform private.write_audit(auth.uid(), 'logout_all_devices', 'success', 'auth');
  return revoked_epoch;
end;
$$;

create or replace function public.bootstrap_super_admin(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  membership_id uuid;
begin
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'unknown_user' using errcode = '22023';
  end if;

  insert into public.workspace_memberships(
    user_id,
    role,
    status,
    reviewed_at,
    reviewed_by
  ) values (
    target_user_id,
    'super_admin',
    'approved',
    now(),
    target_user_id
  )
  on conflict (user_id, role) do update
    set status = 'approved',
        reviewed_at = now(),
        reviewed_by = target_user_id,
        updated_at = now()
  returning id into membership_id;

  insert into public.active_workspaces(user_id, membership_id, updated_at)
  values (target_user_id, membership_id, now())
  on conflict (user_id) do update
    set membership_id = excluded.membership_id,
        updated_at = now();

  perform private.write_audit(target_user_id, 'super_admin_bootstrapped', 'success', 'bootstrap', 'super_admin');
  return membership_id;
end;
$$;

create policy accounts_select_own
  on public.accounts for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy memberships_select_own_or_super_admin
  on public.workspace_memberships for select
  to authenticated
  using (
    ((select auth.uid()) is not null and (select auth.uid()) = user_id)
    or private.current_active_role(auth.uid()) = 'super_admin'
  );

create policy active_workspace_select_own
  on public.active_workspaces for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy security_state_select_own
  on public.account_security_state for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy age_assurance_select_own
  on public.age_assurance_records for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy audit_select_own
  on public.audit_events for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = actor_user_id);

revoke all on public.accounts from anon, authenticated;
revoke all on public.workspace_memberships from anon, authenticated;
revoke all on public.active_workspaces from anon, authenticated;
revoke all on public.account_security_state from anon, authenticated;
revoke all on public.age_assurance_records from anon, authenticated;
revoke all on public.audit_events from anon, authenticated;

grant select on public.accounts to authenticated;
grant select on public.workspace_memberships to authenticated;
grant select on public.active_workspaces to authenticated;
grant select on public.account_security_state to authenticated;
grant select on public.age_assurance_records to authenticated;
grant select on public.audit_events to authenticated;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.get_viewer_context() from public, anon;
revoke all on function public.confirm_adult_attestation(text, text) from public, anon;
revoke all on function public.request_workspace_role(public.app_role) from public, anon;
revoke all on function public.activate_workspace(uuid) from public, anon;
revoke all on function public.review_workspace_request(uuid, public.membership_status) from public, anon;
revoke all on function public.record_auth_event(text, public.audit_outcome) from public, anon;
revoke all on function public.record_access_denied(text, public.app_role, text) from public, anon;
revoke all on function public.revoke_all_app_sessions() from public, anon;
revoke all on function public.bootstrap_super_admin(uuid) from public, anon, authenticated;

grant execute on function public.get_viewer_context() to authenticated;
grant execute on function public.confirm_adult_attestation(text, text) to authenticated;
grant execute on function public.request_workspace_role(public.app_role) to authenticated;
grant execute on function public.activate_workspace(uuid) to authenticated;
grant execute on function public.review_workspace_request(uuid, public.membership_status) to authenticated;
grant execute on function public.record_auth_event(text, public.audit_outcome) to authenticated;
grant execute on function public.record_access_denied(text, public.app_role, text) to authenticated;
grant execute on function public.revoke_all_app_sessions() to authenticated;
grant execute on function public.bootstrap_super_admin(uuid) to service_role;

grant usage on schema public to anon, authenticated;

notify pgrst, 'reload schema';
