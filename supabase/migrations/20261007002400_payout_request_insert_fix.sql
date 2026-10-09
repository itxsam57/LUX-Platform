-- Fix the payout reservation insert so both reservation and last-ledger references
-- are initialized to the same journal transaction on first request.

create or replace function public.request_payout(
  requested_project_public_id text,
  requested_amount_minor bigint,
  requested_currency text,
  requested_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare
  project_row public.projects%rowtype;
  existing_row public.payout_requests%rowtype;
  available_account_id uuid;
  pending_account_id uuid;
  available_minor bigint;
  journal_id uuid;
  candidate text;
  currency_value text:=upper(trim(coalesce(requested_currency,'')));
  normalized_key text:=trim(coalesce(requested_idempotency_key,''));
begin
  perform private.assert_current_session();

  if requested_amount_minor is null
     or requested_amount_minor<1
     or currency_value !~ '^[A-Z]{3}$'
     or char_length(normalized_key) not between 8 and 128
     or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception 'invalid_payout_request' using errcode='22023';
  end if;

  select * into project_row
  from public.projects
  where public_id=trim(coalesce(requested_project_public_id,''));

  if project_row.id is null then
    raise exception 'payout_not_allowed' using errcode='42501';
  end if;

  select * into existing_row
  from public.payout_requests
  where participant_user_id=auth.uid()
    and idempotency_key=normalized_key;

  if existing_row.id is not null then
    if existing_row.project_id<>project_row.id
       or existing_row.amount_minor<>requested_amount_minor
       or existing_row.currency<>currency_value then
      raise exception 'payout_idempotency_conflict' using errcode='40001';
    end if;
    return jsonb_build_object(
      'publicId',existing_row.public_id,
      'state',existing_row.state,
      'amountMinor',existing_row.amount_minor,
      'currency',existing_row.currency
    );
  end if;

  if not private.project_payout_ready(project_row.id)
     or not private.user_payout_verified(auth.uid()) then
    raise exception 'payout_not_allowed' using errcode='42501';
  end if;

  if exists(
    select 1
    from public.ledger_holds hold
    where hold.project_id=project_row.id
      and hold.participant_user_id=auth.uid()
      and hold.state='open'
      and hold.kind in ('dispute','chargeback','campaign','verification')
  ) then
    raise exception 'payout_held' using errcode='42501';
  end if;

  available_account_id:=private.ensure_ledger_account(
    project_row.id,auth.uid(),'participant_available',currency_value
  );
  available_minor:=private.ledger_account_balance(available_account_id);

  if requested_amount_minor>available_minor then
    raise exception 'payout_exceeds_available_balance' using errcode='22023';
  end if;

  pending_account_id:=private.ensure_ledger_account(
    project_row.id,auth.uid(),'payout_pending',currency_value
  );

  loop
    candidate:='pay'||encode(extensions.gen_random_bytes(12),'hex');
    exit when not exists(select 1 from public.payout_requests where public_id=candidate);
  end loop;

  journal_id:=private.post_ledger_transaction(
    project_row.id,
    'payout_reservation',
    currency_value,
    'payout',
    candidate,
    normalized_key,
    jsonb_build_array(
      jsonb_build_object('accountId',available_account_id,'side','debit','amountMinor',requested_amount_minor),
      jsonb_build_object('accountId',pending_account_id,'side','credit','amountMinor',requested_amount_minor)
    ),
    jsonb_build_object('payoutPublicId',candidate)
  );

  insert into public.payout_requests(
    public_id,
    participant_user_id,
    project_id,
    currency,
    amount_minor,
    idempotency_key,
    reservation_ledger_transaction_id,
    last_ledger_transaction_id
  )
  values(
    candidate,
    auth.uid(),
    project_row.id,
    currency_value,
    requested_amount_minor,
    normalized_key,
    journal_id,
    journal_id
  )
  returning * into existing_row;

  perform private.write_audit(
    auth.uid(),
    'payout_requested',
    'success',
    '/app/earnings',
    private.current_active_role(auth.uid()),
    jsonb_build_object(
      'projectPublicId',project_row.public_id,
      'payoutPublicId',existing_row.public_id,
      'amountMinor',existing_row.amount_minor,
      'currency',existing_row.currency
    )
  );

  return jsonb_build_object(
    'publicId',existing_row.public_id,
    'state',existing_row.state,
    'amountMinor',existing_row.amount_minor,
    'currency',existing_row.currency
  );
end;
$$;

notify pgrst,'reload schema';
