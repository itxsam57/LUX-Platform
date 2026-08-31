create table public.funding_commitments (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  campaign_term_version_id uuid not null references public.campaign_term_versions(id) on delete restrict,
  supporter_user_id uuid not null references auth.users(id) on delete restrict,
  amount_minor bigint not null check (amount_minor between 1 and 9007199254740991),
  supporter_anonymous boolean not null,
  badge_choice text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint funding_commitment_public_id_format check (public_id ~ '^fnd[0-9a-f]{24}$'),
  constraint funding_commitment_badge_choice check (
    badge_choice is null
    or (
      char_length(badge_choice) between 1 and 64
      and badge_choice ~ '^[A-Za-z0-9][A-Za-z0-9 ._-]*$'
    )
  ),
  constraint funding_commitment_idempotency_key check (
    char_length(idempotency_key) between 8 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  unique(supporter_user_id, idempotency_key)
);

create index funding_commitments_terms_created_idx
  on public.funding_commitments(campaign_term_version_id, created_at desc);
create index funding_commitments_supporter_created_idx
  on public.funding_commitments(supporter_user_id, created_at desc);

alter table public.funding_commitments enable row level security;

revoke all on public.funding_commitments from public, anon, authenticated;

create or replace function public.create_prebook(
  requested_campaign_public_id text,
  requested_amount_minor bigint,
  requested_supporter_visibility text,
  requested_badge_choice text,
  requested_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $$
declare
  supporter_id uuid;
  supporter_profile public.profiles%rowtype;
  campaign_row public.campaigns%rowtype;
  project_row public.projects%rowtype;
  version_row public.campaign_term_versions%rowtype;
  existing_row public.funding_commitments%rowtype;
  commitment_row public.funding_commitments%rowtype;
  normalized_visibility text;
  normalized_badge text;
  normalized_key text;
  resolved_anonymous boolean;
  deadline_at timestamptz;
  candidate_public_id text;
begin
  perform private.assert_adult_profile_action();
  supporter_id := auth.uid();

  if supporter_id is null then
    raise exception 'prebook_not_allowed' using errcode = '42501';
  end if;

  if requested_amount_minor is null
     or requested_amount_minor < 1
     or requested_amount_minor > 9007199254740991 then
    raise exception 'invalid_prebook_amount' using errcode = '22023';
  end if;

  normalized_visibility := trim(coalesce(requested_supporter_visibility,''));
  if normalized_visibility not in ('default','anonymous','public') then
    raise exception 'invalid_supporter_visibility' using errcode = '22023';
  end if;

  normalized_key := trim(coalesce(requested_idempotency_key,''));
  if char_length(normalized_key) not between 8 and 128
     or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception 'invalid_prebook_idempotency_key' using errcode = '22023';
  end if;

  normalized_badge := nullif(trim(coalesce(requested_badge_choice,'')),'');
  if normalized_badge is not null
     and (
       char_length(normalized_badge) > 64
       or normalized_badge !~ '^[A-Za-z0-9][A-Za-z0-9 ._-]*$'
     ) then
    raise exception 'invalid_badge_choice' using errcode = '22023';
  end if;

  select commitment.* into existing_row
  from public.funding_commitments commitment
  where commitment.supporter_user_id = supporter_id
    and commitment.idempotency_key = normalized_key
  limit 1;

  if existing_row.id is not null then
    select version.* into version_row
    from public.campaign_term_versions version
    where version.id = existing_row.campaign_term_version_id;

    return jsonb_build_object(
      'publicId', existing_row.public_id,
      'amountMinor', existing_row.amount_minor,
      'supporterAnonymous', existing_row.supporter_anonymous,
      'badgeChoice', existing_row.badge_choice,
      'termsVersion', version_row.version,
      'termsHash', version_row.terms_hash,
      'createdAt', existing_row.created_at
    );
  end if;

  select profile.* into supporter_profile
  from public.profiles profile
  where profile.user_id = supporter_id;

  if supporter_profile.user_id is null then
    raise exception 'prebook_not_allowed' using errcode = '42501';
  end if;

  select campaign.* into campaign_row
  from public.campaigns campaign
  where campaign.public_id = trim(coalesce(requested_campaign_public_id,''))
  for update;

  if campaign_row.id is null
     or campaign_row.state <> 'published'
     or not campaign_row.payment_environment_eligible
     or campaign_row.current_terms_version is null then
    raise exception 'prebook_not_allowed' using errcode = '42501';
  end if;

  select project.* into project_row
  from public.projects project
  where project.id = campaign_row.project_id;

  if project_row.id is null or project_row.funding_restricted then
    raise exception 'prebook_not_allowed' using errcode = '42501';
  end if;

  select version.* into version_row
  from public.campaign_term_versions version
  where version.campaign_id = campaign_row.id
    and version.version = campaign_row.current_terms_version;

  if version_row.id is null then
    raise exception 'prebook_not_allowed' using errcode = '42501';
  end if;

  begin
    deadline_at := (version_row.body ->> 'deadline')::timestamptz;
  exception when others then
    raise exception 'prebook_not_allowed' using errcode = '42501';
  end;

  if deadline_at <= now() then
    raise exception 'prebook_not_allowed' using errcode = '42501';
  end if;

  resolved_anonymous := case normalized_visibility
    when 'anonymous' then true
    when 'public' then false
    else supporter_profile.supporter_anonymity_default
  end;

  loop
    candidate_public_id := 'fnd' || encode(extensions.gen_random_bytes(12),'hex');
    exit when not exists (
      select 1 from public.funding_commitments commitment
      where commitment.public_id = candidate_public_id
    );
  end loop;

  insert into public.funding_commitments(
    public_id,
    campaign_term_version_id,
    supporter_user_id,
    amount_minor,
    supporter_anonymous,
    badge_choice,
    idempotency_key
  ) values (
    candidate_public_id,
    version_row.id,
    supporter_id,
    requested_amount_minor,
    resolved_anonymous,
    normalized_badge,
    normalized_key
  )
  returning * into commitment_row;

  perform private.write_audit(
    supporter_id,
    'funding_prebook_created',
    'success',
    '/app/funding/' || commitment_row.public_id,
    private.current_active_role(supporter_id),
    jsonb_build_object(
      'commitmentPublicId', commitment_row.public_id,
      'campaignPublicId', campaign_row.public_id,
      'termsVersion', version_row.version,
      'termsHash', version_row.terms_hash,
      'amountMinor', commitment_row.amount_minor,
      'supporterAnonymous', commitment_row.supporter_anonymous
    )
  );

  return jsonb_build_object(
    'publicId', commitment_row.public_id,
    'amountMinor', commitment_row.amount_minor,
    'supporterAnonymous', commitment_row.supporter_anonymous,
    'badgeChoice', commitment_row.badge_choice,
    'termsVersion', version_row.version,
    'termsHash', version_row.terms_hash,
    'createdAt', commitment_row.created_at
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
begin
  select campaign.* into campaign_row
  from public.campaigns campaign
  where campaign.public_id = trim(requested_campaign_public_id)
    and campaign.state in ('published','funding_closed')
  limit 1;

  if campaign_row.id is null then
    return null;
  end if;

  select project.* into project_row
  from public.projects project
  where project.id = campaign_row.project_id;

  select version.* into campaign_terms
  from public.campaign_term_versions version
  where version.campaign_id = campaign_row.id
    and version.version = campaign_row.current_terms_version;

  select version.* into project_version
  from public.project_versions version
  where version.project_id = project_row.id
    and version.revision = campaign_terms.project_revision;

  select profile.* into creator_profile
  from public.profiles profile
  where profile.user_id = project_row.owner_user_id;

  if campaign_terms.id is null
     or project_version.id is null
     or creator_profile.user_id is null then
    return null;
  end if;

  select
    count(distinct commitment.supporter_user_id),
    coalesce(sum(commitment.amount_minor),0)
  into supporter_count, funded_amount
  from public.funding_commitments commitment
  join public.campaign_term_versions version
    on version.id = commitment.campaign_term_version_id
  where version.campaign_id = campaign_row.id;

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
    'supporterCount', supporter_count,
    'fundedAmountMinor', funded_amount
  );
end;
$$;

comment on function public.create_prebook(text,bigint,text,text,text) is
  'Creates an idempotent Slice 9 pre-book commitment bound to the campaign exact current immutable terms version. It does not represent processor authorization, settlement, payout, or ledger state.';

comment on function public.get_public_campaign(text) is
  'Returns the public-safe campaign projection with supporter count and funded amount derived from durable Slice 9 commitments. No supporter identity or internal funding identifiers are exposed.';

revoke all on function public.create_prebook(text,bigint,text,text,text) from public, anon, authenticated;
grant execute on function public.create_prebook(text,bigint,text,text,text) to authenticated;

notify pgrst, 'reload schema';
