-- Production provider adapter persistence and normalized callback boundaries.
-- Raw identity documents, card data, and provider secrets are deliberately excluded.

create table public.payment_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  funding_commitment_id uuid not null references public.funding_commitments(id) on delete restrict,
  provider_key text not null,
  checkout_reference text not null,
  idempotency_key text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint payment_checkout_provider_key check (provider_key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  constraint payment_checkout_reference_length check (char_length(checkout_reference) between 3 and 255 and checkout_reference !~ '[[:cntrl:]]'),
  constraint payment_checkout_idempotency_key check (char_length(idempotency_key) between 8 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  unique(provider_key,checkout_reference),
  unique(funding_commitment_id,idempotency_key)
);

create table public.payout_dispatch_receipts (
  id uuid primary key default gen_random_uuid(),
  payout_request_id uuid not null unique references public.payout_requests(id) on delete restrict,
  provider_key text not null,
  provider_payout_ref text,
  idempotency_key text not null,
  state text not null default 'prepared',
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  constraint payout_dispatch_provider_key check (provider_key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  constraint payout_dispatch_provider_ref check (provider_payout_ref is null or (char_length(provider_payout_ref) between 3 and 255 and provider_payout_ref !~ '[[:cntrl:]]')),
  constraint payout_dispatch_idempotency_key check (char_length(idempotency_key) between 8 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  constraint payout_dispatch_state check (state in ('prepared','dispatched')),
  constraint payout_dispatch_state_shape check (
    (state='prepared' and provider_payout_ref is null and dispatched_at is null)
    or (state='dispatched' and provider_payout_ref is not null and dispatched_at is not null)
  ),
  unique(provider_key,provider_payout_ref)
);

create table public.payout_dispatch_events (
  id bigint generated always as identity primary key,
  payout_dispatch_receipt_id uuid not null references public.payout_dispatch_receipts(id) on delete restrict,
  event_type text not null check (event_type in ('prepared','dispatched')),
  provider_payout_ref text,
  created_at timestamptz not null default now(),
  constraint payout_dispatch_event_provider_ref check (
    provider_payout_ref is null
    or (char_length(provider_payout_ref) between 3 and 255 and provider_payout_ref !~ '[[:cntrl:]]')
  ),
  constraint payout_dispatch_event_shape check (
    (event_type='prepared' and provider_payout_ref is null)
    or (event_type='dispatched' and provider_payout_ref is not null)
  )
);

create table public.age_assurance_provider_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_key text not null,
  provider_reference text not null,
  jurisdiction_code text not null,
  policy_version text not null,
  state text not null default 'pending',
  session_expires_at timestamptz not null,
  result_expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint age_provider_key check (provider_key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  constraint age_provider_reference check (char_length(provider_reference) between 3 and 512 and provider_reference !~ '[[:cntrl:]]'),
  constraint age_provider_jurisdiction check (jurisdiction_code ~ '^[A-Z]{2}$'),
  constraint age_provider_policy check (char_length(policy_version) between 3 and 80 and policy_version ~ '^[A-Za-z0-9._-]+$'),
  constraint age_provider_state check (state in ('pending','accepted','rejected','expired')),
  unique(provider_key,provider_reference)
);

create table public.age_assurance_provider_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.age_assurance_provider_sessions(id) on delete restrict,
  provider_key text not null,
  event_id text not null,
  payload_hash text not null,
  normalized_status text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint age_provider_event_key check (provider_key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  constraint age_provider_event_id check (char_length(event_id) between 3 and 255 and event_id !~ '[[:cntrl:]]'),
  constraint age_provider_event_hash check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint age_provider_event_status check (normalized_status in ('accepted','rejected')),
  unique(provider_key,event_id)
);

create table public.verification_provider_events (
  id uuid primary key default gen_random_uuid(),
  verification_session_id uuid not null references public.verification_sessions(id) on delete restrict,
  provider_key text not null,
  event_id text not null,
  payload_hash text not null,
  normalized_status public.verification_status not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint verification_provider_event_key check (provider_key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  constraint verification_provider_event_id check (char_length(event_id) between 3 and 255 and event_id !~ '[[:cntrl:]]'),
  constraint verification_provider_event_hash check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint verification_provider_event_status check (normalized_status in ('pending','needs_review','verified','rejected')),
  unique(provider_key,event_id)
);

create index payment_checkout_commitment_created_idx on public.payment_checkout_sessions(funding_commitment_id,created_at desc);
create index payout_dispatch_request_created_idx on public.payout_dispatch_receipts(payout_request_id,created_at desc);
create index age_provider_sessions_user_created_idx on public.age_assurance_provider_sessions(user_id,created_at desc);
create index verification_provider_events_session_created_idx on public.verification_provider_events(verification_session_id,created_at desc);

alter table public.payment_checkout_sessions enable row level security;
alter table public.payout_dispatch_receipts enable row level security;
alter table public.payout_dispatch_events enable row level security;
alter table public.age_assurance_provider_sessions enable row level security;
alter table public.age_assurance_provider_events enable row level security;
alter table public.verification_provider_events enable row level security;

revoke all on public.payment_checkout_sessions from public,anon,authenticated;
revoke all on public.payout_dispatch_receipts from public,anon,authenticated;
revoke all on public.payout_dispatch_events from public,anon,authenticated;
revoke all on public.age_assurance_provider_sessions from public,anon,authenticated;
revoke all on public.age_assurance_provider_events from public,anon,authenticated;
revoke all on public.verification_provider_events from public,anon,authenticated;

create trigger payout_dispatch_events_immutable
before update or delete on public.payout_dispatch_events
for each row execute function private.reject_finance_history_mutation();

create trigger age_assurance_provider_events_immutable
before update or delete on public.age_assurance_provider_events
for each row execute function private.reject_admin_history_mutation();

create trigger verification_provider_events_immutable
before update or delete on public.verification_provider_events
for each row execute function private.reject_admin_history_mutation();

create or replace function public.record_payment_checkout_session(
  requested_commitment_public_id text,
  requested_provider_key text,
  requested_checkout_reference text,
  requested_expires_at timestamptz,
  requested_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare commitment_row public.funding_commitments%rowtype;
declare existing_row public.payment_checkout_sessions%rowtype;
declare created_row public.payment_checkout_sessions%rowtype;
declare normalized_provider text:=lower(trim(coalesce(requested_provider_key,'')));
declare normalized_reference text:=trim(coalesce(requested_checkout_reference,''));
declare normalized_key text:=trim(coalesce(requested_idempotency_key,''));
begin
  perform private.assert_adult_profile_action();
  select * into commitment_row
  from public.funding_commitments
  where public_id=trim(coalesce(requested_commitment_public_id,''))
    and supporter_user_id=auth.uid()
  for update;

  if commitment_row.id is null
     or normalized_provider !~ '^[a-z0-9][a-z0-9_-]{1,63}$'
     or char_length(normalized_reference) not between 3 and 255
     or normalized_reference ~ '[[:cntrl:]]'
     or requested_expires_at is null or requested_expires_at<=now() or requested_expires_at>now()+interval '24 hours'
     or char_length(normalized_key) not between 8 and 128
     or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception 'invalid_payment_checkout_session' using errcode='22023';
  end if;

  if exists (
    select 1 from public.payment_transactions transaction
    where transaction.funding_commitment_id=commitment_row.id
      and transaction.state in ('authorized','captured','partially_refunded','refunded')
  ) then
    raise exception 'payment_checkout_not_allowed' using errcode='42501';
  end if;

  select * into existing_row
  from public.payment_checkout_sessions
  where funding_commitment_id=commitment_row.id and idempotency_key=normalized_key;

  if existing_row.id is not null then
    if existing_row.provider_key<>normalized_provider
       or existing_row.checkout_reference<>normalized_reference
       or existing_row.expires_at<>requested_expires_at then
      raise exception 'payment_checkout_idempotency_conflict' using errcode='40001';
    end if;
    return jsonb_build_object('providerKey',existing_row.provider_key,'checkoutReference',existing_row.checkout_reference,'expiresAt',existing_row.expires_at);
  end if;

  insert into public.payment_checkout_sessions(
    funding_commitment_id,provider_key,checkout_reference,idempotency_key,expires_at
  ) values (
    commitment_row.id,normalized_provider,normalized_reference,normalized_key,requested_expires_at
  ) returning * into created_row;

  perform private.write_audit(
    auth.uid(),'payment_checkout_started','success','/app/funding/'||commitment_row.public_id,
    private.current_active_role(auth.uid()),
    jsonb_build_object('commitmentPublicId',commitment_row.public_id,'providerKey',normalized_provider)
  );

  return jsonb_build_object('providerKey',created_row.provider_key,'checkoutReference',created_row.checkout_reference,'expiresAt',created_row.expires_at);
end;
$$;

create or replace function public.assert_initial_payment_provider_event(
  requested_commitment_public_id text,
  requested_provider_key text,
  requested_state text,
  requested_authorized_minor bigint,
  requested_captured_minor bigint,
  requested_occurred_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare commitment_row public.funding_commitments%rowtype;
declare checkout_row public.payment_checkout_sessions%rowtype;
declare normalized_provider text:=lower(trim(coalesce(requested_provider_key,'')));
declare normalized_state text:=lower(trim(coalesce(requested_state,'')));
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'payment_provider_event_not_allowed' using errcode='42501';
  end if;

  select * into commitment_row
  from public.funding_commitments
  where public_id=trim(coalesce(requested_commitment_public_id,''));

  if commitment_row.id is null
     or normalized_provider !~ '^[a-z0-9][a-z0-9_-]{1,63}$'
     or normalized_state not in ('authorized','captured','failed')
     or requested_occurred_at is null then
    raise exception 'invalid_initial_payment_provider_event' using errcode='22023';
  end if;

  select * into checkout_row
  from public.payment_checkout_sessions
  where funding_commitment_id=commitment_row.id
    and provider_key=normalized_provider
    and expires_at>=requested_occurred_at
  order by created_at desc
  limit 1;

  if checkout_row.id is null then
    raise exception 'payment_checkout_not_found' using errcode='42501';
  end if;

  if normalized_state='authorized'
     and (requested_authorized_minor<>commitment_row.amount_minor or requested_captured_minor<>0) then
    raise exception 'payment_amount_mismatch' using errcode='42501';
  elsif normalized_state='captured'
     and (requested_authorized_minor<>commitment_row.amount_minor or requested_captured_minor<>commitment_row.amount_minor) then
    raise exception 'payment_amount_mismatch' using errcode='42501';
  elsif normalized_state='failed'
     and (coalesce(requested_authorized_minor,0)<>0 or coalesce(requested_captured_minor,0)<>0) then
    raise exception 'payment_amount_mismatch' using errcode='42501';
  end if;

  return true;
end;
$$;

create or replace function public.prepare_payout_dispatch(
  requested_payout_public_id text,
  requested_provider_key text,
  requested_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare payout_row public.payout_requests%rowtype;
declare receipt_row public.payout_dispatch_receipts%rowtype;
declare normalized_provider text:=lower(trim(coalesce(requested_provider_key,'')));
declare normalized_key text:=trim(coalesce(requested_idempotency_key,''));
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'payout_dispatch_not_allowed' using errcode='42501';
  end if;

  select * into payout_row
  from public.payout_requests
  where public_id=trim(coalesce(requested_payout_public_id,''))
  for update;

  if payout_row.id is null or payout_row.state<>'processing'
     or normalized_provider !~ '^[a-z0-9][a-z0-9_-]{1,63}$'
     or char_length(normalized_key) not between 8 and 128
     or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception 'invalid_payout_dispatch' using errcode='22023';
  end if;

  select * into receipt_row
  from public.payout_dispatch_receipts
  where payout_request_id=payout_row.id
  for update;

  if receipt_row.id is not null then
    if receipt_row.provider_key<>normalized_provider or receipt_row.idempotency_key<>normalized_key then
      raise exception 'payout_dispatch_already_prepared' using errcode='40001';
    end if;
    return jsonb_build_object(
      'payoutPublicId',payout_row.public_id,
      'providerKey',receipt_row.provider_key,
      'state',receipt_row.state,
      'providerPayoutRef',receipt_row.provider_payout_ref
    );
  end if;

  insert into public.payout_dispatch_receipts(
    payout_request_id,provider_key,idempotency_key,state
  ) values (
    payout_row.id,normalized_provider,normalized_key,'prepared'
  ) returning * into receipt_row;

  insert into public.payout_dispatch_events(payout_dispatch_receipt_id,event_type,provider_payout_ref)
  values(receipt_row.id,'prepared',null);

  perform private.write_audit(
    null,'payout_dispatch_prepared','success','finance-payouts',null,
    jsonb_build_object('payoutPublicId',payout_row.public_id,'providerKey',normalized_provider)
  );

  return jsonb_build_object(
    'payoutPublicId',payout_row.public_id,
    'providerKey',receipt_row.provider_key,
    'state',receipt_row.state,
    'providerPayoutRef',null
  );
end;
$$;

create or replace function public.complete_payout_dispatch(
  requested_payout_public_id text,
  requested_provider_key text,
  requested_provider_payout_ref text,
  requested_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare payout_row public.payout_requests%rowtype;
declare receipt_row public.payout_dispatch_receipts%rowtype;
declare normalized_provider text:=lower(trim(coalesce(requested_provider_key,'')));
declare normalized_ref text:=trim(coalesce(requested_provider_payout_ref,''));
declare normalized_key text:=trim(coalesce(requested_idempotency_key,''));
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'payout_dispatch_not_allowed' using errcode='42501';
  end if;

  select * into payout_row
  from public.payout_requests
  where public_id=trim(coalesce(requested_payout_public_id,''))
  for update;

  if payout_row.id is null or payout_row.state<>'processing'
     or normalized_provider !~ '^[a-z0-9][a-z0-9_-]{1,63}$'
     or char_length(normalized_ref) not between 3 and 255
     or char_length(normalized_key) not between 8 and 128
     or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception 'invalid_payout_dispatch' using errcode='22023';
  end if;

  select * into receipt_row
  from public.payout_dispatch_receipts
  where payout_request_id=payout_row.id
  for update;

  if receipt_row.id is null
     or receipt_row.provider_key<>normalized_provider
     or receipt_row.idempotency_key<>normalized_key then
    raise exception 'payout_dispatch_not_prepared' using errcode='40001';
  end if;

  if receipt_row.state='dispatched' then
    if receipt_row.provider_payout_ref<>normalized_ref then
      raise exception 'payout_dispatch_idempotency_conflict' using errcode='40001';
    end if;
    return jsonb_build_object(
      'payoutPublicId',payout_row.public_id,
      'providerKey',receipt_row.provider_key,
      'providerPayoutRef',receipt_row.provider_payout_ref,
      'state',receipt_row.state
    );
  end if;

  update public.payout_dispatch_receipts
  set provider_payout_ref=normalized_ref,
      state='dispatched',
      dispatched_at=now()
  where id=receipt_row.id
  returning * into receipt_row;

  insert into public.payout_dispatch_events(payout_dispatch_receipt_id,event_type,provider_payout_ref)
  values(receipt_row.id,'dispatched',receipt_row.provider_payout_ref);

  perform private.write_audit(
    null,'payout_dispatched','success','finance-payouts',null,
    jsonb_build_object('payoutPublicId',payout_row.public_id,'providerKey',normalized_provider)
  );

  return jsonb_build_object(
    'payoutPublicId',payout_row.public_id,
    'providerKey',receipt_row.provider_key,
    'providerPayoutRef',receipt_row.provider_payout_ref,
    'state',receipt_row.state
  );
end;
$$;

create or replace function public.apply_verified_payout_provider_event(
  requested_payout_public_id text,
  requested_provider_key text,
  requested_event_id text,
  requested_provider_payout_ref text,
  requested_state text,
  requested_reported_amount_minor bigint,
  requested_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare payout_row public.payout_requests%rowtype;
declare dispatch_row public.payout_dispatch_receipts%rowtype;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'payout_provider_event_not_allowed' using errcode='42501';
  end if;

  select * into payout_row from public.payout_requests
  where public_id=trim(coalesce(requested_payout_public_id,''));

  if payout_row.id is null then raise exception 'unknown_payout' using errcode='22023'; end if;

  select * into dispatch_row
  from public.payout_dispatch_receipts
  where payout_request_id=payout_row.id
    and provider_key=lower(trim(coalesce(requested_provider_key,'')))
    and provider_payout_ref=trim(coalesce(requested_provider_payout_ref,''))
    and state='dispatched'
  order by created_at desc
  limit 1;

  if dispatch_row.id is null then
    raise exception 'payout_provider_event_unmatched' using errcode='42501';
  end if;

  return public.apply_payout_provider_event(
    requested_payout_public_id,
    lower(trim(requested_provider_key)),
    requested_event_id,
    requested_provider_payout_ref,
    requested_state,
    requested_reported_amount_minor,
    requested_occurred_at,
    true
  );
end;
$$;

create or replace function public.start_age_assurance_provider_session(
  requested_provider_key text,
  requested_provider_reference text,
  requested_jurisdiction_code text,
  requested_policy_version text,
  requested_session_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare normalized_provider text:=lower(trim(coalesce(requested_provider_key,'')));
declare normalized_reference text:=trim(coalesce(requested_provider_reference,''));
declare normalized_jurisdiction text:=upper(trim(coalesce(requested_jurisdiction_code,'')));
declare normalized_policy text:=trim(coalesce(requested_policy_version,''));
declare created_id uuid;
begin
  perform private.assert_current_session();

  if auth.uid() is null
     or not exists (
       select 1 from auth.users auth_user
       where auth_user.id=auth.uid() and auth_user.email_confirmed_at is not null
     )
     or normalized_provider !~ '^[a-z0-9][a-z0-9_-]{1,63}$'
     or char_length(normalized_reference) not between 3 and 512
     or normalized_reference ~ '[[:cntrl:]]'
     or normalized_jurisdiction !~ '^[A-Z]{2}$'
     or normalized_policy !~ '^[A-Za-z0-9._-]{3,80}$'
     or requested_session_expires_at is null
     or requested_session_expires_at<=now()
     or requested_session_expires_at>now()+interval '2 hours' then
    raise exception 'invalid_age_provider_session' using errcode='22023';
  end if;

  insert into public.age_assurance_provider_sessions(
    user_id,provider_key,provider_reference,jurisdiction_code,policy_version,session_expires_at
  ) values (
    auth.uid(),normalized_provider,normalized_reference,normalized_jurisdiction,normalized_policy,requested_session_expires_at
  ) returning id into created_id;

  perform private.write_audit(
    auth.uid(),'age_provider_session_started','success','age-assurance',null,
    jsonb_build_object('providerKey',normalized_provider,'sessionId',created_id,'jurisdictionCode',normalized_jurisdiction)
  );

  return created_id;
end;
$$;

create or replace function public.apply_age_assurance_provider_event(
  requested_provider_key text,
  requested_event_id text,
  requested_provider_reference text,
  requested_subject_user_id uuid,
  requested_jurisdiction_code text,
  requested_status text,
  requested_result_expires_at timestamptz,
  requested_occurred_at timestamptz,
  requested_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare session_row public.age_assurance_provider_sessions%rowtype;
declare existing_event public.age_assurance_provider_events%rowtype;
declare normalized_provider text:=lower(trim(coalesce(requested_provider_key,'')));
declare normalized_event text:=trim(coalesce(requested_event_id,''));
declare normalized_reference text:=trim(coalesce(requested_provider_reference,''));
declare normalized_jurisdiction text:=upper(trim(coalesce(requested_jurisdiction_code,'')));
declare normalized_status text:=lower(trim(coalesce(requested_status,'')));
declare normalized_hash text:=lower(trim(coalesce(requested_payload_hash,'')));
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'age_provider_event_not_allowed' using errcode='42501';
  end if;

  if normalized_provider !~ '^[a-z0-9][a-z0-9_-]{1,63}$'
     or char_length(normalized_event) not between 3 and 255
     or char_length(normalized_reference) not between 3 and 512
     or requested_subject_user_id is null
     or normalized_jurisdiction !~ '^[A-Z]{2}$'
     or normalized_status not in ('accepted','rejected')
     or normalized_hash !~ '^[0-9a-f]{64}$'
     or requested_occurred_at is null then
    raise exception 'invalid_age_provider_event' using errcode='22023';
  end if;

  select * into existing_event
  from public.age_assurance_provider_events
  where provider_key=normalized_provider and event_id=normalized_event;

  if existing_event.id is not null then
    if existing_event.payload_hash<>normalized_hash then
      raise exception 'age_provider_event_conflict' using errcode='40001';
    end if;
    select * into session_row from public.age_assurance_provider_sessions where id=existing_event.session_id;
    return jsonb_build_object('sessionId',session_row.id,'state',session_row.state,'replayed',true);
  end if;

  select * into session_row
  from public.age_assurance_provider_sessions
  where provider_key=normalized_provider
    and provider_reference=normalized_reference
    and user_id=requested_subject_user_id
  for update;

  if session_row.id is null
     or session_row.jurisdiction_code<>normalized_jurisdiction
     or session_row.state<>'pending'
     or session_row.session_expires_at<requested_occurred_at then
    raise exception 'age_provider_session_not_applicable' using errcode='42501';
  end if;

  if normalized_status='accepted'
     and (requested_result_expires_at is null or requested_result_expires_at<=requested_occurred_at) then
    raise exception 'age_provider_expiry_required' using errcode='22023';
  end if;

  insert into public.age_assurance_records(
    user_id,method,status,jurisdiction_code,policy_version,assured_at,expires_at
  ) values (
    session_row.user_id,'provider',normalized_status::public.age_assurance_status,
    session_row.jurisdiction_code,session_row.policy_version,requested_occurred_at,
    case when normalized_status='accepted' then requested_result_expires_at else null end
  );

  update public.age_assurance_provider_sessions
  set state=normalized_status,
      result_expires_at=case when normalized_status='accepted' then requested_result_expires_at else null end,
      completed_at=now(),
      updated_at=now()
  where id=session_row.id;

  insert into public.age_assurance_provider_events(
    session_id,provider_key,event_id,payload_hash,normalized_status,occurred_at
  ) values (
    session_row.id,normalized_provider,normalized_event,normalized_hash,normalized_status,requested_occurred_at
  );

  perform private.write_audit(
    null,'age_provider_result_applied','success','age-assurance',null,
    jsonb_build_object('targetUserId',session_row.user_id,'providerKey',normalized_provider,'status',normalized_status,'jurisdictionCode',normalized_jurisdiction)
  );

  return jsonb_build_object('sessionId',session_row.id,'state',normalized_status,'replayed',false);
end;
$$;

create or replace function public.apply_verification_provider_event(
  requested_provider_key text,
  requested_event_id text,
  requested_provider_reference text,
  requested_status text,
  requested_liveness_passed boolean,
  requested_risk_screen_passed boolean,
  requested_result_expires_at timestamptz,
  requested_occurred_at timestamptz,
  requested_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare session_row public.verification_sessions%rowtype;
declare existing_event public.verification_provider_events%rowtype;
declare performer_row public.performer_records%rowtype;
declare normalized_provider text:=lower(trim(coalesce(requested_provider_key,'')));
declare normalized_event text:=trim(coalesce(requested_event_id,''));
declare normalized_reference text:=trim(coalesce(requested_provider_reference,''));
declare normalized_status text:=lower(trim(coalesce(requested_status,'')));
declare normalized_hash text:=lower(trim(coalesce(requested_payload_hash,'')));
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'verification_provider_event_not_allowed' using errcode='42501';
  end if;

  if normalized_provider !~ '^[a-z0-9][a-z0-9_-]{1,63}$'
     or char_length(normalized_event) not between 3 and 255
     or char_length(normalized_reference) not between 3 and 512
     or normalized_status not in ('pending','needs_review','verified','rejected')
     or normalized_hash !~ '^[0-9a-f]{64}$'
     or requested_occurred_at is null then
    raise exception 'invalid_verification_provider_event' using errcode='22023';
  end if;

  select * into existing_event
  from public.verification_provider_events
  where provider_key=normalized_provider and event_id=normalized_event;

  if existing_event.id is not null then
    if existing_event.payload_hash<>normalized_hash then
      raise exception 'verification_provider_event_conflict' using errcode='40001';
    end if;
    return jsonb_build_object('sessionId',existing_event.verification_session_id,'state',existing_event.normalized_status,'replayed',true);
  end if;

  select * into session_row
  from public.verification_sessions
  where provider_key=normalized_provider
    and provider_reference=normalized_reference
    and synthetic=false
  for update;

  if session_row.id is null then
    raise exception 'verification_provider_session_not_found' using errcode='22023';
  end if;

  if session_row.completed_at is not null then
    raise exception 'verification_session_completed' using errcode='42501';
  end if;

  if normalized_status='verified' then
    if session_row.session_expires_at<requested_occurred_at
       or requested_result_expires_at is null
       or requested_result_expires_at<=requested_occurred_at
       or requested_liveness_passed is distinct from true
       or requested_risk_screen_passed is distinct from true then
      raise exception 'verification_provider_checks_incomplete' using errcode='42501';
    end if;

    if session_row.target_level='v3' then
      if not private.verification_is_current(session_row.user_id,'v2') then
        raise exception 'v2_verification_required' using errcode='42501';
      end if;
      select * into performer_row from public.performer_records where user_id=session_row.user_id;
      if performer_row.user_id is null
         or not performer_row.active
         or performer_row.liveness_expires_at is null
         or performer_row.liveness_expires_at<=now()
         or not performer_row.payout_ownership_verified
         or not private.has_current_consent_education(session_row.user_id) then
        raise exception 'v3_prerequisites_incomplete' using errcode='42501';
      end if;
    end if;
  end if;

  update public.verification_sessions
  set status=normalized_status::public.verification_status,
      liveness_passed=requested_liveness_passed,
      risk_screen_passed=requested_risk_screen_passed,
      result_expires_at=case when normalized_status='verified' then requested_result_expires_at else null end,
      completed_at=case when normalized_status in ('verified','rejected') then now() else null end,
      reviewed_by=null,
      updated_at=now()
  where id=session_row.id;

  if normalized_status<>'pending' then
    insert into public.verification_subjects(
      user_id,level,status,verified_at,expires_at,recheck_reason,reviewed_by,reviewed_at
    ) values (
      session_row.user_id,session_row.target_level,normalized_status::public.verification_status,
      case when normalized_status='verified' then now() else null end,
      case when normalized_status='verified' then requested_result_expires_at else null end,
      case when normalized_status='needs_review' then 'provider_review_required' else null end,
      null,now()
    )
    on conflict(user_id,level) do update
    set status=excluded.status,
        verified_at=excluded.verified_at,
        expires_at=excluded.expires_at,
        recheck_reason=excluded.recheck_reason,
        reviewed_by=null,
        reviewed_at=now(),
        updated_at=now();
  end if;

  insert into public.verification_provider_events(
    verification_session_id,provider_key,event_id,payload_hash,normalized_status,occurred_at
  ) values (
    session_row.id,normalized_provider,normalized_event,normalized_hash,normalized_status::public.verification_status,requested_occurred_at
  );

  perform private.write_audit(
    null,'verification_provider_result_applied','success','verification-provider',null,
    jsonb_build_object(
      'targetUserId',session_row.user_id,'targetLevel',session_row.target_level,
      'providerKey',normalized_provider,'status',normalized_status,'sessionId',session_row.id
    )
  );

  return jsonb_build_object('sessionId',session_row.id,'state',normalized_status,'replayed',false);
end;
$$;

comment on table public.payout_dispatch_events is
  'Immutable provider payout dispatch history. The mutable dispatch receipt only tracks prepared-to-dispatched state.';

comment on table public.payment_checkout_sessions is
  'Opaque provider checkout session receipts. No card data or hosted checkout URLs are persisted.';
comment on table public.age_assurance_provider_events is
  'Normalized age-assurance callback receipts only. Raw identity/age evidence must never be stored here.';
comment on table public.verification_provider_events is
  'Normalized identity-provider callback receipts only. Raw identity documents and biometric evidence are excluded.';

revoke all on function public.record_payment_checkout_session(text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.record_payment_checkout_session(text,text,text,timestamptz,text) to authenticated;

revoke all on function public.assert_initial_payment_provider_event(text,text,text,bigint,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.assert_initial_payment_provider_event(text,text,text,bigint,bigint,timestamptz) to service_role;

revoke all on function public.prepare_payout_dispatch(text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_payout_dispatch(text,text,text) to service_role;

revoke all on function public.complete_payout_dispatch(text,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_payout_dispatch(text,text,text,text) to service_role;

revoke all on function public.apply_verified_payout_provider_event(text,text,text,text,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_verified_payout_provider_event(text,text,text,text,text,bigint,timestamptz) to service_role;

revoke all on function public.start_age_assurance_provider_session(text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.start_age_assurance_provider_session(text,text,text,text,timestamptz) to authenticated;

revoke all on function public.apply_age_assurance_provider_event(text,text,text,uuid,text,text,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.apply_age_assurance_provider_event(text,text,text,uuid,text,text,timestamptz,timestamptz,text) to service_role;

revoke all on function public.apply_verification_provider_event(text,text,text,text,boolean,boolean,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.apply_verification_provider_event(text,text,text,text,boolean,boolean,timestamptz,timestamptz,text) to service_role;

notify pgrst,'reload schema';
