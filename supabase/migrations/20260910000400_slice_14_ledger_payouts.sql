create table public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete restrict,
  owner_user_id uuid references auth.users(id) on delete restrict,
  account_code text not null,
  currency text not null,
  created_at timestamptz not null default now(),
  constraint ledger_account_code_allowed check (account_code in (
    'processor_clearing','processing_fee','platform_fee','reserve_restricted',
    'participant_restricted','participant_available','agency_restricted',
    'payout_pending','payout_settled'
  )),
  constraint ledger_account_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint ledger_account_owner_shape check (
    (account_code in ('participant_restricted','participant_available','agency_restricted','payout_pending','payout_settled') and owner_user_id is not null)
    or (account_code in ('processor_clearing','processing_fee','platform_fee','reserve_restricted') and owner_user_id is null)
  ),
  constraint ledger_account_scope_unique unique nulls not distinct (project_id,owner_user_id,account_code,currency)
);

create table public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  project_id uuid not null references public.projects(id) on delete restrict,
  kind text not null,
  currency text not null,
  source_type text not null,
  source_key text not null,
  idempotency_key text not null,
  request_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint ledger_transaction_public_id_format check (public_id ~ '^jrn[0-9a-f]{24}$'),
  constraint ledger_transaction_kind_allowed check (kind in (
    'payment_settlement','payment_adjustment','earnings_promotion','earnings_hold','earnings_hold_release',
    'payout_reservation','payout_paid','payout_failed','payout_retry'
  )),
  constraint ledger_transaction_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint ledger_transaction_source_type_format check (source_type ~ '^[a-z][a-z0-9_-]{1,63}$'),
  constraint ledger_transaction_source_key_length check (char_length(source_key) between 1 and 255),
  constraint ledger_transaction_idempotency_key_format check (
    char_length(idempotency_key) between 8 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint ledger_transaction_request_hash_format check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint ledger_transaction_metadata_object check (jsonb_typeof(metadata)='object'),
  unique(source_type,source_key,idempotency_key)
);

create table public.ledger_postings (
  id uuid primary key default gen_random_uuid(),
  ledger_transaction_id uuid not null references public.ledger_transactions(id) on delete restrict,
  ledger_account_id uuid not null references public.ledger_accounts(id) on delete restrict,
  side text not null,
  amount_minor bigint not null,
  created_at timestamptz not null default now(),
  constraint ledger_posting_side_allowed check (side in ('debit','credit')),
  constraint ledger_posting_amount_positive check (amount_minor between 1 and 9007199254740991)
);

create table public.project_revenue_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  contract_lock_receipt_id uuid not null references public.contract_lock_receipts(id) on delete restrict,
  version integer not null check (version >= 1),
  rules_hash text not null,
  idempotency_key text not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint project_revenue_rules_hash_format check (rules_hash ~ '^[0-9a-f]{64}$'),
  constraint project_revenue_rules_key_format check (
    char_length(idempotency_key) between 8 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  unique(project_id,version),
  unique(project_id,idempotency_key)
);

create table public.project_revenue_rule_lines (
  id uuid primary key default gen_random_uuid(),
  revenue_rule_id uuid not null references public.project_revenue_rules(id) on delete restrict,
  line_kind text not null,
  recipient_user_id uuid references auth.users(id) on delete restrict,
  basis_points integer not null check (basis_points between 0 and 10000),
  position integer not null check (position between 1 and 50),
  created_at timestamptz not null default now(),
  constraint project_revenue_rule_line_kind_allowed check (line_kind in ('platform_fee','agency_share','reserve','participant')),
  constraint project_revenue_rule_line_recipient_shape check (
    (line_kind in ('participant','agency_share') and recipient_user_id is not null)
    or (line_kind in ('platform_fee','reserve') and recipient_user_id is null)
  ),
  constraint project_revenue_rule_line_identity_unique unique nulls not distinct (revenue_rule_id,line_kind,recipient_user_id),
  unique(revenue_rule_id,position)
);

create table public.payment_ledger_settlements (
  payment_transaction_id uuid primary key references public.payment_transactions(id) on delete restrict,
  revenue_rule_id uuid not null references public.project_revenue_rules(id) on delete restrict,
  net_captured_minor bigint not null default 0 check (net_captured_minor between 0 and 9007199254740991),
  processing_fee_minor bigint not null default 0 check (processing_fee_minor between 0 and 9007199254740991),
  last_ledger_transaction_id uuid references public.ledger_transactions(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.payment_ledger_allocations (
  payment_transaction_id uuid not null references public.payment_transactions(id) on delete restrict,
  revenue_rule_line_id uuid not null references public.project_revenue_rule_lines(id) on delete restrict,
  amount_minor bigint not null default 0 check (amount_minor between 0 and 9007199254740991),
  updated_at timestamptz not null default now(),
  primary key(payment_transaction_id,revenue_rule_line_id)
);

create table public.payment_ledger_sync_receipts (
  id uuid primary key default gen_random_uuid(),
  payment_transaction_id uuid not null references public.payment_transactions(id) on delete restrict,
  idempotency_key text not null,
  request_hash text not null,
  normalized_result jsonb not null,
  created_at timestamptz not null default now(),
  constraint payment_ledger_sync_key_format check (
    char_length(idempotency_key) between 8 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint payment_ledger_sync_hash_format check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint payment_ledger_sync_result_object check (jsonb_typeof(normalized_result)='object'),
  unique(payment_transaction_id,idempotency_key)
);

create table public.earnings_promotion_receipts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  idempotency_key text not null,
  normalized_result jsonb not null,
  created_at timestamptz not null default now(),
  constraint earnings_promotion_key_format check (
    char_length(idempotency_key) between 8 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint earnings_promotion_result_object check (jsonb_typeof(normalized_result)='object'),
  unique(project_id,idempotency_key)
);

create table public.ledger_holds (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  project_id uuid not null references public.projects(id) on delete restrict,
  participant_user_id uuid not null references auth.users(id) on delete restrict,
  currency text not null,
  kind text not null,
  amount_minor bigint not null,
  state text not null default 'open',
  reason text not null,
  idempotency_key text not null,
  placed_ledger_transaction_id uuid not null references public.ledger_transactions(id) on delete restrict,
  released_ledger_transaction_id uuid references public.ledger_transactions(id) on delete restrict,
  release_idempotency_key text,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  constraint ledger_hold_public_id_format check (public_id ~ '^hld[0-9a-f]{24}$'),
  constraint ledger_hold_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint ledger_hold_kind_allowed check (kind in ('reserve','dispute','chargeback','campaign','verification')),
  constraint ledger_hold_amount_positive check (amount_minor between 1 and 9007199254740991),
  constraint ledger_hold_state_allowed check (state in ('open','released')),
  constraint ledger_hold_reason_length check (char_length(trim(reason)) between 3 and 1000 and reason !~ '[[:cntrl:]]'),
  constraint ledger_hold_idempotency_key_format check (char_length(idempotency_key) between 8 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  constraint ledger_hold_release_key_format check (release_idempotency_key is null or (char_length(release_idempotency_key) between 8 and 128 and release_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')),
  constraint ledger_hold_release_shape check ((state='open' and released_at is null and released_ledger_transaction_id is null) or (state='released' and released_at is not null and released_ledger_transaction_id is not null)),
  unique(project_id,participant_user_id,idempotency_key)
);

create table public.payout_batches (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  month_start date not null,
  currency text not null,
  state text not null default 'processing',
  idempotency_key text not null unique,
  created_by_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint payout_batch_public_id_format check (public_id ~ '^pbt[0-9a-f]{24}$'),
  constraint payout_batch_month_start check (month_start=date_trunc('month',month_start::timestamp)::date),
  constraint payout_batch_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint payout_batch_state_allowed check (state in ('processing','completed','held')),
  constraint payout_batch_key_format check (char_length(idempotency_key) between 8 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')
);

create table public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  participant_user_id uuid not null references auth.users(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  currency text not null,
  amount_minor bigint not null,
  state text not null default 'requested',
  idempotency_key text not null,
  payout_batch_id uuid references public.payout_batches(id) on delete restrict,
  reservation_ledger_transaction_id uuid not null references public.ledger_transactions(id) on delete restrict,
  last_ledger_transaction_id uuid not null references public.ledger_transactions(id) on delete restrict,
  provider_key text,
  provider_payout_ref text,
  attempt_count integer not null default 1 check (attempt_count between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint payout_request_public_id_format check (public_id ~ '^pay[0-9a-f]{24}$'),
  constraint payout_request_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint payout_request_amount_positive check (amount_minor between 1 and 9007199254740991),
  constraint payout_request_state_allowed check (state in ('requested','processing','paid','failed')),
  constraint payout_request_key_format check (char_length(idempotency_key) between 8 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  constraint payout_request_provider_shape check ((provider_key is null and provider_payout_ref is null) or (provider_key is not null and provider_payout_ref is not null)),
  unique(participant_user_id,idempotency_key)
);

create table public.payout_retry_receipts (
  id uuid primary key default gen_random_uuid(),
  payout_request_id uuid not null references public.payout_requests(id) on delete restrict,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint payout_retry_key_format check (char_length(idempotency_key) between 8 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  unique(payout_request_id,idempotency_key)
);

create table public.payout_provider_events (
  id uuid primary key default gen_random_uuid(),
  payout_request_id uuid not null references public.payout_requests(id) on delete restrict,
  provider_key text not null,
  event_id text not null,
  provider_payout_ref text not null,
  payload_hash text not null,
  normalized_state text not null,
  reported_amount_minor bigint not null,
  occurred_at timestamptz not null,
  ignored boolean not null default false,
  created_at timestamptz not null default now(),
  constraint payout_provider_key_format check (provider_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$'),
  constraint payout_provider_event_id_length check (char_length(event_id) between 3 and 255),
  constraint payout_provider_ref_length check (char_length(provider_payout_ref) between 3 and 255),
  constraint payout_provider_payload_hash_format check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint payout_provider_state_allowed check (normalized_state in ('paid','failed')),
  constraint payout_provider_reported_amount_nonnegative check (reported_amount_minor between 0 and 9007199254740991),
  unique(provider_key,event_id)
);

create table public.finance_reconciliation_cases (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  project_id uuid not null references public.projects(id) on delete restrict,
  payout_request_id uuid references public.payout_requests(id) on delete restrict,
  provider_event_id uuid references public.payout_provider_events(id) on delete restrict,
  kind text not null,
  expected_minor bigint not null,
  observed_minor bigint not null,
  currency text not null,
  state text not null default 'open',
  note text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint finance_case_public_id_format check (public_id ~ '^fin[0-9a-f]{24}$'),
  constraint finance_case_kind_allowed check (kind in ('payout_amount_mismatch','payout_state_conflict')),
  constraint finance_case_amounts_nonnegative check (expected_minor>=0 and observed_minor>=0),
  constraint finance_case_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint finance_case_state_allowed check (state in ('open','resolved')),
  constraint finance_case_note_length check (char_length(trim(note)) between 3 and 1000 and note !~ '[[:cntrl:]]')
);

create index ledger_postings_transaction_idx on public.ledger_postings(ledger_transaction_id);
create index ledger_postings_account_idx on public.ledger_postings(ledger_account_id,created_at desc);
create index ledger_transactions_project_created_idx on public.ledger_transactions(project_id,created_at desc);
create index revenue_rules_project_version_idx on public.project_revenue_rules(project_id,version desc);
create index ledger_holds_participant_state_idx on public.ledger_holds(participant_user_id,state,created_at desc);
create index payouts_participant_state_idx on public.payout_requests(participant_user_id,state,created_at desc);
create index payouts_batch_state_idx on public.payout_requests(payout_batch_id,state);
create index finance_cases_state_created_idx on public.finance_reconciliation_cases(state,created_at desc);

alter table public.ledger_accounts enable row level security;
alter table public.ledger_transactions enable row level security;
alter table public.ledger_postings enable row level security;
alter table public.project_revenue_rules enable row level security;
alter table public.project_revenue_rule_lines enable row level security;
alter table public.payment_ledger_settlements enable row level security;
alter table public.payment_ledger_allocations enable row level security;
alter table public.payment_ledger_sync_receipts enable row level security;
alter table public.earnings_promotion_receipts enable row level security;
alter table public.ledger_holds enable row level security;
alter table public.payout_batches enable row level security;
alter table public.payout_requests enable row level security;
alter table public.payout_retry_receipts enable row level security;
alter table public.payout_provider_events enable row level security;
alter table public.finance_reconciliation_cases enable row level security;

revoke all on public.ledger_accounts from public,anon,authenticated;
revoke all on public.ledger_transactions from public,anon,authenticated;
revoke all on public.ledger_postings from public,anon,authenticated;
revoke all on public.project_revenue_rules from public,anon,authenticated;
revoke all on public.project_revenue_rule_lines from public,anon,authenticated;
revoke all on public.payment_ledger_settlements from public,anon,authenticated;
revoke all on public.payment_ledger_allocations from public,anon,authenticated;
revoke all on public.payment_ledger_sync_receipts from public,anon,authenticated;
revoke all on public.earnings_promotion_receipts from public,anon,authenticated;
revoke all on public.ledger_holds from public,anon,authenticated;
revoke all on public.payout_batches from public,anon,authenticated;
revoke all on public.payout_requests from public,anon,authenticated;
revoke all on public.payout_retry_receipts from public,anon,authenticated;
revoke all on public.payout_provider_events from public,anon,authenticated;
revoke all on public.finance_reconciliation_cases from public,anon,authenticated;

create or replace function private.reject_finance_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'immutable_finance_history' using errcode='55000';
end;
$$;

create trigger ledger_transactions_immutable
before update or delete on public.ledger_transactions
for each row execute function private.reject_finance_history_mutation();
create trigger ledger_postings_immutable
before update or delete on public.ledger_postings
for each row execute function private.reject_finance_history_mutation();
create trigger project_revenue_rules_immutable
before update or delete on public.project_revenue_rules
for each row execute function private.reject_finance_history_mutation();
create trigger project_revenue_rule_lines_immutable
before update or delete on public.project_revenue_rule_lines
for each row execute function private.reject_finance_history_mutation();
create trigger payment_ledger_sync_receipts_immutable
before update or delete on public.payment_ledger_sync_receipts
for each row execute function private.reject_finance_history_mutation();
create trigger payout_provider_events_immutable
before update or delete on public.payout_provider_events
for each row execute function private.reject_finance_history_mutation();

create or replace function private.assert_ledger_transaction_balanced(target_transaction_id uuid)
returns void
language plpgsql
stable
as $$
declare debit_total numeric; credit_total numeric; posting_count bigint;
begin
  select
    coalesce(sum(case when side='debit' then amount_minor else 0 end),0),
    coalesce(sum(case when side='credit' then amount_minor else 0 end),0),
    count(*)
  into debit_total,credit_total,posting_count
  from public.ledger_postings
  where ledger_transaction_id=target_transaction_id;
  if posting_count<2 or debit_total<>credit_total or debit_total<=0 then
    raise exception 'unbalanced_ledger_transaction' using errcode='23514';
  end if;
end;
$$;

create or replace function private.check_ledger_posting_balance()
returns trigger
language plpgsql
as $$
begin
  perform private.assert_ledger_transaction_balanced(case when tg_op='DELETE' then old.ledger_transaction_id else new.ledger_transaction_id end);
  return null;
end;
$$;

create constraint trigger ledger_postings_balance_enforced
after insert or update or delete on public.ledger_postings
deferrable initially deferred
for each row execute function private.check_ledger_posting_balance();

create or replace function private.assert_finance_or_service()
returns void
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare active_role public.app_role;
begin
  if coalesce(auth.role(),'')='service_role' then return; end if;
  perform private.assert_current_session();
  active_role:=private.current_active_role(auth.uid());
  if active_role not in ('finance'::public.app_role,'super_admin'::public.app_role) then
    raise exception 'finance_action_not_allowed' using errcode='42501';
  end if;
end;
$$;

create or replace function private.ensure_ledger_account(
  target_project_id uuid,
  target_owner_user_id uuid,
  target_account_code text,
  target_currency text
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare account_id uuid;
begin
  select id into account_id from public.ledger_accounts
  where project_id is not distinct from target_project_id
    and owner_user_id is not distinct from target_owner_user_id
    and account_code=target_account_code
    and currency=target_currency;
  if account_id is not null then return account_id; end if;
  insert into public.ledger_accounts(project_id,owner_user_id,account_code,currency)
  values(target_project_id,target_owner_user_id,target_account_code,target_currency)
  on conflict on constraint ledger_account_scope_unique do nothing
  returning id into account_id;
  if account_id is null then
    select id into account_id from public.ledger_accounts
    where project_id is not distinct from target_project_id
      and owner_user_id is not distinct from target_owner_user_id
      and account_code=target_account_code
      and currency=target_currency;
  end if;
  return account_id;
end;
$$;

create or replace function private.ledger_account_balance(target_account_id uuid)
returns bigint
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select coalesce(sum(case when posting.side='credit' then posting.amount_minor else -posting.amount_minor end),0)::bigint
  from public.ledger_postings posting
  where posting.ledger_account_id=target_account_id;
$$;

create or replace function private.post_ledger_transaction(
  target_project_id uuid,
  target_kind text,
  target_currency text,
  target_source_type text,
  target_source_key text,
  target_idempotency_key text,
  target_lines jsonb,
  target_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,private,extensions
as $$
declare
  existing_row public.ledger_transactions%rowtype;
  transaction_id uuid;
  candidate_public_id text;
  line jsonb;
  debit_total numeric:=0;
  credit_total numeric:=0;
  line_amount bigint;
  line_side text;
  line_account_id uuid;
  request_hash_value text;
begin
  if target_project_id is null or target_kind not in ('payment_settlement','payment_adjustment','earnings_promotion','earnings_hold','earnings_hold_release','payout_reservation','payout_paid','payout_failed','payout_retry')
     or target_currency !~ '^[A-Z]{3}$'
     or target_source_type !~ '^[a-z][a-z0-9_-]{1,63}$'
     or char_length(coalesce(target_source_key,'')) not between 1 and 255
     or char_length(coalesce(target_idempotency_key,'')) not between 8 and 128
     or target_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
     or jsonb_typeof(target_lines) is distinct from 'array'
     or jsonb_array_length(target_lines)<2
     or jsonb_array_length(target_lines)>100
     or jsonb_typeof(coalesce(target_metadata,'{}'::jsonb)) is distinct from 'object' then
    raise exception 'invalid_ledger_transaction' using errcode='22023';
  end if;

  for line in select value from jsonb_array_elements(target_lines) item(value) loop
    begin
      line_account_id:=(line->>'accountId')::uuid;
      line_amount:=(line->>'amountMinor')::bigint;
    exception when others then
      raise exception 'invalid_ledger_posting' using errcode='22023';
    end;
    line_side:=lower(trim(coalesce(line->>'side','')));
    if line_account_id is null or line_amount<1 or line_amount>9007199254740991 or line_side not in ('debit','credit')
       or not exists(select 1 from public.ledger_accounts account where account.id=line_account_id and account.project_id=target_project_id and account.currency=target_currency) then
      raise exception 'invalid_ledger_posting' using errcode='22023';
    end if;
    if line_side='debit' then debit_total:=debit_total+line_amount; else credit_total:=credit_total+line_amount; end if;
  end loop;
  if debit_total<>credit_total or debit_total<=0 then
    raise exception 'unbalanced_ledger_transaction' using errcode='23514';
  end if;

  request_hash_value:=encode(extensions.digest(convert_to(jsonb_build_object(
    'projectId',target_project_id,'kind',target_kind,'currency',target_currency,'sourceType',target_source_type,
    'sourceKey',target_source_key,'lines',target_lines,'metadata',coalesce(target_metadata,'{}'::jsonb)
  )::text,'UTF8'),'sha256'),'hex');

  select * into existing_row from public.ledger_transactions
  where source_type=target_source_type and source_key=target_source_key and idempotency_key=target_idempotency_key;
  if existing_row.id is not null then
    if existing_row.request_hash<>request_hash_value then raise exception 'ledger_idempotency_conflict' using errcode='40001'; end if;
    return existing_row.id;
  end if;

  loop
    candidate_public_id:='jrn'||encode(extensions.gen_random_bytes(12),'hex');
    exit when not exists(select 1 from public.ledger_transactions where public_id=candidate_public_id);
  end loop;
  insert into public.ledger_transactions(public_id,project_id,kind,currency,source_type,source_key,idempotency_key,request_hash,metadata)
  values(candidate_public_id,target_project_id,target_kind,target_currency,target_source_type,target_source_key,target_idempotency_key,request_hash_value,coalesce(target_metadata,'{}'::jsonb))
  returning id into transaction_id;
  for line in select value from jsonb_array_elements(target_lines) item(value) loop
    insert into public.ledger_postings(ledger_transaction_id,ledger_account_id,side,amount_minor)
    values(transaction_id,(line->>'accountId')::uuid,lower(line->>'side'),(line->>'amountMinor')::bigint);
  end loop;
  perform private.assert_ledger_transaction_balanced(transaction_id);
  return transaction_id;
end;
$$;

create or replace function private.user_payout_verified(subject_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,private
as $$
  select private.verification_is_current(subject_user_id,'v2')
    and not exists(
      select 1 from public.performer_records performer
      where performer.user_id=subject_user_id and not performer.payout_ownership_verified
    );
$$;

create or replace function private.project_payout_ready(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,private
as $$
  select exists(
    select 1
    from public.projects project
    join public.contract_lock_receipts contract_lock on contract_lock.project_id=project.id
    join public.releases release on release.project_id=project.id
    join public.final_delivery_versions delivery on delivery.id=release.delivery_version_id
    where project.id=target_project_id
      and not project.funding_restricted
      and private.delivery_is_release_ready(delivery.id)
      and not exists(select 1 from public.campaigns campaign where campaign.project_id=project.id and campaign.state='cancelled')
  );
$$;

create or replace function public.configure_project_revenue_rules(
  requested_project_public_id text,
  requested_rules jsonb,
  requested_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare
  project_row public.projects%rowtype;
  contract_row public.contract_lock_receipts%rowtype;
  term_row public.project_term_versions%rowtype;
  existing_row public.project_revenue_rules%rowtype;
  created_row public.project_revenue_rules%rowtype;
  line jsonb;
  normalized_kind text;
  normalized_handle text;
  recipient_id uuid;
  bps_numeric numeric;
  bps integer;
  bps_total integer:=0;
  platform_count integer:=0;
  participant_count integer:=0;
  position_value integer:=0;
  rules_hash_value text;
  normalized_key text:=trim(coalesce(requested_idempotency_key,''));
begin
  perform private.assert_creator_project_action();
  select * into project_row from public.projects where public_id=trim(coalesce(requested_project_public_id,'')) and owner_user_id=auth.uid() for update;
  if project_row.id is null then raise exception 'revenue_rules_not_allowed' using errcode='42501'; end if;
  select * into contract_row from public.contract_lock_receipts where project_id=project_row.id;
  if contract_row.id is null then raise exception 'revenue_rules_require_locked_contract' using errcode='42501'; end if;
  select * into term_row from public.project_term_versions where id=contract_row.term_version_id;
  if jsonb_typeof(requested_rules) is distinct from 'object'
     or jsonb_typeof(requested_rules->'lines') is distinct from 'array'
     or jsonb_array_length(requested_rules->'lines') not between 2 and 50
     or char_length(normalized_key) not between 8 and 128
     or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception 'invalid_revenue_rules' using errcode='22023';
  end if;
  rules_hash_value:=encode(extensions.digest(convert_to(requested_rules::text,'UTF8'),'sha256'),'hex');
  select * into existing_row from public.project_revenue_rules where project_id=project_row.id and idempotency_key=normalized_key;
  if existing_row.id is not null then
    if existing_row.rules_hash<>rules_hash_value then raise exception 'revenue_rules_idempotency_conflict' using errcode='40001'; end if;
    return jsonb_build_object('projectPublicId',project_row.public_id,'version',existing_row.version,'hash',existing_row.rules_hash);
  end if;

  for line in select value from jsonb_array_elements(requested_rules->'lines') item(value) loop
    normalized_kind:=lower(trim(coalesce(line->>'kind','')));
    begin bps_numeric:=(line->>'basisPoints')::numeric; exception when others then raise exception 'invalid_revenue_rule_line' using errcode='22023'; end;
    if bps_numeric<>trunc(bps_numeric) or bps_numeric<0 or bps_numeric>10000 or normalized_kind not in ('platform_fee','agency_share','reserve','participant') then
      raise exception 'invalid_revenue_rule_line' using errcode='22023';
    end if;
    bps:=bps_numeric::integer;
    if normalized_kind='platform_fee' then platform_count:=platform_count+1; end if;
    if normalized_kind='participant' then participant_count:=participant_count+1; end if;
    if normalized_kind in ('participant','agency_share') then
      normalized_handle:=lower(trim(coalesce(line->>'handle','')));
      select user_id into recipient_id from public.profiles where handle=normalized_handle;
      if recipient_id is null then raise exception 'invalid_revenue_rule_recipient' using errcode='22023'; end if;
      if normalized_kind='participant' and not exists(
        select 1 from jsonb_array_elements(term_row.terms->'participants') participant(value)
        where lower(participant.value->>'handle')=normalized_handle
      ) then raise exception 'invalid_revenue_rule_recipient' using errcode='22023'; end if;
      if normalized_kind='agency_share' and not exists(
        select 1 from public.workspace_memberships membership
        where membership.user_id=recipient_id and membership.role='agency'::public.app_role and membership.status='approved'
      ) then raise exception 'invalid_revenue_rule_recipient' using errcode='22023'; end if;
    elsif nullif(trim(coalesce(line->>'handle','')),'') is not null then
      raise exception 'invalid_revenue_rule_recipient' using errcode='22023';
    end if;
    bps_total:=bps_total+bps;
  end loop;
  if bps_total<>10000 or platform_count<>1 or participant_count<1 then raise exception 'invalid_revenue_rules' using errcode='22023'; end if;

  insert into public.project_revenue_rules(project_id,contract_lock_receipt_id,version,rules_hash,idempotency_key,created_by_user_id)
  values(project_row.id,contract_row.id,coalesce((select max(version) from public.project_revenue_rules where project_id=project_row.id),0)+1,rules_hash_value,normalized_key,auth.uid())
  returning * into created_row;
  for line in select value from jsonb_array_elements(requested_rules->'lines') item(value) loop
    position_value:=position_value+1;
    normalized_kind:=lower(trim(line->>'kind'));
    recipient_id:=null;
    if normalized_kind in ('participant','agency_share') then
      select user_id into recipient_id from public.profiles where handle=lower(trim(line->>'handle'));
    end if;
    insert into public.project_revenue_rule_lines(revenue_rule_id,line_kind,recipient_user_id,basis_points,position)
    values(created_row.id,normalized_kind,recipient_id,(line->>'basisPoints')::integer,position_value);
  end loop;
  perform private.write_audit(auth.uid(),'project_revenue_rules_configured','success','/studio/projects/'||project_row.public_id||'/earnings','creator',jsonb_build_object('projectPublicId',project_row.public_id,'version',created_row.version,'rulesHash',created_row.rules_hash));
  return jsonb_build_object('projectPublicId',project_row.public_id,'version',created_row.version,'hash',created_row.rules_hash);
end;
$$;

create or replace function private.revenue_rule_account(
  target_line_kind text,
  target_recipient_user_id uuid,
  target_project_id uuid,
  target_currency text
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
begin
  if target_line_kind='platform_fee' then return private.ensure_ledger_account(target_project_id,null,'platform_fee',target_currency); end if;
  if target_line_kind='reserve' then return private.ensure_ledger_account(target_project_id,null,'reserve_restricted',target_currency); end if;
  if target_line_kind='agency_share' then return private.ensure_ledger_account(target_project_id,target_recipient_user_id,'agency_restricted',target_currency); end if;
  return private.ensure_ledger_account(target_project_id,target_recipient_user_id,'participant_restricted',target_currency);
end;
$$;

create or replace function public.sync_payment_ledger(
  requested_provider_key text,
  requested_provider_transaction_ref text,
  requested_processing_fee_minor bigint,
  requested_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare
  payment_row public.payment_transactions%rowtype;
  project_row public.projects%rowtype;
  settlement_row public.payment_ledger_settlements%rowtype;
  rule_row public.project_revenue_rules%rowtype;
  sync_row public.payment_ledger_sync_receipts%rowtype;
  allocation record;
  account_id uuid;
  processor_account_id uuid;
  processing_account_id uuid;
  target_net bigint;
  prior_net bigint:=0;
  prior_fee bigint:=0;
  distributable bigint;
  allocation_delta bigint;
  fee_delta bigint;
  net_delta bigint;
  prior_allocation bigint;
  postings jsonb:='[]'::jsonb;
  journal_id uuid;
  request_hash_value text;
  normalized_key text:=trim(coalesce(requested_idempotency_key,''));
  result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'payment_ledger_sync_not_allowed' using errcode='42501'; end if;
  if requested_provider_key !~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$'
     or char_length(trim(coalesce(requested_provider_transaction_ref,''))) not between 3 and 255
     or requested_processing_fee_minor is null or requested_processing_fee_minor<0
     or char_length(normalized_key) not between 8 and 128 or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception 'invalid_payment_ledger_sync' using errcode='22023';
  end if;
  select * into payment_row from public.payment_transactions
  where provider_key=requested_provider_key and provider_transaction_ref=trim(requested_provider_transaction_ref)
  for update;
  if payment_row.id is null or payment_row.captured_minor<=0 or payment_row.state not in ('captured','partially_refunded','refunded') then
    raise exception 'payment_not_settleable' using errcode='42501';
  end if;
  target_net:=payment_row.captured_minor-payment_row.refunded_minor;
  if requested_processing_fee_minor>target_net then raise exception 'invalid_processing_fee' using errcode='22023'; end if;
  select project.* into project_row
  from public.funding_commitments commitment
  join public.campaign_term_versions campaign_terms on campaign_terms.id=commitment.campaign_term_version_id
  join public.campaigns campaign on campaign.id=campaign_terms.campaign_id
  join public.projects project on project.id=campaign.project_id
  where commitment.id=payment_row.funding_commitment_id;
  request_hash_value:=encode(extensions.digest(convert_to(jsonb_build_object('paymentId',payment_row.id,'capturedMinor',payment_row.captured_minor,'refundedMinor',payment_row.refunded_minor,'processingFeeMinor',requested_processing_fee_minor,'currency',payment_row.currency)::text,'UTF8'),'sha256'),'hex');
  select * into sync_row from public.payment_ledger_sync_receipts where payment_transaction_id=payment_row.id and idempotency_key=normalized_key;
  if sync_row.id is not null then
    if sync_row.request_hash<>request_hash_value then raise exception 'payment_ledger_idempotency_conflict' using errcode='40001'; end if;
    return sync_row.normalized_result;
  end if;
  select * into settlement_row from public.payment_ledger_settlements where payment_transaction_id=payment_row.id for update;
  if settlement_row.payment_transaction_id is null then
    select * into rule_row from public.project_revenue_rules where project_id=project_row.id order by version desc limit 1;
    if rule_row.id is null then raise exception 'revenue_rules_required' using errcode='42501'; end if;
  else
    select * into rule_row from public.project_revenue_rules where id=settlement_row.revenue_rule_id;
    prior_net:=settlement_row.net_captured_minor;
    prior_fee:=settlement_row.processing_fee_minor;
  end if;
  distributable:=target_net-requested_processing_fee_minor;
  net_delta:=target_net-prior_net;
  processor_account_id:=private.ensure_ledger_account(project_row.id,null,'processor_clearing',payment_row.currency);
  processing_account_id:=private.ensure_ledger_account(project_row.id,null,'processing_fee',payment_row.currency);
  if net_delta>0 then postings:=postings||jsonb_build_array(jsonb_build_object('accountId',processor_account_id,'side','debit','amountMinor',net_delta));
  elsif net_delta<0 then postings:=postings||jsonb_build_array(jsonb_build_object('accountId',processor_account_id,'side','credit','amountMinor',abs(net_delta))); end if;
  fee_delta:=requested_processing_fee_minor-prior_fee;
  if fee_delta>0 then postings:=postings||jsonb_build_array(jsonb_build_object('accountId',processing_account_id,'side','credit','amountMinor',fee_delta));
  elsif fee_delta<0 then postings:=postings||jsonb_build_array(jsonb_build_object('accountId',processing_account_id,'side','debit','amountMinor',abs(fee_delta))); end if;

  for allocation in
    with calculated as (
      select line.*,
        floor((distributable::numeric*line.basis_points::numeric)/10000)::bigint as base_minor,
        mod(distributable::numeric*line.basis_points::numeric,10000) as fractional
      from public.project_revenue_rule_lines line
      where line.revenue_rule_id=rule_row.id
    ), ranked as (
      select calculated.*,
        row_number() over(order by fractional desc,position asc) as remainder_rank,
        (distributable-sum(base_minor) over())::bigint as remainder_units
      from calculated
    )
    select ranked.*,
      (base_minor+case when remainder_rank<=remainder_units then 1 else 0 end)::bigint as target_minor
    from ranked order by position
  loop
    select amount_minor into prior_allocation from public.payment_ledger_allocations
    where payment_transaction_id=payment_row.id and revenue_rule_line_id=allocation.id;
    prior_allocation:=coalesce(prior_allocation,0);
    allocation_delta:=allocation.target_minor-prior_allocation;
    account_id:=private.revenue_rule_account(allocation.line_kind,allocation.recipient_user_id,project_row.id,payment_row.currency);
    if allocation_delta>0 then postings:=postings||jsonb_build_array(jsonb_build_object('accountId',account_id,'side','credit','amountMinor',allocation_delta));
    elsif allocation_delta<0 then postings:=postings||jsonb_build_array(jsonb_build_object('accountId',account_id,'side','debit','amountMinor',abs(allocation_delta))); end if;
    insert into public.payment_ledger_allocations(payment_transaction_id,revenue_rule_line_id,amount_minor)
    values(payment_row.id,allocation.id,allocation.target_minor)
    on conflict(payment_transaction_id,revenue_rule_line_id) do update set amount_minor=excluded.amount_minor,updated_at=now();
  end loop;

  if jsonb_array_length(postings)>0 then
    journal_id:=private.post_ledger_transaction(project_row.id,case when net_delta<0 then 'payment_adjustment' else 'payment_settlement' end,payment_row.currency,'payment',payment_row.id::text,normalized_key,postings,jsonb_build_object('netCapturedMinor',target_net,'processingFeeMinor',requested_processing_fee_minor,'revenueRuleVersion',rule_row.version));
  end if;
  insert into public.payment_ledger_settlements(payment_transaction_id,revenue_rule_id,net_captured_minor,processing_fee_minor,last_ledger_transaction_id)
  values(payment_row.id,rule_row.id,target_net,requested_processing_fee_minor,journal_id)
  on conflict(payment_transaction_id) do update set net_captured_minor=excluded.net_captured_minor,processing_fee_minor=excluded.processing_fee_minor,last_ledger_transaction_id=coalesce(excluded.last_ledger_transaction_id,public.payment_ledger_settlements.last_ledger_transaction_id),updated_at=now();
  result:=jsonb_build_object('projectPublicId',project_row.public_id,'currency',payment_row.currency,'netCapturedMinor',target_net,'processingFeeMinor',requested_processing_fee_minor,'journalChanged',journal_id is not null);
  insert into public.payment_ledger_sync_receipts(payment_transaction_id,idempotency_key,request_hash,normalized_result)
  values(payment_row.id,normalized_key,request_hash_value,result);
  perform private.write_audit(null,'payment_ledger_synced','success','finance-settlement',null,jsonb_build_object('projectPublicId',project_row.public_id,'currency',payment_row.currency,'netCapturedMinor',target_net,'processingFeeMinor',requested_processing_fee_minor));
  return result;
end;
$$;

create or replace function public.promote_project_earnings(requested_project_public_id text,requested_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare
  project_row public.projects%rowtype;
  receipt_row public.earnings_promotion_receipts%rowtype;
  account_row record;
  available_account_id uuid;
  restricted_balance bigint;
  currency_value text;
  currency_postings jsonb;
  journal_count integer:=0;
  promoted_minor bigint:=0;
  blocked_participants integer:=0;
  normalized_key text:=trim(coalesce(requested_idempotency_key,''));
  result jsonb;
begin
  perform private.assert_finance_or_service();
  select * into project_row from public.projects where public_id=trim(coalesce(requested_project_public_id,'')) for update;
  if project_row.id is null then raise exception 'unknown_project' using errcode='22023'; end if;
  if char_length(normalized_key) not between 8 and 128 or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then raise exception 'invalid_promotion_request' using errcode='22023'; end if;
  select * into receipt_row from public.earnings_promotion_receipts where project_id=project_row.id and idempotency_key=normalized_key;
  if receipt_row.id is not null then return receipt_row.normalized_result; end if;
  if not private.project_payout_ready(project_row.id) then raise exception 'earnings_promotion_blocked' using errcode='42501'; end if;
  select count(distinct account.owner_user_id)::integer into blocked_participants
  from public.ledger_accounts account
  where account.project_id=project_row.id
    and account.account_code in ('participant_restricted','agency_restricted')
    and private.ledger_account_balance(account.id)>0
    and not private.user_payout_verified(account.owner_user_id);

  for currency_value in
    select distinct account.currency
    from public.ledger_accounts account
    where account.project_id=project_row.id
      and account.account_code in ('participant_restricted','agency_restricted')
      and private.ledger_account_balance(account.id)>0
      and private.user_payout_verified(account.owner_user_id)
    order by account.currency
  loop
    currency_postings:='[]'::jsonb;
    for account_row in
      select * from public.ledger_accounts account
      where account.project_id=project_row.id
        and account.account_code in ('participant_restricted','agency_restricted')
        and account.currency=currency_value
        and private.user_payout_verified(account.owner_user_id)
      order by account.owner_user_id,account.account_code
    loop
      restricted_balance:=private.ledger_account_balance(account_row.id);
      if restricted_balance<=0 then continue; end if;
      available_account_id:=private.ensure_ledger_account(project_row.id,account_row.owner_user_id,'participant_available',currency_value);
      currency_postings:=currency_postings||jsonb_build_array(
        jsonb_build_object('accountId',account_row.id,'side','debit','amountMinor',restricted_balance),
        jsonb_build_object('accountId',available_account_id,'side','credit','amountMinor',restricted_balance)
      );
      promoted_minor:=promoted_minor+restricted_balance;
    end loop;
    if jsonb_array_length(currency_postings)>0 then
      perform private.post_ledger_transaction(
        project_row.id,'earnings_promotion',currency_value,'project-promotion',project_row.id::text||':'||currency_value,
        normalized_key,currency_postings,jsonb_build_object('projectPublicId',project_row.public_id,'currency',currency_value));
      journal_count:=journal_count+1;
    end if;
  end loop;
  result:=jsonb_build_object('projectPublicId',project_row.public_id,'promotedMinor',promoted_minor,'blockedParticipants',blocked_participants,'journalChanged',journal_count>0);
  insert into public.earnings_promotion_receipts(project_id,idempotency_key,normalized_result) values(project_row.id,normalized_key,result);
  perform private.write_audit(case when auth.role()='service_role' then null else auth.uid() end,'project_earnings_promoted','success','finance-earnings',case when auth.role()='service_role' then null else private.current_active_role(auth.uid()) end,result);
  return result;
end;
$$;

create or replace function public.place_earnings_hold(
  requested_project_public_id text,
  requested_participant_handle text,
  requested_amount_minor bigint,
  requested_kind text,
  requested_reason text,
  requested_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare project_row public.projects%rowtype; participant_id uuid; available_account_id uuid; restricted_account_id uuid; available_minor bigint; existing_row public.ledger_holds%rowtype; created_row public.ledger_holds%rowtype; journal_id uuid; candidate text; currency_value text; normalized_kind text:=lower(trim(coalesce(requested_kind,''))); normalized_reason text:=trim(coalesce(requested_reason,'')); normalized_key text:=trim(coalesce(requested_idempotency_key,''));
begin
  perform private.assert_finance_or_service();
  select * into project_row from public.projects where public_id=trim(coalesce(requested_project_public_id,''));
  select user_id into participant_id from public.profiles where handle=lower(trim(coalesce(requested_participant_handle,'')));
  if project_row.id is null or participant_id is null or requested_amount_minor is null or requested_amount_minor<1 or normalized_kind not in ('reserve','dispute','chargeback','campaign','verification')
     or char_length(normalized_reason) not between 3 and 1000 or normalized_reason ~ '[[:cntrl:]]'
     or char_length(normalized_key) not between 8 and 128 or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then raise exception 'invalid_earnings_hold' using errcode='22023'; end if;
  select * into existing_row from public.ledger_holds where project_id=project_row.id and participant_user_id=participant_id and idempotency_key=normalized_key;
  if existing_row.id is not null then
    if existing_row.amount_minor<>requested_amount_minor or existing_row.kind<>normalized_kind or existing_row.reason<>normalized_reason then raise exception 'earnings_hold_idempotency_conflict' using errcode='40001'; end if;
    return jsonb_build_object('publicId',existing_row.public_id,'state',existing_row.state,'amountMinor',existing_row.amount_minor,'currency',existing_row.currency);
  end if;
  select account.currency into currency_value from public.ledger_accounts account
  where account.project_id=project_row.id and account.owner_user_id=participant_id and account.account_code='participant_available' and private.ledger_account_balance(account.id)>=requested_amount_minor
  order by account.currency limit 1;
  if currency_value is null then raise exception 'hold_exceeds_available_balance' using errcode='22023'; end if;
  available_account_id:=private.ensure_ledger_account(project_row.id,participant_id,'participant_available',currency_value);
  available_minor:=private.ledger_account_balance(available_account_id);
  if requested_amount_minor>available_minor then raise exception 'hold_exceeds_available_balance' using errcode='22023'; end if;
  restricted_account_id:=private.ensure_ledger_account(project_row.id,participant_id,'participant_restricted',currency_value);
  journal_id:=private.post_ledger_transaction(project_row.id,'earnings_hold',currency_value,'earnings-hold',project_row.id::text||':'||participant_id::text,normalized_key,jsonb_build_array(
    jsonb_build_object('accountId',available_account_id,'side','debit','amountMinor',requested_amount_minor),
    jsonb_build_object('accountId',restricted_account_id,'side','credit','amountMinor',requested_amount_minor)
  ),jsonb_build_object('kind',normalized_kind,'reason',normalized_reason));
  loop candidate:='hld'||encode(extensions.gen_random_bytes(12),'hex'); exit when not exists(select 1 from public.ledger_holds where public_id=candidate); end loop;
  insert into public.ledger_holds(public_id,project_id,participant_user_id,currency,kind,amount_minor,reason,idempotency_key,placed_ledger_transaction_id)
  values(candidate,project_row.id,participant_id,currency_value,normalized_kind,requested_amount_minor,normalized_reason,normalized_key,journal_id) returning * into created_row;
  perform private.write_audit(case when auth.role()='service_role' then null else auth.uid() end,'earnings_hold_placed','success','finance-holds',case when auth.role()='service_role' then null else private.current_active_role(auth.uid()) end,jsonb_build_object('projectPublicId',project_row.public_id,'holdPublicId',created_row.public_id,'kind',normalized_kind,'amountMinor',requested_amount_minor,'currency',currency_value));
  return jsonb_build_object('publicId',created_row.public_id,'state',created_row.state,'amountMinor',created_row.amount_minor,'currency',created_row.currency);
end;
$$;

create or replace function public.release_earnings_hold(requested_hold_public_id text,requested_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare hold_row public.ledger_holds%rowtype; project_row public.projects%rowtype; restricted_account_id uuid; available_account_id uuid; journal_id uuid; normalized_key text:=trim(coalesce(requested_idempotency_key,''));
begin
  perform private.assert_finance_or_service();
  select * into hold_row from public.ledger_holds where public_id=trim(coalesce(requested_hold_public_id,'')) for update;
  if hold_row.id is null or char_length(normalized_key) not between 8 and 128 or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then raise exception 'invalid_hold_release' using errcode='22023'; end if;
  if hold_row.state='released' then
    if hold_row.release_idempotency_key=normalized_key then return jsonb_build_object('publicId',hold_row.public_id,'state','released'); end if;
    raise exception 'hold_already_released' using errcode='40001';
  end if;
  select * into project_row from public.projects where id=hold_row.project_id;
  if not private.project_payout_ready(project_row.id) or not private.user_payout_verified(hold_row.participant_user_id) then raise exception 'hold_release_blocked' using errcode='42501'; end if;
  restricted_account_id:=private.ensure_ledger_account(project_row.id,hold_row.participant_user_id,'participant_restricted',hold_row.currency);
  available_account_id:=private.ensure_ledger_account(project_row.id,hold_row.participant_user_id,'participant_available',hold_row.currency);
  if private.ledger_account_balance(restricted_account_id)<hold_row.amount_minor then raise exception 'hold_release_balance_conflict' using errcode='40001'; end if;
  journal_id:=private.post_ledger_transaction(project_row.id,'earnings_hold_release',hold_row.currency,'earnings-hold-release',hold_row.id::text,normalized_key,jsonb_build_array(
    jsonb_build_object('accountId',restricted_account_id,'side','debit','amountMinor',hold_row.amount_minor),
    jsonb_build_object('accountId',available_account_id,'side','credit','amountMinor',hold_row.amount_minor)
  ),jsonb_build_object('holdPublicId',hold_row.public_id,'kind',hold_row.kind));
  update public.ledger_holds set state='released',released_ledger_transaction_id=journal_id,release_idempotency_key=normalized_key,released_at=now() where id=hold_row.id;
  perform private.write_audit(case when auth.role()='service_role' then null else auth.uid() end,'earnings_hold_released','success','finance-holds',case when auth.role()='service_role' then null else private.current_active_role(auth.uid()) end,jsonb_build_object('projectPublicId',project_row.public_id,'holdPublicId',hold_row.public_id,'amountMinor',hold_row.amount_minor,'currency',hold_row.currency));
  return jsonb_build_object('publicId',hold_row.public_id,'state','released');
end;
$$;

create or replace function public.request_payout(requested_project_public_id text,requested_amount_minor bigint,requested_currency text,requested_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare project_row public.projects%rowtype; existing_row public.payout_requests%rowtype; available_account_id uuid; pending_account_id uuid; available_minor bigint; journal_id uuid; candidate text; currency_value text:=upper(trim(coalesce(requested_currency,''))); normalized_key text:=trim(coalesce(requested_idempotency_key,''));
begin
  perform private.assert_current_session();
  if requested_amount_minor is null or requested_amount_minor<1 or currency_value !~ '^[A-Z]{3}$' or char_length(normalized_key) not between 8 and 128 or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then raise exception 'invalid_payout_request' using errcode='22023'; end if;
  select * into project_row from public.projects where public_id=trim(coalesce(requested_project_public_id,''));
  if project_row.id is null then raise exception 'payout_not_allowed' using errcode='42501'; end if;
  select * into existing_row from public.payout_requests where participant_user_id=auth.uid() and idempotency_key=normalized_key;
  if existing_row.id is not null then
    if existing_row.project_id<>project_row.id or existing_row.amount_minor<>requested_amount_minor or existing_row.currency<>currency_value then raise exception 'payout_idempotency_conflict' using errcode='40001'; end if;
    return jsonb_build_object('publicId',existing_row.public_id,'state',existing_row.state,'amountMinor',existing_row.amount_minor,'currency',existing_row.currency);
  end if;
  if not private.project_payout_ready(project_row.id) or not private.user_payout_verified(auth.uid()) then raise exception 'payout_not_allowed' using errcode='42501'; end if;
  if exists(select 1 from public.ledger_holds hold where hold.project_id=project_row.id and hold.participant_user_id=auth.uid() and hold.state='open' and hold.kind in ('dispute','chargeback','campaign','verification')) then raise exception 'payout_held' using errcode='42501'; end if;
  available_account_id:=private.ensure_ledger_account(project_row.id,auth.uid(),'participant_available',currency_value);
  available_minor:=private.ledger_account_balance(available_account_id);
  if requested_amount_minor>available_minor then raise exception 'payout_exceeds_available_balance' using errcode='22023'; end if;
  pending_account_id:=private.ensure_ledger_account(project_row.id,auth.uid(),'payout_pending',currency_value);
  loop candidate:='pay'||encode(extensions.gen_random_bytes(12),'hex'); exit when not exists(select 1 from public.payout_requests where public_id=candidate); end loop;
  journal_id:=private.post_ledger_transaction(project_row.id,'payout_reservation',currency_value,'payout',candidate,normalized_key,jsonb_build_array(
    jsonb_build_object('accountId',available_account_id,'side','debit','amountMinor',requested_amount_minor),
    jsonb_build_object('accountId',pending_account_id,'side','credit','amountMinor',requested_amount_minor)
  ),jsonb_build_object('payoutPublicId',candidate));
  insert into public.payout_requests(public_id,participant_user_id,project_id,currency,amount_minor,idempotency_key,reservation_ledger_transaction_id,last_ledger_transaction_id)
  values(candidate,auth.uid(),project_row.id,currency_value,requested_amount_minor,normalized_key,journal_id) returning * into existing_row;
  perform private.write_audit(auth.uid(),'payout_requested','success','/app/earnings',private.current_active_role(auth.uid()),jsonb_build_object('projectPublicId',project_row.public_id,'payoutPublicId',existing_row.public_id,'amountMinor',existing_row.amount_minor,'currency',existing_row.currency));
  return jsonb_build_object('publicId',existing_row.public_id,'state',existing_row.state,'amountMinor',existing_row.amount_minor,'currency',existing_row.currency);
end;
$$;

create or replace function public.create_monthly_payout_batch(requested_month date,requested_currency text,requested_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare existing_row public.payout_batches%rowtype; created_row public.payout_batches%rowtype; month_value date:=date_trunc('month',requested_month::timestamp)::date; currency_value text:=upper(trim(coalesce(requested_currency,''))); normalized_key text:=trim(coalesce(requested_idempotency_key,'')); candidate text; payout_count bigint;
begin
  perform private.assert_finance_or_service();
  if requested_month is null or requested_month<>month_value or month_value>date_trunc('month',current_date)::date or currency_value !~ '^[A-Z]{3}$' or char_length(normalized_key) not between 8 and 128 or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then raise exception 'invalid_payout_batch' using errcode='22023'; end if;
  select * into existing_row from public.payout_batches where idempotency_key=normalized_key;
  if existing_row.id is not null then
    if existing_row.month_start<>month_value or existing_row.currency<>currency_value then raise exception 'payout_batch_idempotency_conflict' using errcode='40001'; end if;
    select count(*) into payout_count from public.payout_requests where payout_batch_id=existing_row.id;
    return jsonb_build_object('publicId',existing_row.public_id,'state',existing_row.state,'month',existing_row.month_start,'currency',existing_row.currency,'payoutCount',payout_count);
  end if;
  loop candidate:='pbt'||encode(extensions.gen_random_bytes(12),'hex'); exit when not exists(select 1 from public.payout_batches where public_id=candidate); end loop;
  insert into public.payout_batches(public_id,month_start,currency,idempotency_key,created_by_user_id)
  values(candidate,month_value,currency_value,normalized_key,case when auth.role()='service_role' then null else auth.uid() end) returning * into created_row;
  update public.payout_requests set payout_batch_id=created_row.id,state='processing',updated_at=now()
  where state='requested' and currency=currency_value and created_at>=month_value::timestamptz and created_at<(month_value+interval '1 month')::timestamptz;
  get diagnostics payout_count=row_count;
  perform private.write_audit(case when auth.role()='service_role' then null else auth.uid() end,'monthly_payout_batch_created','success','finance-payouts',case when auth.role()='service_role' then null else private.current_active_role(auth.uid()) end,jsonb_build_object('batchPublicId',created_row.public_id,'month',created_row.month_start,'currency',created_row.currency,'payoutCount',payout_count));
  return jsonb_build_object('publicId',created_row.public_id,'state',created_row.state,'month',created_row.month_start,'currency',created_row.currency,'payoutCount',payout_count);
end;
$$;

create or replace function public.apply_payout_provider_event(
  requested_payout_public_id text,
  requested_provider_key text,
  requested_event_id text,
  requested_provider_payout_ref text,
  requested_state text,
  requested_reported_amount_minor bigint,
  requested_occurred_at timestamptz,
  requested_signature_verified boolean
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare payout_row public.payout_requests%rowtype; project_row public.projects%rowtype; existing_event public.payout_provider_events%rowtype; created_event public.payout_provider_events%rowtype; normalized_state text:=lower(trim(coalesce(requested_state,''))); payload_hash_value text; pending_account_id uuid; destination_account_id uuid; journal_id uuid; candidate text; case_row public.finance_reconciliation_cases%rowtype;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'payout_provider_event_not_allowed' using errcode='42501'; end if;
  if requested_signature_verified is distinct from true then raise exception 'invalid_payout_provider_signature' using errcode='42501'; end if;
  if requested_provider_key !~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$' or char_length(trim(coalesce(requested_event_id,''))) not between 3 and 255 or char_length(trim(coalesce(requested_provider_payout_ref,''))) not between 3 and 255 or normalized_state not in ('paid','failed') or requested_reported_amount_minor is null or requested_reported_amount_minor<0 or requested_occurred_at is null then raise exception 'invalid_payout_provider_event' using errcode='22023'; end if;
  select * into payout_row from public.payout_requests where public_id=trim(coalesce(requested_payout_public_id,'')) for update;
  if payout_row.id is null then raise exception 'unknown_payout' using errcode='22023'; end if;
  payload_hash_value:=encode(extensions.digest(convert_to(jsonb_build_object('payoutPublicId',payout_row.public_id,'providerKey',requested_provider_key,'eventId',requested_event_id,'providerPayoutRef',requested_provider_payout_ref,'state',normalized_state,'reportedAmountMinor',requested_reported_amount_minor,'occurredAt',requested_occurred_at)::text,'UTF8'),'sha256'),'hex');
  select * into existing_event from public.payout_provider_events where provider_key=requested_provider_key and event_id=trim(requested_event_id);
  if existing_event.id is not null then
    if existing_event.payload_hash<>payload_hash_value then raise exception 'payout_provider_event_conflict' using errcode='40001'; end if;
    return jsonb_build_object('payoutPublicId',payout_row.public_id,'state',payout_row.state,'ignored',existing_event.ignored);
  end if;
  select * into project_row from public.projects where id=payout_row.project_id;
  if normalized_state='paid' and requested_reported_amount_minor<>payout_row.amount_minor then
    insert into public.payout_provider_events(payout_request_id,provider_key,event_id,provider_payout_ref,payload_hash,normalized_state,reported_amount_minor,occurred_at,ignored)
    values(payout_row.id,requested_provider_key,trim(requested_event_id),trim(requested_provider_payout_ref),payload_hash_value,normalized_state,requested_reported_amount_minor,requested_occurred_at,true) returning * into created_event;
    loop candidate:='fin'||encode(extensions.gen_random_bytes(12),'hex'); exit when not exists(select 1 from public.finance_reconciliation_cases where public_id=candidate); end loop;
    insert into public.finance_reconciliation_cases(public_id,project_id,payout_request_id,provider_event_id,kind,expected_minor,observed_minor,currency,note)
    values(candidate,project_row.id,payout_row.id,created_event.id,'payout_amount_mismatch',payout_row.amount_minor,requested_reported_amount_minor,payout_row.currency,'Provider-reported payout amount differs from the reserved payout amount.') returning * into case_row;
    perform private.write_audit(null,'payout_reconciliation_case_opened','success','finance-reconciliation',null,jsonb_build_object('projectPublicId',project_row.public_id,'payoutPublicId',payout_row.public_id,'casePublicId',case_row.public_id,'expectedMinor',payout_row.amount_minor,'observedMinor',requested_reported_amount_minor,'currency',payout_row.currency));
    return jsonb_build_object('payoutPublicId',payout_row.public_id,'state',payout_row.state,'ignored',true,'reconciliationCasePublicId',case_row.public_id);
  end if;
  if payout_row.state='paid' or payout_row.state='failed' then
    insert into public.payout_provider_events(payout_request_id,provider_key,event_id,provider_payout_ref,payload_hash,normalized_state,reported_amount_minor,occurred_at,ignored)
    values(payout_row.id,requested_provider_key,trim(requested_event_id),trim(requested_provider_payout_ref),payload_hash_value,normalized_state,requested_reported_amount_minor,requested_occurred_at,true) returning * into created_event;
    return jsonb_build_object('payoutPublicId',payout_row.public_id,'state',payout_row.state,'ignored',true);
  end if;
  if payout_row.state<>'processing' then raise exception 'payout_not_processing' using errcode='42501'; end if;
  pending_account_id:=private.ensure_ledger_account(project_row.id,payout_row.participant_user_id,'payout_pending',payout_row.currency);
  if private.ledger_account_balance(pending_account_id)<payout_row.amount_minor then raise exception 'payout_pending_balance_conflict' using errcode='40001'; end if;
  if normalized_state='paid' then
    destination_account_id:=private.ensure_ledger_account(project_row.id,payout_row.participant_user_id,'payout_settled',payout_row.currency);
    journal_id:=private.post_ledger_transaction(project_row.id,'payout_paid',payout_row.currency,'payout-provider',payout_row.id::text,trim(requested_event_id),jsonb_build_array(
      jsonb_build_object('accountId',pending_account_id,'side','debit','amountMinor',payout_row.amount_minor),
      jsonb_build_object('accountId',destination_account_id,'side','credit','amountMinor',payout_row.amount_minor)
    ),jsonb_build_object('payoutPublicId',payout_row.public_id));
    update public.payout_requests set state='paid',provider_key=requested_provider_key,provider_payout_ref=trim(requested_provider_payout_ref),last_ledger_transaction_id=journal_id,paid_at=requested_occurred_at,updated_at=now() where id=payout_row.id;
  else
    destination_account_id:=private.ensure_ledger_account(project_row.id,payout_row.participant_user_id,'participant_available',payout_row.currency);
    journal_id:=private.post_ledger_transaction(project_row.id,'payout_failed',payout_row.currency,'payout-provider',payout_row.id::text,trim(requested_event_id),jsonb_build_array(
      jsonb_build_object('accountId',pending_account_id,'side','debit','amountMinor',payout_row.amount_minor),
      jsonb_build_object('accountId',destination_account_id,'side','credit','amountMinor',payout_row.amount_minor)
    ),jsonb_build_object('payoutPublicId',payout_row.public_id));
    update public.payout_requests set state='failed',provider_key=requested_provider_key,provider_payout_ref=trim(requested_provider_payout_ref),last_ledger_transaction_id=journal_id,updated_at=now() where id=payout_row.id;
  end if;
  insert into public.payout_provider_events(payout_request_id,provider_key,event_id,provider_payout_ref,payload_hash,normalized_state,reported_amount_minor,occurred_at,ignored)
  values(payout_row.id,requested_provider_key,trim(requested_event_id),trim(requested_provider_payout_ref),payload_hash_value,normalized_state,requested_reported_amount_minor,requested_occurred_at,false);
  perform private.write_audit(null,'payout_provider_event_applied','success','finance-payouts',null,jsonb_build_object('projectPublicId',project_row.public_id,'payoutPublicId',payout_row.public_id,'state',normalized_state,'amountMinor',payout_row.amount_minor,'currency',payout_row.currency));
  return jsonb_build_object('payoutPublicId',payout_row.public_id,'state',normalized_state,'ignored',false);
end;
$$;

create or replace function public.retry_payout(requested_payout_public_id text,requested_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare payout_row public.payout_requests%rowtype; project_row public.projects%rowtype; retry_row public.payout_retry_receipts%rowtype; available_account_id uuid; pending_account_id uuid; journal_id uuid; normalized_key text:=trim(coalesce(requested_idempotency_key,''));
begin
  perform private.assert_current_session();
  select * into payout_row from public.payout_requests where public_id=trim(coalesce(requested_payout_public_id,'')) for update;
  if payout_row.id is null or char_length(normalized_key) not between 8 and 128 or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then raise exception 'invalid_payout_retry' using errcode='22023'; end if;
  if auth.uid()<>payout_row.participant_user_id and private.current_active_role(auth.uid()) not in ('finance'::public.app_role,'super_admin'::public.app_role) then raise exception 'payout_retry_not_allowed' using errcode='42501'; end if;
  select * into retry_row from public.payout_retry_receipts where payout_request_id=payout_row.id and idempotency_key=normalized_key;
  if retry_row.id is not null then return jsonb_build_object('publicId',payout_row.public_id,'state',payout_row.state,'attemptCount',payout_row.attempt_count); end if;
  if payout_row.state<>'failed' then raise exception 'payout_retry_not_allowed' using errcode='42501'; end if;
  select * into project_row from public.projects where id=payout_row.project_id;
  if not private.project_payout_ready(project_row.id) or not private.user_payout_verified(payout_row.participant_user_id) or exists(select 1 from public.ledger_holds hold where hold.project_id=project_row.id and hold.participant_user_id=payout_row.participant_user_id and hold.state='open' and hold.kind in ('dispute','chargeback','campaign','verification')) then raise exception 'payout_retry_not_allowed' using errcode='42501'; end if;
  available_account_id:=private.ensure_ledger_account(project_row.id,payout_row.participant_user_id,'participant_available',payout_row.currency);
  if private.ledger_account_balance(available_account_id)<payout_row.amount_minor then raise exception 'payout_exceeds_available_balance' using errcode='22023'; end if;
  pending_account_id:=private.ensure_ledger_account(project_row.id,payout_row.participant_user_id,'payout_pending',payout_row.currency);
  journal_id:=private.post_ledger_transaction(project_row.id,'payout_retry',payout_row.currency,'payout-retry',payout_row.id::text,normalized_key,jsonb_build_array(
    jsonb_build_object('accountId',available_account_id,'side','debit','amountMinor',payout_row.amount_minor),
    jsonb_build_object('accountId',pending_account_id,'side','credit','amountMinor',payout_row.amount_minor)
  ),jsonb_build_object('payoutPublicId',payout_row.public_id,'attemptCount',payout_row.attempt_count+1));
  insert into public.payout_retry_receipts(payout_request_id,idempotency_key) values(payout_row.id,normalized_key);
  update public.payout_requests set state='requested',payout_batch_id=null,provider_key=null,provider_payout_ref=null,attempt_count=attempt_count+1,last_ledger_transaction_id=journal_id,updated_at=now() where id=payout_row.id returning * into payout_row;
  perform private.write_audit(auth.uid(),'payout_retried','success','/app/earnings',private.current_active_role(auth.uid()),jsonb_build_object('projectPublicId',project_row.public_id,'payoutPublicId',payout_row.public_id,'attemptCount',payout_row.attempt_count));
  return jsonb_build_object('publicId',payout_row.public_id,'state',payout_row.state,'attemptCount',payout_row.attempt_count);
end;
$$;

create or replace function public.get_my_earnings()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
begin
  perform private.assert_current_session();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'projectPublicId',project.public_id,
      'projectTitle',coalesce(project_version.title,'Untitled project'),
      'currency',account.currency,
      'restrictedMinor',coalesce((select sum(private.ledger_account_balance(a.id)) from public.ledger_accounts a where a.project_id=project.id and a.owner_user_id=auth.uid() and a.currency=account.currency and a.account_code in ('participant_restricted','agency_restricted')),0),
      'availableMinor',coalesce((select sum(private.ledger_account_balance(a.id)) from public.ledger_accounts a where a.project_id=project.id and a.owner_user_id=auth.uid() and a.currency=account.currency and a.account_code='participant_available'),0),
      'pendingPayoutMinor',coalesce((select sum(private.ledger_account_balance(a.id)) from public.ledger_accounts a where a.project_id=project.id and a.owner_user_id=auth.uid() and a.currency=account.currency and a.account_code='payout_pending'),0),
      'paidMinor',coalesce((select sum(private.ledger_account_balance(a.id)) from public.ledger_accounts a where a.project_id=project.id and a.owner_user_id=auth.uid() and a.currency=account.currency and a.account_code='payout_settled'),0),
      'openHoldMinor',coalesce((select sum(hold.amount_minor) from public.ledger_holds hold where hold.project_id=project.id and hold.participant_user_id=auth.uid() and hold.currency=account.currency and hold.state='open'),0),
      'payoutEligible',private.project_payout_ready(project.id) and private.user_payout_verified(auth.uid()) and not exists(select 1 from public.ledger_holds hold where hold.project_id=project.id and hold.participant_user_id=auth.uid() and hold.state='open' and hold.kind in ('dispute','chargeback','campaign','verification'))
    ) order by project.updated_at desc,account.currency)
    from (
      select distinct project_id,currency from public.ledger_accounts where owner_user_id=auth.uid()
    ) account
    join public.projects project on project.id=account.project_id
    left join public.project_versions project_version on project_version.project_id=project.id and project_version.revision=project.current_revision
  ),'[]'::jsonb);
end;
$$;

create or replace function public.get_earnings_statement(requested_project_public_id text,requested_from date,requested_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare project_row public.projects%rowtype;
begin
  perform private.assert_current_session();
  if requested_from is null or requested_to is null or requested_from>requested_to or requested_to-requested_from>366 then raise exception 'invalid_statement_period' using errcode='22023'; end if;
  select * into project_row from public.projects where public_id=trim(coalesce(requested_project_public_id,''));
  if project_row.id is null or not exists(select 1 from public.ledger_accounts where project_id=project_row.id and owner_user_id=auth.uid()) then raise exception 'statement_not_allowed' using errcode='42501'; end if;
  return jsonb_build_object(
    'projectPublicId',project_row.public_id,'from',requested_from,'to',requested_to,
    'entries',coalesce((
      select jsonb_agg(jsonb_build_object(
        'journalPublicId',transaction.public_id,'kind',transaction.kind,'currency',transaction.currency,
        'account',account.account_code,'side',posting.side,'amountMinor',posting.amount_minor,'occurredAt',transaction.effective_at
      ) order by transaction.effective_at,posting.id)
      from public.ledger_postings posting
      join public.ledger_accounts account on account.id=posting.ledger_account_id
      join public.ledger_transactions transaction on transaction.id=posting.ledger_transaction_id
      where account.project_id=project_row.id and account.owner_user_id=auth.uid()
        and transaction.effective_at>=requested_from::timestamptz and transaction.effective_at<(requested_to+1)::timestamptz
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.list_my_payouts()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
begin
  perform private.assert_current_session();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'publicId',payout.public_id,
      'projectPublicId',project.public_id,
      'projectTitle',coalesce(project_version.title,'Untitled project'),
      'amountMinor',payout.amount_minor,
      'currency',payout.currency,
      'state',payout.state,
      'attemptCount',payout.attempt_count,
      'createdAt',payout.created_at,
      'paidAt',payout.paid_at
    ) order by payout.created_at desc)
    from public.payout_requests payout
    join public.projects project on project.id=payout.project_id
    left join public.project_versions project_version on project_version.project_id=project.id and project_version.revision=project.current_revision
    where payout.participant_user_id=auth.uid()
  ),'[]'::jsonb);
end;
$$;

create or replace function public.list_finance_payout_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
begin
  perform private.assert_finance_or_service();
  return jsonb_build_object(
    'payouts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'publicId',payout.public_id,'projectPublicId',project.public_id,'participantHandle',profile.handle,
        'amountMinor',payout.amount_minor,'currency',payout.currency,'state',payout.state,'attemptCount',payout.attempt_count,
        'batchPublicId',batch.public_id,'createdAt',payout.created_at
      ) order by payout.created_at desc)
      from public.payout_requests payout
      join public.projects project on project.id=payout.project_id
      join public.profiles profile on profile.user_id=payout.participant_user_id
      left join public.payout_batches batch on batch.id=payout.payout_batch_id
      where payout.state in ('requested','processing','failed')
    ),'[]'::jsonb),
    'holds',coalesce((
      select jsonb_agg(jsonb_build_object('publicId',hold.public_id,'projectPublicId',project.public_id,'participantHandle',profile.handle,'kind',hold.kind,'amountMinor',hold.amount_minor,'currency',hold.currency,'state',hold.state,'reason',hold.reason,'createdAt',hold.created_at) order by hold.created_at desc)
      from public.ledger_holds hold join public.projects project on project.id=hold.project_id join public.profiles profile on profile.user_id=hold.participant_user_id where hold.state='open'
    ),'[]'::jsonb),
    'reconciliationCases',coalesce((
      select jsonb_agg(jsonb_build_object('publicId',finance_case.public_id,'projectPublicId',project.public_id,'payoutPublicId',payout.public_id,'kind',finance_case.kind,'expectedMinor',finance_case.expected_minor,'observedMinor',finance_case.observed_minor,'currency',finance_case.currency,'state',finance_case.state,'note',finance_case.note,'createdAt',finance_case.created_at) order by finance_case.created_at desc)
      from public.finance_reconciliation_cases finance_case join public.projects project on project.id=finance_case.project_id left join public.payout_requests payout on payout.id=finance_case.payout_request_id where finance_case.state='open'
    ),'[]'::jsonb)
  );
end;
$$;

comment on table public.ledger_transactions is 'Immutable Slice 14 journal headers. All product money movement is represented by balanced postings.';
comment on table public.ledger_postings is 'Immutable debit/credit postings. Authenticated clients never receive raw account or processor identifiers.';
comment on table public.payment_ledger_settlements is 'Mutable cumulative reconciliation cursor pinned to one immutable revenue-rule version per processor transaction.';
comment on table public.payout_provider_events is 'Immutable provider payout event receipts. Raw provider references remain server-only.';

revoke all on function private.reject_finance_history_mutation() from public,anon,authenticated;
revoke all on function private.assert_ledger_transaction_balanced(uuid) from public,anon,authenticated;
revoke all on function private.check_ledger_posting_balance() from public,anon,authenticated;
revoke all on function private.assert_finance_or_service() from public,anon,authenticated;
revoke all on function private.ensure_ledger_account(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function private.ledger_account_balance(uuid) from public,anon,authenticated;
revoke all on function private.post_ledger_transaction(uuid,text,text,text,text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function private.user_payout_verified(uuid) from public,anon,authenticated;
revoke all on function private.project_payout_ready(uuid) from public,anon,authenticated;
revoke all on function private.revenue_rule_account(text,uuid,uuid,text) from public,anon,authenticated;

revoke all on function public.configure_project_revenue_rules(text,jsonb,text) from public,anon,authenticated;
revoke all on function public.sync_payment_ledger(text,text,bigint,text) from public,anon,authenticated;
revoke all on function public.promote_project_earnings(text,text) from public,anon,authenticated;
revoke all on function public.place_earnings_hold(text,text,bigint,text,text,text) from public,anon,authenticated;
revoke all on function public.release_earnings_hold(text,text) from public,anon,authenticated;
revoke all on function public.request_payout(text,bigint,text,text) from public,anon,authenticated;
revoke all on function public.create_monthly_payout_batch(date,text,text) from public,anon,authenticated;
revoke all on function public.apply_payout_provider_event(text,text,text,text,text,bigint,timestamptz,boolean) from public,anon,authenticated;
revoke all on function public.retry_payout(text,text) from public,anon,authenticated;
revoke all on function public.get_my_earnings() from public,anon,authenticated;
revoke all on function public.get_earnings_statement(text,date,date) from public,anon,authenticated;
revoke all on function public.list_my_payouts() from public,anon,authenticated;
revoke all on function public.list_finance_payout_queue() from public,anon,authenticated;

grant execute on function public.configure_project_revenue_rules(text,jsonb,text) to authenticated;
grant execute on function public.sync_payment_ledger(text,text,bigint,text) to service_role;
grant execute on function public.promote_project_earnings(text,text) to authenticated,service_role;
grant execute on function public.place_earnings_hold(text,text,bigint,text,text,text) to authenticated,service_role;
grant execute on function public.release_earnings_hold(text,text) to authenticated,service_role;
grant execute on function public.request_payout(text,bigint,text,text) to authenticated;
grant execute on function public.create_monthly_payout_batch(date,text,text) to authenticated,service_role;
grant execute on function public.apply_payout_provider_event(text,text,text,text,text,bigint,timestamptz,boolean) to service_role;
grant execute on function public.retry_payout(text,text) to authenticated;
grant execute on function public.get_my_earnings() to authenticated;
grant execute on function public.get_earnings_statement(text,date,date) to authenticated;
grant execute on function public.list_my_payouts() to authenticated;
grant execute on function public.list_finance_payout_queue() to authenticated,service_role;

notify pgrst, 'reload schema';
