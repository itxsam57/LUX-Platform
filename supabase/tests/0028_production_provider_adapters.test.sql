begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','payment_checkout_sessions','opaque payment checkout session receipts exist');
select has_table('public','payout_dispatch_receipts','payout dispatch state exists');
select has_table('public','payout_dispatch_events','immutable payout dispatch history exists');
select has_table('public','age_assurance_provider_sessions','age provider sessions exist');
select has_table('public','age_assurance_provider_events','age provider event history exists');
select has_table('public','verification_provider_events','identity provider event history exists');

select has_function('public','record_payment_checkout_session',array['text','text','text','timestamp with time zone','text'],'supporter checkout receipt RPC exists');
select has_function('public','assert_initial_payment_provider_event',array['text','text','text','bigint','bigint','timestamp with time zone'],'initial payment event checkout/amount assertion exists');
select has_function('public','prepare_payout_dispatch',array['text','text','text'],'payout dispatch preparation RPC exists');
select has_function('public','complete_payout_dispatch',array['text','text','text','text'],'payout dispatch completion RPC exists');
select has_function('public','apply_verified_payout_provider_event',array['text','text','text','text','text','bigint','timestamp with time zone'],'verified payout provider event RPC exists');
select has_function('public','start_age_assurance_provider_session',array['text','text','text','text','timestamp with time zone'],'age provider session RPC exists');
select has_function('public','apply_age_assurance_provider_event',array['text','text','text','uuid','text','text','timestamp with time zone','timestamp with time zone','text'],'age provider result RPC exists');
select has_function('public','apply_verification_provider_event',array['text','text','text','text','boolean','boolean','timestamp with time zone','timestamp with time zone','text'],'identity provider result RPC exists');

select ok(not has_table_privilege('authenticated','public.payment_checkout_sessions','SELECT'),'checkout provider references are not client-readable');
select ok(not has_table_privilege('authenticated','public.payout_dispatch_receipts','SELECT'),'payout dispatch provider references are not client-readable');
select ok(not has_table_privilege('authenticated','public.age_assurance_provider_sessions','SELECT'),'age provider references are not client-readable');
select ok(not has_table_privilege('authenticated','public.verification_provider_events','SELECT'),'identity provider event history is not client-readable');

select has_trigger('public','payout_dispatch_events','payout_dispatch_events_immutable','payout dispatch event history is append-only');
select has_trigger('public','age_assurance_provider_events','age_assurance_provider_events_immutable','age provider event history is append-only');
select has_trigger('public','verification_provider_events','verification_provider_events_immutable','identity provider event history is append-only');

select ok(
  position('supporter_user_id=auth.uid()' in replace(lower(pg_get_functiondef('public.record_payment_checkout_session(text,text,text,timestamp with time zone,text)'::regprocedure)),' ',''))>0,
  'checkout sessions can only be attached by the owning supporter'
);

select ok(
  position('payment_checkout_sessions' in lower(pg_get_functiondef('public.assert_initial_payment_provider_event(text,text,text,bigint,bigint,timestamp with time zone)'::regprocedure)))>0
  and position('requested_authorized_minor<>commitment_row.amount_minor' in replace(lower(pg_get_functiondef('public.assert_initial_payment_provider_event(text,text,text,bigint,bigint,timestamp with time zone)'::regprocedure)),' ',''))>0
  and position('requested_captured_minor<>commitment_row.amount_minor' in replace(lower(pg_get_functiondef('public.assert_initial_payment_provider_event(text,text,text,bigint,bigint,timestamp with time zone)'::regprocedure)),' ',''))>0,
  'first production payment event must match a real unexpired checkout and exact commitment amount'
);

select ok(
  position('state=''prepared''' in replace(lower(pg_get_functiondef('public.prepare_payout_dispatch(text,text,text)'::regprocedure)),' ',''))>0
  and position('state=''dispatched''' in replace(lower(pg_get_functiondef('public.complete_payout_dispatch(text,text,text,text)'::regprocedure)),' ',''))>0,
  'payout dispatch uses a durable prepare then complete state machine'
);

select ok(
  position('state=''dispatched''' in replace(lower(pg_get_functiondef('public.apply_verified_payout_provider_event(text,text,text,text,text,bigint,timestamp with time zone)'::regprocedure)),' ',''))>0
  and position('public.apply_payout_provider_event' in lower(pg_get_functiondef('public.apply_verified_payout_provider_event(text,text,text,text,text,bigint,timestamp with time zone)'::regprocedure)))>0,
  'final payout callbacks require a matching completed dispatch before entering the ledger state machine'
);

select ok(
  position('auth.role()' in lower(pg_get_functiondef('public.apply_age_assurance_provider_event(text,text,text,uuid,text,text,timestamp with time zone,timestamp with time zone,text)'::regprocedure)))>0
  and position('''service_role''' in lower(pg_get_functiondef('public.apply_age_assurance_provider_event(text,text,text,uuid,text,text,timestamp with time zone,timestamp with time zone,text)'::regprocedure)))>0,
  'age provider results are service-only'
);

select ok(
  position('synthetic=false' in replace(lower(pg_get_functiondef('public.apply_verification_provider_event(text,text,text,text,boolean,boolean,timestamp with time zone,timestamp with time zone,text)'::regprocedure)),' ',''))>0
  and position('v3_prerequisites_incomplete' in lower(pg_get_functiondef('public.apply_verification_provider_event(text,text,text,text,boolean,boolean,timestamp with time zone,timestamp with time zone,text)'::regprocedure)))>0,
  'production identity callbacks cannot attach to synthetic sessions and preserve V3 prerequisites'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema='public'
      and table_name in (
        'payment_checkout_sessions',
        'payout_dispatch_receipts',
        'payout_dispatch_events',
        'age_assurance_provider_sessions',
        'age_assurance_provider_events',
        'verification_provider_events'
      )
      and lower(column_name) ~ '(pan|cvv|card_number|bank_account|routing|iban|document|selfie|biometric|date_of_birth|dob)'
  ),
  0,
  'provider adapter persistence contains no raw card, bank, identity-document, biometric, or birth-date fields'
);

select * from finish();
rollback;
