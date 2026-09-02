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
    candidate_public_id := 'dem' || encode(extensions.gen_random_bytes(12), 'hex');
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