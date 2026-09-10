begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','releases','immutable releases exist');
select has_table('public','release_entitlements','release entitlements exist');
select has_table('public','release_playback_sessions','short-lived playback sessions exist');
select has_table('public','release_asset_access_tokens','short-lived release asset access exists');
select has_table('public','release_reviews','entitled release reviews exist');
select has_table('public','release_stolen_copy_reports','private copied-release intake exists');
select has_function('public','create_release',array['text','jsonb','text'],'release publication RPC exists');
select has_function('public','list_fan_library',array[]::text[],'fan library projection exists');
select has_function('public','get_release_detail',array['text'],'release detail projection exists');
select has_function('public','list_public_profile_releases',array['text'],'profile release projection exists');
select has_function('public','issue_release_playback',array['text','text'],'playback issuance RPC exists');
select has_function('public','resolve_release_playback',array['text'],'playback resolution RPC exists');
select has_function('public','issue_release_asset_access',array['text','text'],'release asset issuance RPC exists');
select has_function('public','resolve_release_asset_access',array['text'],'release asset resolution RPC exists');
select has_function('public','submit_release_review',array['text','integer','text'],'entitled review RPC exists');
select has_function('public','report_release_stolen_copy',array['text','text','text'],'copied-release intake RPC exists');

select ok(not has_table_privilege('authenticated','public.releases','SELECT'),'clients cannot read raw releases');
select ok(not has_table_privilege('authenticated','public.release_entitlements','SELECT'),'clients cannot read raw entitlement rows');
select ok(not has_table_privilege('authenticated','public.release_playback_sessions','SELECT'),'clients cannot read playback token hashes');
select ok(not has_table_privilege('authenticated','public.release_asset_access_tokens','SELECT'),'clients cannot read asset token hashes');
select ok(not has_table_privilege('authenticated','public.release_reviews','SELECT'),'clients cannot read raw review rows');
select ok(not has_table_privilege('authenticated','public.release_stolen_copy_reports','SELECT'),'reported URLs remain private');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','13000000-0000-0000-0000-0000000000a1','authenticated','authenticated','s13-owner@lux.test',crypt('x',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','13000000-0000-0000-0000-0000000000a2','authenticated','authenticated','s13-performer@lux.test',crypt('x',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','13000000-0000-0000-0000-0000000000a3','authenticated','authenticated','s13-supporter@lux.test',crypt('x',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','13000000-0000-0000-0000-0000000000a4','authenticated','authenticated','s13-outsider@lux.test',crypt('x',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','13000000-0000-0000-0000-0000000000a5','authenticated','authenticated','s13-reviewer@lux.test',crypt('x',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

update public.profiles set
  handle=case user_id
    when '13000000-0000-0000-0000-0000000000a1' then 's13_owner'
    when '13000000-0000-0000-0000-0000000000a2' then 's13_performer'
    when '13000000-0000-0000-0000-0000000000a3' then 's13_supporter'
    when '13000000-0000-0000-0000-0000000000a4' then 's13_outsider'
    else 's13_reviewer' end,
  display_name=case user_id
    when '13000000-0000-0000-0000-0000000000a1' then 'Slice 13 Owner'
    when '13000000-0000-0000-0000-0000000000a2' then 'Slice 13 Performer'
    when '13000000-0000-0000-0000-0000000000a3' then 'Slice 13 Supporter'
    when '13000000-0000-0000-0000-0000000000a4' then 'Slice 13 Outsider'
    else 'Slice 13 Reviewer' end,
  visibility='public'
where user_id in (
  '13000000-0000-0000-0000-0000000000a1','13000000-0000-0000-0000-0000000000a2',
  '13000000-0000-0000-0000-0000000000a3','13000000-0000-0000-0000-0000000000a4',
  '13000000-0000-0000-0000-0000000000a5');

insert into public.age_assurance_records(user_id,method,status,jurisdiction_code,policy_version,expires_at)
select id,'self_attestation','accepted','PK','slice-13-release-test',now()+interval '1 year'
from auth.users where id in (
  '13000000-0000-0000-0000-0000000000a1','13000000-0000-0000-0000-0000000000a2',
  '13000000-0000-0000-0000-0000000000a3','13000000-0000-0000-0000-0000000000a4');

insert into public.workspace_memberships(user_id,role,status,reviewed_at,reviewed_by) values
('13000000-0000-0000-0000-0000000000a1','creator','approved',now(),'13000000-0000-0000-0000-0000000000a1'),
('13000000-0000-0000-0000-0000000000a2','creator','approved',now(),'13000000-0000-0000-0000-0000000000a2'),
('13000000-0000-0000-0000-0000000000a5','reviewer','approved',now(),'13000000-0000-0000-0000-0000000000a5');

update public.active_workspaces active set membership_id=membership.id,updated_at=now()
from public.workspace_memberships membership
where membership.user_id=active.user_id and membership.status='approved'
  and active.user_id in ('13000000-0000-0000-0000-0000000000a1','13000000-0000-0000-0000-0000000000a2','13000000-0000-0000-0000-0000000000a5')
  and membership.role=case active.user_id when '13000000-0000-0000-0000-0000000000a5' then 'reviewer'::public.app_role else 'creator'::public.app_role end;

insert into public.verification_subjects(user_id,level,status,verified_at,expires_at) values
('13000000-0000-0000-0000-0000000000a1','v2','verified',now(),now()+interval '1 year'),
('13000000-0000-0000-0000-0000000000a2','v2','verified',now(),now()+interval '1 year'),
('13000000-0000-0000-0000-0000000000a2','v3','verified',now(),now()+interval '1 year');

select set_config('request.jwt.claims',jsonb_build_object('sub','13000000-0000-0000-0000-0000000000a1','role','authenticated')::text,true);
create temp table s13_project(payload jsonb);
insert into s13_project select public.create_project_draft(jsonb_build_object(
  'title','Slice 13 secure release project',
  'publicSynopsis','A complete release fixture proving entitlement, playback, ratings, privacy, and immutable delivery binding.',
  'privateBrief','Private release fixture context that must never leak through release or fan-library projections.',
  'category','concept','format','video','boundaries',jsonb_build_array('closed-set'),'compensationModel','fixed',
  'distributionScope','Platform release only','rightsDeclarations',jsonb_build_array('original-concept')));

create temp table s13_terms(payload jsonb);
insert into s13_terms select public.publish_project_terms((select payload->>'publicId' from s13_project),1,jsonb_build_object(
  'participants',jsonb_build_array(
    jsonb_build_object('handle','s13_owner','role','creator','depicted',false),
    jsonb_build_object('handle','s13_performer','role','performer','depicted',true)),
  'role','creator','boundaries',jsonb_build_array('closed-set'),'collaborators',jsonb_build_array('editor'),
  'compensation','fixed:10000:USD','distributionScope','platform-only','rightsScope','streaming-only',
  'schedule','January to March 2027','cancellation','Either party may leave before contract lock',
  'finalCutApprovalRequired',true));
select public.accept_project_terms((select payload->>'publicId' from s13_project),(select payload->>'hash' from s13_terms),'owner-step-up-confirmed');

select set_config('request.jwt.claims',jsonb_build_object('sub','13000000-0000-0000-0000-0000000000a2','role','authenticated')::text,true);
select public.accept_project_terms((select payload->>'publicId' from s13_project),(select payload->>'hash' from s13_terms),'performer-step-up-confirmed');
select public.record_depicted_consent((select payload->>'publicId' from s13_project),(select payload->>'hash' from s13_terms),'performer-consent-confirmed');

select set_config('request.jwt.claims',jsonb_build_object('sub','13000000-0000-0000-0000-0000000000a1','role','authenticated')::text,true);
select public.lock_project_contract((select payload->>'publicId' from s13_project),(select payload->>'hash' from s13_terms));

create temp table s13_campaign(payload jsonb);
insert into s13_campaign select public.save_campaign_draft((select payload->>'publicId' from s13_project),jsonb_build_object(
  'fundingTargetMinor',250000,'currency','USD','deadline',to_char((now()+interval '60 days') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'expectedDeliveryWindow','January-March 2027','guarantees',jsonb_build_array('One completed platform release'),
  'optionalChoices',jsonb_build_array('Creator-approved poster vote'),
  'refundRules','If the campaign fails or is cancelled, the permitted refund path is shown before confirmation.',
  'materialChangeRules','Material campaign changes require a new version and fresh supporter action where applicable.'));
select public.submit_campaign_for_publish((select payload->>'publicId' from s13_campaign),1);
select public.publish_campaign((select payload->>'publicId' from s13_campaign),1);

select set_config('request.jwt.claims',jsonb_build_object('sub','13000000-0000-0000-0000-0000000000a3','role','authenticated')::text,true);
create temp table s13_commitment(payload jsonb);
insert into s13_commitment select public.create_prebook((select payload->>'publicId' from s13_campaign),5000,'anonymous',null,'s13-prebook-001');

select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-0000-0000-000000000000','role','service_role')::text,true);
select public.record_payment_transition(
  (select payload->>'publicId' from s13_commitment),'sandbox',
  'cus_sbx_131313131313131313131313','pm_sbx_141414141414141414141414','txn_sbx_151515151515151515151515',
  'authorized',5000,0,0,'s13-pay-auth-001');
select public.record_payment_transition(
  (select payload->>'publicId' from s13_commitment),'sandbox',
  'cus_sbx_131313131313131313131313','pm_sbx_141414141414141414141414','txn_sbx_151515151515151515151515',
  'captured',5000,5000,0,'s13-pay-capture-001');

select set_config('request.jwt.claims',jsonb_build_object('sub','13000000-0000-0000-0000-0000000000a1','role','authenticated')::text,true);
create temp table s13_final_asset(payload jsonb);
insert into s13_final_asset select public.register_production_asset(
  (select payload->>'publicId' from s13_project),'media',(select payload->>'publicId' from s13_project)||'/private/final-release.mp4',
  '1313131313131313131313131313131313131313131313131313131313131313');
create temp table s13_poster_asset(payload jsonb);
insert into s13_poster_asset select public.register_production_asset(
  (select payload->>'publicId' from s13_project),'media',(select payload->>'publicId' from s13_project)||'/private/poster.png',
  '1414141414141414141414141414141414141414141414141414141414141414');
create temp table s13_preview_asset(payload jsonb);
insert into s13_preview_asset select public.register_production_asset(
  (select payload->>'publicId' from s13_project),'media',(select payload->>'publicId' from s13_project)||'/private/preview.mp4',
  '1515151515151515151515151515151515151515151515151515151515151515');

create temp table s13_delivery(payload jsonb);
insert into s13_delivery select public.submit_final_delivery(
  (select payload->>'publicId' from s13_project),(select payload->>'publicId' from s13_final_asset),'s13-final-submit-0001');

select throws_ok(
  format($q$select public.create_release(%L,jsonb_build_object('title','Slice 13 Premiere','synopsis','Approved release metadata bound to one immutable final delivery.','posterAssetPublicId',%L,'previewAssetPublicId',%L),'s13-release-0001')$q$,
    (select payload->>'publicId' from s13_delivery),(select payload->>'publicId' from s13_poster_asset),(select payload->>'publicId' from s13_preview_asset)),
  '42501','release_not_allowed','creator cannot publish before processing, checklist, final-cut, and reviewer approval are complete');

select set_config('request.jwt.claims',jsonb_build_object('sub','13000000-0000-0000-0000-0000000000a5','role','authenticated')::text,true);
select public.set_final_delivery_processing((select payload->>'publicId' from s13_delivery),'ready','Transcode, malware, and media checks completed');
select public.set_delivery_review_check((select payload->>'publicId' from s13_delivery),'legality','pass','Contract and legality evidence match');
select public.set_delivery_review_check((select payload->>'publicId' from s13_delivery),'consent','pass','Consent evidence matches the locked terms');
select public.set_delivery_review_check((select payload->>'publicId' from s13_delivery),'copyright','pass','Rights evidence matches the submitted media');
select public.set_delivery_review_check((select payload->>'publicId' from s13_delivery),'quality','pass','Release media passes technical quality review');

select set_config('request.jwt.claims',jsonb_build_object('sub','13000000-0000-0000-0000-0000000000a2','role','authenticated')::text,true);
select public.record_final_cut_approval((select payload->>'publicId' from s13_delivery),'approved','I approve this exact final cut for release');

select set_config('request.jwt.claims',jsonb_build_object('sub','13000000-0000-0000-0000-0000000000a5','role','authenticated')::text,true);
select public.decide_delivery_review((select payload->>'publicId' from s13_delivery),'approve','All release gates pass for this immutable version');

select set_config('request.jwt.claims',jsonb_build_object('sub','13000000-0000-0000-0000-0000000000a1','role','authenticated')::text,true);
create temp table s13_release(payload jsonb);
insert into s13_release select public.create_release(
  (select payload->>'publicId' from s13_delivery),
  jsonb_build_object(
    'title','Slice 13 Premiere','synopsis','Approved release metadata bound to one immutable final delivery.',
    'posterAssetPublicId',(select payload->>'publicId' from s13_poster_asset),
    'previewAssetPublicId',(select payload->>'publicId' from s13_preview_asset)),
  's13-release-0001');
select ok((select payload->>'publicId' from s13_release) ~ '^rel[0-9a-f]{24}$','approved immutable delivery publishes one opaque release id');

create temp table s13_release_retry(payload jsonb);
insert into s13_release_retry select public.create_release(
  (select payload->>'publicId' from s13_delivery),
  jsonb_build_object(
    'title','Slice 13 Premiere','synopsis','Approved release metadata bound to one immutable final delivery.',
    'posterAssetPublicId',(select payload->>'publicId' from s13_poster_asset),
    'previewAssetPublicId',(select payload->>'publicId' from s13_preview_asset)),
  's13-release-0001');
select is((select payload->>'publicId' from s13_release_retry),(select payload->>'publicId' from s13_release),'same publication idempotency key returns the original release');
select is((select count(*) from public.releases where delivery_version_id=(select id from public.final_delivery_versions where public_id=(select payload->>'publicId' from s13_delivery))),1::bigint,'duplicate publication creates no second immutable release');

create temp table s13_delivery_retry_key(payload jsonb);
insert into s13_delivery_retry_key select public.create_release(
  (select payload->>'publicId' from s13_delivery),
  jsonb_build_object(
    'title','Slice 13 Premiere','synopsis','Approved release metadata bound to one immutable final delivery.',
    'posterAssetPublicId',(select payload->>'publicId' from s13_poster_asset),
    'previewAssetPublicId',(select payload->>'publicId' from s13_preview_asset)),
  's13-release-0002');
select is((select payload->>'publicId' from s13_delivery_retry_key),(select payload->>'publicId' from s13_release),'same delivery with identical immutable metadata returns the existing release across retry keys');
select throws_ok(
  format($q$select public.create_release(%L,jsonb_build_object('title','Changed Premiere','synopsis','Approved release metadata bound to one immutable final delivery.','posterAssetPublicId',%L,'previewAssetPublicId',%L),'s13-release-0001')$q$,
    (select payload->>'publicId' from s13_delivery),(select payload->>'publicId' from s13_poster_asset),(select payload->>'publicId' from s13_preview_asset)),
  '40001','release_idempotency_conflict','same publication key cannot drift immutable release metadata');
select throws_ok(
  format($q$select public.create_release(%L,jsonb_build_object('title','Changed Premiere','synopsis','Approved release metadata bound to one immutable final delivery.','posterAssetPublicId',%L,'previewAssetPublicId',%L),'s13-release-0003')$q$,
    (select payload->>'publicId' from s13_delivery),(select payload->>'publicId' from s13_poster_asset),(select payload->>'publicId' from s13_preview_asset)),
  '40001','release_idempotency_conflict','same immutable delivery cannot be silently republished with changed metadata');

select is((select count(*) from public.release_entitlements where release_id=(select id from public.releases where public_id=(select payload->>'publicId' from s13_release)) and supporter_user_id='13000000-0000-0000-0000-0000000000a3'),1::bigint,'captured supporter receives release entitlement at publication');
select is((select count(*) from public.release_entitlements where release_id=(select id from public.releases where public_id=(select payload->>'publicId' from s13_release)) and supporter_user_id='13000000-0000-0000-0000-0000000000a4'),0::bigint,'non-supporter receives no release entitlement');

create temp table s13_creator_detail(payload jsonb);
insert into s13_creator_detail select public.get_release_detail((select payload->>'publicId' from s13_release));
select is((select payload->>'deliveryVersion' from s13_creator_detail),(select payload->>'version' from s13_delivery),'release detail is bound to the reviewed immutable delivery version');
select is((select payload->>'deliverySha256' from s13_creator_detail),'1313131313131313131313131313131313131313131313131313131313131313','release detail is bound to the reviewed immutable file hash');
select ok(coalesce((select payload::text from s13_creator_detail),'') !~ '(production-assets/|/private/|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})','release detail exposes no permanent object path or internal UUID');
select is(jsonb_array_length(public.list_public_profile_releases('s13_owner')),1,'creator public profile includes the approved release');
select is(jsonb_array_length(public.list_public_profile_releases('s13_performer')),1,'accepted performer profile includes the same approved release');

select set_config('request.jwt.claims',jsonb_build_object('sub','13000000-0000-0000-0000-0000000000a4','role','authenticated')::text,true);
create temp table s13_outsider_detail(payload jsonb);
insert into s13_outsider_detail select public.get_release_detail((select payload->>'publicId' from s13_release));
select is((select payload->>'entitlementState' from s13_outsider_detail),'none','public release detail truthfully reports no outsider entitlement');
select is((select payload->>'playbackEligible' from s13_outsider_detail),'false','non-entitled viewer is never playback eligible');
select throws_ok(format($q$select public.issue_release_playback(%L,'device-outside-01')$q$,(select payload->>'publicId' from s13_release)),'42501','playback_denied','non-entitled user cannot issue playback');
select throws_ok(format($q$select public.submit_release_review(%L,5,'Outsider review must fail')$q$,(select payload->>'publicId' from s13_release)),'42501','release_review_denied','non-entitled user cannot rate or review a release');

select set_config('request.jwt.claims',jsonb_build_object('sub','13000000-0000-0000-0000-0000000000a3','role','authenticated')::text,true);
create temp table s13_library_active(payload jsonb);
insert into s13_library_active select public.list_fan_library();
select is(jsonb_array_length((select payload from s13_library_active)),1,'captured supporter sees the release in fan library');
select is((select payload#>>'{0,entitlementState}' from s13_library_active),'active','fan library reports active captured entitlement');
select is((select payload#>>'{0,playbackEligible}' from s13_library_active),'true','captured supporter can play release-ready delivery');
select ok(coalesce((select payload::text from s13_library_active),'') !~ '(production-assets/|/private/|txn_sbx_|cus_sbx_|pm_sbx_|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})','fan library leaks no object path, processor reference, or internal UUID');

create temp table s13_playback(payload jsonb);
insert into s13_playback select public.issue_release_playback((select payload->>'publicId' from s13_release),'device-s13-01');
select ok((select payload->>'playbackPath' from s13_playback) ~ '^/playback/[0-9a-f]{64}$','playback issuance returns only a short-lived opaque route');
select is(
  public.resolve_release_playback(regexp_replace((select payload->>'playbackPath' from s13_playback),'^/playback/','')),
  (select payload->>'publicId' from s13_project)||'/private/final-release.mp4',
  'entitled supporter token resolves to the exact approved private final object only at the server RPC boundary');

create temp table s13_poster_access(payload jsonb);
insert into s13_poster_access select public.issue_release_asset_access((select payload->>'publicId' from s13_release),'poster');
select ok((select payload->>'assetPath' from s13_poster_access) ~ '^/release-assets/[0-9a-f]{64}$','poster access returns only a short-lived opaque route');
select is(
  public.resolve_release_asset_access(regexp_replace((select payload->>'assetPath' from s13_poster_access),'^/release-assets/','')),
  (select payload->>'publicId' from s13_project)||'/private/poster.png',
  'entitled supporter poster token resolves only at the server RPC boundary');

select set_config('request.jwt.claims',jsonb_build_object('sub','13000000-0000-0000-0000-0000000000a4','role','authenticated')::text,true);
select is(public.resolve_release_playback(regexp_replace((select payload->>'playbackPath' from s13_playback),'^/playback/','')),null::text,'opaque playback token is bound to the issuing supporter');
select is(public.resolve_release_asset_access(regexp_replace((select payload->>'assetPath' from s13_poster_access),'^/release-assets/','')),null::text,'opaque asset token is bound to the issuing actor');

select set_config('request.jwt.claims',jsonb_build_object('sub','13000000-0000-0000-0000-0000000000a3','role','authenticated')::text,true);
create temp table s13_expired_playback(payload jsonb);
insert into s13_expired_playback select public.issue_release_playback((select payload->>'publicId' from s13_release),'device-s13-expired');
update public.release_playback_sessions
set created_at=now()-interval '20 minutes',expires_at=now()-interval '10 minutes'
where token_hash=encode(extensions.digest(convert_to(regexp_replace((select payload->>'playbackPath' from s13_expired_playback),'^/playback/',''),'UTF8'),'sha256'),'hex');
select is(public.resolve_release_playback(regexp_replace((select payload->>'playbackPath' from s13_expired_playback),'^/playback/','')),null::text,'expired playback token fails closed');

create temp table s13_expired_asset(payload jsonb);
insert into s13_expired_asset select public.issue_release_asset_access((select payload->>'publicId' from s13_release),'preview');
update public.release_asset_access_tokens
set created_at=now()-interval '20 minutes',expires_at=now()-interval '10 minutes'
where token_hash=encode(extensions.digest(convert_to(regexp_replace((select payload->>'assetPath' from s13_expired_asset),'^/release-assets/',''),'UTF8'),'sha256'),'hex');
select is(public.resolve_release_asset_access(regexp_replace((select payload->>'assetPath' from s13_expired_asset),'^/release-assets/','')),null::text,'expired release asset token fails closed');

select public.issue_release_playback((select payload->>'publicId' from s13_release),'device-s13-02');
select public.issue_release_playback((select payload->>'publicId' from s13_release),'device-s13-03');
select throws_ok(format($q$select public.issue_release_playback(%L,'device-s13-04')$q$,(select payload->>'publicId' from s13_release)),'42501','playback_device_limit','fourth concurrent device is denied at the transactional device cap');

select lives_ok(format($q$select public.submit_release_review(%L,5,'Excellent final release')$q$,(select payload->>'publicId' from s13_release)),'active entitled supporter can rate and review');
select is((public.get_release_detail((select payload->>'publicId' from s13_release)))#>>'{myRating}','5','release detail returns the entitled viewer own rating');
select is((public.get_release_detail((select payload->>'publicId' from s13_release)))#>>'{ratingCount}','1','release rating aggregate counts one entitled review');

create temp table s13_report(payload jsonb);
insert into s13_report select public.report_release_stolen_copy((select payload->>'publicId' from s13_release),'https://pirate.example.invalid/copy/13','Observed copied release at this URL');
select ok((select payload->>'publicId' from s13_report) ~ '^lkr[0-9a-f]{24}$','stolen-copy report returns an opaque report id');
create temp table s13_report_retry(payload jsonb);
insert into s13_report_retry select public.report_release_stolen_copy((select payload->>'publicId' from s13_release),'https://pirate.example.invalid/copy/13','A duplicate note does not mutate the original report');
select is((select payload->>'publicId' from s13_report_retry),(select payload->>'publicId' from s13_report),'same reporter and copied URL are idempotent');
select throws_ok(format($q$update public.release_stolen_copy_reports set note='Mutated report' where public_id=%L$q$,(select payload->>'publicId' from s13_report)),'55000','immutable_release_history','stolen-copy report evidence is immutable');
select throws_ok(format($q$update public.releases set title='Mutated release' where public_id=%L$q$,(select payload->>'publicId' from s13_release)),'55000','immutable_release_history','published release metadata is immutable');

select is(jsonb_array_length(public.list_public_profile_releases('s13_owner')),1,'supporter can see creator public release before a profile block exists');
insert into public.profile_blocks(blocker_user_id,blocked_user_id)
values ('13000000-0000-0000-0000-0000000000a3','13000000-0000-0000-0000-0000000000a1');
select is(jsonb_array_length(public.list_public_profile_releases('s13_owner')),0,'bilateral profile block hides creator releases from the blocked relationship');

select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-0000-0000-000000000000','role','service_role')::text,true);
select public.record_payment_transition(
  (select payload->>'publicId' from s13_commitment),'sandbox',
  'cus_sbx_131313131313131313131313','pm_sbx_141414141414141414141414','txn_sbx_151515151515151515151515',
  'partially_refunded',5000,5000,1000,'s13-pay-partial-refund-001');

select set_config('request.jwt.claims',jsonb_build_object('sub','13000000-0000-0000-0000-0000000000a3','role','authenticated')::text,true);
select is((public.get_release_detail((select payload->>'publicId' from s13_release)))#>>'{entitlementState}','active','partial refund with captured value remaining keeps entitlement active');
create temp table s13_refund_playback(payload jsonb);
insert into s13_refund_playback select public.issue_release_playback((select payload->>'publicId' from s13_release),'device-s13-01');
create temp table s13_refund_asset(payload jsonb);
insert into s13_refund_asset select public.issue_release_asset_access((select payload->>'publicId' from s13_release),'poster');

select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-0000-0000-000000000000','role','service_role')::text,true);
select public.record_payment_transition(
  (select payload->>'publicId' from s13_commitment),'sandbox',
  'cus_sbx_131313131313131313131313','pm_sbx_141414141414141414141414','txn_sbx_151515151515151515151515',
  'refunded',5000,5000,5000,'s13-pay-refund-001');

select set_config('request.jwt.claims',jsonb_build_object('sub','13000000-0000-0000-0000-0000000000a3','role','authenticated')::text,true);
select is(public.resolve_release_playback(regexp_replace((select payload->>'playbackPath' from s13_refund_playback),'^/playback/','')),null::text,'full refund immediately revokes an already-issued playback token');
select is(public.resolve_release_asset_access(regexp_replace((select payload->>'assetPath' from s13_refund_asset),'^/release-assets/','')),null::text,'full refund immediately revokes an already-issued supporter asset token');
select throws_ok(format($q$select public.issue_release_playback(%L,'device-s13-after-refund')$q$,(select payload->>'publicId' from s13_release)),'42501','playback_denied','refunded supporter cannot issue new playback');
select throws_ok(format($q$select public.submit_release_review(%L,4,'Refunded review must fail')$q$,(select payload->>'publicId' from s13_release)),'42501','release_review_denied','refunded supporter cannot create or update a review');

create temp table s13_library_revoked(payload jsonb);
insert into s13_library_revoked select public.list_fan_library();
select is((select payload#>>'{0,entitlementState}' from s13_library_revoked),'revoked','fan library preserves historical release while truthfully marking refunded entitlement revoked');
select is((select payload#>>'{0,playbackEligible}' from s13_library_revoked),'false','revoked library item is never playback eligible');
select ok((select revoked_at is not null from public.release_entitlements where release_id=(select id from public.releases where public_id=(select payload->>'publicId' from s13_release)) and supporter_user_id='13000000-0000-0000-0000-0000000000a3'),'entitlement row records revocation after refund');

select ok((select count(*) from public.audit_events where event_type='release_published' and actor_user_id='13000000-0000-0000-0000-0000000000a1')=1,'release publication is audited exactly once across idempotent retries');
select ok((select count(*) from public.audit_events where event_type='release_playback_issued' and actor_user_id='13000000-0000-0000-0000-0000000000a3')>=1,'playback issuance is audited');
select ok((select count(*) from public.audit_events where event_type='release_playback_resolved' and actor_user_id='13000000-0000-0000-0000-0000000000a3')>=1,'successful playback resolution is audited');
select ok((select count(*) from public.audit_events where event_type='release_review_saved' and actor_user_id='13000000-0000-0000-0000-0000000000a3')=1,'entitled release review is audited');
select ok((select count(*) from public.audit_events where event_type='release_stolen_copy_reported' and actor_user_id='13000000-0000-0000-0000-0000000000a3')=1,'stolen-copy report is audited once across duplicate intake');

select * from finish();
rollback;
