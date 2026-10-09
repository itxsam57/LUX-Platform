begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function(
  'public',
  'request_payout',
  array['text','bigint','text','text'],
  'payout reservation RPC remains available'
);

select ok(
  position(
    'reservation_ledger_transaction_id,last_ledger_transaction_id'
    in regexp_replace(lower(pg_get_functiondef('public.request_payout(text,bigint,text,text)'::regprocedure)), E'\s+', '', 'g')
  ) > 0
  and position(
    'journal_id,journal_id'
    in regexp_replace(lower(pg_get_functiondef('public.request_payout(text,bigint,text,text)'::regprocedure)), E'\s+', '', 'g')
  ) > 0,
  'first payout request initializes both ledger references from the reservation journal'
);

select * from finish();
rollback;
