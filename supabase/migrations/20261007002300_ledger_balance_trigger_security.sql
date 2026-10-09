-- Remove the temporary service-role private-schema dependency by making the
-- deferred ledger-balance trigger execute under the trusted database owner.

create or replace function private.check_ledger_posting_balance()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
begin
  perform private.assert_ledger_transaction_balanced(
    case when tg_op='DELETE' then old.ledger_transaction_id else new.ledger_transaction_id end
  );
  return null;
end;
$$;

revoke usage on schema private from service_role;

notify pgrst,'reload schema';
