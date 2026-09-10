begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','moderation_cases','moderation operations queue exists');
select has_table('public','moderation_case_events','moderation history exists');
select has_table('public','support_cases','support operations queue exists');
select has_table('public','support_case_events','support history exists');
select has_table('public','operational_incidents','incident register exists');
select has_table('public','operational_incident_events','incident history exists');
select has_table('public','legal_holds','legal hold register exists');
select has_table('public','legal_hold_events','legal hold history exists');
select has_table('public','abuse_holds','abuse hold register exists');
select has_table('public','abuse_hold_events','abuse hold history exists');
select has_table('public','operational_rate_limits','rate limit configuration exists');
select has_table('public','operational_rate_limit_events','rate limit change history exists');
select has_table('public','operational_rate_limit_buckets','rate limit counters exist');

select has_function('private','staff_can_access_admin_queue',array['uuid','text'],'server-side staff queue capability matrix exists');
select has_function('public','get_admin_overview',array[]::text[],'super-admin overview RPC exists');
select has_function('public','list_admin_queue',array['text'],'scoped operational queue RPC exists');
select has_function('public','search_operations',array['text'],'scoped operational search RPC exists');
select has_function('public','list_audit_explorer',array['integer'],'scoped audit explorer RPC exists');
select has_function('public','list_operational_incidents',array[]::text[],'incident and hold projection exists');
select has_function('public','perform_critical_admin_action',array['text','text','text','text'],'confirmed critical admin mutation exists');
select has_function('public','list_operational_rate_limits',array[]::text[],'rate limit projection exists');
select has_function('public','update_operational_rate_limit',array['text','integer','integer','boolean','text','text'],'confirmed rate limit mutation exists');

select ok(not has_table_privilege('authenticated','public.moderation_cases','SELECT'),'raw moderation records are not client-readable');
select ok(not has_table_privilege('authenticated','public.support_cases','SELECT'),'raw support records are not client-readable');
select ok(not has_table_privilege('authenticated','public.operational_incidents','SELECT'),'raw incidents are not client-readable');
select ok(not has_table_privilege('authenticated','public.legal_holds','SELECT'),'raw legal holds are not client-readable');
select ok(not has_table_privilege('authenticated','public.abuse_holds','SELECT'),'raw abuse holds are not client-readable');
select ok(not has_table_privilege('authenticated','public.operational_rate_limit_buckets','SELECT'),'rate-limit subject counters are never client-readable');

select has_trigger('public','audit_events','audit_events_immutable','audit history is immutable even for privileged SQL paths');
select has_trigger('public','moderation_case_events','moderation_case_events_immutable','moderation history is append-only');
select has_trigger('public','support_case_events','support_case_events_immutable','support history is append-only');
select has_trigger('public','operational_incident_events','operational_incident_events_immutable','incident history is append-only');
select has_trigger('public','legal_hold_events','legal_hold_events_immutable','legal-hold history is append-only');
select has_trigger('public','abuse_hold_events','abuse_hold_events_immutable','abuse-hold history is append-only');
select has_trigger('public','operational_rate_limit_events','operational_rate_limit_events_immutable','rate-limit history is append-only');

select ok(
  position('''reviewer''' in lower(pg_get_functiondef('private.staff_can_access_admin_queue(uuid,text)'::regprocedure)))>0
  and position('''moderator''' in lower(pg_get_functiondef('private.staff_can_access_admin_queue(uuid,text)'::regprocedure)))>0
  and position('''finance''' in lower(pg_get_functiondef('private.staff_can_access_admin_queue(uuid,text)'::regprocedure)))>0
  and position('''copyright''' in lower(pg_get_functiondef('private.staff_can_access_admin_queue(uuid,text)'::regprocedure)))>0
  and position('''support''' in lower(pg_get_functiondef('private.staff_can_access_admin_queue(uuid,text)'::regprocedure)))>0
  and position('''super_admin''' in lower(pg_get_functiondef('private.staff_can_access_admin_queue(uuid,text)'::regprocedure)))>0,
  'database capability matrix recognizes every scoped staff role'
);

select ok(
  position('confirmation_value <> ''CONFIRM''' in pg_get_functiondef('public.perform_critical_admin_action(text,text,text,text)'::regprocedure))>0
  and position('char_length(normalized_reason) not between 8 and 1000' in pg_get_functiondef('public.perform_critical_admin_action(text,text,text,text)'::regprocedure))>0,
  'critical operations require explicit confirmation and a meaningful reason'
);

select ok(
  position('private.staff_can_access_admin_queue(auth.uid(), normalized_queue)' in pg_get_functiondef('public.list_admin_queue(text)'::regprocedure))>0,
  'queue listing checks server-side staff capability before reading operational state'
);

select ok(
  position('private.staff_can_access_admin_queue(auth.uid(), ''audit'')' in pg_get_functiondef('public.list_audit_explorer(integer)'::regprocedure))>0,
  'audit explorer is limited to the dedicated audit capability'
);

select ok(
  position('provider_reference' in lower(pg_get_functiondef('public.search_operations(text)'::regprocedure)))=0
  and position('private_brief' in lower(pg_get_functiondef('public.search_operations(text)'::regprocedure)))=0
  and position('evidence_reference' in lower(pg_get_functiondef('public.search_operations(text)'::regprocedure)))=0,
  'operational search does not project provider, private-brief, or raw evidence references'
);

select ok(
  position('encode(extensions.digest' in lower(pg_get_functiondef('private.consume_operational_rate_limit(text,uuid)'::regprocedure)))>0,
  'rate-limit counters use a one-way subject hash rather than storing user ids'
);

select * from finish();
rollback;
