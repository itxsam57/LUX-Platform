begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select has_table('public', 'discovery_interests', 'discovery interests table exists');
select has_table('public', 'account_interests', 'account interests table exists');
select has_table('public', 'hidden_topics', 'hidden topics table exists');

select has_function('public', 'get_discovery_feed', array['text', 'integer', 'timestamp with time zone'], 'feed read RPC exists');
select has_function('public', 'search_discovery', array['text', 'integer'], 'search read RPC exists');

select has_column('public', 'discovery_interests', 'slug', 'interest taxonomy uses a public slug');
select has_column('public', 'account_interests', 'user_id', 'account interest ownership is internal');
select has_column('public', 'hidden_topics', 'user_id', 'hidden-topic ownership is internal');

select is(
  (select relrowsecurity from pg_class where oid = 'public.discovery_interests'::regclass),
  true,
  'discovery interests have RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.account_interests'::regclass),
  true,
  'account interests have RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.hidden_topics'::regclass),
  true,
  'hidden topics have RLS enabled'
);

select is(
  has_table_privilege('anon', 'public.account_interests', 'SELECT'),
  false,
  'anonymous callers cannot read private account-interest rows directly'
);

select * from finish();
rollback;
