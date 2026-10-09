begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','production_workspaces','production workspace persistence exists');
select has_table('public','production_tasks','production task persistence exists');
select has_table('public','production_assets','private production asset registry exists');
select has_table('public','production_asset_access_tokens','private production asset token registry exists');
select has_table('public','production_updates','supporter update workflow exists');
select has_table('public','project_access_revocations','collaborator access revocation exists');
select has_function('public','get_production_workspace',array['text'],'production workspace projection exists');
select has_function('public','issue_production_asset_access',array['text'],'short lived production asset access exists');
select has_function('public','resolve_production_asset_access',array['text'],'production asset token resolver exists');
select has_function('public','list_supporter_production_updates',array['text'],'supporter safe published update projection exists');
select has_function('public','revoke_project_collaborator_access',array['text','text','text'],'collaborator revocation RPC exists');
select ok(has_function_privilege('authenticated','public.issue_production_asset_access(text)','EXECUTE'),'authenticated project members may request scoped asset access');
select ok(not has_table_privilege('authenticated','public.production_workspaces','SELECT'),'authenticated clients cannot read production workspace rows directly');
select ok(not has_table_privilege('authenticated','public.production_tasks','SELECT'),'authenticated clients cannot read production task rows directly');
select ok(not has_table_privilege('authenticated','public.production_assets','SELECT'),'authenticated clients cannot read the private asset registry directly');
select ok(not has_table_privilege('authenticated','public.production_asset_access_tokens','SELECT'),'authenticated clients cannot read private asset access tokens directly');
select ok(not has_table_privilege('authenticated','public.production_updates','SELECT'),'authenticated clients cannot read production update rows directly');
select ok(not has_table_privilege('authenticated','public.project_access_revocations','SELECT'),'authenticated clients cannot read collaborator revocation rows directly');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','11000000-0000-0000-0000-0000000000a1','authenticated','authenticated','s11-owner@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','11000000-0000-0000-0000-0000000000a2','authenticated','authenticated','s11-assignee@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','11000000-0000-0000-0000-0000000000a3','authenticated','authenticated','s11-collaborator@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','11000000-0000-0000-0000-0000000000a4','authenticated','authenticated','s11-outsider@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','11000000-0000-0000-0000-0000000000a5','authenticated','authenticated','s11-supporter@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

update public.profiles set
 handle=case user_id
   when '11000000-0000-0000-0000-0000000000a1' then 's11_owner'
   when '11000000-0000-0000-0000-0000000000a2' then 's11_assignee'
   when '11000000-0000-0000-0000-0000000000a3' then 's11_collaborator'
   when '11000000-0000-0000-0000-0000000000a4' then 's11_outsider'
   else 's11_supporter' end,
 display_name=case user_id
   when '11000000-0000-0000-0000-0000000000a1' then 'Slice 11 Owner'
   when '11000000-0000-0000-0000-0000000000a2' then 'Slice 11 Assignee'
   when '11000000-0000-0000-0000-0000000000a3' then 'Slice 11 Collaborator'
   when '11000000-0000-0000-0000-0000000000a4' then 'Slice 11 Outsider'
   else 'Slice 11 Supporter' end,
 visibility='public'
where user_id in (
 '11000000-0000-0000-0000-0000000000a1','11000000-0000-0000-0000-0000000000a2',
 '11000000-0000-0000-0000-0000000000a3','11000000-0000-0000-0000-0000000000a4',
 '11000000-0000-0000-0000-0000000000a5');

insert into public.age_assurance_records(user_id,method,status,jurisdiction_code,policy_version,expires_at)
select id,'self_attestation','accepted','PK','slice-11-production-test',now()+interval '1 year' from auth.users
where id in (
 '11000000-0000-0000-0000-0000000000a1','11000000-0000-0000-0000-0000000000a2',
 '11000000-0000-0000-0000-0000000000a3','11000000-0000-0000-0000-0000000000a4',
 '11000000-0000-0000-0000-0000000000a5');

insert into public.workspace_memberships(user_id,role,status,reviewed_at,reviewed_by) values
('11000000-0000-0000-0000-0000000000a1','creator','approved',now(),'11000000-0000-0000-0000-0000000000a1'),
('11000000-0000-0000-0000-0000000000a2','creator','approved',now(),'11000000-0000-0000-0000-0000000000a2'),
('11000000-0000-0000-0000-0000000000a3','creator','approved',now(),'11000000-0000-0000-0000-0000000000a3'),
('11000000-0000-0000-0000-0000000000a4','creator','approved',now(),'11000000-0000-0000-0000-0000000000a4');

update public.active_workspaces active set membership_id=membership.id,updated_at=now()
from public.workspace_memberships membership
where membership.user_id=active.user_id and membership.status='approved'
  and active.user_id in ('11000000-0000-0000-0000-0000000000a1','11000000-0000-0000-0000-0000000000a2','11000000-0000-0000-0000-0000000000a3','11000000-0000-0000-0000-0000000000a4')
  and membership.role='creator';

insert into public.verification_subjects(user_id,level,status,verified_at,expires_at)
values ('11000000-0000-0000-0000-0000000000a1','v2','verified',now(),now()+interval '1 year');

select set_config('request.jwt.claims',jsonb_build_object('sub','11000000-0000-0000-0000-0000000000a1','role','authenticated')::text,true);
create temp table s11_project(payload jsonb);
insert into s11_project select public.create_project_draft(jsonb_build_object(
 'title','Slice 11 production workspace project',
 'publicSynopsis','A public-safe project used to verify production collaboration, private assets, and supporter updates.',
 'privateBrief','Confidential production details that must remain inside the authorized production workspace.',
 'category','concept','format','video','boundaries',jsonb_build_array('closed-set'),'compensationModel','fixed',
 'distributionScope','Platform release only','rightsDeclarations',jsonb_build_array('original-concept')));

create temp table s11_invite_assignee(payload jsonb);
insert into s11_invite_assignee select public.send_project_invitation((select payload->>'publicId' from s11_project),'s11_assignee','performer',jsonb_build_object('note','Production assignee fixture'));
create temp table s11_invite_collaborator(payload jsonb);
insert into s11_invite_collaborator select public.send_project_invitation((select payload->>'publicId' from s11_project),'s11_collaborator','editor',jsonb_build_object('note','Production collaborator fixture'));

select set_config('request.jwt.claims',jsonb_build_object('sub','11000000-0000-0000-0000-0000000000a2','role','authenticated')::text,true);
select public.respond_project_invitation((select payload->>'publicId' from s11_invite_assignee),'interested');
select public.respond_project_invitation((select payload->>'publicId' from s11_invite_assignee),'accepted');
select set_config('request.jwt.claims',jsonb_build_object('sub','11000000-0000-0000-0000-0000000000a3','role','authenticated')::text,true);
select public.respond_project_invitation((select payload->>'publicId' from s11_invite_collaborator),'interested');
select public.respond_project_invitation((select payload->>'publicId' from s11_invite_collaborator),'accepted');

select set_config('request.jwt.claims',jsonb_build_object('sub','11000000-0000-0000-0000-0000000000a4','role','authenticated')::text,true);
select throws_ok(format($q$select public.get_production_workspace(%L)$q$,(select payload->>'publicId' from s11_project)),'42501','production_project_access_denied','outsider cannot read a production workspace');

select set_config('request.jwt.claims',jsonb_build_object('sub','11000000-0000-0000-0000-0000000000a2','role','authenticated')::text,true);
create temp table s11_member_workspace(payload jsonb);
select lives_ok(format($q$insert into s11_member_workspace select public.get_production_workspace(%L)$q$,(select payload->>'publicId' from s11_project)),'accepted collaborator can read the production workspace');
select is((select payload->>'isOwner' from s11_member_workspace),'false','collaborator workspace projection is explicitly non-owner');
select ok(coalesce((select payload::text from s11_member_workspace),'') !~ '(production-assets/|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})','workspace projection exposes neither permanent asset paths nor internal UUIDs');

select set_config('request.jwt.claims',jsonb_build_object('sub','11000000-0000-0000-0000-0000000000a1','role','authenticated')::text,true);
create temp table s11_task(payload jsonb);
insert into s11_task select public.create_production_task((select payload->>'publicId' from s11_project),'Edit first production cut','s11_assignee','editor',null);

select set_config('request.jwt.claims',jsonb_build_object('sub','11000000-0000-0000-0000-0000000000a2','role','authenticated')::text,true);
select lives_ok(format($q$select public.set_production_task_status(%L,'in_progress')$q$,(select payload->>'publicId' from s11_task)),'assigned collaborator can mutate their own production task');

select set_config('request.jwt.claims',jsonb_build_object('sub','11000000-0000-0000-0000-0000000000a3','role','authenticated')::text,true);
select throws_ok(format($q$select public.set_production_task_status(%L,'done')$q$,(select payload->>'publicId' from s11_task)),'42501','production_task_update_denied','another accepted collaborator cannot mutate a task they do not own');

select set_config('request.jwt.claims',jsonb_build_object('sub','11000000-0000-0000-0000-0000000000a1','role','authenticated')::text,true);
select lives_ok(format($q$select public.set_production_task_status(%L,'done')$q$,(select payload->>'publicId' from s11_task)),'project owner can mutate a collaborator task');
select is((select status::text from public.production_tasks where public_id=(select payload->>'publicId' from s11_task)),'done','task mutation persists');

select throws_ok(format($q$select public.set_production_status(%L,'delayed',null,'Schedule slipped')$q$,(select payload->>'publicId' from s11_project)),'22023','production_status_reason_required','delayed status requires a revised estimate');
select throws_ok(format($q$select public.set_production_status(%L,'at_risk',now()+interval '7 days','')$q$,(select payload->>'publicId' from s11_project)),'22023','production_status_reason_required','at-risk status requires a reason');
select lives_ok(format($q$select public.set_production_status(%L,'delayed',now()+interval '7 days','Editing delivery slipped by one week')$q$,(select payload->>'publicId' from s11_project)),'owner can record a delayed status with reason and revised estimate');
select is((select status::text from public.production_workspaces where project_id=(select id from public.projects where public_id=(select payload->>'publicId' from s11_project))),'delayed','valid delayed status persists');

-- The length bound applies to the entire suffix, including nested directories.
select lives_ok(format($q$select public.register_production_asset(%L,'media',%L,repeat('a',64))$q$,
 (select payload->>'publicId' from s11_project),(select payload->>'publicId' from s11_project)||'/a/123456'),
 'nested eight-character asset suffix is valid');
select lives_ok(format($q$select public.register_production_asset(%L,'media',%L,repeat('a',64))$q$,
 (select payload->>'publicId' from s11_project),(select payload->>'publicId' from s11_project)||'/private/'||repeat('a',412)),
 'nested 420-character asset suffix is valid');
select throws_ok(format($q$select public.register_production_asset(%L,'media',%L,repeat('a',64))$q$,
 (select payload->>'publicId' from s11_project),(select payload->>'publicId' from s11_project)||'/1234567'),
 '22023','invalid_production_asset','seven-character asset suffix is rejected');
select throws_ok(format($q$select public.register_production_asset(%L,'media',%L,repeat('a',64))$q$,
 (select payload->>'publicId' from s11_project),(select payload->>'publicId' from s11_project)||'/longdirname/'||repeat('a',409)),
 '22023','invalid_production_asset','nested 421-character asset suffix is rejected');
create temp table s11_asset(payload jsonb);
insert into s11_asset select public.register_production_asset(
 (select payload->>'publicId' from s11_project),
 'media',
 (select payload->>'publicId' from s11_project)||'/private/first-cut.mp4',
 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
select ok((select payload->>'publicId' from s11_asset) like 'ast%','owner registers an opaque private production asset');

select set_config('request.jwt.claims',jsonb_build_object('sub','11000000-0000-0000-0000-0000000000a4','role','authenticated')::text,true);
select throws_ok(format($q$select public.issue_production_asset_access(%L)$q$,(select payload->>'publicId' from s11_asset)),'42501','production_asset_access_denied','outsider cannot issue asset access');

select set_config('request.jwt.claims',jsonb_build_object('sub','11000000-0000-0000-0000-0000000000a2','role','authenticated')::text,true);
create temp table s11_asset_access(payload jsonb);
insert into s11_asset_access select public.issue_production_asset_access((select payload->>'publicId' from s11_asset));
select ok((select payload->>'downloadPath' from s11_asset_access) ~ '^/production-assets/[0-9a-f]{64}$','collaborator receives only a short-lived opaque download path');
select is(
 public.resolve_production_asset_access(regexp_replace((select payload->>'downloadPath' from s11_asset_access),'^/production-assets/','')),
 (select payload->>'publicId' from s11_project)||'/private/first-cut.mp4',
 'authorized collaborator token resolves to the private object path only at the server RPC boundary');

select set_config('request.jwt.claims',jsonb_build_object('sub','11000000-0000-0000-0000-0000000000a1','role','authenticated')::text,true);
select lives_ok(format($q$select public.revoke_project_collaborator_access(%L,'s11_assignee','Production access ended after delivery')$q$,(select payload->>'publicId' from s11_project)),'owner can revoke collaborator production access');

select set_config('request.jwt.claims',jsonb_build_object('sub','11000000-0000-0000-0000-0000000000a2','role','authenticated')::text,true);
select throws_ok(format($q$select public.get_production_workspace(%L)$q$,(select payload->>'publicId' from s11_project)),'42501','production_project_access_denied','revoked collaborator immediately loses production workspace access');
select is(
 public.resolve_production_asset_access(regexp_replace((select payload->>'downloadPath' from s11_asset_access),'^/production-assets/','')),
 null::text,
 'asset token issued before revocation immediately stops resolving');

select set_config('request.jwt.claims',jsonb_build_object('sub','11000000-0000-0000-0000-0000000000a1','role','authenticated')::text,true);
create temp table s11_update(payload jsonb);
insert into s11_update select public.create_production_update(
 (select payload->>'publicId' from s11_project),
 'progress',
 'First cut completed and entering review.',
 null);

create temp table s11_terms(payload jsonb);
insert into s11_terms select public.publish_project_terms((select payload->>'publicId' from s11_project),1,jsonb_build_object(
 'participants',jsonb_build_array(jsonb_build_object('handle','s11_owner','role','creator','depicted',false)),
 'role','creator','boundaries',jsonb_build_array('closed-set'),'collaborators',jsonb_build_array(),
 'compensation','fixed:10000:USD','distributionScope','platform-only','rightsScope','streaming-only',
 'schedule','January to March 2027','cancellation','Either party may leave before contract lock','finalCutApprovalRequired',true));
select public.accept_project_terms((select payload->>'publicId' from s11_project),(select payload->>'hash' from s11_terms),'step-up-confirmed');
select public.lock_project_contract((select payload->>'publicId' from s11_project),(select payload->>'hash' from s11_terms));

create temp table s11_campaign(payload jsonb);
insert into s11_campaign select public.save_campaign_draft((select payload->>'publicId' from s11_project),jsonb_build_object(
 'fundingTargetMinor',250000,'currency','USD',
 'deadline',to_char((now()+interval '60 days') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
 'expectedDeliveryWindow','January-March 2027',
 'guarantees',jsonb_build_array('One completed platform release'),
 'optionalChoices',jsonb_build_array('Creator-approved poster vote'),
 'refundRules','If the campaign fails or is cancelled, the permitted refund path is shown before confirmation.',
 'materialChangeRules','Material campaign changes require a new version and fresh supporter action where applicable.'));
select public.submit_campaign_for_publish((select payload->>'publicId' from s11_campaign),1);
select public.publish_campaign((select payload->>'publicId' from s11_campaign),1);

select set_config('request.jwt.claims',jsonb_build_object('sub','11000000-0000-0000-0000-0000000000a5','role','authenticated')::text,true);
create temp table s11_commitment(payload jsonb);
insert into s11_commitment select public.create_prebook((select payload->>'publicId' from s11_campaign),5000,'anonymous',null,'s11-prebook-001');

select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-0000-0000-000000000000','role','service_role')::text,true);
select public.record_payment_transition(
 (select payload->>'publicId' from s11_commitment),'sandbox',
 'cus_sbx_111111111111111111111111','pm_sbx_222222222222222222222222','txn_sbx_333333333333333333333333',
 'authorized',5000,0,0,'s11-pay-auth-001');
select public.record_payment_transition(
 (select payload->>'publicId' from s11_commitment),'sandbox',
 'cus_sbx_111111111111111111111111','pm_sbx_222222222222222222222222','txn_sbx_333333333333333333333333',
 'captured',5000,5000,0,'s11-pay-capture-001');

select set_config('request.jwt.claims',jsonb_build_object('sub','11000000-0000-0000-0000-0000000000a5','role','authenticated')::text,true);
select is(jsonb_array_length(public.list_supporter_production_updates((select payload->>'publicId' from s11_campaign))),0,'supporter cannot see draft production updates');

select set_config('request.jwt.claims',jsonb_build_object('sub','11000000-0000-0000-0000-0000000000a1','role','authenticated')::text,true);
select public.set_production_update_state((select payload->>'publicId' from s11_update),'approved');
select set_config('request.jwt.claims',jsonb_build_object('sub','11000000-0000-0000-0000-0000000000a5','role','authenticated')::text,true);
select is(jsonb_array_length(public.list_supporter_production_updates((select payload->>'publicId' from s11_campaign))),0,'supporter cannot see approved but unpublished production updates');

select set_config('request.jwt.claims',jsonb_build_object('sub','11000000-0000-0000-0000-0000000000a1','role','authenticated')::text,true);
select public.set_production_update_state((select payload->>'publicId' from s11_update),'published');
select set_config('request.jwt.claims',jsonb_build_object('sub','11000000-0000-0000-0000-0000000000a5','role','authenticated')::text,true);
create temp table s11_supporter_updates(payload jsonb);
insert into s11_supporter_updates select public.list_supporter_production_updates((select payload->>'publicId' from s11_campaign));
select is(jsonb_array_length((select payload from s11_supporter_updates)),1,'captured supporter sees the published production update');
select is((select payload#>>'{0,body}' from s11_supporter_updates),'First cut completed and entering review.','supporter update contains only the approved published body');
select ok(coalesce((select payload::text from s11_supporter_updates),'') !~ '(production-assets/|txn_sbx_|cus_sbx_|pm_sbx_|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})','supporter update projection leaks no asset path, processor reference, or internal UUID');

select ok((select count(*) from public.audit_events where event_type='production_status_changed' and actor_user_id='11000000-0000-0000-0000-0000000000a1')>=1,'production status changes are audited');
select ok((select count(*) from public.audit_events where event_type='project_collaborator_access_revoked' and actor_user_id='11000000-0000-0000-0000-0000000000a1')>=1,'collaborator revocation is audited');
select ok((select count(*) from public.audit_events where event_type='production_asset_access_issued' and actor_user_id='11000000-0000-0000-0000-0000000000a2')>=1,'asset access issuance is audited');
select ok((select count(*) from public.audit_events where event_type='production_asset_accessed' and actor_user_id='11000000-0000-0000-0000-0000000000a2')>=1,'asset access resolution is audited');
select ok((select count(*) from public.audit_events where event_type='production_update_state_changed' and actor_user_id='11000000-0000-0000-0000-0000000000a1')>=2,'production update approval and publication are audited');

-- Exercise storage policies as the real client role, without private table grants.
select set_config('test.production_path',(select payload->>'publicId' from s11_project)||'/private/storage.mp4',true);
select set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-0000000000a1","role":"authenticated"}',true);
set local role authenticated;
select ok(not has_table_privilege(current_user,'public.projects','SELECT'),'storage authorization does not expose project rows');
select lives_ok($q$insert into storage.objects(bucket_id,name) values('production-assets',current_setting('test.production_path'))$q$,'owner can upload production objects as authenticated');
select is((select count(*)::integer from storage.objects where bucket_id='production-assets'),1,'owner can read production object');
select set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-0000000000a3","role":"authenticated"}',true);
select is((select count(*)::integer from storage.objects where bucket_id='production-assets'),1,'accepted collaborator can read production object');
select throws_ok($q$insert into storage.objects(bucket_id,name) values('production-assets',current_setting('test.production_path')||'.other')$q$,'42501',null,'collaborator cannot upload owner production objects');
select set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-0000000000a2","role":"authenticated"}',true);
select is((select count(*)::integer from storage.objects where bucket_id='production-assets'),0,'revoked collaborator cannot read production object');
select set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-0000000000a4","role":"authenticated"}',true);
select is((select count(*)::integer from storage.objects where bucket_id='production-assets'),0,'outsider cannot read production object');
select set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-0000000000a1","role":"authenticated"}',true);
select throws_ok(
  $q$delete from storage.objects where bucket_id='production-assets'$q$,
  '42501',
  null,
  'direct SQL storage deletion is forbidden even for the owner; deletion must use the Storage API'
);
select is((select count(*)::integer from storage.objects where bucket_id='production-assets'),1,'failed direct deletion leaves the production object intact');
reset role;

select * from finish();
rollback;
