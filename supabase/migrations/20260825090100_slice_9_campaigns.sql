create type public.campaign_state as enum ('draft','review_ready','published','funding_closed','cancelled');

alter table public.projects
  add column funding_restricted boolean not null default false;

comment on column public.projects.funding_restricted is
  'Fail-closed campaign publication hold. This does not itself represent payment, settlement, or payout state.';

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  project_id uuid not null unique references public.projects(id) on delete cascade,
  state public.campaign_state not null default 'draft',
  current_terms_version integer check (current_terms_version is null or current_terms_version >= 1),
  payment_environment_eligible boolean not null default true,
  submitted_at timestamptz,
  published_at timestamptz,
  funding_closed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_public_id_format check (public_id ~ '^cmp[0-9a-f]{24}$'),
  constraint campaign_state_timestamps check (
    (state <> 'published' or published_at is not null)
    and (state <> 'funding_closed' or funding_closed_at is not null)
    and (state <> 'cancelled' or cancelled_at is not null)
  )
);

comment on column public.campaigns.payment_environment_eligible is
  'Slice 9 pre-book publication eligibility only. It is not proof that a production payment processor is configured; Slice 10 financial actions remain provider-gated.';

create table public.campaign_term_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  version integer not null check (version >= 1),
  project_revision integer not null check (project_revision >= 1),
  contract_term_version_id uuid not null references public.project_term_versions(id) on delete restrict,
  body jsonb not null check (jsonb_typeof(body) = 'object'),
  terms_hash text not null check (terms_hash ~ '^[0-9a-f]{64}$'),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(campaign_id, version),
  unique(campaign_id, terms_hash)
);

create table public.campaign_tiers (
  id uuid primary key default gen_random_uuid(),
  campaign_term_version_id uuid not null references public.campaign_term_versions(id) on delete cascade,
  tier_key text not null check (tier_key ~ '^[a-z0-9][a-z0-9_-]{1,47}$'),
  title text not null check (char_length(trim(title)) between 2 and 120 and title !~ '[[:cntrl:]]'),
  amount_minor bigint not null check (amount_minor > 0),
  access_promise text not null check (char_length(trim(access_promise)) between 3 and 500 and access_promise !~ '[[:cntrl:]]'),
  position integer not null check (position between 1 and 100),
  created_at timestamptz not null default now(),
  unique(campaign_term_version_id, tier_key),
  unique(campaign_term_version_id, position)
);

create table public.campaign_choices (
  id uuid primary key default gen_random_uuid(),
  campaign_term_version_id uuid not null references public.campaign_term_versions(id) on delete cascade,
  position integer not null check (position between 1 and 100),
  choice_text text not null check (char_length(trim(choice_text)) between 2 and 240 and choice_text !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now(),
  unique(campaign_term_version_id, position)
);

create index campaigns_state_updated_idx on public.campaigns(state, updated_at desc);
create index campaign_terms_campaign_version_idx on public.campaign_term_versions(campaign_id, version desc);
create index campaign_terms_contract_idx on public.campaign_term_versions(contract_term_version_id);
create index campaign_tiers_terms_position_idx on public.campaign_tiers(campaign_term_version_id, position);
create index campaign_choices_terms_position_idx on public.campaign_choices(campaign_term_version_id, position);

alter table public.campaigns enable row level security;
alter table public.campaign_term_versions enable row level security;
alter table public.campaign_tiers enable row level security;
alter table public.campaign_choices enable row level security;

revoke all on public.campaigns from public, anon, authenticated;
revoke all on public.campaign_term_versions from public, anon, authenticated;
revoke all on public.campaign_tiers from public, anon, authenticated;
revoke all on public.campaign_choices from public, anon, authenticated;

create or replace function private.validate_campaign_terms(candidate jsonb)
returns jsonb
language plpgsql
volatile
set search_path = pg_catalog, public
as $$
declare
  target_numeric numeric;
  target_minor bigint;
  normalized_currency text;
  deadline_at timestamptz;
  delivery_window text;
  refund_rules text;
  material_change_rules text;
  normalized_guarantees jsonb;
  normalized_choices jsonb;
begin
  if candidate is null or jsonb_typeof(candidate) <> 'object' or octet_length(candidate::text) > 24000 then
    raise exception 'incomplete_campaign_terms' using errcode = '22023';
  end if;

  if jsonb_typeof(candidate -> 'fundingTargetMinor') is distinct from 'number' then
    raise exception 'invalid_campaign_funding_target' using errcode = '22023';
  end if;

  begin
    target_numeric := (candidate ->> 'fundingTargetMinor')::numeric;
  exception when others then
    raise exception 'invalid_campaign_funding_target' using errcode = '22023';
  end;

  if target_numeric <> trunc(target_numeric)
     or target_numeric < 1
     or target_numeric > 9007199254740991 then
    raise exception 'invalid_campaign_funding_target' using errcode = '22023';
  end if;
  target_minor := target_numeric::bigint;

  normalized_currency := trim(coalesce(candidate ->> 'currency',''));
  if normalized_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid_campaign_currency' using errcode = '22023';
  end if;

  if jsonb_typeof(candidate -> 'deadline') is distinct from 'string' then
    raise exception 'invalid_campaign_deadline' using errcode = '22023';
  end if;
  begin
    deadline_at := (candidate ->> 'deadline')::timestamptz;
  exception when others then
    raise exception 'invalid_campaign_deadline' using errcode = '22023';
  end;
  if deadline_at <= now() then
    raise exception 'invalid_campaign_deadline' using errcode = '22023';
  end if;

  delivery_window := trim(coalesce(candidate ->> 'expectedDeliveryWindow',''));
  refund_rules := trim(coalesce(candidate ->> 'refundRules',''));
  material_change_rules := trim(coalesce(candidate ->> 'materialChangeRules',''));

  if char_length(delivery_window) not between 3 and 240
     or delivery_window ~ '[[:cntrl:]]'
     or char_length(refund_rules) not between 8 and 1000
     or refund_rules ~ '[[:cntrl:]]'
     or char_length(material_change_rules) not between 8 and 1000
     or material_change_rules ~ '[[:cntrl:]]' then
    raise exception 'incomplete_campaign_terms' using errcode = '22023';
  end if;

  if jsonb_typeof(candidate -> 'guarantees') is distinct from 'array'
     or jsonb_array_length(candidate -> 'guarantees') not between 1 and 12 then
    raise exception 'incomplete_campaign_terms' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(candidate -> 'guarantees') item(value)
    where jsonb_typeof(item.value) <> 'string'
       or char_length(trim(item.value #>> '{}')) not between 3 and 240
       or trim(item.value #>> '{}') ~ '[[:cntrl:]]'
  ) then
    raise exception 'incomplete_campaign_terms' using errcode = '22023';
  end if;

  if jsonb_typeof(candidate -> 'optionalChoices') is distinct from 'array'
     or jsonb_array_length(candidate -> 'optionalChoices') > 12 then
    raise exception 'incomplete_campaign_terms' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(candidate -> 'optionalChoices') item(value)
    where jsonb_typeof(item.value) <> 'string'
       or char_length(trim(item.value #>> '{}')) not between 2 and 240
       or trim(item.value #>> '{}') ~ '[[:cntrl:]]'
  ) then
    raise exception 'incomplete_campaign_terms' using errcode = '22023';
  end if;

  select jsonb_agg(trim(item.value) order by item.ordinality)
  into normalized_guarantees
  from jsonb_array_elements_text(candidate -> 'guarantees') with ordinality item(value, ordinality);

  select coalesce(jsonb_agg(trim(item.value) order by item.ordinality), '[]'::jsonb)
  into normalized_choices
  from jsonb_array_elements_text(candidate -> 'optionalChoices') with ordinality item(value, ordinality);

  return jsonb_build_object(
    'fundingTargetMinor', target_minor,
    'currency', normalized_currency,
    'deadline', to_char(deadline_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'expectedDeliveryWindow', delivery_window,
    'guarantees', normalized_guarantees,
    'optionalChoices', normalized_choices,
    'refundRules', refund_rules,
    'materialChangeRules', material_change_rules
  );
end;
$$;

create or replace function private.campaign_publication_obligations_current(
  project_row_id uuid,
  contract_term_row_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.project_term_versions term
    join public.contract_lock_receipts receipt
      on receipt.project_id = term.project_id
     and receipt.term_version_id = term.id
     and receipt.terms_hash = term.terms_hash
    where term.id = contract_term_row_id
      and term.project_id = project_row_id
      and not exists (
        select 1
        from jsonb_array_elements(term.terms -> 'participants') participant(value)
        left join public.profiles profile
          on profile.handle = lower(participant.value ->> 'handle')
        where profile.user_id is null
           or not private.verification_is_current(profile.user_id,'v2')
           or not exists (
             select 1
             from public.participant_acceptances acceptance
             where acceptance.term_version_id = term.id
               and acceptance.participant_user_id = profile.user_id
               and acceptance.superseded_at is null
               and acceptance.accepted_hash = term.terms_hash
           )
           or (
             coalesce((participant.value ->> 'depicted')::boolean,false)
             and (
               not private.verification_is_current(profile.user_id,'v3')
               or not exists (
                 select 1
                 from public.depicted_person_consents consent
                 where consent.term_version_id = term.id
                   and consent.performer_user_id = profile.user_id
                   and consent.superseded_at is null
                   and consent.consented_hash = term.terms_hash
               )
             )
           )
      )
  );
$$;

create or replace function public.save_campaign_draft(
  requested_project_public_id text,
  requested_terms jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $$
declare
  project_row public.projects%rowtype;
  contract_term_row public.project_term_versions%rowtype;
  lock_row public.contract_lock_receipts%rowtype;
  campaign_row public.campaigns%rowtype;
  version_row public.campaign_term_versions%rowtype;
  normalized jsonb;
  hash_value text;
  next_version integer;
  candidate_public_id text;
  choice_item record;
begin
  perform private.assert_adult_profile_action();

  select project.* into project_row
  from public.projects project
  where project.public_id = trim(requested_project_public_id)
  for update;

  if project_row.id is null
     or project_row.owner_user_id <> auth.uid()
     or private.current_active_role(auth.uid()) is distinct from 'creator'::public.app_role
     or project_row.state <> 'contract_locked' then
    raise exception 'campaign_edit_not_allowed' using errcode = '42501';
  end if;

  contract_term_row := private.latest_project_terms(project_row.id);
  select receipt.* into lock_row
  from public.contract_lock_receipts receipt
  where receipt.project_id = project_row.id
  limit 1;

  if contract_term_row.id is null
     or lock_row.id is null
     or lock_row.term_version_id <> contract_term_row.id
     or lock_row.terms_hash <> contract_term_row.terms_hash then
    raise exception 'campaign_edit_not_allowed' using errcode = '42501';
  end if;

  normalized := private.validate_campaign_terms(requested_terms);
  hash_value := encode(extensions.digest(convert_to(normalized::text,'UTF8'),'sha256'),'hex');

  select campaign.* into campaign_row
  from public.campaigns campaign
  where campaign.project_id = project_row.id
  for update;

  if campaign_row.id is null then
    loop
      candidate_public_id := 'cmp' || encode(extensions.gen_random_bytes(12),'hex');
      exit when not exists(select 1 from public.campaigns campaign where campaign.public_id = candidate_public_id);
    end loop;

    insert into public.campaigns(public_id,project_id,state,payment_environment_eligible)
    values(candidate_public_id,project_row.id,'draft',true)
    returning * into campaign_row;
  elsif campaign_row.state not in ('draft','review_ready') then
    raise exception 'campaign_edit_not_allowed' using errcode = '42501';
  end if;

  select version.* into version_row
  from public.campaign_term_versions version
  where version.campaign_id = campaign_row.id
    and version.terms_hash = hash_value
  limit 1;

  if version_row.id is not null then
    return jsonb_build_object(
      'publicId', campaign_row.public_id,
      'state', campaign_row.state,
      'termsVersion', version_row.version,
      'termsHash', version_row.terms_hash
    );
  end if;

  select coalesce(max(version),0) + 1 into next_version
  from public.campaign_term_versions
  where campaign_id = campaign_row.id;

  insert into public.campaign_term_versions(
    campaign_id,version,project_revision,contract_term_version_id,body,terms_hash,created_by_user_id
  ) values(
    campaign_row.id,next_version,project_row.current_revision,contract_term_row.id,normalized,hash_value,auth.uid()
  ) returning * into version_row;

  insert into public.campaign_choices(campaign_term_version_id,position,choice_text)
  select version_row.id, item.ordinality::integer, trim(item.value)
  from jsonb_array_elements_text(normalized -> 'optionalChoices') with ordinality item(value, ordinality);

  update public.campaigns
  set current_terms_version = version_row.version,
      state = 'draft',
      submitted_at = null,
      updated_at = now()
  where id = campaign_row.id
  returning * into campaign_row;

  perform private.write_audit(
    auth.uid(),'campaign_draft_saved','success','/studio/projects/'||project_row.public_id||'/campaign','creator',
    jsonb_build_object('campaignPublicId',campaign_row.public_id,'projectPublicId',project_row.public_id,'termsVersion',version_row.version,'termsHash',version_row.terms_hash)
  );

  return jsonb_build_object(
    'publicId', campaign_row.public_id,
    'state', campaign_row.state,
    'termsVersion', version_row.version,
    'termsHash', version_row.terms_hash
  );
end;
$$;

create or replace function public.submit_campaign_for_publish(
  requested_campaign_public_id text,
  expected_terms_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  campaign_row public.campaigns%rowtype;
  project_row public.projects%rowtype;
  version_row public.campaign_term_versions%rowtype;
begin
  perform private.assert_adult_profile_action();

  select campaign.* into campaign_row
  from public.campaigns campaign
  where campaign.public_id = trim(requested_campaign_public_id)
  for update;

  if campaign_row.id is null then
    raise exception 'campaign_edit_not_allowed' using errcode = '42501';
  end if;

  select project.* into project_row from public.projects project where project.id = campaign_row.project_id;

  if project_row.owner_user_id <> auth.uid()
     or private.current_active_role(auth.uid()) is distinct from 'creator'::public.app_role
     or project_row.state <> 'contract_locked'
     or campaign_row.current_terms_version is distinct from expected_terms_version then
    raise exception 'campaign_edit_not_allowed' using errcode = '42501';
  end if;

  select version.* into version_row
  from public.campaign_term_versions version
  where version.campaign_id = campaign_row.id
    and version.version = expected_terms_version;

  if version_row.id is null then
    raise exception 'campaign_edit_not_allowed' using errcode = '42501';
  end if;

  if campaign_row.state = 'review_ready' then
    return jsonb_build_object('publicId',campaign_row.public_id,'state',campaign_row.state,'termsVersion',campaign_row.current_terms_version);
  end if;
  if campaign_row.state <> 'draft' then
    raise exception 'campaign_edit_not_allowed' using errcode = '42501';
  end if;

  update public.campaigns
  set state='review_ready',submitted_at=now(),updated_at=now()
  where id=campaign_row.id
  returning * into campaign_row;

  perform private.write_audit(
    auth.uid(),'campaign_submitted_for_publish','success','/studio/projects/'||project_row.public_id||'/campaign','creator',
    jsonb_build_object('campaignPublicId',campaign_row.public_id,'termsVersion',campaign_row.current_terms_version)
  );

  return jsonb_build_object('publicId',campaign_row.public_id,'state',campaign_row.state,'termsVersion',campaign_row.current_terms_version);
end;
$$;

create or replace function public.publish_campaign(
  requested_campaign_public_id text,
  expected_terms_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  campaign_row public.campaigns%rowtype;
  project_row public.projects%rowtype;
  version_row public.campaign_term_versions%rowtype;
  deadline_at timestamptz;
begin
  perform private.assert_adult_profile_action();

  select campaign.* into campaign_row
  from public.campaigns campaign
  where campaign.public_id = trim(requested_campaign_public_id)
  for update;

  if campaign_row.id is null then
    raise exception 'campaign_publish_not_allowed' using errcode = '42501';
  end if;

  select project.* into project_row
  from public.projects project
  where project.id = campaign_row.project_id
  for update;

  if project_row.owner_user_id <> auth.uid()
     or private.current_active_role(auth.uid()) is distinct from 'creator'::public.app_role
     or campaign_row.current_terms_version is distinct from expected_terms_version then
    raise exception 'campaign_publish_not_allowed' using errcode = '42501';
  end if;

  if campaign_row.state = 'published' then
    return jsonb_build_object('publicId',campaign_row.public_id,'state',campaign_row.state,'termsVersion',campaign_row.current_terms_version);
  end if;

  if campaign_row.state <> 'review_ready'
     or project_row.state <> 'contract_locked'
     or project_row.funding_restricted
     or not campaign_row.payment_environment_eligible
     or not private.verification_is_current(project_row.owner_user_id,'v2') then
    raise exception 'campaign_publish_not_allowed' using errcode = '42501';
  end if;

  select version.* into version_row
  from public.campaign_term_versions version
  where version.campaign_id = campaign_row.id
    and version.version = expected_terms_version;

  if version_row.id is null
     or not private.campaign_publication_obligations_current(project_row.id,version_row.contract_term_version_id) then
    raise exception 'campaign_publish_not_allowed' using errcode = '42501';
  end if;

  begin
    deadline_at := (version_row.body ->> 'deadline')::timestamptz;
  exception when others then
    raise exception 'campaign_publish_not_allowed' using errcode = '42501';
  end;
  if deadline_at <= now() then
    raise exception 'campaign_publish_not_allowed' using errcode = '42501';
  end if;

  update public.campaigns
  set state='published',published_at=now(),updated_at=now()
  where id=campaign_row.id
  returning * into campaign_row;

  perform private.write_audit(
    auth.uid(),'campaign_published','success','/p/'||campaign_row.public_id,'creator',
    jsonb_build_object('campaignPublicId',campaign_row.public_id,'projectPublicId',project_row.public_id,'termsVersion',campaign_row.current_terms_version,'termsHash',version_row.terms_hash)
  );

  return jsonb_build_object('publicId',campaign_row.public_id,'state',campaign_row.state,'termsVersion',campaign_row.current_terms_version,'termsHash',version_row.terms_hash);
end;
$$;

create or replace function public.get_public_campaign(requested_campaign_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  campaign_row public.campaigns%rowtype;
  project_row public.projects%rowtype;
  campaign_terms public.campaign_term_versions%rowtype;
  project_version public.project_versions%rowtype;
  creator_profile public.profiles%rowtype;
begin
  select campaign.* into campaign_row
  from public.campaigns campaign
  where campaign.public_id = trim(requested_campaign_public_id)
    and campaign.state in ('published','funding_closed')
  limit 1;

  if campaign_row.id is null then
    return null;
  end if;

  select project.* into project_row from public.projects project where project.id=campaign_row.project_id;
  select version.* into campaign_terms
  from public.campaign_term_versions version
  where version.campaign_id=campaign_row.id and version.version=campaign_row.current_terms_version;
  select version.* into project_version
  from public.project_versions version
  where version.project_id=project_row.id and version.revision=campaign_terms.project_revision;
  select profile.* into creator_profile from public.profiles profile where profile.user_id=project_row.owner_user_id;

  if campaign_terms.id is null or project_version.id is null or creator_profile.user_id is null then
    return null;
  end if;

  return jsonb_build_object(
    'publicId', campaign_row.public_id,
    'state', campaign_row.state,
    'title', project_version.title,
    'publicSynopsis', project_version.public_synopsis,
    'creatorHandle', creator_profile.handle,
    'creatorStageName', creator_profile.display_name,
    'fundingTargetMinor', (campaign_terms.body ->> 'fundingTargetMinor')::bigint,
    'currency', campaign_terms.body ->> 'currency',
    'deadline', campaign_terms.body ->> 'deadline',
    'expectedDeliveryWindow', campaign_terms.body ->> 'expectedDeliveryWindow',
    'guarantees', campaign_terms.body -> 'guarantees',
    'optionalChoices', campaign_terms.body -> 'optionalChoices',
    'refundRules', campaign_terms.body ->> 'refundRules',
    'materialChangeRules', campaign_terms.body ->> 'materialChangeRules',
    'campaignTermsVersion', campaign_terms.version,
    'campaignTermsHash', campaign_terms.terms_hash,
    'supporterCount', 0,
    'fundedAmountMinor', 0
  );
end;
$$;

comment on function public.get_public_campaign(text) is
  'Slice 9 Task 1 returns zero supporter/funded aggregates because funding commitments do not exist until Task 2. Task 2 replaces these literals with eligible durable commitment aggregates.';

revoke all on function private.validate_campaign_terms(jsonb) from public, anon, authenticated;
revoke all on function private.campaign_publication_obligations_current(uuid,uuid) from public, anon, authenticated;
revoke all on function public.save_campaign_draft(text,jsonb) from public, anon, authenticated;
revoke all on function public.submit_campaign_for_publish(text,integer) from public, anon, authenticated;
revoke all on function public.publish_campaign(text,integer) from public, anon, authenticated;
revoke all on function public.get_public_campaign(text) from public, anon, authenticated;

grant execute on function public.save_campaign_draft(text,jsonb) to authenticated;
grant execute on function public.submit_campaign_for_publish(text,integer) to authenticated;
grant execute on function public.publish_campaign(text,integer) to authenticated;
grant execute on function public.get_public_campaign(text) to anon, authenticated;

notify pgrst, 'reload schema';
