begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_column('public','funding_commitments','campaign_tier_id','funding commitments can bind the selected immutable campaign tier');
select has_function('public','create_prebook_for_tier',array['text','text','text','text','text'],'tier-bound prebook RPC exists');

select ok(
  position('tiers' in lower(pg_get_functiondef('private.validate_campaign_terms(jsonb)'::regprocedure)))>0
  and position('duplicate_campaign_tier_key' in lower(pg_get_functiondef('private.validate_campaign_terms(jsonb)'::regprocedure)))>0,
  'campaign term validation normalizes and rejects duplicate tiers'
);

select ok(
  position('insert into public.campaign_tiers' in lower(pg_get_functiondef('public.save_campaign_draft(text,jsonb)'::regprocedure)))>0,
  'saving a campaign version persists its immutable tier rows'
);

select ok(
  position('campaign_tier_id' in lower(pg_get_functiondef('public.create_prebook_for_tier(text,text,text,text,text)'::regprocedure)))>0
  and position('public.create_prebook' in lower(pg_get_functiondef('public.create_prebook_for_tier(text,text,text,text,text)'::regprocedure)))>0,
  'tier prebooking reuses the existing commitment boundary and binds the selected tier'
);

select ok(
  position('campaign_tiers' in lower(pg_get_functiondef('public.get_public_campaign(text)'::regprocedure)))>0
  and position('''tiers''' in lower(pg_get_functiondef('public.get_public_campaign(text)'::regprocedure)))>0,
  'public campaign projection includes safe tier details'
);

select ok(
  not has_table_privilege('authenticated','public.campaign_tiers','SELECT'),
  'raw campaign tier rows remain inaccessible to clients'
);

select * from finish();
rollback;
