begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

select has_table('public','project_term_versions','Slice 8 stores immutable project terms');
select has_table('public','participant_acceptances','Slice 8 stores exact-version participant acceptances');
select has_table('public','depicted_person_consents','Slice 8 stores personal depicted-person consent');
select has_table('public','contract_lock_receipts','Slice 8 stores immutable contract lock receipts');
select has_function('public','publish_project_terms',array['text','integer','jsonb'],'owner can publish immutable project terms');
select has_function('public','accept_project_terms',array['text','text','text'],'participant acceptance RPC binds version hash and step-up proof');
select has_function('public','record_depicted_consent',array['text','text','text'],'personal depicted consent RPC exists');
select has_function('public','lock_project_contract',array['text','text'],'constrained contract lock RPC exists');
select ok(coalesce(has_table_privilege('authenticated','public.participant_acceptances','INSERT'),false)=false,'authenticated clients cannot forge acceptance rows');
select ok(coalesce(has_table_privilege('authenticated','public.depicted_person_consents','INSERT'),false)=false,'authenticated clients cannot forge consent rows');
select ok(coalesce(has_table_privilege('authenticated','public.contract_lock_receipts','INSERT'),false)=false,'authenticated clients cannot forge contract locks');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-0000000000b1','authenticated','authenticated','s8-owner@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-0000000000b2','authenticated','authenticated','s8-performer@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-0000000000b3','authenticated','authenticated','s8-agency@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set handle=case user_id when '10000000-0000-0000-0000-0000000000b1' then 's8_owner' when '10000000-0000-0000-0000-0000000000b2' then 's8_performer' else 's8_agency' end,display_name='Slice 8 Test',visibility='public' where user_id in ('10000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-0000000000b2','10000000-0000-0000-0000-0000000000b3');
insert into public.age_assurance_records(user_id,method,status,jurisdiction_code,policy_version,expires_at) select id,'self_attestation','accepted','PK','slice-8-test',now()+interval '1 year' from auth.users where id in ('10000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-0000000000b2','10000000-0000-0000-0000-0000000000b3');
insert into public.workspace_memberships(user_id,role,status,reviewed_at,reviewed_by) values ('10000000-0000-0000-0000-0000000000b1','creator','approved',now(),'10000000-0000-0000-0000-0000000000b1'),('10000000-0000-0000-0000-0000000000b3','agency','approved',now(),'10000000-0000-0000-0000-0000000000b3');
update public.active_workspaces active set membership_id=membership.id,updated_at=now() from public.workspace_memberships membership where membership.user_id=active.user_id and membership.status='approved' and ((active.user_id='10000000-0000-0000-0000-0000000000b1' and membership.role='creator') or (active.user_id='10000000-0000-0000-0000-0000000000b3' and membership.role='agency'));
insert into public.verification_subjects(user_id,level,status,verified_at,expires_at) values ('10000000-0000-0000-0000-0000000000b2','v2','verified',now(),now()+interval '1 year');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000b1','role','authenticated')::text,true);
create temp table s8_project(payload jsonb);
insert into s8_project select public.create_project_draft(jsonb_build_object('title','Slice 8 contract project','publicSynopsis','A public project synopsis for exact version contract and consent testing.','privateBrief','A private production brief that remains separate from the public terms acceptance projection.','category','concept','format','video','boundaries',jsonb_build_array('closed-set'),'compensationModel','fixed','distributionScope','Platform release only','rightsDeclarations',jsonb_build_array('original-concept')));
create temp table s8_terms(payload jsonb);
insert into s8_terms select public.publish_project_terms((select payload->>'publicId' from s8_project),1,jsonb_build_object('participants',jsonb_build_array(jsonb_build_object('handle','s8_performer','role','performer','depicted',true)),'role','performer','boundaries',jsonb_build_array('closed-set'),'collaborators',jsonb_build_array('s8_owner'),'compensation','fixed:10000:USD','distributionScope','platform-only','rightsScope','streaming-only','schedule','September window','cancellation','Either party may leave before contract lock','finalCutApprovalRequired',true));
select ok(length((select payload->>'hash' from s8_terms)) = 64,'terms publication returns a SHA-256 version hash');
select is(length((select payload->>'hash' from s8_terms)),64,'terms hash is SHA-256 sized');
select is((select version from public.project_term_versions limit 1),1,'first terms version is immutable v1');

select throws_ok(format($q$select public.accept_project_terms(%L,%L,'step-up-confirmed')$q$,(select payload->>'publicId' from s8_project),(select payload->>'hash' from s8_terms)),'42501','terms_acceptance_not_allowed','project owner cannot accept on behalf of performer');
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000b3','role','authenticated')::text,true);
select throws_ok(format($q$select public.record_depicted_consent(%L,%L,'step-up-confirmed')$q$,(select payload->>'publicId' from s8_project),(select payload->>'hash' from s8_terms)),'42501','depicted_consent_not_allowed','agency cannot consent for performer');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000b2','role','authenticated')::text,true);
select throws_ok(format($q$select public.accept_project_terms(%L,%L,'step-up-confirmed')$q$,(select payload->>'publicId' from s8_project),(select payload->>'hash' from s8_terms)),'42501','terms_acceptance_not_allowed','depicted participant cannot accept terms with V2 only');
insert into public.verification_subjects(user_id,level,status,verified_at,expires_at) values ('10000000-0000-0000-0000-0000000000b2','v3','verified',now(),now()+interval '1 year');
select lives_ok(format($q$select public.accept_project_terms(%L,%L,'step-up-confirmed')$q$,(select payload->>'publicId' from s8_project),(select payload->>'hash' from s8_terms)),'current V3 performer accepts exact terms');
select lives_ok(format($q$select public.accept_project_terms(%L,%L,'step-up-confirmed')$q$,(select payload->>'publicId' from s8_project),(select payload->>'hash' from s8_terms)),'duplicate exact acceptance is idempotent');
select is((select count(*)::integer from public.participant_acceptances where superseded_at is null),1,'duplicate acceptance creates one current receipt');
select lives_ok(format($q$select public.record_depicted_consent(%L,%L,'step-up-confirmed')$q$,(select payload->>'publicId' from s8_project),(select payload->>'hash' from s8_terms)),'current V3 performer personally records depicted consent');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000b1','role','authenticated')::text,true);
create temp table s8_terms2(payload jsonb);
insert into s8_terms2 select public.publish_project_terms((select payload->>'publicId' from s8_project),1,jsonb_build_object('participants',jsonb_build_array(jsonb_build_object('handle','s8_performer','role','performer','depicted',true)),'role','performer','boundaries',jsonb_build_array('closed-set','no-surprises'),'collaborators',jsonb_build_array('s8_owner'),'compensation','fixed:10000:USD','distributionScope','platform-only','rightsScope','streaming-only','schedule','September window','cancellation','Either party may leave before contract lock','finalCutApprovalRequired',true));
select is((select count(*)::integer from public.project_term_versions),2,'material change creates new immutable terms version');
select ok((select superseded_at is not null from public.participant_acceptances order by accepted_at limit 1),'material terms change supersedes old acceptance');
select ok((select superseded_at is not null from public.depicted_person_consents order by consented_at limit 1),'material terms change supersedes old consent');
select throws_ok(format($q$select public.lock_project_contract(%L,%L)$q$,(select payload->>'publicId' from s8_project),(select payload->>'hash' from s8_terms2)),'42501','contract_lock_not_allowed','owner cannot lock while latest obligations incomplete');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000b2','role','authenticated')::text,true);
select lives_ok(format($q$select public.accept_project_terms(%L,%L,'step-up-confirmed')$q$,(select payload->>'publicId' from s8_project),(select payload->>'hash' from s8_terms2)),'performer accepts latest exact terms');
select lives_ok(format($q$select public.record_depicted_consent(%L,%L,'step-up-confirmed')$q$,(select payload->>'publicId' from s8_project),(select payload->>'hash' from s8_terms2)),'performer consents to latest depicted scope');
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000b1','role','authenticated')::text,true);
select lives_ok(format($q$select public.lock_project_contract(%L,%L)$q$,(select payload->>'publicId' from s8_project),(select payload->>'hash' from s8_terms2)),'owner locks only after latest obligations satisfied');
select is((select state::text from public.projects where public_id=(select payload->>'publicId' from s8_project)),'contract_locked','contract lock changes project state only through constrained transition');
select is((select count(*)::integer from public.contract_lock_receipts),1,'contract lock writes one immutable receipt');
select throws_ok(format($q$select public.publish_project_terms(%L,1,'{}'::jsonb)$q$,(select payload->>'publicId' from s8_project)),'42501','project_terms_not_editable','locked project cannot publish replacement terms');

select * from finish();
rollback;
