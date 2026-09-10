begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','ledger_accounts','chart of accounts exists');
select has_table('public','ledger_transactions','immutable journal headers exist');
select has_table('public','ledger_postings','immutable double-entry postings exist');
select has_table('public','project_revenue_rules','versioned revenue rules exist');
select has_table('public','project_revenue_rule_lines','explicit split lines exist');
select has_table('public','payment_ledger_settlements','processor truth is reconciled into the journal');
select has_table('public','ledger_holds','reserve and dispute holds exist');
select has_table('public','payout_requests','idempotent payout reservations exist');
select has_table('public','payout_provider_events','immutable provider payout events exist');
select has_table('public','finance_reconciliation_cases','reconciliation differences create operations cases');

select has_function('public','configure_project_revenue_rules',array['text','jsonb','text'],'project split rules are configured through an RPC');
select has_function('public','sync_payment_ledger',array['text','text','bigint','text'],'captured/refunded processor truth settles idempotently');
select has_function('public','promote_project_earnings',array['text','text'],'restricted earnings promote only after release gates pass');
select has_function('public','place_earnings_hold',array['text','text','bigint','text','text','text'],'finance can place auditable holds');
select has_function('public','release_earnings_hold',array['text','text'],'finance can release auditable holds');
select has_function('public','request_payout',array['text','bigint','text','text'],'participant payout reservation is idempotent and capped');
select has_function('public','apply_payout_provider_event',array['text','text','text','text','text','bigint','timestamptz','boolean'],'provider payout events reconcile idempotently');
select has_function('public','get_my_earnings',array[]::text[],'participants receive a safe journal-backed earnings projection');
select has_function('public','list_my_payouts',array[]::text[],'participants receive payout status without provider identifiers');
select has_function('public','list_finance_payout_queue',array[]::text[],'finance receives a safe payout queue projection');
select has_function('public','get_earnings_statement',array['text','date','date'],'participants can download statement data from the same journal');

select ok(not has_table_privilege('authenticated','public.ledger_accounts','SELECT'),'clients cannot read raw account rows');
select ok(not has_table_privilege('authenticated','public.ledger_transactions','SELECT'),'clients cannot read raw journal headers');
select ok(not has_table_privilege('authenticated','public.ledger_postings','SELECT'),'clients cannot read raw journal postings');
select ok(not has_table_privilege('authenticated','public.payment_ledger_settlements','SELECT'),'clients cannot read processor settlement internals');
select ok(not has_table_privilege('authenticated','public.payout_provider_events','SELECT'),'clients cannot read provider payout references');
select ok(not has_table_privilege('authenticated','public.finance_reconciliation_cases','SELECT'),'clients cannot read finance operations cases directly');

select * from finish();
rollback;
