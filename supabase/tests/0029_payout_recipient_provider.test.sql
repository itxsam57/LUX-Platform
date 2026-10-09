begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','payout_recipient_accounts','provider payout recipient account state exists');
select has_table('public','payout_recipient_provider_events','payout recipient provider history exists');
select has_function('public','start_payout_recipient_onboarding',array['text','text','timestamp with time zone'],'payout recipient onboarding RPC exists');
select has_function('public','apply_payout_recipient_provider_event',array['text','text','uuid','text','text','boolean','timestamp with time zone','text'],'payout recipient callback RPC exists');
select has_function('public','get_my_payout_recipient_status',array[]::text[],'safe payout recipient status projection exists');
select has_function('public','get_payout_dispatch_context',array['text'],'service-only payout dispatch context exists');

select ok(not has_table_privilege('authenticated','public.payout_recipient_accounts','SELECT'),'raw provider recipient references are not client-readable');
select ok(not has_table_privilege('authenticated','public.payout_recipient_provider_events','SELECT'),'raw recipient callback history is not client-readable');
select has_trigger('public','payout_recipient_provider_events','payout_recipient_provider_events_immutable','recipient provider history is append-only');

select ok(
  position('private.verification_is_current(auth.uid(),''v2'')' in replace(lower(pg_get_functiondef('public.start_payout_recipient_onboarding(text,text,timestamp with time zone)'::regprocedure)),' ',''))>0,
  'payout recipient onboarding requires current V2 identity verification'
);

select ok(
  position('payout_ownership_verified=false' in replace(lower(pg_get_functiondef('public.start_payout_recipient_onboarding(text,text,timestamp with time zone)'::regprocedure)),' ',''))>0,
  're-onboarding fails closed by clearing payout ownership until the provider verifies it again'
);

select ok(
  position('payout_ownership_verified=excluded.payout_ownership_verified' in replace(lower(pg_get_functiondef('public.apply_payout_recipient_provider_event(text,text,uuid,text,text,boolean,timestamp with time zone,text)'::regprocedure)),' ',''))>0,
  'provider recipient ownership result feeds the performer payout-ownership prerequisite'
);

select ok(
  position('state=''verified''' in replace(lower(pg_get_functiondef('public.get_payout_dispatch_context(text)'::regprocedure)),' ',''))>0
  and position('ownership_verified=true' in replace(lower(pg_get_functiondef('public.get_payout_dispatch_context(text)'::regprocedure)),' ',''))>0,
  'provider payout dispatch requires a verified owned recipient account'
);

select ok(
  position('payout_recipient_accounts' in lower(pg_get_functiondef('private.user_payout_verified(uuid)'::regprocedure)))>0
  and position('state=''verified''' in replace(lower(pg_get_functiondef('private.user_payout_verified(uuid)'::regprocedure)),' ',''))>0,
  'payout eligibility now requires an actually verified provider recipient'
);

select ok(
  position('performer.liveness_expires_at>now()' in replace(lower(pg_get_functiondef('private.verification_is_current(uuid,public.verification_level)'::regprocedure)),' ',''))>0
  and position('performer.payout_ownership_verified' in lower(pg_get_functiondef('private.verification_is_current(uuid,public.verification_level)'::regprocedure)))>0
  and position('private.has_current_consent_education' in lower(pg_get_functiondef('private.verification_is_current(uuid,public.verification_level)'::regprocedure)))>0,
  'V3 current status dynamically depends on liveness, payout ownership, and consent education'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema='public'
      and table_name in ('payout_recipient_accounts','payout_recipient_provider_events')
      and lower(column_name) ~ '(bank|account_number|routing|iban|document|identity_number|tax_id)'
  ),
  0,
  'payout recipient persistence contains no bank, KYC document, identity-number, or tax-id fields'
);

select * from finish();
rollback;
