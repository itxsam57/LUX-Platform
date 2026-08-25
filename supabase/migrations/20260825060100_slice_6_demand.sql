create type public.demand_state as enum (
  'open',
  'creator_interested',
  'converted',
  'expired',
  'closed'
);

create table public.demands (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  brief text not null,
  category text not null,
  format text not null,
  suggested_creator_user_id uuid references auth.users(id) on delete set null,
  budget_min_minor bigint,
  budget_max_minor bigint,
  budget_currency text,
  safety_labels text[] not null default '{}'::text[],
  visibility public.profile_visibility not null default 'public',
  state public.demand_state not null default 'open',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demand_public_id_format check (public_id ~ '^dem[A-Za-z0-9_-]{24}$'),
  constraint demand_title_length check (char_length(trim(title)) between 4 and 120),
  constraint demand_title_plain_text check (title !~ '[[:cntrl:]]'),
  constraint demand_brief_length check (char_length(trim(brief)) between 20 and 1200),
  constraint demand_brief_plain_text check (brief !~ '[[:cntrl:]]'),
  constraint demand_category_format check (category ~ '^[a-z0-9][a-z0-9_-]{1,47}$'),
  constraint demand_format_format check (format ~ '^[a-z0-9][a-z0-9_-]{1,47}$'),
  constraint demand_budget_complete check (
    (budget_min_minor is null and budget_max_minor is null and budget_currency is null)
    or (
      budget_min_minor is not null
      and budget_max_minor is not null
      and budget_currency is not null
    )
  ),
  constraint demand_budget_range check (
    budget_min_minor is null
    or (
      budget_min_minor >= 0
      and budget_max_minor >= budget_min_minor
      and budget_min_minor <= 9007199254740991
      and budget_max_minor <= 9007199254740991
    )
  ),
  constraint demand_budget_currency check (
    budget_currency is null or budget_currency ~ '^[A-Z]{3}$'
  ),
  constraint demand_safety_label_count check (cardinality(safety_labels) <= 8),
  constraint demand_expiry_after_creation check (expires_at is null or expires_at > created_at)
);

create table public.demand_supports (
  demand_id uuid not null references public.demands(id) on delete cascade,
  supporter_user_id uuid not null references auth.users(id) on delete cascade,
  publicly_attributed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (demand_id, supporter_user_id)
);

create table public.demand_creator_responses (
  demand_id uuid not null references public.demands(id) on delete cascade,
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  response text not null check (response in ('declined', 'interested')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (demand_id, creator_user_id)
);

create index demands_public_created_idx
  on public.demands(visibility, state, created_at desc);
create index demands_author_created_idx
  on public.demands(author_user_id, created_at desc);
create index demands_suggested_creator_created_idx
  on public.demands(suggested_creator_user_id, created_at desc)
  where suggested_creator_user_id is not null;
create index demand_supports_supporter_created_idx
  on public.demand_supports(supporter_user_id, created_at desc);
create index demand_creator_responses_creator_updated_idx
  on public.demand_creator_responses(creator_user_id, updated_at desc);

alter table public.demands enable row level security;
alter table public.demand_supports enable row level security;
alter table public.demand_creator_responses enable row level security;

revoke all on public.demands from public, anon, authenticated;
revoke all on public.demand_supports from public, anon, authenticated;
revoke all on public.demand_creator_responses from public, anon, authenticated;

create or replace function private.demand_relationship_blocked(
  left_user_id uuid,
  right_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
  select case
    when left_user_id is null or right_user_id is null then false
    when left_user_id = right_user_id then false
    else exists (
      select 1
      from public.profile_blocks block
      where (block.blocker_user_id = left_user_id and block.blocked_user_id = right_user_id)
         or (block.blocker_user_id = right_user_id and block.blocked_user_id = left_user_id)
    )
  end;
$$;

create or replace function private.demand_effective_state(
  stored_state public.demand_state,
  demand_expires_at timestamptz
)
returns public.demand_state
language sql
stable
as $$
  select case
    when stored_state in ('open', 'creator_interested')
      and demand_expires_at is not null
      and demand_expires_at <= now()
      then 'expired'::public.demand_state
    else stored_state
  end;
$$;

create or replace function private.build_demand_projection(
  demand_row_id uuid,
  viewer_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  demand_row public.demands%rowtype;
  author_row public.profiles%rowtype;
  creator_row public.profiles%rowtype;
  public_supporters jsonb;
  support_count integer;
  viewer_supported boolean := false;
  effective_state public.demand_state;
  suggested_creator jsonb := null;
  budget jsonb := null;
begin
  select demand.*
  into demand_row
  from public.demands demand
  where demand.id = demand_row_id
  limit 1;

  if demand_row.id is null then
    return null;
  end if;

  if viewer_user_id is not null
     and private.demand_relationship_blocked(viewer_user_id, demand_row.author_user_id) then
    return null;
  end if;

  select profile.*
  into author_row
  from public.profiles profile
  where profile.user_id = demand_row.author_user_id
  limit 1;

  if author_row.user_id is null then
    return null;
  end if;

  select count(*)::integer
  into support_count
  from public.demand_supports support
  where support.demand_id = demand_row.id;

  if viewer_user_id is not null then
    select exists (
      select 1
      from public.demand_supports support
      where support.demand_id = demand_row.id
        and support.supporter_user_id = viewer_user_id
    ) into viewer_supported;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'handle', supporter_profile.handle,
        'displayName', supporter_profile.display_name
      )
      order by support.created_at asc, supporter_profile.handle asc
    ),
    '[]'::jsonb
  )
  into public_supporters
  from public.demand_supports support
  join public.profiles supporter_profile
    on supporter_profile.user_id = support.supporter_user_id
  where support.demand_id = demand_row.id
    and support.publicly_attributed = true
    and supporter_profile.visibility <> 'private'
    and not private.demand_relationship_blocked(support.supporter_user_id, demand_row.author_user_id);

  if demand_row.suggested_creator_user_id is not null then
    select profile.*
    into creator_row
    from public.profiles profile
    where profile.user_id = demand_row.suggested_creator_user_id
    limit 1;

    if creator_row.user_id is not null then
      suggested_creator := jsonb_build_object(
        'handle', creator_row.handle,
        'displayName', creator_row.display_name,
        'relationship', case
          when private.demand_effective_state(demand_row.state, demand_row.expires_at) = 'creator_interested'
            then 'interested'
          else 'suggested'
        end
      );
    end if;
  end if;

  if demand_row.budget_min_minor is not null then
    budget := jsonb_build_object(
      'minMinor', demand_row.budget_min_minor,
      'maxMinor', demand_row.budget_max_minor,
      'currency', demand_row.budget_currency
    );
  end if;

  effective_state := private.demand_effective_state(demand_row.state, demand_row.expires_at);

  return jsonb_build_object(
    'publicId', demand_row.public_id,
    'title', demand_row.title,
    'brief', demand_row.brief,
    'category', demand_row.category,
    'format', demand_row.format,
    'state', effective_state,
    'author', jsonb_build_object(
      'handle', author_row.handle,
      'displayName', author_row.display_name
    ),
    'suggestedCreator', suggested_creator,
    'budget', budget,
    'safetyLabels', to_jsonb(demand_row.safety_labels),
    'supportCount', support_count,
    'viewerSupported', viewer_supported,
    'publicSupporters', public_supporters,
    'expiresAt', demand_row.expires_at,
    'createdAt', demand_row.created_at
  );
end;
$$;

create or replace function public.create_demand(demand_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  normalized_title text;
  normalized_brief text;
  normalized_category text;
  normalized_format text;
  normalized_creator_handle text;
  suggested_creator_id uuid;
  normalized_budget_min bigint;
  normalized_budget_max bigint;
  normalized_budget_currency text;
  normalized_safety_labels text[] := '{}'::text[];
  normalized_expiry timestamptz;
  candidate_label text;
  candidate_public_id text;
  created_demand public.demands%rowtype;
  budget_payload jsonb;
  safety_payload jsonb;
begin
  perform private.assert_adult_profile_action();

  if demand_input is null or jsonb_typeof(demand_input) <> 'object' then
    raise exception 'invalid_demand_input' using errcode = '22023';
  end if;

  if jsonb_typeof(demand_input -> 'title') is distinct from 'string' then
    raise exception 'invalid_demand_title' using errcode = '22023';
  end if;
  normalized_title := trim(demand_input ->> 'title');
  if char_length(normalized_title) not between 4 and 120 or normalized_title ~ '[[:cntrl:]]' then
    raise exception 'invalid_demand_title' using errcode = '22023';
  end if;

  if jsonb_typeof(demand_input -> 'brief') is distinct from 'string' then
    raise exception 'invalid_demand_brief' using errcode = '22023';
  end if;
  normalized_brief := trim(demand_input ->> 'brief');
  if char_length(normalized_brief) not between 20 and 1200 or normalized_brief ~ '[[:cntrl:]]' then
    raise exception 'invalid_demand_brief' using errcode = '22023';
  end if;

  if jsonb_typeof(demand_input -> 'category') is distinct from 'string' then
    raise exception 'invalid_demand_category' using errcode = '22023';
  end if;
  normalized_category := lower(trim(demand_input ->> 'category'));
  if normalized_category !~ '^[a-z0-9][a-z0-9_-]{1,47}$' then
    raise exception 'invalid_demand_category' using errcode = '22023';
  end if;

  if jsonb_typeof(demand_input -> 'format') is distinct from 'string' then
    raise exception 'invalid_demand_format' using errcode = '22023';
  end if;
  normalized_format := lower(trim(demand_input ->> 'format'));
  if normalized_format !~ '^[a-z0-9][a-z0-9_-]{1,47}$' then
    raise exception 'invalid_demand_format' using errcode = '22023';
  end if;

  if demand_input ? 'suggestedCreatorHandle'
     and demand_input -> 'suggestedCreatorHandle' <> 'null'::jsonb
     and coalesce(demand_input ->> 'suggestedCreatorHandle', '') <> '' then
    if jsonb_typeof(demand_input -> 'suggestedCreatorHandle') <> 'string' then
      raise exception 'invalid_suggested_creator_handle' using errcode = '22023';
    end if;

    normalized_creator_handle := lower(trim(demand_input ->> 'suggestedCreatorHandle'));
    if normalized_creator_handle !~ '^[a-z0-9_]{3,30}$' then
      raise exception 'invalid_suggested_creator_handle' using errcode = '22023';
    end if;

    select profile.user_id
    into suggested_creator_id
    from public.profiles profile
    where profile.handle = normalized_creator_handle
      and profile.visibility = 'public'
      and exists (
        select 1
        from public.workspace_memberships membership
        where membership.user_id = profile.user_id
          and membership.role = 'creator'
          and membership.status = 'approved'
      )
    limit 1;

    if suggested_creator_id is null
       or private.demand_relationship_blocked(auth.uid(), suggested_creator_id) then
      raise exception 'creator_unavailable' using errcode = '42501';
    end if;
  end if;

  budget_payload := demand_input -> 'budget';
  if budget_payload is not null and budget_payload <> 'null'::jsonb then
    if jsonb_typeof(budget_payload) <> 'object'
       or jsonb_typeof(budget_payload -> 'minMinor') <> 'number'
       or jsonb_typeof(budget_payload -> 'maxMinor') <> 'number'
       or jsonb_typeof(budget_payload -> 'currency') <> 'string'
       or (budget_payload ->> 'minMinor') !~ '^[0-9]+$'
       or (budget_payload ->> 'maxMinor') !~ '^[0-9]+$' then
      raise exception 'invalid_demand_budget' using errcode = '22023';
    end if;

    begin
      normalized_budget_min := (budget_payload ->> 'minMinor')::bigint;
      normalized_budget_max := (budget_payload ->> 'maxMinor')::bigint;
    exception when others then
      raise exception 'invalid_demand_budget' using errcode = '22023';
    end;

    normalized_budget_currency := upper(trim(budget_payload ->> 'currency'));
    if normalized_budget_min < 0
       or normalized_budget_max < normalized_budget_min
       or normalized_budget_min > 9007199254740991
       or normalized_budget_max > 9007199254740991
       or normalized_budget_currency !~ '^[A-Z]{3}$' then
      raise exception 'invalid_demand_budget' using errcode = '22023';
    end if;
  end if;

  safety_payload := demand_input -> 'safetyLabels';
  if safety_payload is not null and safety_payload <> 'null'::jsonb then
    if jsonb_typeof(safety_payload) <> 'array' or jsonb_array_length(safety_payload) > 8 then
      raise exception 'invalid_demand_safety_labels' using errcode = '22023';
    end if;

    for candidate_label in
      select value
      from jsonb_array_elements_text(safety_payload) element(value)
    loop
      candidate_label := lower(trim(candidate_label));
      if candidate_label !~ '^[a-z0-9][a-z0-9_-]{1,31}$' then
        raise exception 'invalid_demand_safety_labels' using errcode = '22023';
      end if;
      if not (candidate_label = any(normalized_safety_labels)) then
        normalized_safety_labels := array_append(normalized_safety_labels, candidate_label);
      end if;
    end loop;
  end if;

  if demand_input ? 'expiresAt'
     and demand_input -> 'expiresAt' <> 'null'::jsonb
     and coalesce(demand_input ->> 'expiresAt', '') <> '' then
    if jsonb_typeof(demand_input -> 'expiresAt') <> 'string' then
      raise exception 'invalid_demand_expiry' using errcode = '22023';
    end if;
    begin
      normalized_expiry := (demand_input ->> 'expiresAt')::timestamptz;
    exception when others then
      raise exception 'invalid_demand_expiry' using errcode = '22023';
    end;
    if normalized_expiry <= now() then
      raise exception 'invalid_demand_expiry' using errcode = '22023';
    end if;
  end if;

  loop
    candidate_public_id := 'dem' || encode(gen_random_bytes(12), 'hex');
    exit when not exists (
      select 1 from public.demands demand where demand.public_id = candidate_public_id
    );
  end loop;

  insert into public.demands (
    public_id,
    author_user_id,
    title,
    brief,
    category,
    format,
    suggested_creator_user_id,
    budget_min_minor,
    budget_max_minor,
    budget_currency,
    safety_labels,
    expires_at
  ) values (
    candidate_public_id,
    auth.uid(),
    normalized_title,
    normalized_brief,
    normalized_category,
    normalized_format,
    suggested_creator_id,
    normalized_budget_min,
    normalized_budget_max,
    normalized_budget_currency,
    normalized_safety_labels,
    normalized_expiry
  ) returning * into created_demand;

  perform private.write_audit(
    auth.uid(),
    'demand_created',
    'success',
    '/app/demand/new',
    null,
    jsonb_build_object('publicId', created_demand.public_id)
  );

  return jsonb_build_object(
    'publicId', created_demand.public_id,
    'state', created_demand.state
  );
end;
$$;

create or replace function public.get_demand(requested_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  demand_row_id uuid;
  normalized_public_id text := trim(requested_public_id);
begin
  perform private.assert_adult_profile_action();

  if normalized_public_id is null or normalized_public_id !~ '^dem[A-Za-z0-9_-]{24}$' then
    return null;
  end if;

  select demand.id
  into demand_row_id
  from public.demands demand
  where demand.public_id = normalized_public_id
    and demand.visibility in ('public', 'unlisted')
  limit 1;

  if demand_row_id is null then
    return null;
  end if;

  return private.build_demand_projection(demand_row_id, auth.uid());
end;
$$;

create or replace function public.list_demands(
  page_size integer default 20,
  page_cursor timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  result jsonb;
begin
  perform private.assert_adult_profile_action();

  if page_size is null or page_size < 1 or page_size > 50 then
    raise exception 'invalid_page_size' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(item.payload order by item.created_at desc, item.public_id asc), '[]'::jsonb)
  into result
  from (
    select
      demand.created_at,
      demand.public_id,
      private.build_demand_projection(demand.id, auth.uid()) as payload
    from public.demands demand
    where demand.visibility = 'public'
      and (page_cursor is null or demand.created_at < page_cursor)
      and not private.demand_relationship_blocked(auth.uid(), demand.author_user_id)
      and private.demand_effective_state(demand.state, demand.expires_at) in ('open', 'creator_interested')
    order by demand.created_at desc, demand.public_id asc
    limit page_size
  ) item
  where item.payload is not null;

  return result;
end;
$$;

create or replace function public.set_demand_support(
  requested_public_id text,
  enabled boolean,
  publicly_attributed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  demand_row public.demands%rowtype;
  effective_state public.demand_state;
begin
  perform private.assert_adult_profile_action();

  if enabled is null or publicly_attributed is null then
    raise exception 'invalid_demand_support' using errcode = '22023';
  end if;

  select demand.*
  into demand_row
  from public.demands demand
  where demand.public_id = trim(requested_public_id)
  limit 1;

  if demand_row.id is null
     or demand_row.visibility = 'private'
     or private.demand_relationship_blocked(auth.uid(), demand_row.author_user_id) then
    raise exception 'demand_unavailable' using errcode = '42501';
  end if;

  effective_state := private.demand_effective_state(demand_row.state, demand_row.expires_at);
  if effective_state not in ('open', 'creator_interested') then
    raise exception 'demand_unavailable' using errcode = '42501';
  end if;

  if enabled then
    insert into public.demand_supports (
      demand_id,
      supporter_user_id,
      publicly_attributed
    ) values (
      demand_row.id,
      auth.uid(),
      publicly_attributed
    )
    on conflict (demand_id, supporter_user_id) do update
      set publicly_attributed = excluded.publicly_attributed,
          updated_at = now();
  else
    delete from public.demand_supports support
    where support.demand_id = demand_row.id
      and support.supporter_user_id = auth.uid();
  end if;

  perform private.write_audit(
    auth.uid(),
    'demand_support_changed',
    'success',
    '/app/demand',
    null,
    jsonb_build_object(
      'publicId', demand_row.public_id,
      'enabled', enabled,
      'publiclyAttributed', case when enabled then publicly_attributed else false end
    )
  );

  return jsonb_build_object(
    'publicId', demand_row.public_id,
    'supported', enabled,
    'publiclyAttributed', case when enabled then publicly_attributed else false end
  );
end;
$$;

create or replace function public.respond_to_demand(
  requested_public_id text,
  requested_response text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  demand_row public.demands%rowtype;
  normalized_response text := lower(trim(requested_response));
  effective_state public.demand_state;
begin
  perform private.assert_adult_profile_action();

  if normalized_response not in ('declined', 'interested') then
    raise exception 'invalid_demand_response' using errcode = '22023';
  end if;

  select demand.*
  into demand_row
  from public.demands demand
  where demand.public_id = trim(requested_public_id)
  limit 1;

  if demand_row.id is null
     or demand_row.visibility = 'private'
     or private.demand_relationship_blocked(auth.uid(), demand_row.author_user_id) then
    raise exception 'demand_unavailable' using errcode = '42501';
  end if;

  if demand_row.suggested_creator_user_id is distinct from auth.uid() then
    raise exception 'suggested_creator_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.workspace_memberships membership
    where membership.user_id = auth.uid()
      and membership.role = 'creator'
      and membership.status = 'approved'
  ) then
    raise exception 'creator_role_required' using errcode = '42501';
  end if;

  effective_state := private.demand_effective_state(demand_row.state, demand_row.expires_at);
  if effective_state not in ('open', 'creator_interested') then
    raise exception 'demand_unavailable' using errcode = '42501';
  end if;

  insert into public.demand_creator_responses (
    demand_id,
    creator_user_id,
    response
  ) values (
    demand_row.id,
    auth.uid(),
    normalized_response
  )
  on conflict (demand_id, creator_user_id) do update
    set response = excluded.response,
        updated_at = now();

  if normalized_response = 'interested' then
    update public.demands
    set state = 'creator_interested',
        updated_at = now()
    where id = demand_row.id
      and state in ('open', 'creator_interested');

    perform private.write_audit(
      auth.uid(),
      'demand_creator_interested',
      'success',
      '/workspace/creator/demand',
      'creator',
      jsonb_build_object('publicId', demand_row.public_id)
    );
  else
    update public.demands
    set state = 'open',
        updated_at = now()
    where id = demand_row.id
      and state = 'creator_interested';

    perform private.write_audit(
      auth.uid(),
      'demand_creator_declined',
      'success',
      '/workspace/creator/demand',
      'creator',
      jsonb_build_object('publicId', demand_row.public_id)
    );
  end if;

  return jsonb_build_object(
    'publicId', demand_row.public_id,
    'response', normalized_response,
    'state', case
      when normalized_response = 'interested' then 'creator_interested'
      else 'open'
    end
  );
end;
$$;

revoke all on function public.create_demand(jsonb) from public, anon, authenticated;
revoke all on function public.get_demand(text) from public, anon, authenticated;
revoke all on function public.list_demands(integer, timestamptz) from public, anon, authenticated;
revoke all on function public.set_demand_support(text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.respond_to_demand(text, text) from public, anon, authenticated;

grant execute on function public.create_demand(jsonb) to authenticated;
grant execute on function public.get_demand(text) to authenticated;
grant execute on function public.list_demands(integer, timestamptz) to authenticated;
grant execute on function public.set_demand_support(text, boolean, boolean) to authenticated;
grant execute on function public.respond_to_demand(text, text) to authenticated;