begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','project_invitations','Slice 7 stores collaboration invitations');
select has_table('public','project_invitation_proposals','Slice 7 stores immutable invitation proposal versions');
select has_table('public','project_agency_authorities','Slice 7 stores explicit agency communication grants');
select has_function('public','send_project_invitation',array['text','text','text','jsonb'],'invitation send RPC exists');
select has_function('public','respond_project_invitation',array['text','text'],'recipient response RPC exists');
select has_function('public','propose_invitation_change',array['text','jsonb'],'structured proposal-change RPC exists');
select has_function('public','withdraw_project_invitation',array['text'],'withdraw RPC exists');
select ok(coalesce(has_table_privilege('authenticated','public.project_invitations','INSERT'),false)=false,'authenticated clients cannot insert invitations directly');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-0000000000a1','authenticated','authenticated','s7-owner@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-0000000000a2','authenticated','authenticated','s7-recipient@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-0000000000a3','authenticated','authenticated','s7-agency@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set
 handle=case user_id when '10000000-0000-0000-0000-0000000000a1' then 's7_owner' when '10000000-0000-0000-0000-0000000000a2' then 's7_recipient' else 's7_agency' end,
 display_name=case user_id when '10000000-0000-0000-0000-0000000000a1' then 'S7 Owner' when '10000000-0000-0000-0000-0000000000a2' then 'S7 Recipient' else 'S7 Agency' end,
 visibility='public'
where user_id in ('10000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-0000000000a3');
insert into public.age_assurance_records(user_id,method,status,jurisdiction_code,policy_version,expires_at)
select id,'self_attestation','accepted','PK','slice-7-invitation-test',now()+interval '1 year' from auth.users
where id in ('10000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-0000000000a3');
insert into public.workspace_memberships(user_id,role,status,reviewed_at,reviewed_by) values
('10000000-0000-0000-0000-0000000000a1','creator','approved',now(),'10000000-0000-0000-0000-0000000000a1'),
('10000000-0000-0000-0000-0000000000a2','creator','approved',now(),'10000000-0000-0000-0000-0000000000a2'),
('10000000-0000-0000-0000-0000000000a3','agency','approved',now(),'10000000-0000-0000-0000-0000000000a3');
update public.active_workspaces active set membership_id=membership.id,updated_at=now()
from public.workspace_memberships membership where membership.user_id=active.user_id and membership.status='approved'
and ((active.user_id='10000000-0000-0000-0000-0000000000a1' and membership.role='creator') or (active.user_id='10000000-0000-0000-0000-0000000000a2' and membership.role='creator') or (active.user_id='10000000-0000-0000-0000-0000000000a3' and membership.role='agency'));

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000a1','role','authenticated')::text,true);
create temp table s7_project(payload jsonb);
insert into s7_project select public.create_project_draft(jsonb_build_object(
 'title','Invitation project','publicSynopsis','A public-safe synopsis for a voluntary collaboration project invitation.',
 'privateBrief','A private production brief containing project logistics and confidential collaborator context.',
 'category','concept','format','video','boundaries',jsonb_build_array('closed-set'),'compensationModel','fixed',
 'distributionScope','Platform release only','rightsDeclarations',jsonb_build_array('original-concept')));
create temp table s7_invite(payload jsonb);
insert into s7_invite select public.send_project_invitation((select payload->>'publicId' from s7_project),'s7_recipient','performer',jsonb_build_object('note','Initial exact-revision proposal'));
select ok((select payload->>'publicId' from s7_invite) like 'inv%','owner receives an opaque invitation public ID');
select is((select state::text from public.project_invitations limit 1),'sent','new invitation starts sent');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000a3','role','authenticated')::text,true);
select throws_ok(
 format($q$select public.send_project_invitation(%L,'s7_recipient','editor','{}'::jsonb)$q$,(select payload->>'publicId' from s7_project)),
 '42501','project_communication_not_allowed','agency cannot act without an explicit communication grant');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000a1','role','authenticated')::text,true);
-- S16 requires a verified agency and performer-accepted scoped representation.
select throws_ok(format($q$select public.set_project_agency_authority(%L,'s7_agency',true)$q$,(select payload->>'publicId' from s7_project)),
 '42501','agency_unavailable','workspace approval alone does not authorize an unverified agency');
insert into public.agency_profiles(public_id,owner_user_id,display_name,jurisdiction_code,verification_status)
values('agy000000000000000000000007','10000000-0000-0000-0000-0000000000a3','S7 Agency','PK','approved');
insert into public.agency_staff_memberships(agency_id,user_id,staff_role,added_by_user_id)
select id,owner_user_id,'owner',owner_user_id from public.agency_profiles where public_id='agy000000000000000000000007';
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000a3','role','authenticated')::text,true);
create temp table s7_representation(payload jsonb);
insert into s7_representation select public.invite_performer_representation('s7_owner',
 '{"communications":true,"opportunities":false,"negotiations":false,"projectAdmin":true,"contractAdmin":false,"earningsVisibility":false,"commissionBasisPoints":0,"revocationNoticeDays":0}'::jsonb);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000a1','role','authenticated')::text,true);
select throws_ok(format($q$select public.set_project_agency_authority(%L,'s7_agency',true)$q$,(select payload->>'publicId' from s7_project)),
 '42501','agency_representation_scope_required','proposed representation does not authorize project administration');
select public.respond_agency_representation((select payload->>'publicId' from s7_representation),'accept');
select lives_ok(format($q$select public.set_project_agency_authority(%L,'s7_agency',true)$q$,(select payload->>'publicId' from s7_project)),'owner can explicitly grant agency communication authority');
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000a3','role','authenticated')::text,true);
select lives_ok(format($q$select public.send_project_invitation(%L,'s7_recipient','editor',jsonb_build_object('note','Agency managed proposal'))$q$,(select payload->>'publicId' from s7_project)),'authorized agency can send an attributed invitation');
select is((select count(*)::integer from public.project_invitations where agency_actor_user_id='10000000-0000-0000-0000-0000000000a3'),1,'agency-managed invitation is visibly attributable in durable state');

-- S16: exercise capability changes and isolate representation by performer.
select is((private.active_agency_representation('10000000-0000-0000-0000-0000000000a3','10000000-0000-0000-0000-0000000000a2','project_admin')).id,null::uuid,
 'one performer acceptance cannot authorize another performer');
select throws_ok(format($q$select public.create_agency_opportunity(%L,'A new opportunity','A scoped opportunity summary')$q$,(select payload->>'publicId' from s7_representation)),
 '42501','agency_opportunity_denied','communication scope does not grant opportunities');
update public.agency_representation_agreements set scope_opportunities=true where public_id=(select payload->>'publicId' from s7_representation);
create temp table s16_opportunity(payload jsonb);
select lives_ok(format($q$insert into s16_opportunity select public.create_agency_opportunity(%L,'A new opportunity','A scoped opportunity summary')$q$,(select payload->>'publicId' from s7_representation)),
 'accepted opportunity scope allows opportunity creation');
select throws_ok(format($q$select public.advance_agency_negotiation(%L,'proposed','Proposed engagement')$q$,(select payload->>'publicId' from s16_opportunity)),
 '42501','agency_negotiation_denied','opportunity scope does not grant negotiations');
update public.agency_representation_agreements set scope_negotiations=true where public_id=(select payload->>'publicId' from s7_representation);
select lives_ok(format($q$select public.advance_agency_negotiation(%L,'proposed','Proposed engagement')$q$,(select payload->>'publicId' from s16_opportunity)),
 'accepted negotiation scope allows negotiation');
update public.agency_representation_agreements set scope_communications=false where public_id=(select payload->>'publicId' from s7_representation);
select throws_ok(format($q$select public.send_project_invitation(%L,'s7_recipient','performer','{}'::jsonb)$q$,(select payload->>'publicId' from s7_project)),
 '42501','project_communication_not_allowed','project administration without communication scope cannot invite');
update public.agency_representation_agreements set scope_communications=true,scope_project_admin=false where public_id=(select payload->>'publicId' from s7_representation);
select throws_ok(format($q$select public.send_project_invitation(%L,'s7_recipient','performer','{}'::jsonb)$q$,(select payload->>'publicId' from s7_project)),
 '42501','project_communication_not_allowed','communication without project administration cannot invite');
update public.agency_representation_agreements set scope_project_admin=true,status='revocation_pending',revocation_effective_at=now()-interval '1 second' where public_id=(select payload->>'publicId' from s7_representation);
select throws_ok(format($q$select public.send_project_invitation(%L,'s7_recipient','performer','{}'::jsonb)$q$,(select payload->>'publicId' from s7_project)),
 '42501','project_communication_not_allowed','expired revocation notice removes communication authority');
select throws_ok(format($q$select public.create_agency_opportunity(%L,'A new opportunity','A scoped opportunity summary')$q$,(select payload->>'publicId' from s7_representation)),
 '42501','agency_opportunity_denied','expired revocation notice removes opportunity authority');
select throws_ok(format($q$select public.advance_agency_negotiation(%L,'accepted','Accepted engagement')$q$,(select payload->>'publicId' from s16_opportunity)),
 '42501','agency_negotiation_denied','expired revocation notice removes negotiation authority');
select * from finish();
rollback;
