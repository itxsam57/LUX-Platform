begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

select has_table('public','payment_transactions','Slice 10 stores private payment transaction state');
select has_table('public','payment_webhook_receipts','Slice 10 stores authenticated webhook replay receipts');
select has_table('public','funding_change_requests','Slice 10 stores material-change and refund requests');
select has_table('public','supporter_badges','Slice 10 stores supporter badge visibility');
select has_table('public','payment_operation_receipts','Slice 10 stores payment-operation idempotency receipts');
select hasnt_column('public','payment_transactions','pan','payment storage has no PAN column');
select hasnt_column('public','payment_transactions','cvv','payment storage has no CVV column');
select hasnt_column('public','payment_transactions','card_number','payment storage has no raw card-number column');

select has_function('public','record_payment_transition',array['text','text','text','text','text','text','bigint','bigint','bigint','text'],'service payment-transition RPC exists');
select has_function('public','apply_payment_webhook',array['text','text','text','text','bigint','bigint','bigint','timestamptz','text'],'verified webhook application RPC exists');
select has_function('public','request_funding_refund',array['text','bigint','text','text'],'supporter refund-request RPC exists');
select has_function('public','accept_changed_campaign_terms',array['text','integer','text','text'],'explicit changed-terms acceptance RPC exists');
select has_function('public','set_supporter_badge',array['text','text','text'],'supporter badge-setting RPC exists');
select has_function('public','get_funding_commitment',array['text'],'owner-safe funding detail RPC exists');

select ok(case when to_regclass('public.payment_transactions') is null then false else coalesce(has_table_privilege('authenticated','public.payment_transactions','INSERT'),false)=false end,'authenticated clients cannot forge payment transactions');
select ok(case when to_regclass('public.payment_transactions') is null then false else coalesce(has_table_privilege('authenticated','public.payment_transactions','UPDATE'),false)=false end,'authenticated clients cannot mutate payment transactions directly');
select ok(case when to_regclass('public.payment_transactions') is null then false else coalesce(has_table_privilege('authenticated','public.payment_transactions','SELECT'),false)=false end,'authenticated clients cannot read private processor references');
select ok(case when to_regclass('public.payment_webhook_receipts') is null then false else coalesce(has_table_privilege('authenticated','public.payment_webhook_receipts','INSERT'),false)=false end,'authenticated clients cannot forge webhook receipts');
select ok(case when to_regclass('public.funding_change_requests') is null then false else coalesce(has_table_privilege('authenticated','public.funding_change_requests','INSERT'),false)=false end,'authenticated clients cannot forge change/refund rows directly');
select ok(case when to_regclass('public.supporter_badges') is null then false else coalesce(has_table_privilege('authenticated','public.supporter_badges','INSERT'),false)=false end,'authenticated clients cannot forge supporter badges directly');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-0000000000e1','authenticated','authenticated','s10-owner@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-0000000000e2','authenticated','authenticated','s10-supporter@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-0000000000e3','authenticated','authenticated','s10-other@lux.test',crypt('LuxTestPassword1',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

update public.profiles set handle=case user_id when '10000000-0000-0000-0000-0000000000e1' then 's10_owner' when '10000000-0000-0000-0000-0000000000e2' then 's10_supporter' else 's10_other' end,
  display_name=case user_id when '10000000-0000-0000-0000-0000000000e1' then 'Slice 10 Creator' when '10000000-0000-0000-0000-0000000000e2' then 'Slice 10 Supporter' else 'Slice 10 Other' end,
  visibility='public'
where user_id in ('10000000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-0000000000e2','10000000-0000-0000-0000-0000000000e3');

insert into public.age_assurance_records(user_id,method,status,jurisdiction_code,policy_version,expires_at)
select id,'self_attestation','accepted','PK','slice-10-funding-test',now()+interval '1 year' from auth.users
where id in ('10000000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-0000000000e2','10000000-0000-0000-0000-0000000000e3');

insert into public.workspace_memberships(user_id,role,status,reviewed_at,reviewed_by)
values ('10000000-0000-0000-0000-0000000000e1','creator','approved',now(),'10000000-0000-0000-0000-0000000000e1');
update public.active_workspaces active set membership_id=membership.id,updated_at=now()
from public.workspace_memberships membership
where membership.user_id=active.user_id and membership.status='approved' and active.user_id='10000000-0000-0000-0000-0000000000e1' and membership.role='creator';

insert into public.verification_subjects(user_id,level,status,verified_at,expires_at)
values ('10000000-0000-0000-0000-0000000000e1','v2','verified',now(),now()+interval '1 year');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000e1','role','authenticated')::text,true);
create temp table s10_project(payload jsonb);
insert into s10_project select public.create_project_draft(jsonb_build_object(
  'title','Slice 10 funding lifecycle project','publicSynopsis','A truthful public synopsis used to verify the private funding lifecycle and supporter dashboard.',
  'privateBrief','This private production brief must never appear in funding or processor projections.','category','concept','format','video',
  'boundaries',jsonb_build_array('closed-set'),'compensationModel','fixed','distributionScope','Platform release only','rightsDeclarations',jsonb_build_array('original-concept')));
create temp table s10_terms(payload jsonb);
insert into s10_terms select public.publish_project_terms((select payload->>'publicId' from s10_project),1,jsonb_build_object(
  'participants',jsonb_build_array(jsonb_build_object('handle','s10_owner','role','creator','depicted',false)),'role','creator','boundaries',jsonb_build_array('closed-set'),
  'collaborators',jsonb_build_array(),'compensation','fixed:10000:USD','distributionScope','platform-only','rightsScope','streaming-only',
  'schedule','January to March 2027','cancellation','Either party may leave before contract lock','finalCutApprovalRequired',true));
select public.accept_project_terms((select payload->>'publicId' from s10_project),(select payload->>'hash' from s10_terms),'step-up-confirmed');
select public.lock_project_contract((select payload->>'publicId' from s10_project),(select payload->>'hash' from s10_terms));

create temp table s10_campaign(payload jsonb);
insert into s10_campaign select public.save_campaign_draft((select payload->>'publicId' from s10_project),jsonb_build_object(
  'fundingTargetMinor',250000,'currency','USD','deadline',to_char((now()+interval '60 days') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'expectedDeliveryWindow','January-March 2027','guarantees',jsonb_build_array('One completed platform release'),
  'optionalChoices',jsonb_build_array('Creator-approved poster vote'),'refundRules','If the campaign fails or is cancelled, the permitted refund path is shown before confirmation.',
  'materialChangeRules','Material campaign changes require a new version and fresh supporter action where applicable.'));
select public.submit_campaign_for_publish((select payload->>'publicId' from s10_campaign),1);
select public.publish_campaign((select payload->>'publicId' from s10_campaign),1);

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000e2','role','authenticated')::text,true);
create temp table s10_commitment(payload jsonb);
insert into s10_commitment select public.create_prebook((select payload->>'publicId' from s10_campaign),5000,'anonymous',null,'s10-prebook-001');

create temp table s10_owner_before(payload jsonb);
select lives_ok(format($q$insert into s10_owner_before select public.get_funding_commitment(%L)$q$,(select payload->>'publicId' from s10_commitment)),'supporter can read only their safe funding detail');
select is((select payload->>'paymentState' from s10_owner_before limit 1),'pending','new pre-book truthfully reports pending processor state');
select ok(coalesce((select payload::text from s10_owner_before limit 1),'') !~ '(txn_sbx_|cus_sbx_|pm_sbx_|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})','safe funding detail exposes no processor references or internal UUIDs');

select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-0000-0000-000000000000','role','service_role')::text,true);
create temp table s10_authorized(payload jsonb);
select lives_ok(format($q$insert into s10_authorized select public.record_payment_transition(%L,'sandbox','cus_sbx_aaaaaaaaaaaaaaaaaaaaaaaa','pm_sbx_bbbbbbbbbbbbbbbbbbbbbbbb','txn_sbx_cccccccccccccccccccccccc','authorized',5000,0,0,'pay-auth-001')$q$,(select payload->>'publicId' from s10_commitment)),'service boundary records an authorized payment transition');
select is((select payload->>'paymentState' from s10_authorized limit 1),'authorized','authorized transition is normalized');
select is((select (payload->>'authorizedMinor')::bigint from s10_authorized limit 1),5000::bigint,'authorized value is exact');
select ok(coalesce((select payload::text from s10_authorized limit 1),'') !~ '(txn_sbx_|cus_sbx_|pm_sbx_)','payment transition response never echoes private processor references');

create temp table s10_authorized_retry(payload jsonb);
select lives_ok(format($q$insert into s10_authorized_retry select public.record_payment_transition(%L,'sandbox','cus_sbx_aaaaaaaaaaaaaaaaaaaaaaaa','pm_sbx_bbbbbbbbbbbbbbbbbbbbbbbb','txn_sbx_cccccccccccccccccccccccc','authorized',5000,0,0,'pay-auth-001')$q$,(select payload->>'publicId' from s10_commitment)),'same payment idempotency key is safe to retry');
select is((select payload::text from s10_authorized_retry limit 1),(select payload::text from s10_authorized limit 1),'payment idempotent retry returns the original normalized result');

create temp table s10_captured(payload jsonb);
select lives_ok(format($q$insert into s10_captured select public.record_payment_transition(%L,'sandbox','cus_sbx_aaaaaaaaaaaaaaaaaaaaaaaa','pm_sbx_bbbbbbbbbbbbbbbbbbbbbbbb','txn_sbx_cccccccccccccccccccccccc','captured',5000,5000,0,'pay-capture-001')$q$,(select payload->>'publicId' from s10_commitment)),'authorized payment can advance to captured');
select is((select payload->>'paymentState' from s10_captured limit 1),'captured','captured state persists');
select is((select (payload->>'capturedMinor')::bigint from s10_captured limit 1),5000::bigint,'captured value is exact');
select throws_ok(format($q$select public.record_payment_transition(%L,'sandbox','cus_sbx_aaaaaaaaaaaaaaaaaaaaaaaa','pm_sbx_bbbbbbbbbbbbbbbbbbbbbbbb','txn_sbx_cccccccccccccccccccccccc','authorized',5000,0,0,'pay-regress-001')$q$,(select payload->>'publicId' from s10_commitment)),'22023','invalid_payment_transition','captured payment cannot regress to authorized');

create temp table s10_webhook_first(payload jsonb);
select lives_ok($q$insert into s10_webhook_first select public.apply_payment_webhook('sandbox','evt-s10-001','txn_sbx_cccccccccccccccccccccccc','captured',5000,5000,0,now(),'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')$q$,'verified webhook applies through the service-only event boundary');
select is((select payload->>'paymentState' from s10_webhook_first limit 1),'captured','webhook keeps the normalized captured state');
create temp table s10_webhook_retry(payload jsonb);
select lives_ok($q$insert into s10_webhook_retry select public.apply_payment_webhook('sandbox','evt-s10-001','txn_sbx_cccccccccccccccccccccccc','captured',5000,5000,0,now(),'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')$q$,'duplicate webhook with the same event id and payload hash is idempotent');
select is((select payload->>'replayed' from s10_webhook_retry limit 1),'true','duplicate webhook is marked replayed rather than re-applied');
select throws_ok($q$select public.apply_payment_webhook('sandbox','evt-s10-001','txn_sbx_cccccccccccccccccccccccc','captured',5000,5000,0,now(),'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')$q$,'22023','webhook_event_conflict','same webhook event id with a different payload hash is rejected');
create temp table s10_webhook_old(payload jsonb);
select lives_ok($q$insert into s10_webhook_old select public.apply_payment_webhook('sandbox','evt-s10-old','txn_sbx_cccccccccccccccccccccccc','authorized',5000,0,0,now()-interval '1 hour','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc')$q$,'reordered older webhook is handled without regressing money state');
select is((select payload->>'ignored' from s10_webhook_old limit 1),'true','older webhook is explicitly ignored');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000e2','role','authenticated')::text,true);
create temp table s10_refund(payload jsonb);
select lives_ok(format($q$insert into s10_refund select public.request_funding_refund(%L,1500,'Campaign no longer fits my needs','refund-s10-001')$q$,(select payload->>'publicId' from s10_commitment)),'supporter can explicitly request a bounded refund');
select is((select (payload->>'amountMinor')::bigint from s10_refund limit 1),1500::bigint,'refund request stores the exact requested amount');
create temp table s10_refund_retry(payload jsonb);
select lives_ok(format($q$insert into s10_refund_retry select public.request_funding_refund(%L,1500,'Campaign no longer fits my needs','refund-s10-001')$q$,(select payload->>'publicId' from s10_commitment)),'same refund idempotency key is safe to retry');
select is((select payload->>'requestPublicId' from s10_refund_retry limit 1),(select payload->>'requestPublicId' from s10_refund limit 1),'refund retry returns the original request');
select throws_ok(format($q$select public.request_funding_refund(%L,6000,'Too much','refund-s10-too-much')$q$,(select payload->>'publicId' from s10_commitment)),'22023','invalid_refund_amount','supporter cannot request more than captured refundable value');

create temp table s10_badge(payload jsonb);
select lives_ok(format($q$insert into s10_badge select public.set_supporter_badge(%L,'founding-supporter','public')$q$,(select payload->>'publicId' from s10_commitment)),'supporter can set an explicit badge visibility choice');
select is((select payload->>'visibility' from s10_badge limit 1),'public','badge visibility is explicit');
create temp table s10_owner_after_badge(payload jsonb);
select lives_ok(format($q$insert into s10_owner_after_badge select public.get_funding_commitment(%L)$q$,(select payload->>'publicId' from s10_commitment)),'owner-safe funding detail remains readable after badge update');
select is((select payload#>>'{badge,key}' from s10_owner_after_badge limit 1),'founding-supporter','funding detail carries the selected badge');
select ok(coalesce((select payload::text from s10_owner_after_badge limit 1),'') !~ '(txn_sbx_|cus_sbx_|pm_sbx_|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})','post-payment funding detail still exposes no processor references or internal UUIDs');

insert into public.campaign_term_versions(campaign_id,version,project_revision,contract_term_version_id,body,terms_hash,created_by_user_id)
select version.campaign_id,2,version.project_revision,version.contract_term_version_id,
  jsonb_set(version.body,'{expectedDeliveryWindow}',to_jsonb('April-June 2027'::text)),
  encode(extensions.digest(convert_to(jsonb_set(version.body,'{expectedDeliveryWindow}',to_jsonb('April-June 2027'::text))::text,'UTF8'),'sha256'),'hex'),
  '10000000-0000-0000-0000-0000000000e1'
from public.campaign_term_versions version join public.campaigns campaign on campaign.id=version.campaign_id
where campaign.public_id=(select payload->>'publicId' from s10_campaign) and version.version=1;

select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-0000-0000-000000000000','role','service_role')::text,true);
select lives_ok(format($q$insert into public.funding_change_requests(public_id,funding_commitment_id,kind,campaign_term_version_id,state,idempotency_key,reason)
select 'chg0123456789abcdef01234567',commitment.id,'material_change',version.id,'pending','change-s10-001','Delivery window changed after the original commitment.'
from public.funding_commitments commitment
join public.campaign_term_versions original on original.id=commitment.campaign_term_version_id
join public.campaign_term_versions version on version.campaign_id=original.campaign_id and version.version=2
where commitment.public_id=%L$q$,(select payload->>'publicId' from s10_commitment)),'service boundary can register a pending material-change request without mutating original terms');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000e2','role','authenticated')::text,true);
create temp table s10_accept_change(payload jsonb);
select lives_ok(format($q$insert into s10_accept_change select public.accept_changed_campaign_terms(%L,2,(select terms_hash from public.campaign_term_versions version join public.campaigns campaign on campaign.id=version.campaign_id where campaign.public_id=%L and version.version=2),'accept-change-s10-001')$q$,(select payload->>'publicId' from s10_commitment),(select payload->>'publicId' from s10_campaign)),'supporter explicitly accepts the exact changed campaign terms');
select is((select (payload->>'termsVersion')::integer from s10_accept_change limit 1),2,'changed-terms acceptance binds version 2');
select ok((select payload->>'termsHash' from s10_accept_change limit 1) ~ '^[0-9a-f]{64}$','changed-terms acceptance carries the exact immutable hash');
create temp table s10_accept_retry(payload jsonb);
select lives_ok(format($q$insert into s10_accept_retry select public.accept_changed_campaign_terms(%L,2,(select terms_hash from public.campaign_term_versions version join public.campaigns campaign on campaign.id=version.campaign_id where campaign.public_id=%L and version.version=2),'accept-change-s10-001')$q$,(select payload->>'publicId' from s10_commitment),(select payload->>'publicId' from s10_campaign)),'changed-terms acceptance is idempotent');
select is((select payload::text from s10_accept_retry limit 1),(select payload::text from s10_accept_change limit 1),'changed-terms retry returns the original acceptance');

select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-0000000000e3','role','authenticated')::text,true);
create temp table s10_other_read(payload jsonb);
select lives_ok(format($q$insert into s10_other_read select public.get_funding_commitment(%L)$q$,(select payload->>'publicId' from s10_commitment)),'cross-account safe read does not leak by throwing an internal identifier');
select is((select payload from s10_other_read limit 1),null::jsonb,'another supporter receives no funding detail for someone else commitment');

select * from finish();
rollback;
