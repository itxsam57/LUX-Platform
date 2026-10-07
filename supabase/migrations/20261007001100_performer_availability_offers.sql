-- Performer workspace plus availability and creator/performer offers.
-- This migration intentionally follows the enum-only migration so the new enum value
-- is committed before it is referenced.

create table public.creator_availability (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'unavailable' check (status in ('available','limited','unavailable')),
  next_available_at timestamptz,
  note text,
  updated_at timestamptz not null default now(),
  constraint creator_availability_note_check check (
    note is null or (char_length(trim(note)) between 3 and 500 and note !~ '[[:cntrl:]]')
  )
);

create table public.creator_offers (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^off[0-9a-f]{24}$'),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 120 and title !~ '[[:cntrl:]]'),
  description text not null check (char_length(trim(description)) between 20 and 2000 and description !~ '[[:cntrl:]]'),
  category text not null check (category ~ '^[a-z0-9][a-z0-9_-]{1,47}$'),
  role_name text not null check (role_name ~ '^[a-z0-9][a-z0-9 _-]{1,63}$'),
  starting_minor bigint,
  currency text,
  state text not null default 'active' check (state in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_offer_price_complete check (
    (starting_minor is null and currency is null)
    or (starting_minor is not null and currency is not null)
  ),
  constraint creator_offer_price_check check (starting_minor is null or starting_minor between 0 and 9007199254740991),
  constraint creator_offer_currency_check check (currency is null or currency ~ '^[A-Z]{3}$')
);

create index creator_offers_owner_updated_idx on public.creator_offers(owner_user_id,updated_at desc);
create index creator_offers_public_state_idx on public.creator_offers(state,updated_at desc) where state='active';

alter table public.creator_availability enable row level security;
alter table public.creator_offers enable row level security;
revoke all on public.creator_availability from public,anon,authenticated;
revoke all on public.creator_offers from public,anon,authenticated;

create or replace function public.request_workspace_role(requested_role public.app_role)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare membership_id uuid;
begin
  perform private.assert_current_session();

  if requested_role not in ('creator','performer','agency') then
    raise exception 'role_not_requestable' using errcode='42501';
  end if;
  if not private.has_accepted_age_record(auth.uid()) then
    raise exception 'adult_access_required' using errcode='42501';
  end if;

  insert into public.workspace_memberships(user_id,role,status)
  values(auth.uid(),requested_role,'requested')
  on conflict(user_id,role) do update
  set status=case when public.workspace_memberships.status in ('rejected','revoked') then 'requested' else public.workspace_memberships.status end,
      requested_at=case when public.workspace_memberships.status in ('rejected','revoked') then now() else public.workspace_memberships.requested_at end,
      reviewed_at=case when public.workspace_memberships.status in ('rejected','revoked') then null else public.workspace_memberships.reviewed_at end,
      reviewed_by=case when public.workspace_memberships.status in ('rejected','revoked') then null else public.workspace_memberships.reviewed_by end,
      updated_at=now()
  returning id into membership_id;

  perform private.write_audit(auth.uid(),'workspace_role_requested','success','workspace-role-request',requested_role,jsonb_build_object('membership_id',membership_id));
  return membership_id;
end;
$$;

create or replace function public.review_workspace_request(
  target_membership_id uuid,
  decision public.membership_status
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare target_role public.app_role;
begin
  perform private.assert_current_session();
  if private.current_active_role(auth.uid())<>'super_admin' then
    perform private.write_audit(auth.uid(),'workspace_review_denied','denied','staff-role-requests');
    raise exception 'super_admin_required' using errcode='42501';
  end if;
  if decision not in ('approved','rejected') then raise exception 'invalid_review_decision' using errcode='22023'; end if;

  select membership.role into target_role
  from public.workspace_memberships membership
  where membership.id=target_membership_id
    and membership.status='requested'
    and membership.role in ('creator','performer','agency')
  for update;

  if target_role is null then raise exception 'request_not_reviewable' using errcode='22023'; end if;

  update public.workspace_memberships
  set status=decision,reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now()
  where id=target_membership_id;

  perform private.write_audit(auth.uid(),'workspace_role_reviewed','success','staff-role-requests',target_role,jsonb_build_object('membership_id',target_membership_id,'decision',decision));
end;
$$;

create or replace function private.assert_creator_or_performer_action()
returns public.app_role
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare active_role public.app_role;
begin
  perform private.assert_adult_profile_action();
  active_role:=private.current_active_role(auth.uid());

  if active_role not in ('creator','performer') then
    raise exception 'creator_or_performer_workspace_required' using errcode='42501';
  end if;

  if not private.verification_is_current(auth.uid(),'v2') then
    raise exception 'v2_verification_required' using errcode='42501';
  end if;

  if active_role='performer' and not private.verification_is_current(auth.uid(),'v3') then
    raise exception 'v3_verification_required' using errcode='42501';
  end if;

  return active_role;
end;
$$;

create or replace function public.set_creator_availability(
  requested_status text,
  requested_next_available_at timestamptz,
  requested_note text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare active_role public.app_role;
declare normalized_status text:=lower(trim(coalesce(requested_status,'')));
declare normalized_note text:=nullif(trim(coalesce(requested_note,'')),'');
declare row_value public.creator_availability%rowtype;
begin
  active_role:=private.assert_creator_or_performer_action();

  if normalized_status not in ('available','limited','unavailable')
     or (normalized_note is not null and (char_length(normalized_note) not between 3 and 500 or normalized_note ~ '[[:cntrl:]]'))
     or (requested_next_available_at is not null and requested_next_available_at<now()-interval '1 day') then
    raise exception 'invalid_creator_availability' using errcode='22023';
  end if;

  insert into public.creator_availability(user_id,status,next_available_at,note)
  values(auth.uid(),normalized_status,requested_next_available_at,normalized_note)
  on conflict(user_id) do update
  set status=excluded.status,next_available_at=excluded.next_available_at,note=excluded.note,updated_at=now()
  returning * into row_value;

  perform private.write_audit(auth.uid(),'creator_availability_updated','success','creator-availability',active_role,
    jsonb_build_object('status',row_value.status,'nextAvailableAt',row_value.next_available_at));

  return jsonb_build_object('status',row_value.status,'nextAvailableAt',row_value.next_available_at,'note',row_value.note,'updatedAt',row_value.updated_at);
end;
$$;

create or replace function public.create_creator_offer(offer_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare active_role public.app_role;
declare candidate text;
declare title_value text:=trim(coalesce(offer_input->>'title',''));
declare description_value text:=trim(coalesce(offer_input->>'description',''));
declare category_value text:=lower(trim(coalesce(offer_input->>'category','')));
declare role_value text:=lower(trim(coalesce(offer_input->>'roleName','')));
declare starting_value bigint;
declare currency_value text;
declare created_row public.creator_offers%rowtype;
begin
  active_role:=private.assert_creator_or_performer_action();

  if offer_input is null or jsonb_typeof(offer_input)<>'object'
     or char_length(title_value) not between 3 and 120 or title_value ~ '[[:cntrl:]]'
     or char_length(description_value) not between 20 and 2000 or description_value ~ '[[:cntrl:]]'
     or category_value !~ '^[a-z0-9][a-z0-9_-]{1,47}$'
     or role_value !~ '^[a-z0-9][a-z0-9 _-]{1,63}$' then
    raise exception 'invalid_creator_offer' using errcode='22023';
  end if;

  if offer_input ? 'startingMinor' and offer_input->'startingMinor'<>'null'::jsonb then
    if jsonb_typeof(offer_input->'startingMinor')<>'number'
       or (offer_input->>'startingMinor') !~ '^[0-9]+$'
       or jsonb_typeof(offer_input->'currency')<>'string' then
      raise exception 'invalid_creator_offer_price' using errcode='22023';
    end if;
    starting_value:=(offer_input->>'startingMinor')::bigint;
    currency_value:=upper(trim(offer_input->>'currency'));
    if starting_value<0 or starting_value>9007199254740991 or currency_value !~ '^[A-Z]{3}$' then
      raise exception 'invalid_creator_offer_price' using errcode='22023';
    end if;
  end if;

  loop
    candidate:='off'||encode(extensions.gen_random_bytes(12),'hex');
    exit when not exists(select 1 from public.creator_offers where public_id=candidate);
  end loop;

  insert into public.creator_offers(public_id,owner_user_id,title,description,category,role_name,starting_minor,currency)
  values(candidate,auth.uid(),title_value,description_value,category_value,role_value,starting_value,currency_value)
  returning * into created_row;

  perform private.write_audit(auth.uid(),'creator_offer_created','success','creator-offers',active_role,jsonb_build_object('offerPublicId',created_row.public_id));

  return jsonb_build_object('publicId',created_row.public_id,'state',created_row.state);
end;
$$;

create or replace function public.set_creator_offer_state(
  requested_offer_public_id text,
  requested_state text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare active_role public.app_role;
declare row_value public.creator_offers%rowtype;
declare state_value text:=lower(trim(coalesce(requested_state,'')));
begin
  active_role:=private.assert_creator_or_performer_action();
  if state_value not in ('active','paused','archived') then raise exception 'invalid_creator_offer_state' using errcode='22023'; end if;

  update public.creator_offers
  set state=state_value,updated_at=now()
  where public_id=trim(coalesce(requested_offer_public_id,'')) and owner_user_id=auth.uid()
  returning * into row_value;

  if row_value.id is null then raise exception 'creator_offer_not_found' using errcode='22023'; end if;
  perform private.write_audit(auth.uid(),'creator_offer_state_changed','success','creator-offers',active_role,jsonb_build_object('offerPublicId',row_value.public_id,'state',row_value.state));
  return jsonb_build_object('publicId',row_value.public_id,'state',row_value.state);
end;
$$;

create or replace function public.get_my_creator_commerce()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare active_role public.app_role;
begin
  active_role:=private.assert_creator_or_performer_action();
  return jsonb_build_object(
    'role',active_role,
    'availability',(
      select jsonb_build_object('status',availability.status,'nextAvailableAt',availability.next_available_at,'note',availability.note,'updatedAt',availability.updated_at)
      from public.creator_availability availability where availability.user_id=auth.uid()
    ),
    'offers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'publicId',offer.public_id,'title',offer.title,'description',offer.description,'category',offer.category,
        'roleName',offer.role_name,'startingMinor',offer.starting_minor,'currency',offer.currency,
        'state',offer.state,'createdAt',offer.created_at,'updatedAt',offer.updated_at
      ) order by offer.updated_at desc)
      from public.creator_offers offer where offer.owner_user_id=auth.uid()
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.get_public_creator_commerce(profile_handle text)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private
as $$
declare profile_row public.profiles%rowtype;
begin
  select * into profile_row from public.profiles
  where handle=lower(trim(coalesce(profile_handle,'')))
    and visibility in ('public','unlisted')
  limit 1;
  if profile_row.user_id is null then return null; end if;

  return jsonb_build_object(
    'availability',(
      select jsonb_build_object('status',availability.status,'nextAvailableAt',availability.next_available_at,'note',availability.note)
      from public.creator_availability availability where availability.user_id=profile_row.user_id
    ),
    'offers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'publicId',offer.public_id,'title',offer.title,'description',offer.description,'category',offer.category,
        'roleName',offer.role_name,'startingMinor',offer.starting_minor,'currency',offer.currency
      ) order by offer.updated_at desc)
      from public.creator_offers offer
      where offer.owner_user_id=profile_row.user_id and offer.state='active'
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function private.assert_creator_or_performer_action() from public,anon,authenticated;
revoke all on function public.set_creator_availability(text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.create_creator_offer(jsonb) from public,anon,authenticated;
revoke all on function public.set_creator_offer_state(text,text) from public,anon,authenticated;
revoke all on function public.get_my_creator_commerce() from public,anon,authenticated;
revoke all on function public.get_public_creator_commerce(text) from public,anon,authenticated;

grant execute on function public.set_creator_availability(text,timestamptz,text) to authenticated;
grant execute on function public.create_creator_offer(jsonb) to authenticated;
grant execute on function public.set_creator_offer_state(text,text) to authenticated;
grant execute on function public.get_my_creator_commerce() to authenticated;
grant execute on function public.get_public_creator_commerce(text) to public,anon,authenticated;

notify pgrst,'reload schema';
