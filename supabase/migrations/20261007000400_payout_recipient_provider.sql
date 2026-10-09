-- Provider-backed payout recipient onboarding and ownership verification.

create table public.payout_recipient_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider_key text not null,
  recipient_reference text not null,
  state text not null default 'pending',
  ownership_verified boolean not null default false,
  onboarding_expires_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payout_recipient_provider_key check (provider_key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  constraint payout_recipient_reference check (char_length(recipient_reference) between 3 and 255 and recipient_reference !~ '[[:cntrl:]]'),
  constraint payout_recipient_state check (state in ('pending','verified','restricted')),
  constraint payout_recipient_state_shape check (
    (state='verified' and ownership_verified and verified_at is not null)
    or (state<>'verified' and not ownership_verified)
  ),
  unique(provider_key,recipient_reference)
);

create table public.payout_recipient_provider_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  provider_key text not null,
  event_id text not null,
  payload_hash text not null,
  normalized_state text not null,
  ownership_verified boolean not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint payout_recipient_event_provider_key check (provider_key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  constraint payout_recipient_event_id check (char_length(event_id) between 3 and 255 and event_id !~ '[[:cntrl:]]'),
  constraint payout_recipient_event_hash check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint payout_recipient_event_state check (normalized_state in ('verified','restricted')),
  unique(provider_key,event_id)
);

create index payout_recipient_state_updated_idx on public.payout_recipient_accounts(state,updated_at desc);
create index payout_recipient_events_user_created_idx on public.payout_recipient_provider_events(user_id,created_at desc);

alter table public.payout_recipient_accounts enable row level security;
alter table public.payout_recipient_provider_events enable row level security;

revoke all on public.payout_recipient_accounts from public,anon,authenticated;
revoke all on public.payout_recipient_provider_events from public,anon,authenticated;

create trigger payout_recipient_provider_events_immutable
before update or delete on public.payout_recipient_provider_events
for each row execute function private.reject_finance_history_mutation();

create or replace function private.verification_is_current(
  subject_user_id uuid,
  requested_level public.verification_level
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,private
as $$
  select requested_level in ('v2','v3')
    and exists (
      select 1
      from public.verification_subjects subject
      where subject.user_id=subject_user_id
        and subject.level=requested_level
        and subject.status='verified'
        and (subject.expires_at is null or subject.expires_at>now())
    )
    and (
      requested_level='v2'
      or (
        exists (
          select 1
          from public.verification_subjects v2
          where v2.user_id=subject_user_id
            and v2.level='v2'
            and v2.status='verified'
            and (v2.expires_at is null or v2.expires_at>now())
        )
        and exists (
          select 1
          from public.performer_records performer
          where performer.user_id=subject_user_id
            and performer.active
            and performer.liveness_expires_at is not null
            and performer.liveness_expires_at>now()
            and performer.payout_ownership_verified
        )
        and private.has_current_consent_education(subject_user_id)
      )
    );
$$;

create or replace function private.user_payout_verified(subject_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,private
as $$
  select private.verification_is_current(subject_user_id,'v2')
    and exists (
      select 1
      from public.payout_recipient_accounts recipient
      where recipient.user_id=subject_user_id
        and recipient.state='verified'
        and recipient.ownership_verified
        and recipient.verified_at is not null
    );
$$;

create or replace function public.start_payout_recipient_onboarding(
  requested_provider_key text,
  requested_recipient_reference text,
  requested_onboarding_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare normalized_provider text:=lower(trim(coalesce(requested_provider_key,'')));
declare normalized_reference text:=trim(coalesce(requested_recipient_reference,''));
declare account_row public.payout_recipient_accounts%rowtype;
begin
  perform private.assert_adult_profile_action();

  if not private.verification_is_current(auth.uid(),'v2') then
    raise exception 'v2_verification_required' using errcode='42501';
  end if;

  if normalized_provider !~ '^[a-z0-9][a-z0-9_-]{1,63}$'
     or char_length(normalized_reference) not between 3 and 255
     or normalized_reference ~ '[[:cntrl:]]'
     or requested_onboarding_expires_at is null
     or requested_onboarding_expires_at<=now()
     or requested_onboarding_expires_at>now()+interval '24 hours' then
    raise exception 'invalid_payout_recipient_onboarding' using errcode='22023';
  end if;

  insert into public.payout_recipient_accounts(
    user_id,provider_key,recipient_reference,state,ownership_verified,onboarding_expires_at,verified_at
  ) values (
    auth.uid(),normalized_provider,normalized_reference,'pending',false,requested_onboarding_expires_at,null
  )
  on conflict(user_id) do update
  set provider_key=excluded.provider_key,
      recipient_reference=excluded.recipient_reference,
      state='pending',
      ownership_verified=false,
      onboarding_expires_at=excluded.onboarding_expires_at,
      verified_at=null,
      updated_at=now()
  returning * into account_row;

  insert into public.performer_records(user_id,active,payout_ownership_verified,payout_ownership_checked_at)
  values(auth.uid(),false,false,now())
  on conflict(user_id) do update
  set payout_ownership_verified=false,
      payout_ownership_checked_at=now(),
      updated_at=now();

  perform private.write_audit(
    auth.uid(),'payout_recipient_onboarding_started','success','/app/earnings',
    private.current_active_role(auth.uid()),
    jsonb_build_object('providerKey',normalized_provider,'state','pending')
  );

  return jsonb_build_object(
    'providerKey',account_row.provider_key,
    'state',account_row.state,
    'ownershipVerified',account_row.ownership_verified,
    'onboardingExpiresAt',account_row.onboarding_expires_at
  );
end;
$$;

create or replace function public.apply_payout_recipient_provider_event(
  requested_provider_key text,
  requested_event_id text,
  requested_subject_user_id uuid,
  requested_recipient_reference text,
  requested_state text,
  requested_ownership_verified boolean,
  requested_occurred_at timestamptz,
  requested_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare account_row public.payout_recipient_accounts%rowtype;
declare event_row public.payout_recipient_provider_events%rowtype;
declare normalized_provider text:=lower(trim(coalesce(requested_provider_key,'')));
declare normalized_event text:=trim(coalesce(requested_event_id,''));
declare normalized_reference text:=trim(coalesce(requested_recipient_reference,''));
declare normalized_state text:=lower(trim(coalesce(requested_state,'')));
declare normalized_hash text:=lower(trim(coalesce(requested_payload_hash,'')));
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'payout_recipient_provider_event_not_allowed' using errcode='42501';
  end if;

  if normalized_provider !~ '^[a-z0-9][a-z0-9_-]{1,63}$'
     or char_length(normalized_event) not between 3 and 255
     or requested_subject_user_id is null
     or char_length(normalized_reference) not between 3 and 255
     or normalized_state not in ('verified','restricted')
     or normalized_hash !~ '^[0-9a-f]{64}$'
     or requested_occurred_at is null
     or (normalized_state='verified' and requested_ownership_verified is distinct from true)
     or (normalized_state='restricted' and requested_ownership_verified is distinct from false) then
    raise exception 'invalid_payout_recipient_provider_event' using errcode='22023';
  end if;

  select * into event_row
  from public.payout_recipient_provider_events
  where provider_key=normalized_provider and event_id=normalized_event;

  if event_row.id is not null then
    if event_row.payload_hash<>normalized_hash then
      raise exception 'payout_recipient_provider_event_conflict' using errcode='40001';
    end if;
    return jsonb_build_object('state',event_row.normalized_state,'ownershipVerified',event_row.ownership_verified,'replayed',true);
  end if;

  select * into account_row
  from public.payout_recipient_accounts
  where user_id=requested_subject_user_id
    and provider_key=normalized_provider
    and recipient_reference=normalized_reference
  for update;

  if account_row.user_id is null then
    raise exception 'payout_recipient_account_not_found' using errcode='22023';
  end if;

  if account_row.onboarding_expires_at is not null
     and account_row.state='pending'
     and account_row.onboarding_expires_at<requested_occurred_at then
    raise exception 'payout_recipient_onboarding_expired' using errcode='42501';
  end if;

  update public.payout_recipient_accounts
  set state=normalized_state,
      ownership_verified=requested_ownership_verified,
      verified_at=case when normalized_state='verified' then requested_occurred_at else null end,
      updated_at=now()
  where user_id=account_row.user_id;

  insert into public.performer_records(
    user_id,active,payout_ownership_verified,payout_ownership_checked_at
  ) values (
    account_row.user_id,false,requested_ownership_verified,requested_occurred_at
  )
  on conflict(user_id) do update
  set payout_ownership_verified=excluded.payout_ownership_verified,
      payout_ownership_checked_at=excluded.payout_ownership_checked_at,
      updated_at=now();

  insert into public.payout_recipient_provider_events(
    user_id,provider_key,event_id,payload_hash,normalized_state,ownership_verified,occurred_at
  ) values (
    account_row.user_id,normalized_provider,normalized_event,normalized_hash,
    normalized_state,requested_ownership_verified,requested_occurred_at
  );

  perform private.write_audit(
    null,'payout_recipient_provider_result_applied','success','payout-recipient-provider',null,
    jsonb_build_object(
      'targetUserId',account_row.user_id,'providerKey',normalized_provider,
      'state',normalized_state,'ownershipVerified',requested_ownership_verified
    )
  );

  return jsonb_build_object('state',normalized_state,'ownershipVerified',requested_ownership_verified,'replayed',false);
end;
$$;

create or replace function public.get_my_payout_recipient_status()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare account_row public.payout_recipient_accounts%rowtype;
begin
  perform private.assert_current_session();
  select * into account_row from public.payout_recipient_accounts where user_id=auth.uid();
  if account_row.user_id is null then
    return jsonb_build_object('configured',false,'providerKey',null,'state',null,'ownershipVerified',false);
  end if;
  return jsonb_build_object(
    'configured',true,
    'providerKey',account_row.provider_key,
    'state',account_row.state,
    'ownershipVerified',account_row.ownership_verified,
    'verifiedAt',account_row.verified_at,
    'onboardingExpiresAt',account_row.onboarding_expires_at
  );
end;
$$;

create or replace function public.get_payout_dispatch_context(requested_payout_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare payout_row public.payout_requests%rowtype;
declare recipient_row public.payout_recipient_accounts%rowtype;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'payout_dispatch_context_not_allowed' using errcode='42501';
  end if;

  select * into payout_row from public.payout_requests
  where public_id=trim(coalesce(requested_payout_public_id,''));

  if payout_row.id is null or payout_row.state<>'processing' then
    raise exception 'payout_not_dispatchable' using errcode='42501';
  end if;

  select * into recipient_row from public.payout_recipient_accounts
  where user_id=payout_row.participant_user_id
    and state='verified'
    and ownership_verified=true;

  if recipient_row.user_id is null then
    raise exception 'verified_payout_recipient_required' using errcode='42501';
  end if;

  return jsonb_build_object(
    'payoutPublicId',payout_row.public_id,
    'providerKey',recipient_row.provider_key,
    'recipientReference',recipient_row.recipient_reference,
    'amountMinor',payout_row.amount_minor,
    'currency',payout_row.currency
  );
end;
$$;

comment on table public.payout_recipient_accounts is
  'Server-owned payout recipient references and normalized ownership state. Bank/card account details remain with the payout provider.';
comment on table public.payout_recipient_provider_events is
  'Immutable normalized recipient verification events. Raw KYC or bank evidence is not stored.';

revoke all on function public.start_payout_recipient_onboarding(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.start_payout_recipient_onboarding(text,text,timestamptz) to authenticated;

revoke all on function public.apply_payout_recipient_provider_event(text,text,uuid,text,text,boolean,timestamptz,text) from public,anon,authenticated;
grant execute on function public.apply_payout_recipient_provider_event(text,text,uuid,text,text,boolean,timestamptz,text) to service_role;

revoke all on function public.get_my_payout_recipient_status() from public,anon,authenticated;
grant execute on function public.get_my_payout_recipient_status() to authenticated;

revoke all on function public.get_payout_dispatch_context(text) from public,anon,authenticated;
grant execute on function public.get_payout_dispatch_context(text) to service_role;

notify pgrst,'reload schema';
