-- Exact discovery hiding and Crowd Demand reporting through the existing moderation queue.

create table public.hidden_marketplace_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('profile','demand','campaign','release')),
  item_public_id text not null check (
    char_length(item_public_id) between 3 and 120
    and item_public_id !~ '[[:cntrl:]]'
  ),
  created_at timestamptz not null default now(),
  primary key(user_id,item_type,item_public_id)
);

create index hidden_marketplace_user_created_idx on public.hidden_marketplace_items(user_id,created_at desc);

alter table public.hidden_marketplace_items enable row level security;
revoke all on public.hidden_marketplace_items from public,anon,authenticated;

create or replace function private.marketplace_item_hidden(
  subject_user_id uuid,
  requested_item_type text,
  requested_item_public_id text
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select exists(
    select 1 from public.hidden_marketplace_items hidden
    where hidden.user_id=subject_user_id
      and hidden.item_type=requested_item_type
      and hidden.item_public_id=requested_item_public_id
  );
$$;

create or replace function public.set_hidden_marketplace_item(
  requested_item_type text,
  requested_item_public_id text,
  requested_hidden boolean
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare
  type_value text:=lower(trim(coalesce(requested_item_type,'')));
  id_value text:=trim(coalesce(requested_item_public_id,''));
begin
  perform private.assert_adult_profile_action();

  if type_value not in ('profile','demand','campaign','release')
     or char_length(id_value) not between 3 and 120
     or id_value ~ '[[:cntrl:]]' then
    raise exception 'invalid_hidden_marketplace_item' using errcode='22023';
  end if;

  if type_value='profile' then id_value:=lower(id_value); end if;

  if coalesce(requested_hidden,false) then
    insert into public.hidden_marketplace_items(user_id,item_type,item_public_id)
    values(auth.uid(),type_value,id_value)
    on conflict do nothing;
  else
    delete from public.hidden_marketplace_items
    where user_id=auth.uid() and item_type=type_value and item_public_id=id_value;
  end if;

  perform private.write_audit(
    auth.uid(),
    case when coalesce(requested_hidden,false) then 'marketplace_item_hidden' else 'marketplace_item_unhidden' end,
    'success','discovery-preferences',private.current_active_role(auth.uid()),
    jsonb_build_object('itemType',type_value,'itemPublicId',id_value)
  );
  return coalesce(requested_hidden,false);
end;
$$;

alter table public.moderation_cases
  drop constraint if exists moderation_cases_subject_type_check;

alter table public.moderation_cases
  add constraint moderation_cases_subject_type_check
  check (subject_type in ('profile','project','demand','campaign','release','support_case'));

create or replace function public.report_content(
  subject_type_value text,
  subject_public_id_value text,
  summary_value text,
  reason_value text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare
  normalized_type text:=lower(trim(coalesce(subject_type_value,'')));
  normalized_target text:=trim(coalesce(subject_public_id_value,''));
  normalized_summary text:=trim(coalesce(summary_value,''));
  normalized_reason text:=trim(coalesce(reason_value,''));
  created_case public.moderation_cases%rowtype;
  target_exists boolean:=false;
begin
  perform private.assert_current_session();
  perform private.consume_operational_rate_limit('consumer_report_create',auth.uid());

  if normalized_type not in ('profile','project','demand','campaign','release')
     or char_length(normalized_target) not between 3 and 120
     or normalized_target ~ '[[:cntrl:]]'
     or char_length(normalized_summary) not between 8 and 500
     or normalized_summary ~ '[[:cntrl:]]'
     or char_length(normalized_reason) not between 8 and 1000
     or normalized_reason ~ '[[:cntrl:]]' then
    raise exception 'invalid_content_report' using errcode='22023';
  end if;

  if normalized_type='profile' then
    select exists(select 1 from public.profiles where handle=lower(normalized_target)) into target_exists;
    normalized_target:=lower(normalized_target);
  elsif normalized_type='project' then
    select exists(select 1 from public.projects where public_id=normalized_target) into target_exists;
  elsif normalized_type='demand' then
    select exists(select 1 from public.demands where public_id=normalized_target) into target_exists;
  elsif normalized_type='campaign' then
    select exists(select 1 from public.campaigns where public_id=normalized_target) into target_exists;
  else
    select exists(select 1 from public.releases where public_id=normalized_target) into target_exists;
  end if;

  if not target_exists then raise exception 'report_target_not_found' using errcode='22023'; end if;

  insert into public.moderation_cases(public_id,subject_type,subject_public_id,summary,opened_by_user_id)
  values(private.new_admin_public_id('mod'),normalized_type,normalized_target,normalized_summary,auth.uid())
  returning * into created_case;

  insert into public.moderation_case_events(case_id,actor_user_id,event_type,reason)
  values(created_case.id,auth.uid(),'opened',normalized_reason);

  perform private.write_audit(
    auth.uid(),'content_report_created','success'::public.audit_outcome,'/app/support',
    private.current_active_role(auth.uid()),
    jsonb_build_object('casePublicId',created_case.public_id,'subjectType',normalized_type,'subjectPublicId',normalized_target)
  );

  return jsonb_build_object('publicId',created_case.public_id,'state',created_case.state,'createdAt',created_case.opened_at);
end;
$$;

revoke all on function private.marketplace_item_hidden(uuid,text,text) from public,anon,authenticated;
revoke all on function public.set_hidden_marketplace_item(text,text,boolean) from public,anon,authenticated;
grant execute on function public.set_hidden_marketplace_item(text,text,boolean) to authenticated;


create or replace function private.register_discovery_interest_from_slug()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare slug_value text;
begin
  slug_value:=lower(trim(new.category));
  if slug_value ~ '^[a-z0-9][a-z0-9_-]{1,47}$' then
    insert into public.discovery_interests(slug,label)
    values(slug_value,initcap(replace(slug_value,'_',' ')))
    on conflict(slug) do nothing;
  end if;
  return new;
end;
$$;

insert into public.discovery_interests(slug,label)
select category_slug,initcap(replace(category_slug,'_',' '))
from (
  select distinct lower(trim(category)) category_slug from public.demands
  union
  select distinct lower(trim(category)) from public.project_versions
  union
  select distinct lower(trim(category)) from public.creator_offers
) categories
where category_slug ~ '^[a-z0-9][a-z0-9_-]{1,47}$'
on conflict(slug) do nothing;

drop trigger if exists demand_discovery_interest_taxonomy on public.demands;
create trigger demand_discovery_interest_taxonomy
after insert on public.demands
for each row execute function private.register_discovery_interest_from_slug();

drop trigger if exists project_discovery_interest_taxonomy on public.project_versions;
create trigger project_discovery_interest_taxonomy
after insert on public.project_versions
for each row execute function private.register_discovery_interest_from_slug();

drop trigger if exists offer_discovery_interest_taxonomy on public.creator_offers;
create trigger offer_discovery_interest_taxonomy
after insert on public.creator_offers
for each row execute function private.register_discovery_interest_from_slug();

create or replace function public.get_discovery_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
begin
  perform private.assert_current_session();

  return jsonb_build_object(
    'interests',coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug',interest.slug,
        'label',interest.label,
        'enabled',exists(
          select 1 from public.account_interests selected
          where selected.user_id=auth.uid() and selected.interest_slug=interest.slug
        )
      ) order by interest.label asc)
      from public.discovery_interests interest
    ),'[]'::jsonb),
    'hiddenTopics',coalesce((
      select jsonb_agg(hidden.topic_slug order by hidden.topic_slug)
      from public.hidden_topics hidden
      where hidden.user_id=auth.uid()
    ),'[]'::jsonb),
    'hiddenItems',coalesce((
      select jsonb_agg(jsonb_build_object(
        'type',hidden.item_type,
        'publicId',hidden.item_public_id,
        'createdAt',hidden.created_at
      ) order by hidden.created_at desc)
      from public.hidden_marketplace_items hidden
      where hidden.user_id=auth.uid()
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function private.register_discovery_interest_from_slug() from public,anon,authenticated;
revoke all on function public.get_discovery_preferences() from public,anon,authenticated;
grant execute on function public.get_discovery_preferences() to authenticated;

notify pgrst,'reload schema';
