begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_column('public','delivery_review_checklist_items','item_key','delivery review checklist remains present');
select ok(
  position('safety' in lower(pg_get_constraintdef((
    select oid from pg_constraint
    where conrelid='public.delivery_review_checklist_items'::regclass
      and conname='delivery_review_checklist_items_item_key_check'
  ))))>0,
  'delivery review checklist permanently includes safety'
);
select has_trigger('public','delivery_review_cases','delivery_review_safety_check_on_case','new review cases automatically receive safety review');

select has_table('public','saved_items','saved items exist');
select has_table('public','message_threads','private message threads exist');
select has_table('public','messages','private messages exist');
select has_table('public','consumer_orders','consumer orders exist');
select has_table('public','wallet_entries','consumer wallet history exists');
select has_function('public','set_saved_item',array['text','text','boolean'],'saved item mutation exists');
select has_function('public','send_message',array['text','text','text'],'message send mutation exists');
select has_function('public','list_my_orders',array[]::text[],'orders projection exists');
select has_function('public','list_my_wallet_entries',array[]::text[],'wallet projection exists');
select has_trigger('public','messages','messages_immutable','messages are immutable');
select has_trigger('public','wallet_entries','wallet_entries_immutable','wallet history is immutable');
select ok(not has_table_privilege('authenticated','public.messages','SELECT'),'raw messages are not directly client-readable');
select ok(not has_table_privilege('authenticated','public.wallet_entries','SELECT'),'raw wallet history is not directly client-readable');
select ok(
  position('private.users_blocked' in lower(pg_get_functiondef('public.send_message(text,text,text)'::regprocedure)))>0,
  'messaging rechecks blocking before every send'
);
select ok(
  position('payment_transactions' in lower(pg_get_functiondef('private.sync_consumer_order_wallet()'::regprocedure)))>0,
  'orders and wallet are derived from payment transaction state'
);

select * from finish();
rollback;
