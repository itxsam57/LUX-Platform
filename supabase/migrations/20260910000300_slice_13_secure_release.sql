create table public.releases (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^rel[0-9a-f]{24}$'),
  project_id uuid not null references public.projects(id) on delete restrict,
  delivery_version_id uuid not null unique references public.final_delivery_versions(id) on delete restrict,
  creator_user_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 2 and 180 and title !~ '[[:cntrl:]]'),
  synopsis text not null check (char_length(trim(synopsis)) between 3 and 2000 and synopsis !~ '[[:cntrl:]]'),
  poster_asset_id uuid references public.production_assets(id) on delete restrict,
  preview_asset_id uuid references public.production_assets(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 120 and idempotency_key ~ '^[A-Za-z0-9._:-]+$'),
  released_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(project_id,idempotency_key)
);

create table public.release_entitlements (
  release_id uuid not null references public.releases(id) on delete cascade,
  supporter_user_id uuid not null references auth.users(id) on delete cascade,
  source_funding_commitment_id uuid not null references public.funding_commitments(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key(release_id,supporter_user_id)
);

create table public.release_playback_sessions (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  supporter_user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null check (char_length(device_id) between 8 and 128 and device_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  last_accessed_at timestamptz,
  access_count integer not null default 0 check (access_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table public.release_asset_access_tokens (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  asset_id uuid not null references public.production_assets(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('poster','preview')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table public.release_reviews (
  release_id uuid not null references public.releases(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text check (body is null or (char_length(trim(body)) between 3 and 2000 and body !~ '[[:cntrl:]]')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(release_id,reviewer_user_id)
);

create table public.release_stolen_copy_reports (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^lkr[0-9a-f]{24}$'),
  release_id uuid not null references public.releases(id) on delete restrict,
  reporter_user_id uuid not null references auth.users(id) on delete restrict,
  reported_url text not null check (char_length(trim(reported_url)) between 8 and 2048 and reported_url ~ '^https?://'),
  url_hash text not null check (url_hash ~ '^[0-9a-f]{64}$'),
  note text not null check (char_length(trim(note)) between 3 and 2000 and note !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now(),
  unique(release_id,reporter_user_id,url_hash)
);

create index releases_project_released_idx on public.releases(project_id,released_at desc);
create index release_entitlements_supporter_idx on public.release_entitlements(supporter_user_id,granted_at desc);
create index release_sessions_active_idx on public.release_playback_sessions(release_id,supporter_user_id,expires_at desc) where revoked_at is null;
create index release_reviews_release_idx on public.release_reviews(release_id,updated_at desc);
create index release_stolen_release_idx on public.release_stolen_copy_reports(release_id,created_at desc);

alter table public.releases enable row level security;
alter table public.release_entitlements enable row level security;
alter table public.release_playback_sessions enable row level security;
alter table public.release_asset_access_tokens enable row level security;
alter table public.release_reviews enable row level security;
alter table public.release_stolen_copy_reports enable row level security;

revoke all on public.releases from public,anon,authenticated;
revoke all on public.release_entitlements from public,anon,authenticated;
revoke all on public.release_playback_sessions from public,anon,authenticated;
revoke all on public.release_asset_access_tokens from public,anon,authenticated;
revoke all on public.release_reviews from public,anon,authenticated;
revoke all on public.release_stolen_copy_reports from public,anon,authenticated;

create or replace function private.reject_release_history_mutation()
returns trigger
language plpgsql
set search_path=pg_catalog
as $$
begin
  raise exception 'immutable_release_history' using errcode='55000';
end;
$$;

create trigger releases_immutable
before update or delete on public.releases
for each row execute function private.reject_release_history_mutation();

create trigger release_stolen_copy_reports_immutable
before update or delete on public.release_stolen_copy_reports
for each row execute function private.reject_release_history_mutation();

create or replace function private.release_payment_state(release_row_id uuid,subject_user_id uuid)
returns text
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  with payment_truth as (
    select payment.captured_minor,payment.refunded_minor,payment.state
    from public.releases release
    join public.campaigns campaign on campaign.project_id=release.project_id
    join public.campaign_term_versions campaign_terms on campaign_terms.campaign_id=campaign.id
    join public.funding_commitments funding on funding.campaign_term_version_id=campaign_terms.id
    join public.payment_transactions payment on payment.funding_commitment_id=funding.id
    where release.id=release_row_id and funding.supporter_user_id=subject_user_id
  )
  select case
    when exists(select 1 from payment_truth where state in ('captured','partially_refunded') and captured_minor>refunded_minor) then 'active'
    when exists(select 1 from payment_truth where captured_minor>0) then 'revoked'
    else 'none'
  end;
$$;

create or replace function private.sync_release_entitlement(release_row_id uuid,subject_user_id uuid)
returns text
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare resolved_state text; source_commitment_id uuid;
begin
  resolved_state:=private.release_payment_state(release_row_id,subject_user_id);
  select funding.id into source_commitment_id
  from public.releases release
  join public.campaigns campaign on campaign.project_id=release.project_id
  join public.campaign_term_versions campaign_terms on campaign_terms.campaign_id=campaign.id
  join public.funding_commitments funding on funding.campaign_term_version_id=campaign_terms.id
  join public.payment_transactions payment on payment.funding_commitment_id=funding.id
  where release.id=release_row_id and funding.supporter_user_id=subject_user_id and payment.captured_minor>0
  order by payment.created_at asc
  limit 1;

  if source_commitment_id is not null then
    insert into public.release_entitlements(release_id,supporter_user_id,source_funding_commitment_id,revoked_at)
    values(release_row_id,subject_user_id,source_commitment_id,case when resolved_state='active' then null else now() end)
    on conflict(release_id,supporter_user_id) do update
      set revoked_at=case when resolved_state='active' then null else coalesce(public.release_entitlements.revoked_at,now()) end;
  end if;
  return resolved_state;
end;
$$;

create or replace function private.release_participant(release_row_id uuid,subject_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select subject_user_id is not null and exists(
    select 1
    from public.releases release
    join public.final_delivery_versions delivery on delivery.id=release.delivery_version_id
    where release.id=release_row_id
      and (
        release.creator_user_id=subject_user_id
        or exists(
          select 1 from public.participant_acceptances acceptance
          where acceptance.term_version_id=delivery.contract_term_version_id
            and acceptance.participant_user_id=subject_user_id
            and acceptance.superseded_at is null
        )
      )
  );
$$;

create or replace function private.release_asset_access_allowed(release_row_id uuid,subject_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,private
as $$
  select subject_user_id is not null
    and (
      private.release_participant(release_row_id,subject_user_id)
      or private.release_payment_state(release_row_id,subject_user_id)='active'
    );
$$;

create or replace function private.release_review_body(value text)
returns text
language plpgsql
immutable
set search_path=pg_catalog
as $$
declare normalized text:=nullif(trim(coalesce(value,'')),'');
begin
  if normalized is not null and (char_length(normalized) not between 3 and 2000 or normalized ~ '[[:cntrl:]]') then
    raise exception 'invalid_release_review' using errcode='22023';
  end if;
  return normalized;
end;
$$;

create or replace function public.create_release(
  requested_delivery_public_id text,
  requested_metadata jsonb,
  requested_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare
  delivery_row public.final_delivery_versions%rowtype;
  project_row public.projects%rowtype;
  existing_row public.releases%rowtype;
  created_row public.releases%rowtype;
  poster_row public.production_assets%rowtype;
  preview_row public.production_assets%rowtype;
  normalized_title text;
  normalized_synopsis text;
  normalized_key text:=trim(coalesce(requested_idempotency_key,''));
  poster_public_id text:=nullif(trim(coalesce(requested_metadata->>'posterAssetPublicId','')),'');
  preview_public_id text:=nullif(trim(coalesce(requested_metadata->>'previewAssetPublicId','')),'');
  candidate text;
begin
  perform private.assert_creator_project_action();
  if requested_metadata is null or jsonb_typeof(requested_metadata)<>'object'
     or requested_metadata - array['title','synopsis','posterAssetPublicId','previewAssetPublicId'] <> '{}'::jsonb then
    raise exception 'invalid_release_metadata' using errcode='22023';
  end if;
  normalized_title:=trim(coalesce(requested_metadata->>'title',''));
  normalized_synopsis:=trim(coalesce(requested_metadata->>'synopsis',''));
  if char_length(normalized_title) not between 2 and 180 or normalized_title ~ '[[:cntrl:]]'
     or char_length(normalized_synopsis) not between 3 and 2000 or normalized_synopsis ~ '[[:cntrl:]]'
     or char_length(normalized_key) not between 8 and 120 or normalized_key !~ '^[A-Za-z0-9._:-]+$'
     or (poster_public_id is not null and poster_public_id !~ '^ast[0-9a-f]{24}$')
     or (preview_public_id is not null and preview_public_id !~ '^ast[0-9a-f]{24}$') then
    raise exception 'invalid_release_metadata' using errcode='22023';
  end if;

  select * into delivery_row from public.final_delivery_versions where public_id=trim(coalesce(requested_delivery_public_id,''));
  if delivery_row.id is null then raise exception 'release_not_allowed' using errcode='42501'; end if;
  select * into project_row from public.projects where id=delivery_row.project_id and owner_user_id=auth.uid();
  if project_row.id is null or not private.delivery_is_release_ready(delivery_row.id) then
    raise exception 'release_not_allowed' using errcode='42501';
  end if;

  if poster_public_id is not null then
    select * into poster_row from public.production_assets where public_id=poster_public_id and project_id=project_row.id and kind='media';
    if poster_row.id is null then raise exception 'release_asset_not_allowed' using errcode='42501'; end if;
  end if;
  if preview_public_id is not null then
    select * into preview_row from public.production_assets where public_id=preview_public_id and project_id=project_row.id and kind='media';
    if preview_row.id is null then raise exception 'release_asset_not_allowed' using errcode='42501'; end if;
  end if;

  -- Serialize publication for this immutable delivery so concurrent duplicate clicks,
  -- including requests with different idempotency keys, cannot race the unique rows.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('release-delivery:'||delivery_row.id::text,0));

  select * into existing_row from public.releases where project_id=project_row.id and idempotency_key=normalized_key;
  if existing_row.id is not null then
    if existing_row.delivery_version_id<>delivery_row.id
       or existing_row.title<>normalized_title
       or existing_row.synopsis<>normalized_synopsis
       or existing_row.poster_asset_id is distinct from poster_row.id
       or existing_row.preview_asset_id is distinct from preview_row.id then
      raise exception 'release_idempotency_conflict' using errcode='40001';
    end if;
    return jsonb_build_object('publicId',existing_row.public_id,'releasedAt',existing_row.released_at);
  end if;
  select * into existing_row from public.releases where delivery_version_id=delivery_row.id;
  if existing_row.id is not null then
    if existing_row.title<>normalized_title
       or existing_row.synopsis<>normalized_synopsis
       or existing_row.poster_asset_id is distinct from poster_row.id
       or existing_row.preview_asset_id is distinct from preview_row.id then
      raise exception 'release_idempotency_conflict' using errcode='40001';
    end if;
    return jsonb_build_object('publicId',existing_row.public_id,'releasedAt',existing_row.released_at);
  end if;

  loop candidate:='rel'||encode(extensions.gen_random_bytes(12),'hex'); exit when not exists(select 1 from public.releases where public_id=candidate); end loop;
  insert into public.releases(public_id,project_id,delivery_version_id,creator_user_id,title,synopsis,poster_asset_id,preview_asset_id,idempotency_key)
  values(candidate,project_row.id,delivery_row.id,auth.uid(),normalized_title,normalized_synopsis,poster_row.id,preview_row.id,normalized_key)
  returning * into created_row;

  insert into public.release_entitlements(release_id,supporter_user_id,source_funding_commitment_id)
  select distinct on (funding.supporter_user_id) created_row.id,funding.supporter_user_id,funding.id
  from public.campaigns campaign
  join public.campaign_term_versions campaign_terms on campaign_terms.campaign_id=campaign.id
  join public.funding_commitments funding on funding.campaign_term_version_id=campaign_terms.id
  join public.payment_transactions payment on payment.funding_commitment_id=funding.id
  where campaign.project_id=project_row.id and payment.state in ('captured','partially_refunded') and payment.captured_minor>payment.refunded_minor
  order by funding.supporter_user_id,payment.created_at asc
  on conflict(release_id,supporter_user_id) do nothing;

  perform private.write_audit(auth.uid(),'release_published','success','/releases/'||created_row.public_id,'creator',jsonb_build_object(
    'releasePublicId',created_row.public_id,'projectPublicId',project_row.public_id,'deliveryPublicId',delivery_row.public_id,
    'deliveryVersion',delivery_row.version,'deliverySha256',delivery_row.sha256));
  return jsonb_build_object('publicId',created_row.public_id,'releasedAt',created_row.released_at);
end;
$$;

create or replace function public.list_fan_library()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare item record;
begin
  perform private.assert_current_session();
  for item in
    select distinct release.id
    from public.releases release
    join public.campaigns campaign on campaign.project_id=release.project_id
    join public.campaign_term_versions campaign_terms on campaign_terms.campaign_id=campaign.id
    join public.funding_commitments funding on funding.campaign_term_version_id=campaign_terms.id
    join public.payment_transactions payment on payment.funding_commitment_id=funding.id
    where funding.supporter_user_id=auth.uid() and payment.captured_minor>0
  loop
    perform private.sync_release_entitlement(item.id,auth.uid());
  end loop;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'publicId',release.public_id,'title',release.title,'synopsis',release.synopsis,'creatorHandle',profile.handle,
      'deliveryVersion',delivery.version,'deliverySha256',delivery.sha256,'releasedAt',release.released_at,
      'entitlementState',case when private.release_payment_state(release.id,auth.uid())='active' then 'active' else 'revoked' end,
      'playbackEligible',private.release_payment_state(release.id,auth.uid())='active' and private.delivery_is_release_ready(delivery.id),
      'posterAvailable',release.poster_asset_id is not null,'previewAvailable',release.preview_asset_id is not null,
      'myRating',review.rating,'myReview',review.body
    ) order by release.released_at desc)
    from public.release_entitlements entitlement
    join public.releases release on release.id=entitlement.release_id
    join public.final_delivery_versions delivery on delivery.id=release.delivery_version_id
    join public.profiles profile on profile.user_id=release.creator_user_id
    left join public.release_reviews review on review.release_id=release.id and review.reviewer_user_id=auth.uid()
    where entitlement.supporter_user_id=auth.uid()
  ),'[]'::jsonb);
end;
$$;

create or replace function public.get_release_detail(requested_release_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare release_row public.releases%rowtype; delivery_row public.final_delivery_versions%rowtype; creator_handle text; payment_state text:='none'; review_row public.release_reviews%rowtype;
begin
  select * into release_row from public.releases where public_id=trim(coalesce(requested_release_public_id,''));
  if release_row.id is null then return null; end if;
  select * into delivery_row from public.final_delivery_versions where id=release_row.delivery_version_id;
  select handle into creator_handle from public.profiles where user_id=release_row.creator_user_id;
  if auth.uid() is not null then
    payment_state:=private.release_payment_state(release_row.id,auth.uid());
    select * into review_row from public.release_reviews where release_id=release_row.id and reviewer_user_id=auth.uid();
  end if;
  return jsonb_build_object(
    'publicId',release_row.public_id,'title',release_row.title,'synopsis',release_row.synopsis,'creatorHandle',creator_handle,
    'deliveryVersion',delivery_row.version,'deliverySha256',delivery_row.sha256,'releasedAt',release_row.released_at,
    'entitlementState',payment_state,'playbackEligible',payment_state='active' and private.delivery_is_release_ready(delivery_row.id),
    'posterAvailable',release_row.poster_asset_id is not null,'previewAvailable',release_row.preview_asset_id is not null,
    'myRating',review_row.rating,'myReview',review_row.body,
    'ratingAverage',(select round(avg(rating)::numeric,2) from public.release_reviews where release_id=release_row.id),
    'ratingCount',(select count(*) from public.release_reviews where release_id=release_row.id)
  );
end;
$$;

create or replace function public.list_public_profile_releases(profile_handle text)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare subject_user_id uuid; profile_visibility text; viewer_id uuid:=auth.uid();
begin
  if viewer_id is not null and not coalesce(private.session_is_current(viewer_id),false) then viewer_id:=null; end if;
  select user_id,visibility into subject_user_id,profile_visibility from public.profiles where handle=lower(trim(coalesce(profile_handle,'')));
  if subject_user_id is null then return '[]'::jsonb; end if;
  if profile_visibility='private' and viewer_id is distinct from subject_user_id then return '[]'::jsonb; end if;
  if viewer_id is not null and viewer_id<>subject_user_id and exists(
    select 1 from public.profile_blocks block
    where (block.blocker_user_id=viewer_id and block.blocked_user_id=subject_user_id)
       or (block.blocker_user_id=subject_user_id and block.blocked_user_id=viewer_id)
  ) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'publicId',release.public_id,'title',release.title,'synopsis',release.synopsis,
      'deliveryVersion',delivery.version,'deliverySha256',delivery.sha256,'releasedAt',release.released_at,
      'posterAvailable',release.poster_asset_id is not null,'previewAvailable',release.preview_asset_id is not null
    ) order by release.released_at desc)
    from public.releases release
    join public.final_delivery_versions delivery on delivery.id=release.delivery_version_id
    where private.release_participant(release.id,subject_user_id)
  ),'[]'::jsonb);
end;
$$;

create or replace function public.issue_release_playback(requested_release_public_id text,requested_device_id text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare release_row public.releases%rowtype; delivery_row public.final_delivery_versions%rowtype; normalized_device text:=trim(coalesce(requested_device_id,'')); raw_token text; digest_value text; expiry timestamptz:=now()+interval '10 minutes'; active_devices bigint;
begin
  perform private.assert_current_session();
  if char_length(normalized_device) not between 8 and 128 or normalized_device !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$' then raise exception 'invalid_playback_device' using errcode='22023'; end if;
  select * into release_row from public.releases where public_id=trim(coalesce(requested_release_public_id,''));
  if release_row.id is null then raise exception 'playback_denied' using errcode='42501'; end if;
  select * into delivery_row from public.final_delivery_versions where id=release_row.delivery_version_id;
  if private.sync_release_entitlement(release_row.id,auth.uid())<>'active' or not private.delivery_is_release_ready(delivery_row.id) then raise exception 'playback_denied' using errcode='42501'; end if;

  -- Device/session caps are a transactional invariant. Without this lock two
  -- simultaneous devices could both observe the same pre-insert count.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('release-playback:'||release_row.id::text||':'||auth.uid()::text,0));
  if private.sync_release_entitlement(release_row.id,auth.uid())<>'active' then raise exception 'playback_denied' using errcode='42501'; end if;

  update public.release_playback_sessions set revoked_at=coalesce(revoked_at,now())
  where release_id=release_row.id and supporter_user_id=auth.uid() and expires_at<=now() and revoked_at is null;
  select count(distinct device_id) into active_devices from public.release_playback_sessions
  where release_id=release_row.id and supporter_user_id=auth.uid() and expires_at>now() and revoked_at is null and device_id<>normalized_device;
  if active_devices>=3 then raise exception 'playback_device_limit' using errcode='42501'; end if;
  update public.release_playback_sessions set revoked_at=coalesce(revoked_at,now())
  where release_id=release_row.id and supporter_user_id=auth.uid() and device_id=normalized_device and expires_at>now() and revoked_at is null;

  raw_token:=encode(extensions.gen_random_bytes(32),'hex');
  digest_value:=encode(extensions.digest(convert_to(raw_token,'UTF8'),'sha256'),'hex');
  insert into public.release_playback_sessions(release_id,supporter_user_id,device_id,token_hash,expires_at)
  values(release_row.id,auth.uid(),normalized_device,digest_value,expiry);
  perform private.write_audit(auth.uid(),'release_playback_issued','success','/releases/'||release_row.public_id,private.current_active_role(auth.uid()),jsonb_build_object('releasePublicId',release_row.public_id,'deviceIdHash',encode(extensions.digest(convert_to(normalized_device,'UTF8'),'sha256'),'hex'),'expiresAt',expiry));
  return jsonb_build_object('playbackPath','/playback/'||raw_token,'expiresAt',expiry);
end;
$$;

create or replace function public.resolve_release_playback(requested_token text)
returns text
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare session_row public.release_playback_sessions%rowtype; release_row public.releases%rowtype; delivery_row public.final_delivery_versions%rowtype; asset_row public.production_assets%rowtype; digest_value text;
begin
  perform private.assert_current_session();
  if trim(coalesce(requested_token,'')) !~ '^[0-9a-f]{64}$' then return null; end if;
  digest_value:=encode(extensions.digest(convert_to(trim(requested_token),'UTF8'),'sha256'),'hex');
  select * into session_row from public.release_playback_sessions where token_hash=digest_value and supporter_user_id=auth.uid() and expires_at>now() and revoked_at is null for update;
  if session_row.id is null then return null; end if;
  select * into release_row from public.releases where id=session_row.release_id;
  select * into delivery_row from public.final_delivery_versions where id=release_row.delivery_version_id;
  if private.release_payment_state(release_row.id,auth.uid())<>'active' or not private.delivery_is_release_ready(delivery_row.id) then
    update public.release_playback_sessions set revoked_at=now() where id=session_row.id;
    return null;
  end if;
  select * into asset_row from public.production_assets where id=delivery_row.production_asset_id;
  if asset_row.id is null then return null; end if;
  update public.release_playback_sessions set last_accessed_at=now(),access_count=access_count+1 where id=session_row.id;
  perform private.write_audit(auth.uid(),'release_playback_resolved','success','release-playback',private.current_active_role(auth.uid()),jsonb_build_object('releasePublicId',release_row.public_id));
  return asset_row.object_path;
end;
$$;

create or replace function public.issue_release_asset_access(requested_release_public_id text,requested_kind text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare release_row public.releases%rowtype; asset_id uuid; normalized_kind text:=lower(trim(coalesce(requested_kind,''))); raw_token text; digest_value text; expiry timestamptz:=now()+interval '5 minutes';
begin
  perform private.assert_current_session();
  select * into release_row from public.releases where public_id=trim(coalesce(requested_release_public_id,''));
  if release_row.id is null or normalized_kind not in ('poster','preview') then raise exception 'release_asset_denied' using errcode='42501'; end if;
  if not private.release_asset_access_allowed(release_row.id,auth.uid()) then raise exception 'release_asset_denied' using errcode='42501'; end if;
  asset_id:=case normalized_kind when 'poster' then release_row.poster_asset_id else release_row.preview_asset_id end;
  if asset_id is null then raise exception 'release_asset_denied' using errcode='42501'; end if;
  raw_token:=encode(extensions.gen_random_bytes(32),'hex');
  digest_value:=encode(extensions.digest(convert_to(raw_token,'UTF8'),'sha256'),'hex');
  insert into public.release_asset_access_tokens(release_id,asset_id,actor_user_id,kind,token_hash,expires_at)
  values(release_row.id,asset_id,auth.uid(),normalized_kind,digest_value,expiry);
  return jsonb_build_object('assetPath','/release-assets/'||raw_token,'expiresAt',expiry);
end;
$$;

create or replace function public.resolve_release_asset_access(requested_token text)
returns text
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare token_row public.release_asset_access_tokens%rowtype; asset_row public.production_assets%rowtype; digest_value text;
begin
  perform private.assert_current_session();
  if trim(coalesce(requested_token,'')) !~ '^[0-9a-f]{64}$' then return null; end if;
  digest_value:=encode(extensions.digest(convert_to(trim(requested_token),'UTF8'),'sha256'),'hex');
  select * into token_row from public.release_asset_access_tokens where token_hash=digest_value and actor_user_id=auth.uid() and expires_at>now() for update;
  if token_row.id is null then return null; end if;
  if not private.release_asset_access_allowed(token_row.release_id,auth.uid()) then return null; end if;
  select * into asset_row from public.production_assets where id=token_row.asset_id;
  if asset_row.id is null then return null; end if;
  update public.release_asset_access_tokens set used_at=now() where id=token_row.id;
  return asset_row.object_path;
end;
$$;

create or replace function public.submit_release_review(requested_release_public_id text,requested_rating integer,requested_body text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare release_row public.releases%rowtype; delivery_row public.final_delivery_versions%rowtype; normalized_body text;
begin
  perform private.assert_current_session();
  if requested_rating not between 1 and 5 then raise exception 'invalid_release_review' using errcode='22023'; end if;
  normalized_body:=private.release_review_body(requested_body);
  select * into release_row from public.releases where public_id=trim(coalesce(requested_release_public_id,''));
  if release_row.id is null then raise exception 'release_review_denied' using errcode='42501'; end if;
  select * into delivery_row from public.final_delivery_versions where id=release_row.delivery_version_id;
  if private.sync_release_entitlement(release_row.id,auth.uid())<>'active' or not private.delivery_is_release_ready(delivery_row.id) then raise exception 'release_review_denied' using errcode='42501'; end if;
  insert into public.release_reviews(release_id,reviewer_user_id,rating,body)
  values(release_row.id,auth.uid(),requested_rating,normalized_body)
  on conflict(release_id,reviewer_user_id) do update set rating=excluded.rating,body=excluded.body,updated_at=now();
  perform private.write_audit(auth.uid(),'release_review_saved','success','/releases/'||release_row.public_id,private.current_active_role(auth.uid()),jsonb_build_object('releasePublicId',release_row.public_id,'rating',requested_rating));
  return jsonb_build_object('saved',true,'rating',requested_rating,'body',normalized_body);
end;
$$;

create or replace function public.report_release_stolen_copy(requested_release_public_id text,requested_url text,requested_note text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare release_row public.releases%rowtype; normalized_url text:=trim(coalesce(requested_url,'')); normalized_note text:=trim(coalesce(requested_note,'')); hash_value text; existing_row public.release_stolen_copy_reports%rowtype; created_row public.release_stolen_copy_reports%rowtype; candidate text;
begin
  perform private.assert_current_session();
  if char_length(normalized_url) not between 8 and 2048 or normalized_url !~ '^https?://'
     or char_length(normalized_note) not between 3 and 2000 or normalized_note ~ '[[:cntrl:]]' then raise exception 'invalid_stolen_copy_report' using errcode='22023'; end if;
  select * into release_row from public.releases where public_id=trim(coalesce(requested_release_public_id,''));
  if release_row.id is null then raise exception 'stolen_copy_report_denied' using errcode='42501'; end if;
  hash_value:=encode(extensions.digest(convert_to(lower(normalized_url),'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('release-report:'||release_row.id::text||':'||auth.uid()::text||':'||hash_value,0));
  select * into existing_row from public.release_stolen_copy_reports where release_id=release_row.id and reporter_user_id=auth.uid() and url_hash=hash_value;
  if existing_row.id is not null then return jsonb_build_object('publicId',existing_row.public_id,'createdAt',existing_row.created_at); end if;
  loop candidate:='lkr'||encode(extensions.gen_random_bytes(12),'hex'); exit when not exists(select 1 from public.release_stolen_copy_reports where public_id=candidate); end loop;
  insert into public.release_stolen_copy_reports(public_id,release_id,reporter_user_id,reported_url,url_hash,note)
  values(candidate,release_row.id,auth.uid(),normalized_url,hash_value,normalized_note) returning * into created_row;
  perform private.write_audit(auth.uid(),'release_stolen_copy_reported','success','/releases/'||release_row.public_id,private.current_active_role(auth.uid()),jsonb_build_object('releasePublicId',release_row.public_id,'reportPublicId',created_row.public_id,'urlHash',hash_value));
  return jsonb_build_object('publicId',created_row.public_id,'createdAt',created_row.created_at);
end;
$$;

revoke all on function private.reject_release_history_mutation() from public,anon,authenticated;
revoke all on function private.release_payment_state(uuid,uuid) from public,anon,authenticated;
revoke all on function private.sync_release_entitlement(uuid,uuid) from public,anon,authenticated;
revoke all on function private.release_participant(uuid,uuid) from public,anon,authenticated;
revoke all on function private.release_asset_access_allowed(uuid,uuid) from public,anon,authenticated;
revoke all on function private.release_review_body(text) from public,anon,authenticated;
revoke all on function public.create_release(text,jsonb,text) from public,anon,authenticated;
revoke all on function public.list_fan_library() from public,anon,authenticated;
revoke all on function public.get_release_detail(text) from public,anon,authenticated;
revoke all on function public.list_public_profile_releases(text) from public,anon,authenticated;
revoke all on function public.issue_release_playback(text,text) from public,anon,authenticated;
revoke all on function public.resolve_release_playback(text) from public,anon,authenticated;
revoke all on function public.issue_release_asset_access(text,text) from public,anon,authenticated;
revoke all on function public.resolve_release_asset_access(text) from public,anon,authenticated;
revoke all on function public.submit_release_review(text,integer,text) from public,anon,authenticated;
revoke all on function public.report_release_stolen_copy(text,text,text) from public,anon,authenticated;

grant execute on function public.create_release(text,jsonb,text) to authenticated;
grant execute on function public.list_fan_library() to authenticated;
grant execute on function public.get_release_detail(text) to anon,authenticated;
grant execute on function public.list_public_profile_releases(text) to anon,authenticated;
grant execute on function public.issue_release_playback(text,text) to authenticated;
grant execute on function public.resolve_release_playback(text) to authenticated;
grant execute on function public.issue_release_asset_access(text,text) to authenticated;
grant execute on function public.resolve_release_asset_access(text) to authenticated;
grant execute on function public.submit_release_review(text,integer,text) to authenticated;
grant execute on function public.report_release_stolen_copy(text,text,text) to authenticated;
