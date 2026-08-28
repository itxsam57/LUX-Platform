begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

select has_table('public','campaigns','Slice 9 stores campaign lifecycle state');
select has_table('public','campaign_term_versions','Slice 9 stores immutable campaign term versions');
select has_table('public','campaign_tiers','Slice 9 stores truthful campaign access tiers');
select has_table('public','campaign_choices','Slice 9 stores only creator-approved optional choices');
select has_function('public','save_campaign_draft',array['text','jsonb'],'owner campaign draft RPC exists');
select has_function('public','submit_campaign_for_publish',array['text','integer'],'campaign review transition RPC exists');
select has_function('public','publish_campaign',array['text','integer'],'constrained publication RPC exists');
select has_function('public','get_public_campaign',array['text'],'public-safe campaign projection RPC exists');
select ok(coalesce(has_table_privilege('authenticated','public.campaigns','INSERT'),false)=false,'authenticated clients cannot forge campaign rows');
select ok(coalesce(has_table_privilege('authenticated','public.campaign_term_versions','INSERT'),false)=false,'authenticated clients cannot forge campaign terms');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-0000000000c1','authenticated','authenticated','s9-owner@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-0000000000c2','authenticated','authenticated','s9-performer@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-0000000000c3','authenticated','authenticated','s9-outsider@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

update public.profiles set handle=case user_id
  when '10000000-0000-0000-0000-0000000000c1' then 's9_owner'
  when '10000000-0000-0000-0000-0000000000c2' then 's9_performer'
  else 's9_outsider' end,
  display_name=case user_id when '10000000-0000-0000-0000-0000000000c1' then 'Slice 9 Creator' else 'Slice 9 Participant' end,
  visibility='public'
where user_id in ('10000000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-0000000000c2','10000000-0000-0000-0000-0000000000c3');

insert into public.age_assurance_records(user_id,method,status,jurisdiction_code,policy_version,expires_at)
select id,'self_attestation','accepted','PK','slice-9-test',now()+interval '1 year'
from auth.users where id in ('10000000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-0000000000c2','10000000-0000-0000-0000-0000000000c3');
insert into public.workspace_memberships(user_id,role,status,reviewed_at,reviewed_by)
values ('10000000-0000-0000-0000-0000000000c1','creator','approved',now(),'10000000-0000-0000-0000-0000000000c1');
update public.active_workspaces active set membership_id=membership.id,updated_at=now()
from public.workspace_memberships membership
where membership.user_id=active.user_id and membership.status='approved'
  and active.user_id='10000000-0000-0000-0000-0000000000c1' and membership.role='creator';

insert into public.verification_subjects(user_id,level,status,verified_at,expires_at) values
('10000000-0000-0000-0000-0000000000c1','v2','verified',now(),now()+interval '1 year'),
('10000000-0000-0000-0000-0000000000c2','v2','verified',now(),now()+interval '1 year'),
('10000000-0000-0000-0000-0000000000c2','v3','verified',now(),now()+interval '1 year');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000c1','role','authenticated')::text,true);
create temp table s9_project(payload jsonb);
insert into s9_project select public.create_project_draft(jsonb_build_object(
  'title','Slice 9 fundable project',
  'publicSynopsis','A public campaign-safe synopsis that never exposes the private production brief or legal identity.',
  'privateBrief','Private production details must never be returned by the public campaign projection under any condition.',
  'category','concept','format','video','boundaries',jsonb_build_array('closed-set'),
  'compensationModel','fixed','distributionScope','Platform release only','rightsDeclarations',jsonb_build_array('original-concept')));
create temp table s9_terms(payload jsonb);
insert into s9_terms select public.publish_project_terms((select payload->>'publicId' from s9_project),1,jsonb_build_object(
  'participants',jsonb_build_array(jsonb_build_object('handle','s9_performer','role','performer','depicted',true)),
  'role','performer','boundaries',jsonb_build_array('closed-set'),'collaborators',jsonb_build_array('s9_owner'),
  'compensation','fixed:10000:USD','distributionScope','platform-only','rightsScope','streaming-only',
  'schedule','January to March 2027','cancellation','Either party may leave before contract lock','finalCutApprovalRequired',true));
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000c2','role','authenticated')::text,true);
select lives_ok(format($q$select public.accept_project_terms(%L,%L,'step-up-confirmed')$q$,(select payload->>'publicId' from s9_project),(select payload->>'hash' from s9_terms)),'performer accepts exact funding terms');
select lives_ok(format($q$select public.record_depicted_consent(%L,%L,'step-up-confirmed')$q$,(select payload->>'publicId' from s9_project),(select payload->>'hash' from s9_terms)),'performer personally consents to depicted scope');
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000c1','role','authenticated')::text,true);
select lives_ok(format($q$select public.lock_project_contract(%L,%L)$q$,(select payload->>'publicId' from s9_project),(select payload->>'hash' from s9_terms)),'eligible project reaches contract lock before campaign work');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000c3','role','authenticated')::text,true);
select throws_ok(format($q$select public.save_campaign_draft(%L,%L::jsonb)$q$,(select payload->>'publicId' from s9_project),'{"fundingTargetMinor":250000,"currency":"USD","deadline":"2026-10-15T00:00:00Z","expectedDeliveryWindow":"January-March 2027","guarantees":["One completed platform release"],"optionalChoices":["Creator-approved poster vote"],"refundRules":"Refund path shown on failure or cancellation","materialChangeRules":"Material changes require fresh action"}'),'42501','campaign_edit_not_allowed','unrelated account cannot create campaign state');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000c1','role','authenticated')::text,true);
select throws_ok(format($q$select public.save_campaign_draft(%L,%L::jsonb)$q$,(select payload->>'publicId' from s9_project),'{"fundingTargetMinor":0,"currency":"USD","deadline":"2026-10-15T00:00:00Z","expectedDeliveryWindow":"January-March 2027","guarantees":["One completed platform release"],"optionalChoices":[],"refundRules":"Refund path shown","materialChangeRules":"Fresh action required"}'),'22023','invalid_campaign_funding_target','non-positive campaign target is rejected');

create temp table s9_campaign(payload jsonb);
insert into s9_campaign select public.save_campaign_draft((select payload->>'publicId' from s9_project),jsonb_build_object(
  'fundingTargetMinor',250000,'currency','USD','deadline','2026-10-15T00:00:00Z',
  'expectedDeliveryWindow','January-March 2027','guarantees',jsonb_build_array('One completed platform release'),
  'optionalChoices',jsonb_build_array('Creator-approved poster vote'),
  'refundRules','If the campaign fails or is cancelled, the permitted refund path is shown before confirmation.',
  'materialChangeRules','Material campaign changes require a new version and fresh supporter action where applicable.'));
select like((select payload->>'publicId' from s9_campaign),'cmp%','campaign uses an opaque public identifier');
select is((select payload->>'state' from s9_campaign),'draft','campaign starts as draft');
select is((select (payload->>'termsVersion')::integer from s9_campaign),1,'first campaign terms version is v1');
select lives_ok(format($q$select public.submit_campaign_for_publish(%L,1)$q$,(select payload->>'publicId' from s9_campaign)),'owner submits exact campaign version for review');
select is((select state::text from public.campaigns where public_id=(select payload->>'publicId' from s9_campaign)),'review_ready','submission moves campaign to review_ready');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000c3','role','authenticated')::text,true);
select throws_ok(format($q$select public.publish_campaign(%L,1)$q$,(select payload->>'publicId' from s9_campaign)),'42501','campaign_publish_not_allowed','unrelated account cannot publish campaign');
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000c1','role','authenticated')::text,true);

update public.verification_subjects set status='expired',expires_at=now()-interval '1 second' where user_id='10000000-0000-0000-0000-0000000000c1' and level='v2';
select throws_ok(format($q$select public.publish_campaign(%L,1)$q$,(select payload->>'publicId' from s9_campaign)),'42501','campaign_publish_not_allowed','publication rechecks creator verification');
update public.verification_subjects set status='verified',expires_at=now()+interval '1 year' where user_id='10000000-0000-0000-0000-0000000000c1' and level='v2';
update public.verification_subjects set status='expired',expires_at=now()-interval '1 second' where user_id='10000000-0000-0000-0000-0000000000c2' and level='v3';
select throws_ok(format($q$select public.publish_campaign(%L,1)$q$,(select payload->>'publicId' from s9_campaign)),'42501','campaign_publish_not_allowed','publication rechecks every depicted participant V3 state');
update public.verification_subjects set status='verified',expires_at=now()+interval '1 year' where user_id='10000000-0000-0000-0000-0000000000c2' and level='v3';

update public.projects set funding_restricted=true where public_id=(select payload->>'publicId' from s9_project);
select throws_ok(format($q$select public.publish_campaign(%L,1)$q$,(select payload->>'publicId' from s9_campaign)),'42501','campaign_publish_not_allowed','project restriction blocks publication');
update public.projects set funding_restricted=false where public_id=(select payload->>'publicId' from s9_project);
update public.campaigns set payment_environment_eligible=false where public_id=(select payload->>'publicId' from s9_campaign);
select throws_ok(format($q$select public.publish_campaign(%L,1)$q$,(select payload->>'publicId' from s9_campaign)),'42501','campaign_publish_not_allowed','payment-environment ineligibility blocks publication');
update public.campaigns set payment_environment_eligible=true where public_id=(select payload->>'publicId' from s9_campaign);
select lives_ok(format($q$select public.publish_campaign(%L,1)$q$,(select payload->>'publicId' from s9_campaign)),'eligible exact campaign version publishes');
select is((select state::text from public.campaigns where public_id=(select payload->>'publicId' from s9_campaign)),'published','campaign reaches published state only through constrained transition');

create temp table s9_public(payload jsonb);
insert into s9_public select public.get_public_campaign((select payload->>'publicId' from s9_campaign));
select is((select payload->>'title' from s9_public),'Slice 9 fundable project','public campaign uses safe project title');
select is((select (payload->>'fundingTargetMinor')::integer from s9_public),250000,'public target matches exact campaign terms');
select is((select (payload->>'supporterCount')::integer from s9_public),0,'public supporter count starts from real eligible records only');
select is((select (payload->>'fundedAmountMinor')::integer from s9_public),0,'public funded amount starts from real eligible records only');
select ok((select payload::text not like '%Private production details%' from s9_public),'public campaign never exposes private project brief');
select ok((select payload::text !~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' from s9_public),'public campaign projection exposes no internal UUIDs');

select * from finish();
rollback;
