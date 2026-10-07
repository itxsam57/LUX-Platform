-- Expand durable event notifications and close the platform-review safety checklist gap.

alter type public.notification_type add value if not exists 'message_received';
alter type public.notification_type add value if not exists 'funding_updated';
alter type public.notification_type add value if not exists 'campaign_updated';
alter type public.notification_type add value if not exists 'contract_action';
alter type public.notification_type add value if not exists 'review_update';
alter type public.notification_type add value if not exists 'release_available';
alter type public.notification_type add value if not exists 'agency_update';
alter type public.notification_type add value if not exists 'dispute_update';
alter type public.notification_type add value if not exists 'payout_update';

alter table public.delivery_review_checklist_items
  drop constraint if exists delivery_review_checklist_items_item_key_check;

alter table public.delivery_review_checklist_items
  add constraint delivery_review_checklist_items_item_key_check
  check (item_key in ('legality','consent','copyright','safety','quality'));

insert into public.delivery_review_checklist_items(
  review_case_id,item_key,label,required,state,note,checked_by_user_id,checked_at,updated_at
)
select
  review_case.id,'safety','Safety and platform policy',true,'pending',null,null,null,now()
from public.delivery_review_cases review_case
where not exists (
  select 1
  from public.delivery_review_checklist_items item
  where item.review_case_id=review_case.id and item.item_key='safety'
);

create or replace function private.ensure_delivery_review_safety_check()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  insert into public.delivery_review_checklist_items(review_case_id,item_key,label,required)
  values(new.id,'safety','Safety and platform policy',true)
  on conflict(review_case_id,item_key) do nothing;
  return new;
end;
$$;

drop trigger if exists delivery_review_safety_check_on_case on public.delivery_review_cases;
create trigger delivery_review_safety_check_on_case
after insert on public.delivery_review_cases
for each row execute function private.ensure_delivery_review_safety_check();

revoke all on function private.ensure_delivery_review_safety_check() from public,anon,authenticated;

notify pgrst,'reload schema';
