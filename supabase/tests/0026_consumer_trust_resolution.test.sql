begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','consumer_disputes','consumer dispute register exists');
select has_table('public','consumer_dispute_events','consumer dispute history exists');
select has_table('public','appeal_cases','appeal register exists');
select has_table('public','appeal_case_events','appeal history exists');

select has_function('public','report_content',array['text','text','text','text'],'consumer reporting RPC exists');
select has_function('public','create_consumer_dispute',array['text','text','text','text','text'],'consumer dispute RPC exists');
select has_function('public','withdraw_consumer_dispute',array['text','text'],'consumer dispute withdrawal RPC exists');
select has_function('public','create_appeal',array['text','text','text'],'consumer appeal RPC exists');
select has_function('public','list_my_trust_cases',array[]::text[],'consumer trust projection exists');
select has_function('public','list_trust_staff_queue',array['text'],'staff trust queue projection exists');
select has_function('public','review_consumer_dispute',array['text','text','text'],'staff dispute review RPC exists');
select has_function('public','review_appeal',array['text','text','text'],'staff appeal review RPC exists');

select ok(not has_table_privilege('authenticated','public.consumer_disputes','SELECT'),'raw disputes are not client-readable');
select ok(not has_table_privilege('authenticated','public.consumer_dispute_events','SELECT'),'raw dispute history is not client-readable');
select ok(not has_table_privilege('authenticated','public.appeal_cases','SELECT'),'raw appeals are not client-readable');
select ok(not has_table_privilege('authenticated','public.appeal_case_events','SELECT'),'raw appeal history is not client-readable');

select has_trigger('public','consumer_dispute_events','consumer_dispute_events_immutable','dispute history is append-only');
select has_trigger('public','appeal_case_events','appeal_case_events_immutable','appeal history is append-only');

select ok(
  position('supporter_user_id=auth.uid()' in replace(lower(pg_get_functiondef('public.create_consumer_dispute(text,text,text,text,text)'::regprocedure)),' ',''))>0
  and position('release_entitlements' in lower(pg_get_functiondef('public.create_consumer_dispute(text,text,text,text,text)'::regprocedure)))>0,
  'disputes are limited to funding/release resources owned by the signed-in consumer'
);

select ok(
  position('requester_user_id=auth.uid()' in replace(lower(pg_get_functiondef('public.create_appeal(text,text,text)'::regprocedure)),' ',''))>0
  and position('state=''resolved''' in replace(lower(pg_get_functiondef('public.create_appeal(text,text,text)'::regprocedure)),' ',''))>0,
  'appeals require an owned eligible final source decision'
);

insert into auth.users(id,email,email_confirmed_at)
values
  ('26000000-0000-0000-0000-000000000001','trust-consumer@lux.test',now()),
  ('26000000-0000-0000-0000-000000000002','trust-target@lux.test',now()),
  ('26000000-0000-0000-0000-000000000003','trust-support@lux.test',now());

update public.profiles set handle='trust_consumer' where user_id='26000000-0000-0000-0000-000000000001';
update public.profiles set handle='trust_target' where user_id='26000000-0000-0000-0000-000000000002';
update public.profiles set handle='trust_support' where user_id='26000000-0000-0000-0000-000000000003';

insert into public.workspace_memberships(user_id,role,status,reviewed_at,reviewed_by)
values('26000000-0000-0000-0000-000000000003','support','approved',now(),'26000000-0000-0000-0000-000000000003')
on conflict(user_id,role) do update set status='approved',reviewed_at=now(),reviewed_by=excluded.reviewed_by;

select set_config('request.jwt.claims','{"sub":"26000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;

select lives_ok(
  $q$select set_config('test.trust_support_case',(public.create_support_case('Account access problem','The expected account workflow is unavailable after signing in.')->>'publicId'),true)$q$,
  'consumer can create a support case'
);
select lives_ok(
  $q$select public.report_content('profile','trust_target','Profile safety concern','The visible profile content should be reviewed against platform rules.')$q$,
  'consumer can report a visible profile through the moderated intake'
);
select is(
  jsonb_array_length(public.list_my_trust_cases()->'support'),
  1,
  'consumer trust projection includes only the consumer support case'
);
select is(
  jsonb_array_length(public.list_my_trust_cases()->'reports'),
  1,
  'consumer trust projection includes the consumer report'
);
reset role;

update public.active_workspaces
set membership_id=(select id from public.workspace_memberships where user_id='26000000-0000-0000-0000-000000000003' and role='support')
where user_id='26000000-0000-0000-0000-000000000003';

select set_config('request.jwt.claims','{"sub":"26000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
set local role authenticated;

select ok(private.staff_can_access_admin_queue(auth.uid(),'disputes'),'support staff can access dispute queue');
select ok(private.staff_can_access_admin_queue(auth.uid(),'appeals'),'support staff can access appeal queue');
select lives_ok(
  $q$select public.resolve_admin_case('support',current_setting('test.trust_support_case'),'Resolved after support review','CONFIRM')$q$,
  'support staff can resolve the consumer case'
);
reset role;

select set_config('request.jwt.claims','{"sub":"26000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select lives_ok(
  $q$select set_config('test.trust_appeal',(public.create_appeal('support_case',current_setting('test.trust_support_case'),'The resolution did not address the documented account-access problem and should be reviewed again.')->>'publicId'),true)$q$,
  'consumer can appeal an owned resolved support case'
);
select is(
  jsonb_array_length(public.list_my_trust_cases()->'appeals'),
  1,
  'consumer trust projection includes the appeal'
);
reset role;

select set_config('request.jwt.claims','{"sub":"26000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select lives_ok(
  $q$select public.review_appeal(current_setting('test.trust_appeal'),'start_review','Support is reviewing the appeal and the original evidence again.')$q$,
  'support staff can start appeal review'
);
select lives_ok(
  $q$select public.review_appeal(current_setting('test.trust_appeal'),'overturn','The prior resolution was incomplete, so the source support case is reopened.')$q$,
  'support staff can overturn the appeal'
);
reset role;

select is(
  (select state from public.support_cases where public_id=current_setting('test.trust_support_case')),
  'in_progress',
  'overturning the appeal reopens the source support case'
);
select is(
  (select state from public.appeal_cases where public_id=current_setting('test.trust_appeal')),
  'overturned',
  'appeal final state is durable'
);
select ok(
  (select count(*) from public.appeal_case_events where appeal_id=(select id from public.appeal_cases where public_id=current_setting('test.trust_appeal'))) >= 3,
  'appeal lifecycle is append-only and records open, review, and decision events'
);

select * from finish();
rollback;
