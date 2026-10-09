-- Crowd Demand discussion: immutable public comments and structured suggestions.
-- Demand author can hide discussion entries without deleting history.

create table public.demand_discussion_entries (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^dsc[0-9a-f]{24}$'),
  demand_id uuid not null references public.demands(id) on delete restrict,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  kind text not null check (kind in ('comment','suggestion')),
  body text not null check (char_length(trim(body)) between 3 and 2000 and body !~ '[[:cntrl:]]'),
  hidden_by_author boolean not null default false,
  created_at timestamptz not null default now()
);

create index demand_discussion_demand_created_idx
on public.demand_discussion_entries(demand_id,created_at asc);

alter table public.demand_discussion_entries enable row level security;
revoke all on public.demand_discussion_entries from public,anon,authenticated;

create or replace function public.add_demand_discussion_entry(
  requested_demand_public_id text,
  requested_kind text,
  requested_body text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare demand_row public.demands%rowtype;
declare kind_value text:=lower(trim(coalesce(requested_kind,'')));
declare body_value text:=trim(coalesce(requested_body,''));
declare candidate text;
declare entry_row public.demand_discussion_entries%rowtype;
begin
  perform private.assert_adult_profile_action();
  perform private.consume_operational_rate_limit('demand_discussion_create',auth.uid());

  if kind_value not in ('comment','suggestion')
     or char_length(body_value) not between 3 and 2000
     or body_value ~ '[[:cntrl:]]' then
    raise exception 'invalid_demand_discussion_entry' using errcode='22023';
  end if;

  select * into demand_row
  from public.demands demand
  where demand.public_id=trim(coalesce(requested_demand_public_id,''))
    and demand.visibility='public';

  if demand_row.id is null
     or private.demand_effective_state(demand_row.state,demand_row.expires_at) not in ('open','creator_interested')
     or private.users_blocked(auth.uid(),demand_row.author_user_id) then
    raise exception 'demand_discussion_not_available' using errcode='42501';
  end if;

  loop
    candidate:='dsc'||encode(extensions.gen_random_bytes(12),'hex');
    exit when not exists(select 1 from public.demand_discussion_entries where public_id=candidate);
  end loop;

  insert into public.demand_discussion_entries(public_id,demand_id,author_user_id,kind,body)
  values(candidate,demand_row.id,auth.uid(),kind_value,body_value)
  returning * into entry_row;

  if demand_row.author_user_id<>auth.uid() then
    perform private.emit_notification(
      demand_row.author_user_id,auth.uid(),'funding_updated'::public.notification_type,
      '/demand/'||demand_row.public_id
    );
  end if;

  perform private.write_audit(
    auth.uid(),'demand_discussion_entry_created','success','demand-discussion',
    private.current_active_role(auth.uid()),
    jsonb_build_object('demandPublicId',demand_row.public_id,'entryPublicId',entry_row.public_id,'kind',kind_value)
  );

  return jsonb_build_object('publicId',entry_row.public_id,'kind',entry_row.kind,'createdAt',entry_row.created_at);
end;
$$;

create or replace function public.set_demand_discussion_entry_hidden(
  requested_demand_public_id text,
  requested_entry_public_id text,
  requested_hidden boolean
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare demand_row public.demands%rowtype;
declare entry_row public.demand_discussion_entries%rowtype;
begin
  perform private.assert_adult_profile_action();

  select * into demand_row from public.demands
  where public_id=trim(coalesce(requested_demand_public_id,''));
  if demand_row.id is null or demand_row.author_user_id<>auth.uid() then
    raise exception 'demand_discussion_moderation_not_allowed' using errcode='42501';
  end if;

  select * into entry_row from public.demand_discussion_entries
  where public_id=trim(coalesce(requested_entry_public_id,''))
    and demand_id=demand_row.id
  for update;
  if entry_row.id is null then raise exception 'demand_discussion_entry_not_found' using errcode='22023'; end if;

  update public.demand_discussion_entries
  set hidden_by_author=coalesce(requested_hidden,false)
  where id=entry_row.id;

  perform private.write_audit(
    auth.uid(),'demand_discussion_entry_visibility_changed','success','demand-discussion',
    private.current_active_role(auth.uid()),
    jsonb_build_object('demandPublicId',demand_row.public_id,'entryPublicId',entry_row.public_id,'hidden',coalesce(requested_hidden,false))
  );
  return coalesce(requested_hidden,false);
end;
$$;

create or replace function public.list_demand_discussion(requested_demand_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare demand_row public.demands%rowtype;
begin
  perform private.assert_adult_profile_action();

  select * into demand_row
  from public.demands demand
  where demand.public_id=trim(coalesce(requested_demand_public_id,''))
    and demand.visibility='public';

  if demand_row.id is null or private.users_blocked(auth.uid(),demand_row.author_user_id) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'publicId',entry.public_id,
      'kind',entry.kind,
      'body',entry.body,
      'authorHandle',profile.handle,
      'authorDisplayName',profile.display_name,
      'createdAt',entry.created_at,
      'canHide',demand_row.author_user_id=auth.uid()
    ) order by entry.created_at asc)
    from public.demand_discussion_entries entry
    join public.profiles profile on profile.user_id=entry.author_user_id
    where entry.demand_id=demand_row.id
      and not entry.hidden_by_author
      and not private.users_blocked(auth.uid(),entry.author_user_id)
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.add_demand_discussion_entry(text,text,text) from public,anon,authenticated;
revoke all on function public.set_demand_discussion_entry_hidden(text,text,boolean) from public,anon,authenticated;
revoke all on function public.list_demand_discussion(text) from public,anon,authenticated;
grant execute on function public.add_demand_discussion_entry(text,text,text) to authenticated;
grant execute on function public.set_demand_discussion_entry_hidden(text,text,boolean) to authenticated;
grant execute on function public.list_demand_discussion(text) to authenticated;

notify pgrst,'reload schema';
