-- Consumer completion core: private messaging, saved items, orders, wallet records,
-- and broad event notifications. Raw tables stay server-owned; user access is through
-- security-definer projections with current-session and block/privacy checks.

create table public.saved_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('profile','demand','campaign','release')),
  item_public_id text not null check (
    char_length(item_public_id) between 3 and 120
    and item_public_id !~ '[[:cntrl:]]'
  ),
  created_at timestamptz not null default now(),
  primary key(user_id,item_type,item_public_id)
);

create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^mth[0-9a-f]{24}$'),
  direct_pair_hash text not null unique check (direct_pair_hash ~ '^[0-9a-f]{64}$'),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.message_thread_members (
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key(thread_id,user_id)
);

create table public.messages (
  id bigint generated always as identity primary key,
  public_id text not null unique check (public_id ~ '^msg[0-9a-f]{24}$'),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null check (
    char_length(idempotency_key) between 8 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  body text not null check (
    char_length(trim(body)) between 1 and 4000
    and body !~ '[[:cntrl:]]'
  ),
  created_at timestamptz not null default now(),
  unique(thread_id,sender_user_id,idempotency_key)
);

create table public.consumer_orders (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^ord[0-9a-f]{24}$'),
  supporter_user_id uuid not null references auth.users(id) on delete restrict,
  funding_commitment_id uuid not null unique references public.funding_commitments(id) on delete restrict,
  payment_transaction_id uuid not null unique references public.payment_transactions(id) on delete restrict,
  state text not null check (state in ('authorized','captured','partially_refunded','refunded','failed')),
  requested_minor bigint not null check (requested_minor between 1 and 9007199254740991),
  authorized_minor bigint not null check (authorized_minor between 0 and 9007199254740991),
  captured_minor bigint not null check (captured_minor between 0 and 9007199254740991),
  refunded_minor bigint not null check (refunded_minor between 0 and 9007199254740991),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wallet_entries (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^wlt[0-9a-f]{24}$'),
  user_id uuid not null references auth.users(id) on delete restrict,
  order_id uuid not null references public.consumer_orders(id) on delete restrict,
  payment_transaction_id uuid not null references public.payment_transactions(id) on delete restrict,
  entry_type text not null check (entry_type in ('authorization','purchase','refund','payment_failed')),
  direction text not null check (direction in ('hold','debit','credit','none')),
  amount_minor bigint not null check (amount_minor between 0 and 9007199254740991),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  event_key text not null check (
    char_length(event_key) between 8 and 160
    and event_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  created_at timestamptz not null default now(),
  unique(payment_transaction_id,event_key)
);

create index saved_items_user_created_idx on public.saved_items(user_id,created_at desc);
create index message_members_user_joined_idx on public.message_thread_members(user_id,joined_at desc);
create index messages_thread_created_idx on public.messages(thread_id,created_at desc,id desc);
create index consumer_orders_user_updated_idx on public.consumer_orders(supporter_user_id,updated_at desc);
create index wallet_entries_user_created_idx on public.wallet_entries(user_id,created_at desc);

alter table public.saved_items enable row level security;
alter table public.message_threads enable row level security;
alter table public.message_thread_members enable row level security;
alter table public.messages enable row level security;
alter table public.consumer_orders enable row level security;
alter table public.wallet_entries enable row level security;

revoke all on public.saved_items from public,anon,authenticated;
revoke all on public.message_threads from public,anon,authenticated;
revoke all on public.message_thread_members from public,anon,authenticated;
revoke all on public.messages from public,anon,authenticated;
revoke all on public.consumer_orders from public,anon,authenticated;
revoke all on public.wallet_entries from public,anon,authenticated;

create trigger messages_immutable
before update or delete on public.messages
for each row execute function private.reject_admin_history_mutation();

create trigger wallet_entries_immutable
before update or delete on public.wallet_entries
for each row execute function private.reject_finance_history_mutation();

create or replace function private.new_consumer_public_id(prefix_value text)
returns text
language plpgsql
volatile
security definer
set search_path=pg_catalog,public,extensions
as $$
declare candidate text;
begin
  if prefix_value not in ('mth','msg','ord','wlt') then
    raise exception 'invalid_consumer_public_id_prefix' using errcode='22023';
  end if;
  loop
    candidate:=prefix_value||encode(extensions.gen_random_bytes(12),'hex');
    if prefix_value='mth' and not exists(select 1 from public.message_threads where public_id=candidate) then return candidate; end if;
    if prefix_value='msg' and not exists(select 1 from public.messages where public_id=candidate) then return candidate; end if;
    if prefix_value='ord' and not exists(select 1 from public.consumer_orders where public_id=candidate) then return candidate; end if;
    if prefix_value='wlt' and not exists(select 1 from public.wallet_entries where public_id=candidate) then return candidate; end if;
  end loop;
end;
$$;

create or replace function private.users_blocked(left_user_id uuid,right_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select left_user_id is null or right_user_id is null or exists(
    select 1 from public.profile_blocks block
    where (block.blocker_user_id=left_user_id and block.blocked_user_id=right_user_id)
       or (block.blocker_user_id=right_user_id and block.blocked_user_id=left_user_id)
  );
$$;

create or replace function private.emit_notification(
  target_user_id uuid,
  actor_user_id uuid,
  notification_kind public.notification_type,
  notification_path text
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if target_user_id is null or target_user_id=actor_user_id then return; end if;
  if actor_user_id is not null and private.users_blocked(target_user_id,actor_user_id) then return; end if;
  if actor_user_id is not null and exists(
    select 1 from public.profile_mutes mute
    where mute.muter_user_id=target_user_id and mute.muted_user_id=actor_user_id
  ) then return; end if;

  insert into public.notifications(recipient_user_id,actor_user_id,type,target_path)
  values(target_user_id,actor_user_id,notification_kind,notification_path);
end;
$$;

create or replace function public.set_saved_item(
  requested_item_type text,
  requested_item_public_id text,
  requested_saved boolean
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare normalized_type text:=lower(trim(coalesce(requested_item_type,'')));
declare normalized_id text:=trim(coalesce(requested_item_public_id,''));
declare target_user_id uuid;
declare exists_value boolean:=false;
begin
  perform private.assert_adult_profile_action();

  if normalized_type not in ('profile','demand','campaign','release')
     or char_length(normalized_id) not between 3 and 120
     or normalized_id ~ '[[:cntrl:]]' then
    raise exception 'invalid_saved_item' using errcode='22023';
  end if;

  if normalized_type='profile' then
    select profile.user_id into target_user_id
    from public.profiles profile
    where profile.handle=lower(normalized_id)
      and profile.visibility in ('public','unlisted')
    limit 1;
    exists_value:=target_user_id is not null and not private.users_blocked(auth.uid(),target_user_id);
    normalized_id:=lower(normalized_id);
  elsif normalized_type='demand' then
    select exists(
      select 1 from public.demands demand
      where demand.public_id=normalized_id and demand.visibility='public'
    ) into exists_value;
  elsif normalized_type='campaign' then
    select exists(
      select 1 from public.campaigns campaign
      where campaign.public_id=normalized_id and campaign.state in ('published','funding_closed')
    ) into exists_value;
  else
    select exists(select 1 from public.releases release where release.public_id=normalized_id) into exists_value;
  end if;

  if not exists_value then raise exception 'saved_item_not_found' using errcode='22023'; end if;

  if coalesce(requested_saved,false) then
    insert into public.saved_items(user_id,item_type,item_public_id)
    values(auth.uid(),normalized_type,normalized_id)
    on conflict do nothing;
  else
    delete from public.saved_items
    where user_id=auth.uid() and item_type=normalized_type and item_public_id=normalized_id;
  end if;

  perform private.write_audit(
    auth.uid(),case when coalesce(requested_saved,false) then 'item_saved' else 'item_unsaved' end,
    'success','saved-items',private.current_active_role(auth.uid()),
    jsonb_build_object('itemType',normalized_type,'itemPublicId',normalized_id)
  );

  return jsonb_build_object('itemType',normalized_type,'itemPublicId',normalized_id,'saved',coalesce(requested_saved,false));
end;
$$;

create or replace function public.list_my_saved_items()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
begin
  perform private.assert_current_session();

  return coalesce((
    select jsonb_agg(payload order by created_at desc)
    from (
      select item.created_at,
        case item.item_type
          when 'profile' then (
            select jsonb_build_object(
              'type','profile','publicId',profile.handle,'title',profile.display_name,
              'subtitle',profile.bio,'path','/u/'||profile.handle,'createdAt',item.created_at
            )
            from public.profiles profile
            where profile.handle=item.item_public_id
              and profile.visibility in ('public','unlisted')
              and not private.users_blocked(auth.uid(),profile.user_id)
          )
          when 'demand' then (
            select jsonb_build_object(
              'type','demand','publicId',demand.public_id,'title',demand.title,
              'subtitle',demand.brief,'path','/demand/'||demand.public_id,'createdAt',item.created_at
            )
            from public.demands demand
            where demand.public_id=item.item_public_id and demand.visibility='public'
          )
          when 'campaign' then (
            select jsonb_build_object(
              'type','campaign','publicId',campaign.public_id,
              'title',coalesce(version.title,'Campaign'),
              'subtitle',coalesce(version.public_synopsis,''),
              'path','/p/'||campaign.public_id,'createdAt',item.created_at
            )
            from public.campaigns campaign
            join public.projects project on project.id=campaign.project_id
            join public.project_versions version on version.project_id=project.id and version.revision=project.current_revision
            where campaign.public_id=item.item_public_id and campaign.state in ('published','funding_closed')
          )
          when 'release' then (
            select jsonb_build_object(
              'type','release','publicId',release.public_id,'title',release.title,
              'subtitle',release.synopsis,'path','/releases/'||release.public_id,'createdAt',item.created_at
            )
            from public.releases release where release.public_id=item.item_public_id
          )
        end as payload
      from public.saved_items item
      where item.user_id=auth.uid()
    ) saved
    where payload is not null
  ),'[]'::jsonb);
end;
$$;

create or replace function public.create_direct_message_thread(requested_handle text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare normalized_handle text:=lower(trim(coalesce(requested_handle,'')));
declare target_profile public.profiles%rowtype;
declare pair_hash text;
declare thread_row public.message_threads%rowtype;
begin
  perform private.assert_adult_profile_action();

  select * into target_profile
  from public.profiles profile
  where profile.handle=normalized_handle
  limit 1;

  if target_profile.user_id is null
     or target_profile.user_id=auth.uid()
     or not private.has_accepted_age_record(target_profile.user_id)
     or private.users_blocked(auth.uid(),target_profile.user_id) then
    raise exception 'message_recipient_not_available' using errcode='42501';
  end if;

  pair_hash:=encode(extensions.digest(
    least(auth.uid()::text,target_profile.user_id::text)||':'||greatest(auth.uid()::text,target_profile.user_id::text),
    'sha256'
  ),'hex');

  select * into thread_row from public.message_threads where direct_pair_hash=pair_hash;
  if thread_row.id is null then
    insert into public.message_threads(public_id,direct_pair_hash,created_by_user_id)
    values(private.new_consumer_public_id('mth'),pair_hash,auth.uid())
    returning * into thread_row;

    insert into public.message_thread_members(thread_id,user_id,last_read_at)
    values(thread_row.id,auth.uid(),now()),(thread_row.id,target_profile.user_id,null);
  end if;

  return jsonb_build_object(
    'publicId',thread_row.public_id,
    'recipientHandle',target_profile.handle,
    'recipientDisplayName',target_profile.display_name,
    'path','/messages/'||thread_row.public_id
  );
end;
$$;

create or replace function public.send_message(
  requested_thread_public_id text,
  requested_body text,
  requested_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare normalized_id text:=trim(coalesce(requested_thread_public_id,''));
declare normalized_body text:=trim(coalesce(requested_body,''));
declare thread_row public.message_threads%rowtype;
declare recipient_id uuid;
declare created_message public.messages%rowtype;
declare existing_message public.messages%rowtype;
declare normalized_key text:=trim(coalesce(requested_idempotency_key,''));
begin
  perform private.assert_adult_profile_action();

  if normalized_id !~ '^mth[0-9a-f]{24}$'
     or char_length(normalized_body) not between 1 and 4000
     or normalized_body ~ '[[:cntrl:]]'
     or char_length(normalized_key) not between 8 and 128
     or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception 'invalid_message' using errcode='22023';
  end if;

  select thread.* into thread_row
  from public.message_threads thread
  join public.message_thread_members member on member.thread_id=thread.id
  where thread.public_id=normalized_id and member.user_id=auth.uid()
  for update of thread;

  if thread_row.id is null then raise exception 'message_thread_not_found' using errcode='22023'; end if;

  select member.user_id into recipient_id
  from public.message_thread_members member
  where member.thread_id=thread_row.id and member.user_id<>auth.uid()
  limit 1;

  if recipient_id is null
     or not private.has_accepted_age_record(recipient_id)
     or private.users_blocked(auth.uid(),recipient_id) then
    raise exception 'message_recipient_not_available' using errcode='42501';
  end if;

  select * into existing_message
  from public.messages message
  where message.thread_id=thread_row.id
    and message.sender_user_id=auth.uid()
    and message.idempotency_key=normalized_key;

  if existing_message.id is not null then
    if existing_message.body<>normalized_body then
      raise exception 'message_idempotency_conflict' using errcode='40001';
    end if;
    return jsonb_build_object(
      'publicId',existing_message.public_id,'threadPublicId',thread_row.public_id,'createdAt',existing_message.created_at
    );
  end if;

  insert into public.messages(public_id,thread_id,sender_user_id,idempotency_key,body)
  values(private.new_consumer_public_id('msg'),thread_row.id,auth.uid(),normalized_key,normalized_body)
  returning * into created_message;

  update public.message_threads set updated_at=created_message.created_at where id=thread_row.id;
  update public.message_thread_members set last_read_at=created_message.created_at
  where thread_id=thread_row.id and user_id=auth.uid();

  perform private.emit_notification(recipient_id,auth.uid(),'message_received'::public.notification_type,'/messages/'||thread_row.public_id);

  perform private.write_audit(
    auth.uid(),'message_sent','success','/messages/'||thread_row.public_id,
    private.current_active_role(auth.uid()),
    jsonb_build_object('threadPublicId',thread_row.public_id,'messagePublicId',created_message.public_id)
  );

  return jsonb_build_object(
    'publicId',created_message.public_id,'threadPublicId',thread_row.public_id,'createdAt',created_message.created_at
  );
end;
$$;

create or replace function public.mark_message_thread_read(requested_thread_public_id text)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare thread_id_value uuid;
begin
  perform private.assert_current_session();
  select thread.id into thread_id_value
  from public.message_threads thread
  join public.message_thread_members member on member.thread_id=thread.id
  where thread.public_id=trim(coalesce(requested_thread_public_id,'')) and member.user_id=auth.uid();

  if thread_id_value is null then raise exception 'message_thread_not_found' using errcode='22023'; end if;

  update public.message_thread_members set last_read_at=now()
  where thread_id=thread_id_value and user_id=auth.uid();

  update public.notifications set read_at=coalesce(read_at,now())
  where recipient_user_id=auth.uid()
    and type='message_received'
    and target_path='/messages/'||trim(coalesce(requested_thread_public_id,''));

  return true;
end;
$$;

create or replace function public.list_my_message_threads()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
begin
  perform private.assert_current_session();

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'publicId',thread.public_id,
      'otherHandle',other_profile.handle,
      'otherDisplayName',other_profile.display_name,
      'lastMessage',last_message.body,
      'lastMessageAt',last_message.created_at,
      'unreadCount',(
        select count(*)
        from public.messages unread
        where unread.thread_id=thread.id
          and unread.sender_user_id<>auth.uid()
          and (self_member.last_read_at is null or unread.created_at>self_member.last_read_at)
      ),
      'path','/messages/'||thread.public_id
    ) order by thread.updated_at desc)
    from public.message_threads thread
    join public.message_thread_members self_member on self_member.thread_id=thread.id and self_member.user_id=auth.uid()
    join public.message_thread_members other_member on other_member.thread_id=thread.id and other_member.user_id<>auth.uid()
    join public.profiles other_profile on other_profile.user_id=other_member.user_id
    left join lateral (
      select message.body,message.created_at
      from public.messages message
      where message.thread_id=thread.id
      order by message.created_at desc,message.id desc
      limit 1
    ) last_message on true
    where not private.users_blocked(auth.uid(),other_member.user_id)
  ),'[]'::jsonb);
end;
$$;

create or replace function public.get_message_thread(requested_thread_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare thread_row public.message_threads%rowtype;
declare other_profile public.profiles%rowtype;
declare other_user_id uuid;
declare messages_value jsonb;
begin
  perform private.assert_current_session();

  select thread.* into thread_row
  from public.message_threads thread
  join public.message_thread_members member on member.thread_id=thread.id
  where thread.public_id=trim(coalesce(requested_thread_public_id,'')) and member.user_id=auth.uid();

  if thread_row.id is null then return null; end if;

  select member.user_id into other_user_id
  from public.message_thread_members member
  where member.thread_id=thread_row.id and member.user_id<>auth.uid()
  limit 1;

  if other_user_id is null or private.users_blocked(auth.uid(),other_user_id) then return null; end if;
  select * into other_profile from public.profiles where user_id=other_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'publicId',message.public_id,
    'sender','@'||sender_profile.handle,
    'mine',message.sender_user_id=auth.uid(),
    'body',message.body,
    'createdAt',message.created_at
  ) order by message.created_at asc,message.id asc),'[]'::jsonb)
  into messages_value
  from (
    select *
    from public.messages message
    where message.thread_id=thread_row.id
    order by message.created_at desc,message.id desc
    limit 100
  ) message
  join public.profiles sender_profile on sender_profile.user_id=message.sender_user_id;

  return jsonb_build_object(
    'publicId',thread_row.public_id,
    'otherHandle',other_profile.handle,
    'otherDisplayName',other_profile.display_name,
    'messages',messages_value
  );
end;
$$;

create or replace function private.sync_consumer_order_wallet()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare commitment_row public.funding_commitments%rowtype;
declare order_row public.consumer_orders%rowtype;
declare capture_delta bigint:=0;
declare refund_delta bigint:=0;
declare authorization_delta bigint:=0;
declare prior_authorized bigint:=0;
declare prior_captured bigint:=0;
declare prior_refunded bigint:=0;
declare prior_state text:=null;
begin
  if tg_op='UPDATE' then
    prior_authorized:=old.authorized_minor;
    prior_captured:=old.captured_minor;
    prior_refunded:=old.refunded_minor;
    prior_state:=old.state;
  end if;

  select * into commitment_row from public.funding_commitments where id=new.funding_commitment_id;
  if commitment_row.id is null then return new; end if;

  select * into order_row from public.consumer_orders where payment_transaction_id=new.id;
  if order_row.id is null then
    insert into public.consumer_orders(
      public_id,supporter_user_id,funding_commitment_id,payment_transaction_id,state,
      requested_minor,authorized_minor,captured_minor,refunded_minor,currency
    ) values(
      private.new_consumer_public_id('ord'),commitment_row.supporter_user_id,commitment_row.id,new.id,new.state,
      new.requested_minor,new.authorized_minor,new.captured_minor,new.refunded_minor,new.currency
    ) returning * into order_row;
  else
    update public.consumer_orders
    set state=new.state,
        authorized_minor=new.authorized_minor,
        captured_minor=new.captured_minor,
        refunded_minor=new.refunded_minor,
        updated_at=now()
    where id=order_row.id
    returning * into order_row;
  end if;

  authorization_delta:=greatest(new.authorized_minor-prior_authorized,0);
  capture_delta:=greatest(new.captured_minor-prior_captured,0);
  refund_delta:=greatest(new.refunded_minor-prior_refunded,0);

  if authorization_delta>0 then
    insert into public.wallet_entries(
      public_id,user_id,order_id,payment_transaction_id,entry_type,direction,amount_minor,currency,event_key
    ) values(
      private.new_consumer_public_id('wlt'),commitment_row.supporter_user_id,order_row.id,new.id,
      'authorization','hold',authorization_delta,new.currency,'authorization:'||new.authorized_minor::text
    ) on conflict(payment_transaction_id,event_key) do nothing;
  end if;

  if capture_delta>0 then
    insert into public.wallet_entries(
      public_id,user_id,order_id,payment_transaction_id,entry_type,direction,amount_minor,currency,event_key
    ) values(
      private.new_consumer_public_id('wlt'),commitment_row.supporter_user_id,order_row.id,new.id,
      'purchase','debit',capture_delta,new.currency,'capture:'||new.captured_minor::text
    ) on conflict(payment_transaction_id,event_key) do nothing;
  end if;

  if refund_delta>0 then
    insert into public.wallet_entries(
      public_id,user_id,order_id,payment_transaction_id,entry_type,direction,amount_minor,currency,event_key
    ) values(
      private.new_consumer_public_id('wlt'),commitment_row.supporter_user_id,order_row.id,new.id,
      'refund','credit',refund_delta,new.currency,'refund:'||new.refunded_minor::text
    ) on conflict(payment_transaction_id,event_key) do nothing;
  end if;

  if new.state='failed' and (tg_op='INSERT' or prior_state is distinct from new.state) then
    insert into public.wallet_entries(
      public_id,user_id,order_id,payment_transaction_id,entry_type,direction,amount_minor,currency,event_key
    ) values(
      private.new_consumer_public_id('wlt'),commitment_row.supporter_user_id,order_row.id,new.id,
      'payment_failed','none',0,new.currency,'failed:'||extract(epoch from new.updated_at)::bigint::text
    ) on conflict(payment_transaction_id,event_key) do nothing;
  end if;

  if tg_op='INSERT'
     or prior_state is distinct from new.state
     or prior_captured is distinct from new.captured_minor
     or prior_refunded is distinct from new.refunded_minor then
    perform private.emit_notification(
      commitment_row.supporter_user_id,null,'funding_updated'::public.notification_type,'/app/orders'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists payment_consumer_order_wallet_sync on public.payment_transactions;
create trigger payment_consumer_order_wallet_sync
after insert or update of state,authorized_minor,captured_minor,refunded_minor on public.payment_transactions
for each row execute function private.sync_consumer_order_wallet();

-- Backfill current payment state into dedicated order/wallet records.
insert into public.consumer_orders(
  public_id,supporter_user_id,funding_commitment_id,payment_transaction_id,state,
  requested_minor,authorized_minor,captured_minor,refunded_minor,currency,created_at,updated_at
)
select
  private.new_consumer_public_id('ord'),commitment.supporter_user_id,commitment.id,payment.id,payment.state,
  payment.requested_minor,payment.authorized_minor,payment.captured_minor,payment.refunded_minor,payment.currency,
  payment.created_at,payment.updated_at
from public.payment_transactions payment
join public.funding_commitments commitment on commitment.id=payment.funding_commitment_id
where not exists(select 1 from public.consumer_orders existing where existing.payment_transaction_id=payment.id);

insert into public.wallet_entries(
  public_id,user_id,order_id,payment_transaction_id,entry_type,direction,amount_minor,currency,event_key,created_at
)
select private.new_consumer_public_id('wlt'),orders.supporter_user_id,orders.id,payment.id,
  'authorization','hold',payment.authorized_minor,payment.currency,'authorization:'||payment.authorized_minor::text,payment.created_at
from public.payment_transactions payment
join public.consumer_orders orders on orders.payment_transaction_id=payment.id
where payment.authorized_minor>0
on conflict(payment_transaction_id,event_key) do nothing;

insert into public.wallet_entries(
  public_id,user_id,order_id,payment_transaction_id,entry_type,direction,amount_minor,currency,event_key,created_at
)
select private.new_consumer_public_id('wlt'),orders.supporter_user_id,orders.id,payment.id,
  'purchase','debit',payment.captured_minor,payment.currency,'capture:'||payment.captured_minor::text,payment.updated_at
from public.payment_transactions payment
join public.consumer_orders orders on orders.payment_transaction_id=payment.id
where payment.captured_minor>0
on conflict(payment_transaction_id,event_key) do nothing;

insert into public.wallet_entries(
  public_id,user_id,order_id,payment_transaction_id,entry_type,direction,amount_minor,currency,event_key,created_at
)
select private.new_consumer_public_id('wlt'),orders.supporter_user_id,orders.id,payment.id,
  'refund','credit',payment.refunded_minor,payment.currency,'refund:'||payment.refunded_minor::text,payment.updated_at
from public.payment_transactions payment
join public.consumer_orders orders on orders.payment_transaction_id=payment.id
where payment.refunded_minor>0
on conflict(payment_transaction_id,event_key) do nothing;

create or replace function public.list_my_orders()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
begin
  perform private.assert_current_session();

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'publicId',orders.public_id,
      'fundingPublicId',commitment.public_id,
      'campaignPublicId',campaign.public_id,
      'projectPublicId',project.public_id,
      'title',project_version.title,
      'tierTitle',tier.title,
      'state',orders.state,
      'requestedMinor',orders.requested_minor,
      'capturedMinor',orders.captured_minor,
      'refundedMinor',orders.refunded_minor,
      'currency',orders.currency,
      'createdAt',orders.created_at,
      'updatedAt',orders.updated_at,
      'fundingPath','/app/funding/'||commitment.public_id
    ) order by orders.updated_at desc)
    from public.consumer_orders orders
    join public.funding_commitments commitment on commitment.id=orders.funding_commitment_id
    join public.campaign_term_versions campaign_terms on campaign_terms.id=commitment.campaign_term_version_id
    join public.campaigns campaign on campaign.id=campaign_terms.campaign_id
    join public.projects project on project.id=campaign.project_id
    join public.project_versions project_version on project_version.project_id=project.id and project_version.revision=campaign_terms.project_revision
    left join public.campaign_tiers tier on tier.id=commitment.campaign_tier_id
    where orders.supporter_user_id=auth.uid()
  ),'[]'::jsonb);
end;
$$;

create or replace function public.list_my_wallet_entries()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
begin
  perform private.assert_current_session();

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'publicId',entry.public_id,
      'orderPublicId',orders.public_id,
      'fundingPublicId',commitment.public_id,
      'title',project_version.title,
      'entryType',entry.entry_type,
      'direction',entry.direction,
      'amountMinor',entry.amount_minor,
      'currency',entry.currency,
      'createdAt',entry.created_at
    ) order by entry.created_at desc)
    from public.wallet_entries entry
    join public.consumer_orders orders on orders.id=entry.order_id
    join public.funding_commitments commitment on commitment.id=orders.funding_commitment_id
    join public.campaign_term_versions campaign_terms on campaign_terms.id=commitment.campaign_term_version_id
    join public.campaigns campaign on campaign.id=campaign_terms.campaign_id
    join public.projects project on project.id=campaign.project_id
    join public.project_versions project_version on project_version.project_id=project.id and project_version.revision=campaign_terms.project_revision
    where entry.user_id=auth.uid()
  ),'[]'::jsonb);
end;
$$;

create or replace function private.notify_review_case_change()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare owner_id uuid;
declare project_public_id text;
begin
  if tg_op='UPDATE' and old.state is not distinct from new.state then return new; end if;

  select project.owner_user_id,project.public_id into owner_id,project_public_id
  from public.final_delivery_versions delivery
  join public.projects project on project.id=delivery.project_id
  where delivery.id=new.delivery_version_id;

  perform private.emit_notification(owner_id,null,'review_update'::public.notification_type,'/studio/projects/'||project_public_id);
  return new;
end;
$$;

drop trigger if exists delivery_review_case_notification on public.delivery_review_cases;
create trigger delivery_review_case_notification
after update of state on public.delivery_review_cases
for each row execute function private.notify_review_case_change();

create or replace function private.notify_release_available()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare supporter_id uuid;
begin
  for supporter_id in
    select distinct commitment.supporter_user_id
    from public.campaigns campaign
    join public.campaign_term_versions terms on terms.campaign_id=campaign.id
    join public.funding_commitments commitment on commitment.campaign_term_version_id=terms.id
    join public.payment_transactions payment on payment.funding_commitment_id=commitment.id
    where campaign.project_id=new.project_id
      and payment.state in ('captured','partially_refunded')
      and payment.captured_minor>payment.refunded_minor
  loop
    perform private.emit_notification(
      supporter_id,new.creator_user_id,'release_available'::public.notification_type,'/releases/'||new.public_id
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists release_available_notification on public.releases;
create trigger release_available_notification
after insert on public.releases
for each row execute function private.notify_release_available();

create or replace function private.notify_payout_change()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
begin
  if tg_op='INSERT' or old.state is distinct from new.state then
    perform private.emit_notification(
      new.participant_user_id,null,'payout_update'::public.notification_type,'/app/earnings'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists payout_request_notification on public.payout_requests;
create trigger payout_request_notification
after insert or update of state on public.payout_requests
for each row execute function private.notify_payout_change();

create or replace function private.notify_dispute_change()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
begin
  if tg_op='UPDATE' and old.state is distinct from new.state then
    perform private.emit_notification(
      new.requester_user_id,null,'dispute_update'::public.notification_type,'/app/support'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists consumer_dispute_notification on public.consumer_disputes;
create trigger consumer_dispute_notification
after update of state on public.consumer_disputes
for each row execute function private.notify_dispute_change();

create or replace function private.notify_appeal_change()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
begin
  if tg_op='UPDATE' and old.state is distinct from new.state then
    perform private.emit_notification(
      new.appellant_user_id,null,'dispute_update'::public.notification_type,'/app/support'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists appeal_case_notification on public.appeal_cases;
create trigger appeal_case_notification
after update of state on public.appeal_cases
for each row execute function private.notify_appeal_change();

revoke all on function private.new_consumer_public_id(text) from public,anon,authenticated;
revoke all on function private.users_blocked(uuid,uuid) from public,anon,authenticated;
revoke all on function private.emit_notification(uuid,uuid,public.notification_type,text) from public,anon,authenticated;
revoke all on function private.sync_consumer_order_wallet() from public,anon,authenticated;
revoke all on function private.notify_review_case_change() from public,anon,authenticated;
revoke all on function private.notify_release_available() from public,anon,authenticated;
revoke all on function private.notify_payout_change() from public,anon,authenticated;
revoke all on function private.notify_dispute_change() from public,anon,authenticated;
revoke all on function private.notify_appeal_change() from public,anon,authenticated;

revoke all on function public.set_saved_item(text,text,boolean) from public,anon,authenticated;
revoke all on function public.list_my_saved_items() from public,anon,authenticated;
revoke all on function public.create_direct_message_thread(text) from public,anon,authenticated;
revoke all on function public.send_message(text,text,text) from public,anon,authenticated;
revoke all on function public.mark_message_thread_read(text) from public,anon,authenticated;
revoke all on function public.list_my_message_threads() from public,anon,authenticated;
revoke all on function public.get_message_thread(text) from public,anon,authenticated;
revoke all on function public.list_my_orders() from public,anon,authenticated;
revoke all on function public.list_my_wallet_entries() from public,anon,authenticated;

grant execute on function public.set_saved_item(text,text,boolean) to authenticated;
grant execute on function public.list_my_saved_items() to authenticated;
grant execute on function public.create_direct_message_thread(text) to authenticated;
grant execute on function public.send_message(text,text,text) to authenticated;
grant execute on function public.mark_message_thread_read(text) to authenticated;
grant execute on function public.list_my_message_threads() to authenticated;
grant execute on function public.get_message_thread(text) to authenticated;
grant execute on function public.list_my_orders() to authenticated;
grant execute on function public.list_my_wallet_entries() to authenticated;

notify pgrst,'reload schema';
