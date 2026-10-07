begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','demand_discussion_entries','Crowd Demand discussion entries exist');
select has_function('public','add_demand_discussion_entry',array['text','text','text'],'demand discussion creation exists');
select has_function('public','set_demand_discussion_entry_hidden',array['text','text','boolean'],'demand author discussion moderation exists');
select has_function('public','list_demand_discussion',array['text'],'privacy-safe demand discussion projection exists');
select ok(not has_table_privilege('authenticated','public.demand_discussion_entries','SELECT'),'raw demand discussion is not directly client-readable');
select ok(
  position('private.users_blocked' in lower(pg_get_functiondef('public.add_demand_discussion_entry(text,text,text)'::regprocedure)))>0
  and position('private.users_blocked' in lower(pg_get_functiondef('public.list_demand_discussion(text)'::regprocedure)))>0,
  'demand discussion enforces block boundaries on write and read'
);
select ok(
  position('demand_row.author_user_id<>auth.uid()' in replace(lower(pg_get_functiondef('public.add_demand_discussion_entry(text,text,text)'::regprocedure)),' ',''))>0,
  'demand author is not notified about their own discussion entry'
);
select ok(
  position('demand_row.author_user_id<>auth.uid()' in replace(lower(pg_get_functiondef('public.set_demand_discussion_entry_hidden(text,text,boolean)'::regprocedure)),' ',''))>0,
  'only the demand author can moderate the public discussion'
);

select * from finish();
rollback;
