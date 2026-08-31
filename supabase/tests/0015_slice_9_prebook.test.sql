begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

select has_table('public','funding_commitments','Slice 9 stores durable pre-book commitments');
select has_function('public','create_prebook',array['text','bigint','text','text','text'],'pre-book RPC exists with an exact typed boundary');
select ok(coalesce(has_table_privilege('authenticated','public.funding_commitments','INSERT'),false)=false,'authenticated clients cannot forge funding commitments');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-0000000000d1','authenticated','authenticated','s9b-owner@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-0000000000d2','authenticated','authenticated','s9b-supporter@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

update public.profiles set handle=case user_id
  when '10000000-0000-0000-0000-0000000000d1' then 's9b_owner'
  else 's9b_supporter' end,
  display_name=case user_id
  when '10000000-0000-0000-0000-0000000000d1' then 'Slice 9 Prebook Creator'
  else 'Slice 9 Prebook Supporter' end,
  visibility='public'
where user_id in ('10000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-0000000000d2');

insert into public.age_assurance_records(user_id,method,status,jurisdiction_code,policy_version,expires_at)
select id,'self_attestation','accepted','PK','slice-9-prebook-test',now()+interval '1 year'
from auth.users where id in ('10000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-0000000000d2');

insert into public.workspace_memberships(user_id,role,status,reviewed_at,reviewed_by)
values ('10000000-0000-0000-0000-0000000000d1','creator','approved',now(),'10000000-0000-0000-0000-0000000000d1');
update public.active_workspaces active set membership_id=membership.id,updated_at=now()
from public.workspace_memberships membership
where membership.user_id=active.user_id and membership.status='approved'
  and active.user_id='10000000-0000-0000-0000-0000000000d1' and membership.role='creator';

insert into public.verification_subjects(user_id,level,status,verified_at,expires_at)
values ('10000000-0000-0000-0000-0000000000d1','v2','verified',now(),now()+interval '1 year');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000d1','role','authenticated')::text,true);
create temp table s9b_project(payload jsonb);
insert into s9b_project select public.create_project_draft(jsonb_build_object(
  'title','Slice 9 pre-book project',
  'publicSynopsis','A truthful public synopsis for testing exact-version pre-book commitments without private production leakage.',
  'privateBrief','This private production brief must remain inaccessible from campaign and funding public projections.',
  'category','concept','format','video','boundaries',jsonb_build_array('closed-set'),
  'compensationModel','fixed','distributionScope','Platform release only','rightsDeclarations',jsonb_build_array('original-concept')));
create temp table s9b_terms(payload jsonb);
insert into s9b_terms select public.publish_project_terms((select payload->>'publicId' from s9b_project),1,jsonb_build_object(
  'participants',jsonb_build_array(jsonb_build_object('handle','s9b_owner','role','creator','depicted',false)),
  'role','creator','boundaries',jsonb_build_array('closed-set'),'collaborators',jsonb_build_array(),
  'compensation','fixed:10000:USD','distributionScope','platform-only','rightsScope','streaming-only',
  'schedule','January to March 2027','cancellation','Either party may leave before contract lock','finalCutApprovalRequired',true));
select lives_ok(format($q$select public.accept_project_terms(%L,%L,'step-up-confirmed')$q$,(select payload->>'publicId' from s9b_project),(select payload->>'hash' from s9b_terms)),'creator participant accepts the exact contract terms');
select lives_ok(format($q$select public.lock_project_contract(%L,%L)$q$,(select payload->>'publicId' from s9b_project),(select payload->>'hash' from s9b_terms)),'eligible project reaches contract lock');

create temp table s9b_campaign(payload jsonb);
insert into s9b_campaign select public.save_campaign_draft((select payload->>'publicId' from s9b_project),jsonb_build_object(
  'fundingTargetMinor',250000,'currency','USD',
  'deadline',to_char((now()+interval '60 days') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'expectedDeliveryWindow','January-March 2027','guarantees',jsonb_build_array('One completed platform release'),
  'optionalChoices',jsonb_build_array('Creator-approved poster vote'),
  'refundRules','If the campaign fails or is cancelled, the permitted refund path is shown before confirmation.',
  'materialChangeRules','Material campaign changes require a new version and fresh supporter action where applicable.'));
select lives_ok(format($q$select public.submit_campaign_for_publish(%L,1)$q$,(select payload->>'publicId' from s9b_campaign)),'campaign enters review on exact version 1');
select lives_ok(format($q$select public.publish_campaign(%L,1)$q$,(select payload->>'publicId' from s9b_campaign)),'eligible exact campaign version publishes');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000d2','role','authenticated')::text,true);
select throws_ok(
  format($q$select public.create_prebook(%L,0,'default',null,'prebook:invalid-amount')$q$,(select payload->>'publicId' from s9b_campaign)),
  '22023','invalid_prebook_amount','non-positive pre-book amount is rejected'
);

create temp table s9b_first(payload jsonb);
insert into s9b_first select public.create_prebook((select payload->>'publicId' from s9b_campaign),5000,'default','founding-supporter','prebook:fixture-001');
select ok((select payload->>'publicId' from s9b_first) like 'fnd%','commitment uses an opaque public identifier');
select is((select (payload->>'amountMinor')::bigint from s9b_first),5000::bigint,'commitment stores the exact amount');
select is((select (payload->>'supporterAnonymous')::boolean from s9b_first),true,'default visibility resolves from the existing anonymous supporter preference');
select is((select (payload->>'termsVersion')::integer from s9b_first),1,'commitment response binds campaign terms version 1');
select ok((select payload->>'termsHash' from s9b_first) ~ '^[0-9a-f]{64}$','commitment response carries the exact immutable terms hash');
select is((select version.version from public.funding_commitments commitment join public.campaign_term_versions version on version.id=commitment.campaign_term_version_id where commitment.public_id=(select payload->>'publicId' from s9b_first)),1,'durable commitment foreign key binds exact campaign terms version');

create temp table s9b_retry(payload jsonb);
insert into s9b_retry select public.create_prebook((select payload->>'publicId' from s9b_campaign),5000,'default','founding-supporter','prebook:fixture-001');
select is((select payload->>'publicId' from s9b_retry),(select payload->>'publicId' from s9b_first),'same idempotency key returns the original commitment');
select is((select count(*)::integer from public.funding_commitments where supporter_user_id='10000000-0000-0000-0000-0000000000d2'),1,'idempotent retry creates only one durable row');

create temp table s9b_public(payload jsonb);
insert into s9b_public select public.get_public_campaign((select payload->>'publicId' from s9b_campaign));
select is((select (payload->>'supporterCount')::integer from s9b_public),1,'public supporter count derives from real commitments');
select is((select (payload->>'fundedAmountMinor')::bigint from s9b_public),5000::bigint,'public funded amount derives from real commitments');
select ok((select payload::text !~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' from s9b_public),'public totals do not leak commitment or supporter UUIDs');

create temp table s9b_public_override(payload jsonb);
insert into s9b_public_override select public.create_prebook((select payload->>'publicId' from s9b_campaign),2500,'public',null,'prebook:fixture-002');
select is((select (payload->>'supporterAnonymous')::boolean from s9b_public_override),false,'supporter can explicitly choose public attribution for a commitment');
select is((select count(distinct supporter_user_id)::integer from public.funding_commitments),1,'multiple commitments from one supporter still represent one supporter');
select is((select sum(amount_minor)::bigint from public.funding_commitments),7500::bigint,'multiple distinct commitments contribute exact amounts');

update public.campaign_term_versions
set body=jsonb_set(body,'{deadline}',to_jsonb(to_char((now()-interval '1 day') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')))
where campaign_id=(select id from public.campaigns where public_id=(select payload->>'publicId' from s9b_campaign)) and version=1;
select throws_ok(
  format($q$select public.create_prebook(%L,1000,'default',null,'prebook:expired-001')$q$,(select payload->>'publicId' from s9b_campaign)),
  '42501','prebook_not_allowed','expired campaign denies new pre-book commitments'
);
update public.campaign_term_versions
set body=jsonb_set(body,'{deadline}',to_jsonb(to_char((now()+interval '60 days') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')))
where campaign_id=(select id from public.campaigns where public_id=(select payload->>'publicId' from s9b_campaign)) and version=1;

update public.campaigns set state='funding_closed',funding_closed_at=now() where public_id=(select payload->>'publicId' from s9b_campaign);
select throws_ok(
  format($q$select public.create_prebook(%L,1000,'default',null,'prebook:closed-001')$q$,(select payload->>'publicId' from s9b_campaign)),
  '42501','prebook_not_allowed','funding-closed campaign denies new pre-book commitments'
);
update public.campaigns set state='published',funding_closed_at=null where public_id=(select payload->>'publicId' from s9b_campaign);

update public.projects set funding_restricted=true where public_id=(select payload->>'publicId' from s9b_project);
select throws_ok(
  format($q$select public.create_prebook(%L,1000,'default',null,'prebook:restricted-001')$q$,(select payload->>'publicId' from s9b_campaign)),
  '42501','prebook_not_allowed','project restriction is rechecked at pre-book time'
);
update public.projects set funding_restricted=false where public_id=(select payload->>'publicId' from s9b_project);

update public.campaigns set payment_environment_eligible=false where public_id=(select payload->>'publicId' from s9b_campaign);
select throws_ok(
  format($q$select public.create_prebook(%L,1000,'default',null,'prebook:payment-env-001')$q$,(select payload->>'publicId' from s9b_campaign)),
  '42501','prebook_not_allowed','payment-environment ineligibility is rechecked at pre-book time'
);

select * from finish();
rollback;
