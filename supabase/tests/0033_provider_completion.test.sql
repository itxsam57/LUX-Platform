begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function('public','authorize_production_asset_upload',array['text'],'provider-independent upload authorization exists');
select ok(
  position('private.require_production_owner' in lower(pg_get_functiondef('public.authorize_production_asset_upload(text)'::regprocedure)))>0,
  'production upload authorization preserves project ownership gate'
);

select has_table('public','content_screening_receipts','normalized moderation receipts exist');
select has_function('public','record_content_screening_receipt',array['text','text','text','text','text','text[]'],'normalized moderation result persistence exists');
select has_trigger('public','content_screening_receipts','content_screening_receipts_immutable','moderation receipts are immutable');
select ok(not has_table_privilege('authenticated','public.content_screening_receipts','SELECT'),'raw moderation provider references are not client-readable');

select has_function('public','get_creator_media_protection_context',array['text'],'media protection context is bound to creator release');
select has_function('public','apply_media_protection_watermark_result',array['text','text','text','text','boolean'],'media protection provider result application exists');
select ok(
  position('service_role' in lower(pg_get_functiondef('public.apply_media_protection_watermark_result(text,text,text,text,boolean)'::regprocedure)))>0,
  'media protection provider results are service-only'
);

select has_trigger('public','campaigns','campaign_state_notification','campaign state changes notify supporters');
select has_trigger('public','funding_change_requests','funding_change_request_notification','funding changes notify supporters');
select has_trigger('public','agency_representation_agreements','agency_representation_notification','agency representation changes notify performers');
select has_trigger('public','agency_opportunities','agency_opportunity_notification','agency opportunities notify performers');

select * from finish();
rollback;
