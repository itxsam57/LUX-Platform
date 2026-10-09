-- Activate campaign tiers end-to-end while preserving legacy campaign versions.

alter table public.funding_commitments
  add column if not exists campaign_tier_id uuid references public.campaign_tiers(id) on delete restrict;

create index if not exists funding_commitments_tier_created_idx
  on public.funding_commitments(campaign_tier_id,created_at desc)
  where campaign_tier_id is not null;

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
  normalized_tiers jsonb := '[]'::jsonb;
begin
  if candidate is null or jsonb_typeof(candidate) <> 'object' or octet_length(candidate::text) > 32000 then
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

  if candidate ? 'tiers' then
    if jsonb_typeof(candidate -> 'tiers') is distinct from 'array'
       or jsonb_array_length(candidate -> 'tiers') > 12 then
      raise exception 'invalid_campaign_tiers' using errcode='22023';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(candidate -> 'tiers') item(value)
      where jsonb_typeof(item.value) <> 'object'
         or item.value - array['key','title','amountMinor','accessPromise'] <> '{}'::jsonb
         or trim(coalesce(item.value ->> 'key','')) !~ '^[a-z0-9][a-z0-9_-]{1,47}$'
         or char_length(trim(coalesce(item.value ->> 'title',''))) not between 2 and 120
         or trim(coalesce(item.value ->> 'title','')) ~ '[[:cntrl:]]'
         or jsonb_typeof(item.value -> 'amountMinor') is distinct from 'number'
         or ((item.value ->> 'amountMinor')::numeric) <> trunc((item.value ->> 'amountMinor')::numeric)
         or ((item.value ->> 'amountMinor')::numeric) < 1
         or ((item.value ->> 'amountMinor')::numeric) > 9007199254740991
         or char_length(trim(coalesce(item.value ->> 'accessPromise',''))) not between 3 and 500
         or trim(coalesce(item.value ->> 'accessPromise','')) ~ '[[:cntrl:]]'
    ) then
      raise exception 'invalid_campaign_tiers' using errcode='22023';
    end if;

    if exists (
      select 1
      from (
        select lower(trim(item.value ->> 'key')) key_value,count(*) count_value
        from jsonb_array_elements(candidate -> 'tiers') item(value)
        group by lower(trim(item.value ->> 'key'))
      ) duplicate
      where duplicate.count_value > 1
    ) then
      raise exception 'duplicate_campaign_tier_key' using errcode='22023';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'key',lower(trim(item.value ->> 'key')),
      'title',trim(item.value ->> 'title'),
      'amountMinor',((item.value ->> 'amountMinor')::numeric)::bigint,
      'accessPromise',trim(item.value ->> 'accessPromise')
    ) order by item.ordinality),'[]'::jsonb)
    into normalized_tiers
    from jsonb_array_elements(candidate -> 'tiers') with ordinality item(value,ordinality);
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
    'tiers', normalized_tiers,
    'refundRules', refund_rules,
    'materialChangeRules', material_change_rules
  );
end;
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

  insert into public.campaign_tiers(campaign_term_version_id,tier_key,title,amount_minor,access_promise,position)
  select
    version_row.id,
    item.value ->> 'key',
    item.value ->> 'title',
    (item.value ->> 'amountMinor')::bigint,
    item.value ->> 'accessPromise',
    item.ordinality::integer
  from jsonb_array_elements(normalized -> 'tiers') with ordinality item(value,ordinality);

  update public.campaigns
  set current_terms_version = version_row.version,
      state = 'draft',
      submitted_at = null,
      updated_at = now()
  where id = campaign_row.id
  returning * into campaign_row;

  perform private.write_audit(
    auth.uid(),'campaign_draft_saved','success','/studio/projects/'||project_row.public_id||'/campaign','creator',
    jsonb_build_object(
      'campaignPublicId',campaign_row.public_id,'projectPublicId',project_row.public_id,
      'termsVersion',version_row.version,'termsHash',version_row.terms_hash,
      'tierCount',jsonb_array_length(normalized -> 'tiers')
    )
  );

  return jsonb_build_object(
    'publicId', campaign_row.public_id,
    'state', campaign_row.state,
    'termsVersion', version_row.version,
    'termsHash', version_row.terms_hash
  );
end;
$$;

create or replace function public.create_prebook_for_tier(
  requested_campaign_public_id text,
  requested_tier_key text,
  requested_supporter_visibility text,
  requested_badge_choice text,
  requested_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare campaign_row public.campaigns%rowtype;
declare version_row public.campaign_term_versions%rowtype;
declare tier_row public.campaign_tiers%rowtype;
declare normalized_tier text:=lower(trim(coalesce(requested_tier_key,'')));
declare result_value jsonb;
declare commitment_id uuid;
declare commitment_tier_id uuid;
begin
  perform private.assert_adult_profile_action();

  if normalized_tier !~ '^[a-z0-9][a-z0-9_-]{1,47}$' then
    raise exception 'invalid_campaign_tier' using errcode='22023';
  end if;

  select * into campaign_row from public.campaigns
  where public_id=trim(coalesce(requested_campaign_public_id,'')) and state='published';
  if campaign_row.id is null or campaign_row.current_terms_version is null then
    raise exception 'prebook_not_allowed' using errcode='42501';
  end if;

  select * into version_row from public.campaign_term_versions
  where campaign_id=campaign_row.id and version=campaign_row.current_terms_version;
  select * into tier_row from public.campaign_tiers
  where campaign_term_version_id=version_row.id and tier_key=normalized_tier;
  if tier_row.id is null then raise exception 'campaign_tier_not_found' using errcode='22023'; end if;

  result_value := public.create_prebook(
    requested_campaign_public_id,
    tier_row.amount_minor,
    requested_supporter_visibility,
    requested_badge_choice,
    requested_idempotency_key
  );

  select id,campaign_tier_id into commitment_id,commitment_tier_id
  from public.funding_commitments
  where public_id=result_value ->> 'publicId' and supporter_user_id=auth.uid()
  for update;

  if commitment_id is null then raise exception 'prebook_not_allowed' using errcode='42501'; end if;
  if commitment_tier_id is not null and commitment_tier_id<>tier_row.id then
    raise exception 'tier_idempotency_conflict' using errcode='40001';
  end if;

  update public.funding_commitments set campaign_tier_id=tier_row.id
  where id=commitment_id and campaign_tier_id is null;

  perform private.write_audit(
    auth.uid(),'funding_tier_selected','success','/app/funding/'||(result_value ->> 'publicId'),
    private.current_active_role(auth.uid()),jsonb_build_object(
      'campaignPublicId',campaign_row.public_id,'tierKey',tier_row.tier_key,'amountMinor',tier_row.amount_minor
    )
  );

  return result_value || jsonb_build_object(
    'tierKey',tier_row.tier_key,'tierTitle',tier_row.title,'accessPromise',tier_row.access_promise
  );
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
  supporter_count bigint := 0;
  funded_amount bigint := 0;
  tiers_value jsonb := '[]'::jsonb;
begin
  select campaign.* into campaign_row
  from public.campaigns campaign
  where campaign.public_id = trim(requested_campaign_public_id)
    and campaign.state in ('published','funding_closed')
  limit 1;
  if campaign_row.id is null then return null; end if;

  select project.* into project_row from public.projects project where project.id=campaign_row.project_id;
  select version.* into campaign_terms from public.campaign_term_versions version
  where version.campaign_id=campaign_row.id and version.version=campaign_row.current_terms_version;
  select version.* into project_version from public.project_versions version
  where version.project_id=project_row.id and version.revision=campaign_terms.project_revision;
  select profile.* into creator_profile from public.profiles profile where profile.user_id=project_row.owner_user_id;

  if campaign_terms.id is null or project_version.id is null or creator_profile.user_id is null then return null; end if;

  select count(distinct commitment.supporter_user_id),coalesce(sum(commitment.amount_minor),0)
  into supporter_count,funded_amount
  from public.funding_commitments commitment
  join public.campaign_term_versions version on version.id=commitment.campaign_term_version_id
  where version.campaign_id=campaign_row.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'key',tier.tier_key,'title',tier.title,'amountMinor',tier.amount_minor,'accessPromise',tier.access_promise
  ) order by tier.position),'[]'::jsonb)
  into tiers_value
  from public.campaign_tiers tier
  where tier.campaign_term_version_id=campaign_terms.id;

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
    'tiers', tiers_value,
    'refundRules', campaign_terms.body ->> 'refundRules',
    'materialChangeRules', campaign_terms.body ->> 'materialChangeRules',
    'campaignTermsVersion', campaign_terms.version,
    'campaignTermsHash', campaign_terms.terms_hash,
    'supporterCount', supporter_count,
    'fundedAmountMinor', funded_amount
  );
end;
$$;

comment on function public.create_prebook_for_tier(text,text,text,text,text) is
  'Creates an idempotent pre-book at the exact amount of a tier bound to the campaign current immutable terms version and records the chosen tier on the commitment.';

revoke all on function public.create_prebook_for_tier(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_prebook_for_tier(text,text,text,text,text) to authenticated;

notify pgrst,'reload schema';
