create type public.verification_level as enum ('v1', 'v2', 'v3');
create type public.verification_status as enum (
  'not_started',
  'pending',
  'needs_review',
  'verified',
  'rejected',
  'expired',
  'revoked'
);

create table public.verification_subjects (
  user_id uuid not null references auth.users(id) on delete cascade,
  level public.verification_level not null,
  status public.verification_status not null default 'not_started',
  verified_at timestamptz,
  expires_at timestamptz,
  recheck_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, level),
  constraint verification_subject_stored_level check (level in ('v2', 'v3')),
  constraint verification_subject_reason_plain_text check (
    recheck_reason is null
    or (char_length(recheck_reason) between 1 and 240 and recheck_reason !~ '[[:cntrl:]]')
  )
);

create table public.verification_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_level public.verification_level not null,
  provider_key text not null,
  provider_reference text not null,
  status public.verification_status not null default 'pending',
  liveness_passed boolean,
  risk_screen_passed boolean,
  synthetic boolean not null default false,
  session_expires_at timestamptz not null,
  result_expires_at timestamptz,
  completed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verification_session_level check (target_level in ('v2', 'v3')),
  constraint verification_session_provider_key check (
    char_length(provider_key) between 2 and 64
    and provider_key ~ '^[a-z0-9][a-z0-9_-]*$'
  ),
  constraint verification_session_provider_reference check (
    char_length(provider_reference) between 1 and 512
    and provider_reference !~ '[[:cntrl:]]'
  )
);

create table public.performer_records (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default false,
  liveness_expires_at timestamptz,
  payout_ownership_verified boolean not null default false,
  payout_ownership_checked_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.consent_education_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_version text not null,
  acknowledged_at timestamptz not null default now(),
  constraint consent_education_policy_version check (
    char_length(policy_version) between 3 and 80
    and policy_version ~ '^[A-Za-z0-9._-]+$'
  ),
  unique (user_id, policy_version)
);

create index verification_subjects_status_expiry_idx
  on public.verification_subjects(level, status, expires_at);
create index verification_sessions_user_created_idx
  on public.verification_sessions(user_id, created_at desc);
create index verification_sessions_status_created_idx
  on public.verification_sessions(status, created_at asc);
create index consent_education_user_ack_idx
  on public.consent_education_acknowledgements(user_id, acknowledged_at desc);

alter table public.verification_subjects enable row level security;
alter table public.verification_sessions enable row level security;
alter table public.performer_records enable row level security;
alter table public.consent_education_acknowledgements enable row level security;

revoke all on public.verification_subjects from public, anon, authenticated;
revoke all on public.verification_sessions from public, anon, authenticated;
revoke all on public.performer_records from public, anon, authenticated;
revoke all on public.consent_education_acknowledgements from public, anon, authenticated;

grant select on public.verification_subjects to authenticated;
grant select on public.verification_sessions to authenticated;
grant select on public.performer_records to authenticated;
grant select on public.consent_education_acknowledgements to authenticated;

create or replace function private.current_consent_education_version()
returns text
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select 'slice-5-consent-v1'::text;
$$;

create or replace function private.is_verification_reviewer(subject_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
  select subject_user_id is not null
    and coalesce(private.session_is_current(subject_user_id), false)
    and private.current_active_role(subject_user_id) in ('reviewer', 'super_admin');
$$;

create or replace function private.assert_verification_reviewer()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  perform private.assert_current_session();

  if not private.is_verification_reviewer(auth.uid()) then
    raise exception 'verification_reviewer_required' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.verification_is_current(
  subject_user_id uuid,
  requested_level public.verification_level
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select requested_level in ('v2', 'v3')
    and exists (
      select 1
      from public.verification_subjects subject
      where subject.user_id = subject_user_id
        and subject.level = requested_level
        and subject.status = 'verified'
        and (subject.expires_at is null or subject.expires_at > now())
    );
$$;

create or replace function private.has_current_consent_education(subject_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.consent_education_acknowledgements acknowledgement
    where acknowledgement.user_id = subject_user_id
      and acknowledgement.policy_version = private.current_consent_education_version()
  );
$$;

create policy verification_subjects_reviewer_read
  on public.verification_subjects for select
  to authenticated
  using (private.is_verification_reviewer(auth.uid()));

create policy verification_sessions_reviewer_read
  on public.verification_sessions for select
  to authenticated
  using (private.is_verification_reviewer(auth.uid()));

create policy performer_records_reviewer_read
  on public.performer_records for select
  to authenticated
  using (private.is_verification_reviewer(auth.uid()));

create policy consent_education_reviewer_read
  on public.consent_education_acknowledgements for select
  to authenticated
  using (private.is_verification_reviewer(auth.uid()));

create or replace function public.start_verification(
  requested_level public.verification_level,
  requested_provider_key text,
  requested_provider_reference text,
  requested_session_expires_at timestamptz,
  requested_synthetic boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  normalized_provider_key text := lower(trim(requested_provider_key));
  normalized_provider_reference text := trim(requested_provider_reference);
  created_session_id uuid;
  current_subject public.verification_subjects%rowtype;
begin
  perform private.assert_adult_profile_action();

  if requested_level not in ('v2', 'v3') then
    raise exception 'invalid_verification_level' using errcode = '22023';
  end if;

  if requested_level = 'v3' and not private.verification_is_current(auth.uid(), 'v2') then
    raise exception 'v2_verification_required' using errcode = '42501';
  end if;

  if normalized_provider_key is null
     or char_length(normalized_provider_key) < 2
     or char_length(normalized_provider_key) > 64
     or normalized_provider_key !~ '^[a-z0-9][a-z0-9_-]*$' then
    raise exception 'invalid_verification_provider' using errcode = '22023';
  end if;

  if normalized_provider_reference is null
     or char_length(normalized_provider_reference) < 1
     or char_length(normalized_provider_reference) > 512
     or normalized_provider_reference ~ '[[:cntrl:]]' then
    raise exception 'invalid_verification_reference' using errcode = '22023';
  end if;

  if requested_session_expires_at is null
     or requested_session_expires_at <= now()
     or requested_session_expires_at > now() + interval '2 hours' then
    raise exception 'invalid_verification_session_expiry' using errcode = '22023';
  end if;

  select subject.*
  into current_subject
  from public.verification_subjects subject
  where subject.user_id = auth.uid()
    and subject.level = requested_level
  for update;

  if current_subject.user_id is null then
    insert into public.verification_subjects(user_id, level, status)
    values (auth.uid(), requested_level, 'pending');
  elsif not private.verification_is_current(auth.uid(), requested_level) then
    update public.verification_subjects
    set status = 'pending',
        verified_at = null,
        expires_at = null,
        recheck_reason = null,
        reviewed_by = null,
        reviewed_at = null,
        updated_at = now()
    where user_id = auth.uid()
      and level = requested_level;
  end if;

  insert into public.verification_sessions(
    user_id,
    target_level,
    provider_key,
    provider_reference,
    status,
    synthetic,
    session_expires_at
  ) values (
    auth.uid(),
    requested_level,
    normalized_provider_key,
    normalized_provider_reference,
    'pending',
    coalesce(requested_synthetic, false),
    requested_session_expires_at
  )
  returning id into created_session_id;

  perform private.write_audit(
    auth.uid(),
    'verification_started',
    'success',
    'verification-settings',
    null,
    jsonb_build_object(
      'target_level', requested_level,
      'provider_key', normalized_provider_key,
      'synthetic', coalesce(requested_synthetic, false),
      'session_id', created_session_id
    )
  );

  return created_session_id;
end;
$$;

create or replace function public.set_performer_verification_prerequisites(
  target_user_id uuid,
  record_active boolean,
  liveness_expires_at timestamptz,
  payout_ownership_verified boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  perform private.assert_verification_reviewer();

  if target_user_id is null or not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'verification_subject_not_found' using errcode = '22023';
  end if;

  if not private.verification_is_current(target_user_id, 'v2') then
    raise exception 'v2_verification_required' using errcode = '42501';
  end if;

  if coalesce(record_active, false) and (liveness_expires_at is null or liveness_expires_at <= now()) then
    raise exception 'current_liveness_required' using errcode = '22023';
  end if;

  insert into public.performer_records(
    user_id,
    active,
    liveness_expires_at,
    payout_ownership_verified,
    payout_ownership_checked_at,
    reviewed_by,
    reviewed_at
  ) values (
    target_user_id,
    coalesce(record_active, false),
    liveness_expires_at,
    coalesce(payout_ownership_verified, false),
    case when coalesce(payout_ownership_verified, false) then now() else null end,
    auth.uid(),
    now()
  )
  on conflict (user_id) do update
    set active = excluded.active,
        liveness_expires_at = excluded.liveness_expires_at,
        payout_ownership_verified = excluded.payout_ownership_verified,
        payout_ownership_checked_at = excluded.payout_ownership_checked_at,
        reviewed_by = excluded.reviewed_by,
        reviewed_at = excluded.reviewed_at,
        updated_at = now();

  perform private.write_audit(
    auth.uid(),
    'performer_prerequisites_reviewed',
    'success',
    'verification-review',
    null,
    jsonb_build_object(
      'target_user_id', target_user_id,
      'record_active', coalesce(record_active, false),
      'payout_ownership_verified', coalesce(payout_ownership_verified, false)
    )
  );

  return true;
end;
$$;

create or replace function public.acknowledge_consent_education(requested_policy_version text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  normalized_policy_version text := trim(requested_policy_version);
  acknowledgement_id uuid;
begin
  perform private.assert_adult_profile_action();

  if normalized_policy_version is distinct from private.current_consent_education_version() then
    raise exception 'invalid_consent_education_version' using errcode = '22023';
  end if;

  insert into public.consent_education_acknowledgements(user_id, policy_version)
  values (auth.uid(), normalized_policy_version)
  on conflict (user_id, policy_version) do update
    set acknowledged_at = public.consent_education_acknowledgements.acknowledged_at
  returning id into acknowledgement_id;

  perform private.write_audit(
    auth.uid(),
    'consent_education_acknowledged',
    'success',
    'verification-settings',
    null,
    jsonb_build_object('policy_version', normalized_policy_version)
  );

  return acknowledgement_id;
end;
$$;

create or replace function public.apply_verification_result(
  target_session_id uuid,
  decision public.verification_status,
  requested_result_expires_at timestamptz,
  requested_liveness_passed boolean,
  requested_risk_screen_passed boolean,
  requested_recheck_reason text default null
)
returns public.verification_level
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  session_row public.verification_sessions%rowtype;
  performer_row public.performer_records%rowtype;
  normalized_reason text := nullif(trim(requested_recheck_reason), '');
begin
  perform private.assert_verification_reviewer();

  select session.*
  into session_row
  from public.verification_sessions session
  where session.id = target_session_id
  for update;

  if session_row.id is null then
    raise exception 'verification_session_not_found' using errcode = '22023';
  end if;

  if session_row.completed_at is not null then
    if session_row.status = decision then
      return session_row.target_level;
    end if;
    raise exception 'verification_session_completed' using errcode = '22023';
  end if;

  if decision not in ('needs_review', 'verified', 'rejected') then
    raise exception 'invalid_verification_result' using errcode = '22023';
  end if;

  if normalized_reason is not null
     and (char_length(normalized_reason) > 240 or normalized_reason ~ '[[:cntrl:]]') then
    raise exception 'invalid_verification_reason' using errcode = '22023';
  end if;

  if decision = 'verified' then
    if session_row.session_expires_at <= now() then
      raise exception 'verification_session_expired' using errcode = '42501';
    end if;
    if requested_result_expires_at is null or requested_result_expires_at <= now() then
      raise exception 'verification_result_expiry_required' using errcode = '22023';
    end if;
    if not coalesce(requested_liveness_passed, false) or not coalesce(requested_risk_screen_passed, false) then
      raise exception 'verification_checks_incomplete' using errcode = '42501';
    end if;

    if session_row.target_level = 'v3' then
      if not private.verification_is_current(session_row.user_id, 'v2') then
        raise exception 'v2_verification_required' using errcode = '42501';
      end if;

      select performer.*
      into performer_row
      from public.performer_records performer
      where performer.user_id = session_row.user_id;

      if performer_row.user_id is null
         or not performer_row.active
         or performer_row.liveness_expires_at is null
         or performer_row.liveness_expires_at <= now()
         or not performer_row.payout_ownership_verified
         or not private.has_current_consent_education(session_row.user_id) then
        raise exception 'v3_prerequisites_incomplete' using errcode = '42501';
      end if;
    end if;
  end if;

  update public.verification_sessions
  set status = decision,
      liveness_passed = requested_liveness_passed,
      risk_screen_passed = requested_risk_screen_passed,
      result_expires_at = case when decision = 'verified' then requested_result_expires_at else null end,
      completed_at = case when decision in ('verified', 'rejected') then now() else null end,
      reviewed_by = auth.uid(),
      updated_at = now()
  where id = target_session_id;

  insert into public.verification_subjects(
    user_id,
    level,
    status,
    verified_at,
    expires_at,
    recheck_reason,
    reviewed_by,
    reviewed_at
  ) values (
    session_row.user_id,
    session_row.target_level,
    decision,
    case when decision = 'verified' then now() else null end,
    case when decision = 'verified' then requested_result_expires_at else null end,
    normalized_reason,
    auth.uid(),
    now()
  )
  on conflict (user_id, level) do update
    set status = excluded.status,
        verified_at = excluded.verified_at,
        expires_at = excluded.expires_at,
        recheck_reason = excluded.recheck_reason,
        reviewed_by = excluded.reviewed_by,
        reviewed_at = excluded.reviewed_at,
        updated_at = now();

  perform private.write_audit(
    auth.uid(),
    'verification_result_applied',
    'success',
    'verification-review',
    null,
    jsonb_build_object(
      'target_user_id', session_row.user_id,
      'target_level', session_row.target_level,
      'decision', decision,
      'session_id', session_row.id,
      'provider_key', session_row.provider_key,
      'synthetic', session_row.synthetic
    )
  );

  return session_row.target_level;
end;
$$;

create or replace function public.review_verification_state(
  target_user_id uuid,
  target_level public.verification_level,
  decision public.verification_status,
  requested_reason text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  normalized_reason text := trim(requested_reason);
begin
  perform private.assert_verification_reviewer();

  if target_level not in ('v2', 'v3') or decision not in ('expired', 'revoked') then
    raise exception 'invalid_verification_state_review' using errcode = '22023';
  end if;

  if normalized_reason is null
     or normalized_reason = ''
     or char_length(normalized_reason) > 240
     or normalized_reason ~ '[[:cntrl:]]' then
    raise exception 'verification_review_reason_required' using errcode = '22023';
  end if;

  update public.verification_subjects
  set status = decision,
      expires_at = case when decision = 'expired' then least(coalesce(expires_at, now()), now()) else expires_at end,
      recheck_reason = normalized_reason,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where user_id = target_user_id
    and level = target_level;

  if not found then
    raise exception 'verification_subject_not_found' using errcode = '22023';
  end if;

  perform private.write_audit(
    auth.uid(),
    'verification_state_reviewed',
    'success',
    'verification-review',
    null,
    jsonb_build_object(
      'target_user_id', target_user_id,
      'target_level', target_level,
      'decision', decision,
      'reason', normalized_reason
    )
  );

  return true;
end;
$$;

create or replace function public.get_my_verification_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v2_row public.verification_subjects%rowtype;
  v3_row public.verification_subjects%rowtype;
  performer_row public.performer_records%rowtype;
  consent_current boolean := false;
begin
  perform private.assert_current_session();

  select subject.* into v2_row
  from public.verification_subjects subject
  where subject.user_id = auth.uid() and subject.level = 'v2';

  select subject.* into v3_row
  from public.verification_subjects subject
  where subject.user_id = auth.uid() and subject.level = 'v3';

  select performer.* into performer_row
  from public.performer_records performer
  where performer.user_id = auth.uid();

  consent_current := private.has_current_consent_education(auth.uid());

  return jsonb_build_object(
    'v1', jsonb_build_object(
      'current', private.has_accepted_age_record(auth.uid())
    ),
    'v2', jsonb_build_object(
      'status', coalesce(v2_row.status::text, 'not_started'),
      'current', private.verification_is_current(auth.uid(), 'v2'),
      'verifiedAt', v2_row.verified_at,
      'expiresAt', v2_row.expires_at,
      'recheckReason', v2_row.recheck_reason
    ),
    'v3', jsonb_build_object(
      'status', coalesce(v3_row.status::text, 'not_started'),
      'current', private.verification_is_current(auth.uid(), 'v3'),
      'verifiedAt', v3_row.verified_at,
      'expiresAt', v3_row.expires_at,
      'recheckReason', v3_row.recheck_reason,
      'prerequisites', jsonb_build_object(
        'v2Current', private.verification_is_current(auth.uid(), 'v2'),
        'performerRecordActive', coalesce(performer_row.active, false),
        'livenessCurrent', performer_row.liveness_expires_at is not null and performer_row.liveness_expires_at > now(),
        'payoutOwnershipVerified', coalesce(performer_row.payout_ownership_verified, false),
        'consentEducationAcknowledged', consent_current,
        'consentEducationVersion', private.current_consent_education_version()
      )
    )
  );
end;
$$;

create or replace function public.get_public_verification_badge(profile_handle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  normalized_handle text := lower(trim(profile_handle));
  profile_projection jsonb;
  target_user_id uuid;
  current_level public.verification_level;
begin
  profile_projection := public.get_public_profile(normalized_handle);
  if profile_projection is null then
    return null;
  end if;

  select profile.user_id into target_user_id
  from public.profiles profile
  where profile.handle = normalized_handle
  limit 1;

  if target_user_id is null then
    return null;
  end if;

  if private.verification_is_current(target_user_id, 'v3') then
    current_level := 'v3';
  elsif private.verification_is_current(target_user_id, 'v2') then
    current_level := 'v2';
  else
    return null;
  end if;

  return jsonb_build_object('level', current_level, 'verified', true);
end;
$$;

revoke all on function private.current_consent_education_version() from public, anon, authenticated;
revoke all on function private.is_verification_reviewer(uuid) from public, anon, authenticated;
revoke all on function private.assert_verification_reviewer() from public, anon, authenticated;
revoke all on function private.verification_is_current(uuid, public.verification_level) from public, anon, authenticated;
revoke all on function private.has_current_consent_education(uuid) from public, anon, authenticated;

grant execute on function private.is_verification_reviewer(uuid) to authenticated;

revoke all on function public.start_verification(public.verification_level, text, text, timestamptz, boolean) from public, anon;
revoke all on function public.apply_verification_result(uuid, public.verification_status, timestamptz, boolean, boolean, text) from public, anon;
revoke all on function public.set_performer_verification_prerequisites(uuid, boolean, timestamptz, boolean) from public, anon;
revoke all on function public.acknowledge_consent_education(text) from public, anon;
revoke all on function public.review_verification_state(uuid, public.verification_level, public.verification_status, text) from public, anon;
revoke all on function public.get_my_verification_summary() from public, anon;
revoke all on function public.get_public_verification_badge(text) from public;

grant execute on function public.start_verification(public.verification_level, text, text, timestamptz, boolean) to authenticated;
grant execute on function public.apply_verification_result(uuid, public.verification_status, timestamptz, boolean, boolean, text) to authenticated;
grant execute on function public.set_performer_verification_prerequisites(uuid, boolean, timestamptz, boolean) to authenticated;
grant execute on function public.acknowledge_consent_education(text) to authenticated;
grant execute on function public.review_verification_state(uuid, public.verification_level, public.verification_status, text) to authenticated;
grant execute on function public.get_my_verification_summary() to authenticated;
grant execute on function public.get_public_verification_badge(text) to anon, authenticated;

notify pgrst, 'reload schema';
