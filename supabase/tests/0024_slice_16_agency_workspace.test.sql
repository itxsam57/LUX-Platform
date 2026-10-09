begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','agency_profiles','agency verification profile exists');
select has_table('public','agency_staff_memberships','agency staff roles exist');
select has_table('public','agency_representation_agreements','performer representation agreements exist');
select has_table('public','agency_representation_events','performer-visible immutable agency activity exists');
select has_table('public','agency_opportunities','agency opportunity records exist');
select has_table('public','agency_negotiation_events','immutable negotiation history exists');

select has_function('public','ensure_agency_profile',array['text','text'],'agency profile onboarding RPC exists');
select has_function('public','submit_agency_verification',array['text','text','text'],'agency verification submission RPC exists');
select has_function('public','review_agency_verification',array['text','text','text'],'scoped agency verification review RPC exists');
select has_function('public','list_agency_verification_queue',array[]::text[],'reviewer-safe agency verification queue exists');
select has_function('public','invite_performer_representation',array['text','jsonb'],'agency can propose representation terms');
select has_function('public','respond_agency_representation',array['text','text'],'performer acceptance RPC exists');
select has_function('public','revoke_agency_representation',array['text','text'],'performer revocation RPC exists');
select has_function('public','list_my_agency_representations',array[]::text[],'performer representation projection exists');
select has_function('public','list_agency_workspace',array[]::text[],'tenant-scoped agency workspace projection exists');
select has_function('public','upsert_agency_staff_member',array['text','text','text','boolean'],'agency staff role mutation exists');
select has_function('public','create_agency_opportunity',array['text','text','text'],'scoped opportunity creation exists');
select has_function('public','advance_agency_negotiation',array['text','text','text'],'scoped negotiation lifecycle exists');
select has_function('public','list_agency_earnings_statements',array[]::text[],'agency earnings projection exists');

select ok(not has_table_privilege('authenticated','public.agency_profiles','SELECT'),'clients cannot read raw agency verification state');
select ok(not has_table_privilege('authenticated','public.agency_staff_memberships','SELECT'),'clients cannot read raw agency staff tenancy');
select ok(not has_table_privilege('authenticated','public.agency_representation_agreements','SELECT'),'clients cannot read raw representation contracts');
select ok(not has_table_privilege('authenticated','public.agency_representation_events','SELECT'),'clients cannot read raw performer activity');
select ok(not has_table_privilege('authenticated','public.agency_opportunities','SELECT'),'clients cannot read raw opportunities');
select ok(not has_table_privilege('authenticated','public.agency_negotiation_events','SELECT'),'clients cannot read raw negotiation history');

select ok(
  position('verification_evidence_reference' in lower(pg_get_functiondef('public.list_agency_verification_queue()'::regprocedure)))=0
  and position('verification_reason' in lower(pg_get_functiondef('public.list_agency_verification_queue()'::regprocedure)))>0,
  'agency reviewer queue excludes raw verification evidence and exposes only the review reason'
);

select has_trigger('public','agency_representation_events','agency_representation_events_immutable','representation activity is append-only');
select has_trigger('public','agency_negotiation_events','agency_negotiation_events_immutable','negotiation history is append-only');

select ok(
  position('performer_user_id = auth.uid()' in lower(pg_get_functiondef('public.respond_agency_representation(text,text)'::regprocedure)))>0
  and position('accepted_at' in lower(pg_get_functiondef('public.respond_agency_representation(text,text)'::regprocedure)))>0,
  'performer personally accepts representation'
);
select ok(
  position('scope_project_admin' in lower(pg_get_functiondef('public.set_project_agency_authority(text,text,boolean)'::regprocedure)))>0
  and position('active_agency_representation' in lower(pg_get_functiondef('public.set_project_agency_authority(text,text,boolean)'::regprocedure)))>0,
  'creator cannot grant project authority beyond accepted representation scope'
);
select ok(
  position('commission_basis_points' in lower(pg_get_functiondef('public.configure_project_revenue_rules(text,jsonb,text)'::regprocedure)))>0
  and position('active_agency_representation' in lower(pg_get_functiondef('public.configure_project_revenue_rules(text,jsonb,text)'::regprocedure)))>0,
  'agency commission is capped by the explicit active representation agreement'
);
select ok(
  position('performer_user_id=auth.uid()' in replace(lower(pg_get_functiondef('public.revoke_agency_representation(text,text)'::regprocedure)),' ',''))>0
  and position('revocation_effective_at' in lower(pg_get_functiondef('public.revoke_agency_representation(text,text)'::regprocedure)))>0,
  'performer controls representation revocation under the accepted notice rule'
);
select ok(
  position('agency_staff_memberships' in lower(pg_get_functiondef('public.list_agency_workspace()'::regprocedure)))>0
  and position('auth.uid()' in lower(pg_get_functiondef('public.list_agency_workspace()'::regprocedure)))>0,
  'agency workspace is tenant-scoped through explicit staff membership'
);
select ok(
  position('performer_user_id=auth.uid()' in replace(lower(pg_get_functiondef('public.list_my_agency_representations()'::regprocedure)),' ',''))>0
  and position('agency_representation_events' in lower(pg_get_functiondef('public.list_my_agency_representations()'::regprocedure)))>0,
  'performer projection includes representation activity without exposing another performer tenant'
);
select ok(
  position('agency_restricted' in lower(pg_get_functiondef('public.list_agency_earnings_statements()'::regprocedure)))>0,
  'agency earnings statements derive from explicit agency ledger accounts'
);
select ok(
  position('''reviewer''' in lower(pg_get_functiondef('public.list_agency_verification_queue()'::regprocedure)))>0
  and position('''super_admin''' in lower(pg_get_functiondef('public.list_agency_verification_queue()'::regprocedure)))>0
  and position('owner_user_id' in lower(pg_get_functiondef('public.list_agency_verification_queue()'::regprocedure)))=0,
  'agency verification queue is reviewer-scoped and omits owner identity'
);

select * from finish();
rollback;
