begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

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
select like((select payload->>'publicId' from s7_invite),'inv%','owner receives an opaque invitation public ID');
select is((select state::text from public.project_invitations limit 1),'sent','new invitation starts sent');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000a3','role','authenticated')::text,true);
select throws_ok(
 format($q$select public.send_project_invitation(%L,'s7_recipient','editor','{}'::jsonb)$q$,(select payload->>'publicId' from s7_project)),
 '42501','project_communication_not_allowed','agency cannot act without an explicit communication grant');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000a1','role','authenticated')::text,true);
select lives_ok(format($q$select public.set_project_agency_authority(%L,'s7_agency',true)$q$,(select payload->>'publicId' from s7_project)),'owner can explicitly grant agency communication authority');
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000a3','role','authenticated')::text,true);
select lives_ok(format($q$select public.send_project_invitation(%L,'s7_recipient','editor',jsonb_build_object('note','Agency managed proposal'))$q$,(select payload->>'publicId' from s7_project)),'authorized agency can send an attributed invitation');
select is((select count(*)::integer from public.project_invitations where agency_actor_user_id='10000000-0000-0000-0000-0000000000a3'),1,'agency-managed invitation is visibly attributable in durable state');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000a2','role','authenticated')::text,true);
select lives_ok(format($q$select public.respond_project_invitation(%L,'declined')$q$,(select payload->>'publicId' from s7_invite)),'recipient can quietly decline');
select is((select state::text from public.project_invitations where public_id=(select payload->>'publicId' from s7_invite)),'declined','quiet decline persists privately');
select is(public.get_invitation_private((select payload->>'publicId' from s7_invite))->>'state','declined','recipient can read their private decline state');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000a1','role','authenticated')::text,true);
create temp table s7_accept(payload jsonb);
insert into s7_accept select public.send_project_invitation((select payload->>'publicId' from s7_project),'s7_recipient','performer',jsonb_build_object('note','Acceptance fixture'));
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000a2','role','authenticated')::text,true);
select lives_ok(format($q$select public.respond_project_invitation(%L,'interested'); select public.respond_project_invitation(%L,'accepted')$q$,(select payload->>'publicId' from s7_accept),(select payload->>'publicId' from s7_accept)),'recipient may move through interest into acceptance for future contracting');
select is((select state::text from public.projects where public_id=(select payload->>'publicId' from s7_project)),'draft','invitation acceptance never creates contract lock or legal consent');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000a1','role','authenticated')::text,true);
select lives_ok(format($q$select public.update_project_draft(%L,1,jsonb_build_object(
 'title','Invitation project revision 2','publicSynopsis','A revised public-safe synopsis that makes prior invitation acceptance stale.',
 'privateBrief','A revised private brief with changed project details requiring the recipient to reconsider.',
 'category','concept','format','video','boundaries',jsonb_build_array('closed-set','no-surprises'),'compensationModel','fixed',
 'distributionScope','Platform release only','rightsDeclarations',jsonb_build_array('original-concept')))$q$,(select payload->>'publicId' from s7_project)),'project owner can create a new project revision');
select is((select state::text from public.project_invitations where public_id=(select payload->>'publicId' from s7_accept)),'considering','accepted invitation is reopened when its bound project revision becomes stale');
select ok((select invalidated_at is not null from public.project_invitations where public_id=(select payload->>'publicId' from s7_accept)),'stale acceptance records invalidation time');
select is((select accepted_proposal_version from public.project_invitations where public_id=(select payload->>'publicId' from s7_accept)),null,'stale acceptance marker is cleared');

select * from finish();
rollback;
