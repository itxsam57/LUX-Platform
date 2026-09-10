begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','copyright_rights_registrations','private rights registry exists');
select has_table('public','copyright_watermark_jobs','watermark job history exists');
select has_table('public','copyright_cases','copyright case state exists');
select has_table('public','copyright_case_events','immutable copyright case history exists');
select has_table('public','copyright_evidence_packages','private evidence packages exist');
select has_table('public','copyright_notice_records','immutable notice generation and submission history exists');
select has_table('public','copyright_repeat_infringer_signals','repeat-infringer signals exist');

select has_function('public','register_release_rights',array['text','text','text','text','text','text'],'creator rights registration RPC exists');
select has_function('public','list_creator_rights_registry',array[]::text[],'creator rights registry projection exists');
select has_function('public','list_creator_copyright_cases',array[]::text[],'rights-owner case projection exists');
select has_function('public','list_copyright_intake_queue',array[]::text[],'privacy-safe copied-release intake queue exists');
select has_function('public','list_copyright_staff_cases',array[]::text[],'copyright staff queue projection exists');
select has_function('public','open_copyright_case_from_report',array['text','text'],'copied-release intake can become a governed case');
select has_function('public','advance_copyright_case',array['text','text','text','text'],'governed case lifecycle mutation exists');
select has_function('public','record_copyright_source_match',array['text','text','text','text'],'privacy-safe source matching RPC exists');
select has_function('public','record_copyright_watermark_job',array['text','text','text','text'],'watermark provider result RPC exists');
select has_function('public','get_copyright_case_evidence',array['text','text'],'scoped audited evidence access RPC exists');

select ok(not has_table_privilege('authenticated','public.copyright_rights_registrations','SELECT'),'clients cannot read raw ownership evidence');
select ok(not has_table_privilege('authenticated','public.copyright_watermark_jobs','SELECT'),'clients cannot read raw watermark records');
select ok(not has_table_privilege('authenticated','public.copyright_cases','SELECT'),'clients cannot read raw copyright cases');
select ok(not has_table_privilege('authenticated','public.copyright_case_events','SELECT'),'clients cannot read raw case history');
select ok(not has_table_privilege('authenticated','public.copyright_evidence_packages','SELECT'),'clients cannot read raw evidence packages');
select ok(not has_table_privilege('authenticated','public.copyright_notice_records','SELECT'),'clients cannot read raw generated notice records');
select ok(not has_table_privilege('authenticated','public.copyright_repeat_infringer_signals','SELECT'),'clients cannot read repeat-infringer internals');

select has_trigger('public','copyright_rights_registrations','copyright_rights_registrations_immutable','rights evidence is immutable');
select has_trigger('public','copyright_case_events','copyright_case_events_immutable','case event history is immutable');
select has_trigger('public','copyright_evidence_packages','copyright_evidence_packages_immutable','evidence packages are immutable');
select has_trigger('public','copyright_notice_records','copyright_notice_records_immutable','generated notice history is immutable');
select has_trigger('public','copyright_watermark_jobs','copyright_watermark_jobs_history_guard','watermark job history has guarded mutation');

select ok(
  position('purchaser_user_id' in lower(pg_get_functiondef('public.list_creator_copyright_cases()'::regprocedure)))=0,
  'creator case projection does not expose purchaser identity'
);
select ok(
  position('reporter_user_id' in lower(pg_get_functiondef('public.list_copyright_intake_queue()'::regprocedure)))=0,
  'staff intake projection does not expose reporter identity'
);
select ok(
  position('supporter_user_id' in lower(pg_get_functiondef('public.list_creator_copyright_cases()'::regprocedure)))=0,
  'creator case projection does not expose supporter identity'
);
select ok(
  position('write_audit' in lower(pg_get_functiondef('public.get_copyright_case_evidence(text,text)'::regprocedure)))>0,
  'staff evidence access is audit logged'
);
-- Verify the delegated authorization through the RPC, not source spelling.
insert into auth.users(id,email) values('15000000-0000-0000-0000-000000000001','copyright-roles@lux.test');
insert into public.workspace_memberships(user_id,role,status,reviewed_at,reviewed_by)
select '15000000-0000-0000-0000-000000000001',role,'approved',now(),'15000000-0000-0000-0000-000000000001'
from unnest(enum_range(null::public.app_role)) role
on conflict(user_id,role) do nothing;
select set_config('request.jwt.claims','{"sub":"15000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
update public.active_workspaces set membership_id=(select id from public.workspace_memberships where user_id='15000000-0000-0000-0000-000000000001' and role='fan') where user_id='15000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($q$select public.get_copyright_case_evidence('missing-case','Investigating reported infringement')$q$,'42501','copyright_staff_required','fan evidence RPC enforces copyright role boundary');
reset role;
update public.active_workspaces set membership_id=(select id from public.workspace_memberships where user_id='15000000-0000-0000-0000-000000000001' and role='creator') where user_id='15000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($q$select public.get_copyright_case_evidence('missing-case','Investigating reported infringement')$q$,'42501','copyright_staff_required','creator evidence RPC enforces copyright role boundary');
reset role;
update public.active_workspaces set membership_id=(select id from public.workspace_memberships where user_id='15000000-0000-0000-0000-000000000001' and role='agency') where user_id='15000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($q$select public.get_copyright_case_evidence('missing-case','Investigating reported infringement')$q$,'42501','copyright_staff_required','agency evidence RPC enforces copyright role boundary');
reset role;
update public.active_workspaces set membership_id=(select id from public.workspace_memberships where user_id='15000000-0000-0000-0000-000000000001' and role='reviewer') where user_id='15000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($q$select public.get_copyright_case_evidence('missing-case','Investigating reported infringement')$q$,'42501','copyright_staff_required','reviewer evidence RPC enforces copyright role boundary');
reset role;
update public.active_workspaces set membership_id=(select id from public.workspace_memberships where user_id='15000000-0000-0000-0000-000000000001' and role='moderator') where user_id='15000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($q$select public.get_copyright_case_evidence('missing-case','Investigating reported infringement')$q$,'42501','copyright_staff_required','moderator evidence RPC enforces copyright role boundary');
reset role;
update public.active_workspaces set membership_id=(select id from public.workspace_memberships where user_id='15000000-0000-0000-0000-000000000001' and role='finance') where user_id='15000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($q$select public.get_copyright_case_evidence('missing-case','Investigating reported infringement')$q$,'42501','copyright_staff_required','finance evidence RPC enforces copyright role boundary');
reset role;
update public.active_workspaces set membership_id=(select id from public.workspace_memberships where user_id='15000000-0000-0000-0000-000000000001' and role='copyright') where user_id='15000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($q$select public.get_copyright_case_evidence('missing-case','Investigating reported infringement')$q$,'P0001','copyright_case_not_found','copyright evidence RPC enforces copyright role boundary');
reset role;
update public.active_workspaces set membership_id=(select id from public.workspace_memberships where user_id='15000000-0000-0000-0000-000000000001' and role='support') where user_id='15000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($q$select public.get_copyright_case_evidence('missing-case','Investigating reported infringement')$q$,'42501','copyright_staff_required','support evidence RPC enforces copyright role boundary');
reset role;
update public.active_workspaces set membership_id=(select id from public.workspace_memberships where user_id='15000000-0000-0000-0000-000000000001' and role='super_admin') where user_id='15000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($q$select public.get_copyright_case_evidence('missing-case','Investigating reported infringement')$q$,'P0001','copyright_case_not_found','super_admin evidence RPC enforces copyright role boundary');
reset role;
select ok(
  position('closed_false_positive' in lower(pg_get_functiondef('public.advance_copyright_case(text,text,text,text)'::regprocedure)))>0
  and position('counter_notice' in lower(pg_get_functiondef('public.advance_copyright_case(text,text,text,text)'::regprocedure)))>0,
  'case lifecycle includes false-positive and counter-notice paths'
);
select ok(
  position('universal' in lower(pg_get_functiondef('public.advance_copyright_case(text,text,text,text)'::regprocedure)))=0,
  'case lifecycle never claims universal deletion'
);
select ok(
  position('copyright_notice_records' in lower(pg_get_functiondef('public.advance_copyright_case(text,text,text,text)'::regprocedure)))>0
  and position('drafted' in lower(pg_get_functiondef('public.advance_copyright_case(text,text,text,text)'::regprocedure)))>0
  and position('submitted' in lower(pg_get_functiondef('public.advance_copyright_case(text,text,text,text)'::regprocedure)))>0,
  'case lifecycle persists generated notice and submission history'
);
select ok(
  position('noticeDocumentReference' in pg_get_functiondef('public.get_copyright_case_evidence(text,text)'::regprocedure))>0
  and position('noticeDocumentSha256' in pg_get_functiondef('public.get_copyright_case_evidence(text,text)'::regprocedure))>0
  and position('noticeHistory' in pg_get_functiondef('public.get_copyright_case_evidence(text,text)'::regprocedure))>0,
  'audited evidence projection exposes privacy-safe notice artifact history'
);

select * from finish();
rollback;
