begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','final_delivery_versions','immutable final delivery versions exist');
select has_table('public','final_cut_approvals','per-version depicted-person final-cut approvals exist');
select has_table('public','delivery_review_cases','structured delivery review cases exist');
select has_table('public','delivery_review_checklist_items','review checklist persistence exists');
select has_table('public','delivery_review_decisions','immutable reviewer decision history exists');
select has_table('public','delivery_creator_responses','immutable creator response history exists');
select has_function('public','submit_final_delivery',array['text','text','text'],'final delivery submission RPC exists');
select has_function('public','set_final_delivery_processing',array['text','text','text'],'processing transition RPC exists');
select has_function('public','record_final_cut_approval',array['text','text','text'],'personal final-cut response RPC exists');
select has_function('public','set_delivery_review_check',array['text','text','text','text'],'review checklist mutation RPC exists');
select has_function('public','decide_delivery_review',array['text','text','text'],'review decision RPC exists');
select has_function('public','respond_to_delivery_review',array['text','text'],'creator response RPC exists');
select has_function('public','get_delivery_review_context',array['text'],'canonical review projection exists');
select has_function('public','list_delivery_review_queue',array[]::text[],'reviewer queue projection exists');
select has_function('public','issue_final_delivery_asset_access',array['text'],'scoped final media access RPC exists');

select ok(not has_table_privilege('authenticated','public.final_delivery_versions','SELECT'),'clients cannot read raw final delivery rows');
select ok(not has_table_privilege('authenticated','public.final_cut_approvals','SELECT'),'clients cannot read raw final-cut approval rows');
select ok(not has_table_privilege('authenticated','public.delivery_review_cases','SELECT'),'clients cannot read raw review case rows');
select ok(not has_table_privilege('authenticated','public.delivery_review_checklist_items','SELECT'),'clients cannot read raw review checklist rows');
select ok(not has_table_privilege('authenticated','public.delivery_review_decisions','SELECT'),'clients cannot read reviewer decision history directly');
select ok(not has_table_privilege('authenticated','public.delivery_creator_responses','SELECT'),'clients cannot read creator responses directly');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','12000000-0000-0000-0000-0000000000a1','authenticated','authenticated','s12-owner@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','12000000-0000-0000-0000-0000000000a2','authenticated','authenticated','s12-performer@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','12000000-0000-0000-0000-0000000000a3','authenticated','authenticated','s12-reviewer@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','12000000-0000-0000-0000-0000000000a4','authenticated','authenticated','s12-outsider@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

update public.profiles set
 handle=case user_id
   when '12000000-0000-0000-0000-0000000000a1' then 's12_owner'
   when '12000000-0000-0000-0000-0000000000a2' then 's12_performer'
   when '12000000-0000-0000-0000-0000000000a3' then 's12_reviewer'
   else 's12_outsider' end,
 display_name=case user_id
   when '12000000-0000-0000-0000-0000000000a1' then 'Slice 12 Owner'
   when '12000000-0000-0000-0000-0000000000a2' then 'Slice 12 Performer'
   when '12000000-0000-0000-0000-0000000000a3' then 'Slice 12 Reviewer'
   else 'Slice 12 Outsider' end,
 visibility='public'
where user_id in (
 '12000000-0000-0000-0000-0000000000a1','12000000-0000-0000-0000-0000000000a2',
 '12000000-0000-0000-0000-0000000000a3','12000000-0000-0000-0000-0000000000a4');

insert into public.age_assurance_records(user_id,method,status,jurisdiction_code,policy_version,expires_at)
select id,'self_attestation','accepted','PK','slice-12-delivery-review-test',now()+interval '1 year'
from auth.users
where id in ('12000000-0000-0000-0000-0000000000a1','12000000-0000-0000-0000-0000000000a2','12000000-0000-0000-0000-0000000000a4');

insert into public.workspace_memberships(user_id,role,status,reviewed_at,reviewed_by) values
('12000000-0000-0000-0000-0000000000a1','creator','approved',now(),'12000000-0000-0000-0000-0000000000a1'),
('12000000-0000-0000-0000-0000000000a2','creator','approved',now(),'12000000-0000-0000-0000-0000000000a2'),
('12000000-0000-0000-0000-0000000000a3','reviewer','approved',now(),'12000000-0000-0000-0000-0000000000a3'),
('12000000-0000-0000-0000-0000000000a4','creator','approved',now(),'12000000-0000-0000-0000-0000000000a4');

update public.active_workspaces active set membership_id=membership.id,updated_at=now()
from public.workspace_memberships membership
where membership.user_id=active.user_id and membership.status='approved'
  and active.user_id in (
    '12000000-0000-0000-0000-0000000000a1','12000000-0000-0000-0000-0000000000a2',
    '12000000-0000-0000-0000-0000000000a3','12000000-0000-0000-0000-0000000000a4')
  and membership.role=case active.user_id when '12000000-0000-0000-0000-0000000000a3' then 'reviewer'::public.app_role else 'creator'::public.app_role end;

insert into public.performer_records(user_id,active,liveness_expires_at,payout_ownership_verified,payout_ownership_checked_at)
values ('12000000-0000-0000-0000-0000000000a2',true,now()+interval '1 year',true,now())
on conflict(user_id) do update set active=true,liveness_expires_at=excluded.liveness_expires_at,payout_ownership_verified=true,payout_ownership_checked_at=now(),updated_at=now();
insert into public.consent_education_acknowledgements(user_id,policy_version)
values ('12000000-0000-0000-0000-0000000000a2',private.current_consent_education_version())
on conflict(user_id,policy_version) do nothing;

insert into public.verification_subjects(user_id,level,status,verified_at,expires_at) values
('12000000-0000-0000-0000-0000000000a1','v2','verified',now(),now()+interval '1 year'),
('12000000-0000-0000-0000-0000000000a2','v2','verified',now(),now()+interval '1 year'),
('12000000-0000-0000-0000-0000000000a2','v3','verified',now(),now()+interval '1 year');

select set_config('request.jwt.claims',jsonb_build_object('sub','12000000-0000-0000-0000-0000000000a1','role','authenticated')::text,true);
create temp table s12_project(payload jsonb);
insert into s12_project select public.create_project_draft(jsonb_build_object(
 'title','Slice 12 final delivery review project',
 'publicSynopsis','A project used to verify immutable final delivery review and final-cut approval behavior.',
 'privateBrief','Private production context for the exact file, contract, people, evidence, and review workflow.',
 'category','concept','format','video','boundaries',jsonb_build_array('closed-set'),'compensationModel','fixed',
 'distributionScope','Platform release only','rightsDeclarations',jsonb_build_array('original-concept')));

create temp table s12_terms(payload jsonb);
insert into s12_terms select public.publish_project_terms((select payload->>'publicId' from s12_project),1,jsonb_build_object(
 'participants',jsonb_build_array(
   jsonb_build_object('handle','s12_owner','role','creator','depicted',false),
   jsonb_build_object('handle','s12_performer','role','performer','depicted',true)),
 'role','creator','boundaries',jsonb_build_array('closed-set'),'collaborators',jsonb_build_array('editor'),
 'compensation','fixed:10000:USD','distributionScope','platform-only','rightsScope','streaming-only',
 'schedule','January to March 2027','cancellation','Either party may leave before contract lock',
 'finalCutApprovalRequired',true));
select public.accept_project_terms((select payload->>'publicId' from s12_project),(select payload->>'hash' from s12_terms),'owner-step-up-confirmed');

select set_config('request.jwt.claims',jsonb_build_object('sub','12000000-0000-0000-0000-0000000000a2','role','authenticated')::text,true);
select public.accept_project_terms((select payload->>'publicId' from s12_project),(select payload->>'hash' from s12_terms),'performer-step-up-confirmed');
select public.record_depicted_consent((select payload->>'publicId' from s12_project),(select payload->>'hash' from s12_terms),'performer-consent-confirmed');

select set_config('request.jwt.claims',jsonb_build_object('sub','12000000-0000-0000-0000-0000000000a1','role','authenticated')::text,true);
select public.lock_project_contract((select payload->>'publicId' from s12_project),(select payload->>'hash' from s12_terms));

create temp table s12_asset_one(payload jsonb);
insert into s12_asset_one select public.register_production_asset(
 (select payload->>'publicId' from s12_project),'media',
 (select payload->>'publicId' from s12_project)||'/private/final-v1.mp4',
 '1111111111111111111111111111111111111111111111111111111111111111');

create temp table s12_delivery_one(payload jsonb);
insert into s12_delivery_one select public.submit_final_delivery(
 (select payload->>'publicId' from s12_project),(select payload->>'publicId' from s12_asset_one),'s12-final-submit-0001');
select is((select payload->>'version' from s12_delivery_one),'1','first final upload becomes immutable delivery version 1');
select is((select payload->>'sha256' from s12_delivery_one),'1111111111111111111111111111111111111111111111111111111111111111','delivery version is bound to the registered asset hash');

create temp table s12_delivery_one_duplicate(payload jsonb);
insert into s12_delivery_one_duplicate select public.submit_final_delivery(
 (select payload->>'publicId' from s12_project),(select payload->>'publicId' from s12_asset_one),'s12-final-submit-0001');
select is((select payload->>'publicId' from s12_delivery_one_duplicate),(select payload->>'publicId' from s12_delivery_one),'duplicate click with the same idempotency key returns the same delivery');
select is((select count(*) from public.final_delivery_versions where project_id=(select id from public.projects where public_id=(select payload->>'publicId' from s12_project))),1::bigint,'duplicate submission does not create a second delivery version');
select is((select count(*) from public.final_cut_approvals where delivery_version_id=(select id from public.final_delivery_versions where public_id=(select payload->>'publicId' from s12_delivery_one))),1::bigint,'required final-cut approval is derived from the depicted contract participant');

select set_config('request.jwt.claims',jsonb_build_object('sub','12000000-0000-0000-0000-0000000000a4','role','authenticated')::text,true);
select throws_ok(format($q$select public.get_delivery_review_context(%L)$q$,(select payload->>'publicId' from s12_project)),'42501','delivery_review_access_denied','outsider cannot read delivery review context');

select set_config('request.jwt.claims',jsonb_build_object('sub','12000000-0000-0000-0000-0000000000a3','role','authenticated')::text,true);
select ok(public.list_delivery_review_queue()::text like '%'||(select payload->>'publicId' from s12_project)||'%','reviewer queue includes the submitted project');
select throws_ok(format($q$select public.decide_delivery_review(%L,'approve','Initial approval attempt')$q$,(select payload->>'publicId' from s12_delivery_one)),'42501','delivery_review_blocked','review cannot approve while processing and checklist/final-cut blockers remain');
select public.set_final_delivery_processing((select payload->>'publicId' from s12_delivery_one),'ready','Transcode and malware scan completed');
select public.set_delivery_review_check((select payload->>'publicId' from s12_delivery_one),'legality','pass','Contract and legality evidence match');
select public.set_delivery_review_check((select payload->>'publicId' from s12_delivery_one),'consent','pass','Consent evidence matches the locked contract');
select public.set_delivery_review_check((select payload->>'publicId' from s12_delivery_one),'copyright','pass','Rights declaration and evidence pass review');
select public.set_delivery_review_check((select payload->>'publicId' from s12_delivery_one),'safety','pass','Safety review passes for the exact final delivery');
select public.set_delivery_review_check((select payload->>'publicId' from s12_delivery_one),'quality','pass','Final media passes technical quality review');
select throws_ok(format($q$select public.decide_delivery_review(%L,'approve','Checklist complete before performer approval')$q$,(select payload->>'publicId' from s12_delivery_one)),'42501','delivery_review_blocked','review still cannot approve before exact-version final-cut approval');
select throws_ok(format($q$select public.decide_delivery_review(%L,'hold','x')$q$,(select payload->>'publicId' from s12_delivery_one)),'22023','invalid_delivery_review_reason','review decisions require bounded reasons');

select set_config('request.jwt.claims',jsonb_build_object('sub','12000000-0000-0000-0000-0000000000a2','role','authenticated')::text,true);
create temp table s12_final_asset_access(payload jsonb);
insert into s12_final_asset_access select public.issue_final_delivery_asset_access((select payload->>'publicId' from s12_delivery_one));
select ok((select payload->>'downloadPath' from s12_final_asset_access) ~ '^/production-assets/[0-9a-f]{64}$','required depicted person receives only a short-lived opaque final media path');
select is(
 public.resolve_production_asset_access(regexp_replace((select payload->>'downloadPath' from s12_final_asset_access),'^/production-assets/','')),
 (select payload->>'publicId' from s12_project)||'/private/final-v1.mp4',
 'required depicted person can resolve only the explicitly issued final delivery asset token');
select public.record_final_cut_approval((select payload->>'publicId' from s12_delivery_one),'approved','Final cut approved for this exact version');

select set_config('request.jwt.claims',jsonb_build_object('sub','12000000-0000-0000-0000-0000000000a3','role','authenticated')::text,true);
select public.decide_delivery_review((select payload->>'publicId' from s12_delivery_one),'approve','All contract, consent, rights, quality, and final-cut gates pass');
create temp table s12_reviewer_context(payload jsonb);
insert into s12_reviewer_context select public.get_delivery_review_context((select payload->>'publicId' from s12_project));
select is((select payload#>>'{current,status}' from s12_reviewer_context),'approved','reviewer canonical state is approved');
select is((select payload#>>'{current,releaseReady}' from s12_reviewer_context),'true','approved exact version becomes release ready');
select is((select payload#>>'{contract,termsHash}' from s12_reviewer_context),(select payload->>'hash' from s12_terms),'reviewer sees the exact locked contract hash');
select is((select payload#>>'{current,sha256}' from s12_reviewer_context),'1111111111111111111111111111111111111111111111111111111111111111','reviewer sees the exact submitted file hash');
select ok((select payload::text from s12_reviewer_context) like '%s12_performer%','reviewer sees depicted participant evidence');
select ok(coalesce((select payload::text from s12_reviewer_context),'') !~ '(production-assets/|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})','review projection leaks neither permanent asset paths nor internal UUIDs');

select set_config('request.jwt.claims',jsonb_build_object('sub','12000000-0000-0000-0000-0000000000a1','role','authenticated')::text,true);
create temp table s12_creator_context(payload jsonb);
insert into s12_creator_context select public.get_delivery_review_context((select payload->>'publicId' from s12_project));
select is((select payload#>>'{current,status}' from s12_creator_context),(select payload#>>'{current,status}' from s12_reviewer_context),'creator and reviewer see the same canonical review status');

create temp table s12_asset_two(payload jsonb);
insert into s12_asset_two select public.register_production_asset(
 (select payload->>'publicId' from s12_project),'media',
 (select payload->>'publicId' from s12_project)||'/private/final-v2.mp4',
 '2222222222222222222222222222222222222222222222222222222222222222');
create temp table s12_delivery_two(payload jsonb);
insert into s12_delivery_two select public.submit_final_delivery(
 (select payload->>'publicId' from s12_project),(select payload->>'publicId' from s12_asset_two),'s12-final-submit-0002');
select is((select payload->>'version' from s12_delivery_two),'2','changed final file creates a new immutable delivery version');
select is((public.get_delivery_review_context((select payload->>'publicId' from s12_project)))#>>'{current,releaseReady}','false','changed final immediately removes release readiness for the current version');
select is((select state::text from public.final_cut_approvals where delivery_version_id=(select id from public.final_delivery_versions where public_id=(select payload->>'publicId' from s12_delivery_two))),'pending','changed final requires fresh depicted-person final-cut approval');
select is((select state::text from public.final_cut_approvals where delivery_version_id=(select id from public.final_delivery_versions where public_id=(select payload->>'publicId' from s12_delivery_one))),'approved','old exact-version final-cut approval remains immutable history');
select is((select count(*) from public.delivery_review_decisions where review_case_id=(select id from public.delivery_review_cases where delivery_version_id=(select id from public.final_delivery_versions where public_id=(select payload->>'publicId' from s12_delivery_one))) and decision='approve'),1::bigint,'prior review decision remains immutable history after resubmission');
select public.respond_to_delivery_review((select payload->>'publicId' from s12_delivery_two),'New final uploaded after addressing the prior review context.');
select is((select count(*) from public.delivery_creator_responses where review_case_id=(select id from public.delivery_review_cases where delivery_version_id=(select id from public.final_delivery_versions where public_id=(select payload->>'publicId' from s12_delivery_two)))),1::bigint,'creator response is preserved as append-only review history');

select ok((select count(*) from public.audit_events where event_type='final_delivery_submitted' and actor_user_id='12000000-0000-0000-0000-0000000000a1')>=2,'final delivery submissions are audited');
select ok((select count(*) from public.audit_events where event_type='final_cut_approval_recorded' and actor_user_id='12000000-0000-0000-0000-0000000000a2')>=1,'personal final-cut approval is audited');
select ok((select count(*) from public.audit_events where event_type='delivery_review_decided' and actor_user_id='12000000-0000-0000-0000-0000000000a3')>=1,'review decisions are reasoned and audited');

select * from finish();
rollback;
