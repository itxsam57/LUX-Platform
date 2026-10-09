begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','creator_availability','creator and performer availability exists');
select has_table('public','creator_offers','creator and performer offers exist');
select has_function('public','set_creator_availability',array['text','timestamp with time zone','text'],'availability mutation exists');
select has_function('public','create_creator_offer',array['jsonb'],'offer creation exists');
select has_function('public','get_public_creator_commerce',array['text'],'public creator commerce projection exists');

select has_table('public','hidden_marketplace_items','per-user discovery hiding exists');
select has_function('public','set_hidden_marketplace_item',array['text','text','boolean'],'marketplace hide mutation exists');
select has_function('public','report_content',array['text','text','text','text'],'generic content report intake exists');
select has_function('public','get_discovery_preferences',array[]::text[],'discovery preference projection exists');
select has_function('public','search_marketplace',array['text','text','integer','timestamp with time zone'],'cross-object marketplace search exists');
select has_function('public','explore_marketplace',array['text','integer','timestamp with time zone'],'cross-object marketplace explore exists');
select ok(
  position('private.marketplace_item_hidden' in lower(pg_get_functiondef('public.explore_marketplace(text,integer,timestamp with time zone)'::regprocedure)))>0
  and position('private.users_blocked' in lower(pg_get_functiondef('public.explore_marketplace(text,integer,timestamp with time zone)'::regprocedure)))>0,
  'marketplace discovery enforces hides and blocks before returning results'
);

select ok(
  position('interestmatch' in lower(pg_get_functiondef('public.get_discovery_feed(text,integer,timestamp with time zone)'::regprocedure)))>0
  and position('account_interests' in lower(pg_get_functiondef('public.get_discovery_feed(text,integer,timestamp with time zone)'::regprocedure)))>0,
  'For You feed computes real interest matching'
);

select * from finish();
rollback;
