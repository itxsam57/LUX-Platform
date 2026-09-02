create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  funding_commitment_id uuid not null unique references public.funding_commitments(id) on delete restrict,
  provider_key text not null,
  provider_customer_ref text not null,
  provider_payment_method_ref text not null,
  provider_transaction_ref text not null unique,
  state text not null,
  requested_minor bigint not null,
  authorized_minor bigint not null default 0,
  captured_minor bigint not null default 0,
  refunded_minor bigint not null default 0,
  currency text not null,
  last_provider_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_provider_key_format check (provider_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$'),
  constraint payment_customer_ref_length check (char_length(provider_customer_ref) between 3 and 255),
  constraint payment_method_ref_length check (char_length(provider_payment_method_ref) between 3 and 255),
  constraint payment_transaction_ref_length check (char_length(provider_transaction_ref) between 3 and 255),
  constraint payment_state_allowed check (state in ('authorized','captured','partially_refunded','refunded','failed')),
  constraint payment_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint payment_amounts_bounded check (
    requested_minor between 1 and 9007199254740991
    and authorized_minor between 0 and requested_minor
    and captured_minor between 0 and authorized_minor
    and refunded_minor between 0 and captured_minor
  )
);

create table public.payment_operation_receipts (
  id uuid primary key default gen_random_uuid(),
  funding_commitment_id uuid not null references public.funding_commitments(id) on delete restrict,
  payment_transaction_id uuid not null references public.payment_transactions(id) on delete restrict,
  idempotency_key text not null,
  request_hash text not null,
  normalized_result jsonb not null,
  created_at timestamptz not null default now(),
  constraint payment_operation_key_format check (
    char_length(idempotency_key) between 8 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint payment_operation_hash_format check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint payment_operation_result_object check (jsonb_typeof(normalized_result) = 'object'),
  unique(funding_commitment_id,idempotency_key)
);

create table public.payment_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  payment_transaction_id uuid not null references public.payment_transactions(id) on delete restrict,
  provider_key text not null,
  event_id text not null,
  provider_transaction_ref text not null,
  payload_hash text not null,
  normalized_state text not null,
  authorized_minor bigint not null,
  captured_minor bigint not null,
  refunded_minor bigint not null,
  occurred_at timestamptz not null,
  ignored boolean not null default false,
  applied_at timestamptz not null default now(),
  constraint payment_webhook_provider_format check (provider_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$'),
  constraint payment_webhook_event_length check (char_length(event_id) between 3 and 255),
  constraint payment_webhook_transaction_ref_length check (char_length(provider_transaction_ref) between 3 and 255),
  constraint payment_webhook_hash_format check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint payment_webhook_state_allowed check (normalized_state in ('authorized','captured','partially_refunded','refunded','failed')),
  constraint payment_webhook_amounts_nonnegative check (authorized_minor >= 0 and captured_minor >= 0 and refunded_minor >= 0),
  unique(provider_key,event_id)
);

create table public.funding_change_requests (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  funding_commitment_id uuid not null references public.funding_commitments(id) on delete restrict,
  kind text not null,
  campaign_term_version_id uuid references public.campaign_term_versions(id) on delete restrict,
  requested_amount_minor bigint,
  state text not null,
  idempotency_key text not null,
  reason text,
  accepted_terms_hash text,
  acceptance_idempotency_key text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint funding_change_public_id_format check (public_id ~ '^chg[0-9a-f]{24}$'),
  constraint funding_change_kind_allowed check (kind in ('material_change','refund')),
  constraint funding_change_state_allowed check (state in ('pending','requested','accepted','cancelled','completed')),
  constraint funding_change_amount_positive check (requested_amount_minor is null or requested_amount_minor between 1 and 9007199254740991),
  constraint funding_change_key_format check (
    char_length(idempotency_key) between 8 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint funding_change_acceptance_key_format check (
    acceptance_idempotency_key is null
    or (
      char_length(acceptance_idempotency_key) between 8 and 128
      and acceptance_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    )
  ),
  constraint funding_change_terms_hash_format check (accepted_terms_hash is null or accepted_terms_hash ~ '^[0-9a-f]{64}$'),
  constraint funding_change_reason_length check (reason is null or char_length(trim(reason)) between 3 and 1000),
  constraint funding_change_shape check (
    (kind = 'refund' and requested_amount_minor is not null and campaign_term_version_id is null)
    or (kind = 'material_change' and requested_amount_minor is null and campaign_term_version_id is not null)
  ),
  unique(funding_commitment_id,idempotency_key),
  unique(funding_commitment_id,acceptance_idempotency_key)
);

create table public.supporter_badges (
  funding_commitment_id uuid primary key references public.funding_commitments(id) on delete cascade,
  badge_key text not null,
  visibility text not null,
  updated_at timestamptz not null default now(),
  constraint supporter_badge_key_format check (
    char_length(badge_key) between 1 and 64
    and badge_key ~ '^[A-Za-z0-9][A-Za-z0-9 ._-]*$'
  ),
  constraint supporter_badge_visibility_allowed check (visibility in ('public','private','hidden'))
);

create index payment_transactions_state_updated_idx on public.payment_transactions(state,updated_at desc);
create index payment_webhooks_transaction_occurred_idx on public.payment_webhook_receipts(payment_transaction_id,occurred_at desc);
create index funding_change_commitment_created_idx on public.funding_change_requests(funding_commitment_id,created_at desc);

alter table public.payment_transactions enable row level security;
alter table public.payment_operation_receipts enable row level security;
alter table public.payment_webhook_receipts enable row level security;
alter table public.funding_change_requests enable row level security;
alter table public.supporter_badges enable row level security;

revoke all on public.payment_transactions from public, anon, authenticated;
revoke all on public.payment_operation_receipts from public, anon, authenticated;
revoke all on public.payment_webhook_receipts from public, anon, authenticated;
revoke all on public.funding_change_requests from public, anon, authenticated;
revoke all on public.supporter_badges from public, anon, authenticated;

create or replace function private.request_is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(),'') = 'service_role';
$$;

create or replace function private.assert_payment_shape(
  requested_state text,
  requested_minor bigint,
  requested_authorized bigint,
  requested_captured bigint,
  requested_refunded bigint
)
returns void
language plpgsql
immutable
as $$
begin
  if requested_state not in ('authorized','captured','partially_refunded','refunded','failed')
     or requested_minor is null or requested_minor < 1 or requested_minor > 9007199254740991
     or requested_authorized is null or requested_authorized < 0 or requested_authorized > requested_minor
     or requested_captured is null or requested_captured < 0 or requested_captured > requested_authorized
     or requested_refunded is null or requested_refunded < 0 or requested_refunded > requested_captured then
    raise exception 'invalid_payment_transition' using errcode = '22023';
  end if;

  if (requested_state = 'authorized' and (requested_authorized = 0 or requested_captured <> 0 or requested_refunded <> 0))
     or (requested_state = 'captured' and (requested_authorized = 0 or requested_captured = 0 or requested_refunded <> 0))
     or (requested_state = 'partially_refunded' and (requested_captured = 0 or requested_refunded = 0 or requested_refunded >= requested_captured))
     or (requested_state = 'refunded' and (requested_captured = 0 or requested_refunded <> requested_captured)) then
    raise exception 'invalid_payment_transition' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.payment_transition_allowed(
  current_state text,
  next_state text,
  current_authorized bigint,
  current_captured bigint,
  current_refunded bigint,
  next_authorized bigint,
  next_captured bigint,
  next_refunded bigint
)
returns boolean
language sql
immutable
as $$
  select
    next_authorized >= current_authorized
    and next_captured >= current_captured
    and next_refunded >= current_refunded
    and case current_state
      when 'authorized' then next_state in ('authorized','captured','failed')
      when 'captured' then next_state in ('captured','partially_refunded','refunded')
      when 'partially_refunded' then next_state in ('partially_refunded','refunded')
      when 'refunded' then next_state = 'refunded'
      when 'failed' then next_state = 'failed'
      else false
    end;
$$;

create or replace function private.payment_result(transaction_row public.payment_transactions)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select jsonb_build_object(
    'publicId',commitment.public_id,
    'paymentState',transaction_row.state,
    'requestedMinor',transaction_row.requested_minor,
    'authorizedMinor',transaction_row.authorized_minor,
    'capturedMinor',transaction_row.captured_minor,
    'refundedMinor',transaction_row.refunded_minor,
    'currency',transaction_row.currency
  )
  from public.funding_commitments commitment
  where commitment.id = transaction_row.funding_commitment_id;
$$;

create or replace function public.record_payment_transition(
  requested_commitment_public_id text,
  requested_provider_key text,
  requested_customer_ref text,
  requested_payment_method_ref text,
  requested_transaction_ref text,
  requested_state text,
  requested_authorized_minor bigint,
  requested_captured_minor bigint,
  requested_refunded_minor bigint,
  requested_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $$
declare
  commitment_row public.funding_commitments%rowtype;
  transaction_row public.payment_transactions%rowtype;
  operation_row public.payment_operation_receipts%rowtype;
  currency_value text;
  normalized_provider text := trim(coalesce(requested_provider_key,''));
  normalized_customer text := trim(coalesce(requested_customer_ref,''));
  normalized_method text := trim(coalesce(requested_payment_method_ref,''));
  normalized_transaction text := trim(coalesce(requested_transaction_ref,''));
  normalized_state text := trim(coalesce(requested_state,''));
  normalized_key text := trim(coalesce(requested_idempotency_key,''));
  request_hash_value text;
  result_value jsonb;
begin
  if not private.request_is_service_role() then
    raise exception 'payment_transition_not_allowed' using errcode = '42501';
  end if;

  select * into commitment_row
  from public.funding_commitments commitment
  where commitment.public_id = trim(coalesce(requested_commitment_public_id,''))
  for update;

  if commitment_row.id is null then
    raise exception 'payment_commitment_not_found' using errcode = '22023';
  end if;

  select upper(version.body ->> 'currency') into currency_value
  from public.campaign_term_versions version
  where version.id = commitment_row.campaign_term_version_id;

  if currency_value is null or currency_value !~ '^[A-Z]{3}$'
     or normalized_provider !~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$'
     or char_length(normalized_customer) not between 3 and 255
     or char_length(normalized_method) not between 3 and 255
     or char_length(normalized_transaction) not between 3 and 255
     or char_length(normalized_key) not between 8 and 128
     or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception 'invalid_payment_transition' using errcode = '22023';
  end if;

  perform private.assert_payment_shape(
    normalized_state,
    commitment_row.amount_minor,
    requested_authorized_minor,
    requested_captured_minor,
    requested_refunded_minor
  );

  request_hash_value := encode(extensions.digest(convert_to(jsonb_build_object(
    'provider',normalized_provider,
    'customerRef',normalized_customer,
    'paymentMethodRef',normalized_method,
    'transactionRef',normalized_transaction,
    'state',normalized_state,
    'authorizedMinor',requested_authorized_minor,
    'capturedMinor',requested_captured_minor,
    'refundedMinor',requested_refunded_minor
  )::text,'UTF8'),'sha256'),'hex');

  select * into operation_row
  from public.payment_operation_receipts receipt
  where receipt.funding_commitment_id = commitment_row.id
    and receipt.idempotency_key = normalized_key
  limit 1;

  if operation_row.id is not null then
    if operation_row.request_hash <> request_hash_value then
      raise exception 'payment_idempotency_conflict' using errcode = '22023';
    end if;
    return operation_row.normalized_result;
  end if;

  select * into transaction_row
  from public.payment_transactions transaction
  where transaction.funding_commitment_id = commitment_row.id
  for update;

  if transaction_row.id is null then
    if normalized_state not in ('authorized','captured','failed') then
      raise exception 'invalid_payment_transition' using errcode = '22023';
    end if;

    insert into public.payment_transactions(
      funding_commitment_id,provider_key,provider_customer_ref,provider_payment_method_ref,provider_transaction_ref,
      state,requested_minor,authorized_minor,captured_minor,refunded_minor,currency
    ) values (
      commitment_row.id,normalized_provider,normalized_customer,normalized_method,normalized_transaction,
      normalized_state,commitment_row.amount_minor,requested_authorized_minor,requested_captured_minor,requested_refunded_minor,currency_value
    ) returning * into transaction_row;
  else
    if transaction_row.provider_key <> normalized_provider
       or transaction_row.provider_customer_ref <> normalized_customer
       or transaction_row.provider_payment_method_ref <> normalized_method
       or transaction_row.provider_transaction_ref <> normalized_transaction
       or not private.payment_transition_allowed(
         transaction_row.state,normalized_state,
         transaction_row.authorized_minor,transaction_row.captured_minor,transaction_row.refunded_minor,
         requested_authorized_minor,requested_captured_minor,requested_refunded_minor
       ) then
      raise exception 'invalid_payment_transition' using errcode = '22023';
    end if;

    update public.payment_transactions
    set state=normalized_state,
        authorized_minor=requested_authorized_minor,
        captured_minor=requested_captured_minor,
        refunded_minor=requested_refunded_minor,
        updated_at=now()
    where id=transaction_row.id
    returning * into transaction_row;
  end if;

  result_value := private.payment_result(transaction_row);

  insert into public.payment_operation_receipts(
    funding_commitment_id,payment_transaction_id,idempotency_key,request_hash,normalized_result
  ) values (
    commitment_row.id,transaction_row.id,normalized_key,request_hash_value,result_value
  );

  perform private.write_audit(
    null,'payment_transition_recorded','success','payment-transition',null,
    jsonb_build_object(
      'commitmentPublicId',commitment_row.public_id,
      'state',transaction_row.state,
      'authorizedMinor',transaction_row.authorized_minor,
      'capturedMinor',transaction_row.captured_minor,
      'refundedMinor',transaction_row.refunded_minor
    )
  );

  return result_value;
end;
$$;

create or replace function public.apply_payment_webhook(
  requested_provider_key text,
  requested_event_id text,
  requested_transaction_ref text,
  requested_state text,
  requested_authorized_minor bigint,
  requested_captured_minor bigint,
  requested_refunded_minor bigint,
  requested_occurred_at timestamptz,
  requested_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  transaction_row public.payment_transactions%rowtype;
  receipt_row public.payment_webhook_receipts%rowtype;
  normalized_provider text := trim(coalesce(requested_provider_key,''));
  normalized_event text := trim(coalesce(requested_event_id,''));
  normalized_transaction text := trim(coalesce(requested_transaction_ref,''));
  normalized_state text := trim(coalesce(requested_state,''));
  normalized_hash text := lower(trim(coalesce(requested_payload_hash,'')));
  result_value jsonb;
begin
  if not private.request_is_service_role() then
    raise exception 'payment_webhook_not_allowed' using errcode = '42501';
  end if;

  if normalized_provider !~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$'
     or char_length(normalized_event) not between 3 and 255
     or char_length(normalized_transaction) not between 3 and 255
     or normalized_hash !~ '^[0-9a-f]{64}$'
     or requested_occurred_at is null then
    raise exception 'invalid_payment_webhook' using errcode = '22023';
  end if;

  select * into receipt_row
  from public.payment_webhook_receipts receipt
  where receipt.provider_key=normalized_provider and receipt.event_id=normalized_event
  limit 1;

  if receipt_row.id is not null then
    if receipt_row.payload_hash <> normalized_hash then
      raise exception 'webhook_event_conflict' using errcode = '22023';
    end if;
    select * into transaction_row from public.payment_transactions where id=receipt_row.payment_transaction_id;
    return private.payment_result(transaction_row) || jsonb_build_object('replayed',true,'ignored',receipt_row.ignored);
  end if;

  select * into transaction_row
  from public.payment_transactions transaction
  where transaction.provider_key=normalized_provider
    and transaction.provider_transaction_ref=normalized_transaction
  for update;

  if transaction_row.id is null then
    raise exception 'payment_transaction_not_found' using errcode = '22023';
  end if;

  perform private.assert_payment_shape(
    normalized_state,transaction_row.requested_minor,
    requested_authorized_minor,requested_captured_minor,requested_refunded_minor
  );

  if transaction_row.last_provider_event_at is not null
     and requested_occurred_at < transaction_row.last_provider_event_at then
    insert into public.payment_webhook_receipts(
      payment_transaction_id,provider_key,event_id,provider_transaction_ref,payload_hash,normalized_state,
      authorized_minor,captured_minor,refunded_minor,occurred_at,ignored
    ) values (
      transaction_row.id,normalized_provider,normalized_event,normalized_transaction,normalized_hash,normalized_state,
      requested_authorized_minor,requested_captured_minor,requested_refunded_minor,requested_occurred_at,true
    );
    return private.payment_result(transaction_row) || jsonb_build_object('replayed',false,'ignored',true);
  end if;

  if not private.payment_transition_allowed(
    transaction_row.state,normalized_state,
    transaction_row.authorized_minor,transaction_row.captured_minor,transaction_row.refunded_minor,
    requested_authorized_minor,requested_captured_minor,requested_refunded_minor
  ) then
    raise exception 'invalid_payment_transition' using errcode = '22023';
  end if;

  update public.payment_transactions
  set state=normalized_state,
      authorized_minor=requested_authorized_minor,
      captured_minor=requested_captured_minor,
      refunded_minor=requested_refunded_minor,
      last_provider_event_at=requested_occurred_at,
      updated_at=now()
  where id=transaction_row.id
  returning * into transaction_row;

  insert into public.payment_webhook_receipts(
    payment_transaction_id,provider_key,event_id,provider_transaction_ref,payload_hash,normalized_state,
    authorized_minor,captured_minor,refunded_minor,occurred_at,ignored
  ) values (
    transaction_row.id,normalized_provider,normalized_event,normalized_transaction,normalized_hash,normalized_state,
    requested_authorized_minor,requested_captured_minor,requested_refunded_minor,requested_occurred_at,false
  );

  result_value := private.payment_result(transaction_row) || jsonb_build_object('replayed',false,'ignored',false);

  perform private.write_audit(
    null,'payment_webhook_applied','success','payment-webhook',null,
    jsonb_build_object(
      'commitmentPublicId',(select commitment.public_id from public.funding_commitments commitment where commitment.id=transaction_row.funding_commitment_id),
      'state',transaction_row.state,
      'ignored',false
    )
  );

  return result_value;
end;
$$;

create or replace function public.request_funding_refund(
  requested_commitment_public_id text,
  requested_amount_minor bigint,
  requested_reason text,
  requested_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $$
declare
  commitment_row public.funding_commitments%rowtype;
  transaction_row public.payment_transactions%rowtype;
  request_row public.funding_change_requests%rowtype;
  normalized_reason text := trim(coalesce(requested_reason,''));
  normalized_key text := trim(coalesce(requested_idempotency_key,''));
  candidate_public_id text;
begin
  perform private.assert_adult_profile_action();

  select * into commitment_row
  from public.funding_commitments commitment
  where commitment.public_id=trim(coalesce(requested_commitment_public_id,''))
    and commitment.supporter_user_id=auth.uid()
  for update;

  if commitment_row.id is null then
    raise exception 'funding_commitment_not_found' using errcode = '42501';
  end if;

  select * into request_row
  from public.funding_change_requests change_request
  where change_request.funding_commitment_id=commitment_row.id
    and change_request.idempotency_key=normalized_key
  limit 1;

  if request_row.id is not null then
    if request_row.kind <> 'refund'
       or request_row.requested_amount_minor is distinct from requested_amount_minor
       or coalesce(request_row.reason,'') <> normalized_reason then
      raise exception 'refund_idempotency_conflict' using errcode = '22023';
    end if;
    return jsonb_build_object('requestPublicId',request_row.public_id,'state',request_row.state,'amountMinor',request_row.requested_amount_minor);
  end if;

  select * into transaction_row
  from public.payment_transactions transaction
  where transaction.funding_commitment_id=commitment_row.id
  for update;

  if requested_amount_minor is null or requested_amount_minor < 1
     or transaction_row.id is null
     or requested_amount_minor > transaction_row.captured_minor - transaction_row.refunded_minor then
    raise exception 'invalid_refund_amount' using errcode = '22023';
  end if;

  if char_length(normalized_reason) not between 3 and 1000
     or char_length(normalized_key) not between 8 and 128
     or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception 'invalid_refund_request' using errcode = '22023';
  end if;

  loop
    candidate_public_id := 'chg' || encode(extensions.gen_random_bytes(12),'hex');
    exit when not exists(select 1 from public.funding_change_requests existing where existing.public_id=candidate_public_id);
  end loop;

  insert into public.funding_change_requests(
    public_id,funding_commitment_id,kind,requested_amount_minor,state,idempotency_key,reason
  ) values (
    candidate_public_id,commitment_row.id,'refund',requested_amount_minor,'requested',normalized_key,normalized_reason
  ) returning * into request_row;

  perform private.write_audit(
    auth.uid(),'funding_refund_requested','success','/app/funding/'||commitment_row.public_id,null,
    jsonb_build_object('commitmentPublicId',commitment_row.public_id,'requestPublicId',request_row.public_id,'amountMinor',request_row.requested_amount_minor)
  );

  return jsonb_build_object('requestPublicId',request_row.public_id,'state',request_row.state,'amountMinor',request_row.requested_amount_minor);
end;
$$;

create or replace function public.set_supporter_badge(
  requested_commitment_public_id text,
  requested_badge_key text,
  requested_visibility text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  commitment_row public.funding_commitments%rowtype;
  normalized_badge text := trim(coalesce(requested_badge_key,''));
  normalized_visibility text := lower(trim(coalesce(requested_visibility,'')));
begin
  perform private.assert_adult_profile_action();

  select * into commitment_row
  from public.funding_commitments commitment
  where commitment.public_id=trim(coalesce(requested_commitment_public_id,''))
    and commitment.supporter_user_id=auth.uid()
  for update;

  if commitment_row.id is null then
    raise exception 'funding_commitment_not_found' using errcode = '42501';
  end if;

  if char_length(normalized_badge) not between 1 and 64
     or normalized_badge !~ '^[A-Za-z0-9][A-Za-z0-9 ._-]*$'
     or normalized_visibility not in ('public','private','hidden') then
    raise exception 'invalid_supporter_badge' using errcode = '22023';
  end if;

  insert into public.supporter_badges(funding_commitment_id,badge_key,visibility,updated_at)
  values(commitment_row.id,normalized_badge,normalized_visibility,now())
  on conflict(funding_commitment_id) do update
  set badge_key=excluded.badge_key,visibility=excluded.visibility,updated_at=now();

  update public.funding_commitments set badge_choice=normalized_badge where id=commitment_row.id;

  perform private.write_audit(
    auth.uid(),'supporter_badge_updated','success','/app/funding/'||commitment_row.public_id,null,
    jsonb_build_object('commitmentPublicId',commitment_row.public_id,'badgeKey',normalized_badge,'visibility',normalized_visibility)
  );

  return jsonb_build_object('badgeKey',normalized_badge,'visibility',normalized_visibility);
end;
$$;

create or replace function public.accept_changed_campaign_terms(
  requested_commitment_public_id text,
  requested_terms_version integer,
  requested_terms_hash text,
  requested_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  commitment_row public.funding_commitments%rowtype;
  original_version public.campaign_term_versions%rowtype;
  target_version public.campaign_term_versions%rowtype;
  change_row public.funding_change_requests%rowtype;
  normalized_hash text := lower(trim(coalesce(requested_terms_hash,'')));
  normalized_key text := trim(coalesce(requested_idempotency_key,''));
  result_value jsonb;
begin
  perform private.assert_adult_profile_action();

  select * into commitment_row
  from public.funding_commitments commitment
  where commitment.public_id=trim(coalesce(requested_commitment_public_id,''))
    and commitment.supporter_user_id=auth.uid()
  for update;

  if commitment_row.id is null then
    raise exception 'funding_commitment_not_found' using errcode = '42501';
  end if;

  if requested_terms_version is null or requested_terms_version < 1
     or normalized_hash !~ '^[0-9a-f]{64}$'
     or char_length(normalized_key) not between 8 and 128
     or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception 'invalid_changed_terms_acceptance' using errcode = '22023';
  end if;

  select * into change_row
  from public.funding_change_requests change_request
  where change_request.funding_commitment_id=commitment_row.id
    and change_request.acceptance_idempotency_key=normalized_key
  limit 1;

  if change_row.id is not null then
    select * into target_version from public.campaign_term_versions where id=change_row.campaign_term_version_id;
    if change_row.state <> 'accepted' or target_version.version <> requested_terms_version or change_row.accepted_terms_hash <> normalized_hash then
      raise exception 'changed_terms_idempotency_conflict' using errcode = '22023';
    end if;
    return jsonb_build_object('requestPublicId',change_row.public_id,'state','accepted','termsVersion',target_version.version,'termsHash',change_row.accepted_terms_hash);
  end if;

  select * into original_version from public.campaign_term_versions where id=commitment_row.campaign_term_version_id;
  select * into target_version
  from public.campaign_term_versions version
  where version.campaign_id=original_version.campaign_id
    and version.version=requested_terms_version
    and version.terms_hash=normalized_hash;

  if target_version.id is null then
    raise exception 'changed_terms_version_mismatch' using errcode = '22023';
  end if;

  select * into change_row
  from public.funding_change_requests change_request
  where change_request.funding_commitment_id=commitment_row.id
    and change_request.kind='material_change'
    and change_request.campaign_term_version_id=target_version.id
  for update;

  if change_row.id is null or change_row.state <> 'pending' then
    raise exception 'changed_terms_action_not_available' using errcode = '42501';
  end if;

  update public.funding_change_requests
  set state='accepted',accepted_terms_hash=normalized_hash,acceptance_idempotency_key=normalized_key,resolved_at=now()
  where id=change_row.id
  returning * into change_row;

  result_value := jsonb_build_object('requestPublicId',change_row.public_id,'state','accepted','termsVersion',target_version.version,'termsHash',normalized_hash);

  perform private.write_audit(
    auth.uid(),'funding_changed_terms_accepted','success','/app/funding/'||commitment_row.public_id,null,
    jsonb_build_object('commitmentPublicId',commitment_row.public_id,'requestPublicId',change_row.public_id,'termsVersion',target_version.version,'termsHash',normalized_hash)
  );

  return result_value;
end;
$$;

create or replace function public.get_funding_commitment(requested_commitment_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  commitment_row public.funding_commitments%rowtype;
  version_row public.campaign_term_versions%rowtype;
  campaign_row public.campaigns%rowtype;
  transaction_row public.payment_transactions%rowtype;
  badge_row public.supporter_badges%rowtype;
  change_row public.funding_change_requests%rowtype;
  refund_row public.funding_change_requests%rowtype;
  badge_value jsonb;
  change_value jsonb;
  refund_value jsonb;
begin
  perform private.assert_adult_profile_action();

  select * into commitment_row
  from public.funding_commitments commitment
  where commitment.public_id=trim(coalesce(requested_commitment_public_id,''))
    and commitment.supporter_user_id=auth.uid()
  limit 1;

  if commitment_row.id is null then
    return null;
  end if;

  select * into version_row from public.campaign_term_versions where id=commitment_row.campaign_term_version_id;
  select * into campaign_row from public.campaigns where id=version_row.campaign_id;
  select * into transaction_row from public.payment_transactions where funding_commitment_id=commitment_row.id;
  select * into badge_row from public.supporter_badges where funding_commitment_id=commitment_row.id;

  select * into change_row
  from public.funding_change_requests change_request
  where change_request.funding_commitment_id=commitment_row.id and change_request.kind='material_change'
  order by change_request.created_at desc limit 1;

  select * into refund_row
  from public.funding_change_requests change_request
  where change_request.funding_commitment_id=commitment_row.id and change_request.kind='refund'
  order by change_request.created_at desc limit 1;

  badge_value := case when badge_row.funding_commitment_id is null then null else jsonb_build_object('key',badge_row.badge_key,'visibility',badge_row.visibility) end;
  change_value := case when change_row.id is null then null else jsonb_build_object(
    'requestPublicId',change_row.public_id,'state',change_row.state,
    'termsVersion',(select version.version from public.campaign_term_versions version where version.id=change_row.campaign_term_version_id),
    'termsHash',coalesce(change_row.accepted_terms_hash,(select version.terms_hash from public.campaign_term_versions version where version.id=change_row.campaign_term_version_id))
  ) end;
  refund_value := case when refund_row.id is null then null else jsonb_build_object('requestPublicId',refund_row.public_id,'state',refund_row.state,'amountMinor',refund_row.requested_amount_minor) end;

  return jsonb_build_object(
    'publicId',commitment_row.public_id,
    'campaignPublicId',campaign_row.public_id,
    'amountMinor',commitment_row.amount_minor,
    'currency',version_row.body ->> 'currency',
    'supporterAnonymous',commitment_row.supporter_anonymous,
    'termsVersion',version_row.version,
    'termsHash',version_row.terms_hash,
    'paymentState',case when transaction_row.id is null then 'pending' else transaction_row.state end,
    'requestedMinor',commitment_row.amount_minor,
    'authorizedMinor',case when transaction_row.id is null then 0 else transaction_row.authorized_minor end,
    'capturedMinor',case when transaction_row.id is null then 0 else transaction_row.captured_minor end,
    'refundedMinor',case when transaction_row.id is null then 0 else transaction_row.refunded_minor end,
    'badge',badge_value,
    'materialChange',change_value,
    'refundRequest',refund_value,
    'createdAt',commitment_row.created_at
  );
end;
$$;

comment on table public.payment_transactions is 'Restricted Slice 10 processor state. Provider customer, payment-method and transaction references are never exposed through public/user projections.';
comment on table public.payment_webhook_receipts is 'Restricted authenticated-provider event replay boundary used to reject conflicts and ignore stale money-state events.';
comment on table public.funding_change_requests is 'Durable supporter material-change/refund intent. This is not a Slice 14 ledger, payout, or settlement record.';
comment on function public.get_funding_commitment(text) is 'Returns only the signed-in supporter safe funding projection; internal UUIDs and processor references are deliberately omitted.';

revoke all on function public.record_payment_transition(text,text,text,text,text,text,bigint,bigint,bigint,text) from public, anon, authenticated;
revoke all on function public.apply_payment_webhook(text,text,text,text,bigint,bigint,bigint,timestamptz,text) from public, anon, authenticated;
grant execute on function public.record_payment_transition(text,text,text,text,text,text,bigint,bigint,bigint,text) to service_role;
grant execute on function public.apply_payment_webhook(text,text,text,text,bigint,bigint,bigint,timestamptz,text) to service_role;

revoke all on function public.request_funding_refund(text,bigint,text,text) from public, anon, authenticated;
revoke all on function public.accept_changed_campaign_terms(text,integer,text,text) from public, anon, authenticated;
revoke all on function public.set_supporter_badge(text,text,text) from public, anon, authenticated;
revoke all on function public.get_funding_commitment(text) from public, anon, authenticated;
grant execute on function public.request_funding_refund(text,bigint,text,text) to authenticated;
grant execute on function public.accept_changed_campaign_terms(text,integer,text,text) to authenticated;
grant execute on function public.set_supporter_badge(text,text,text) to authenticated;
grant execute on function public.get_funding_commitment(text) to authenticated;

notify pgrst, 'reload schema';
