create or replace function public.list_funding_commitments()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  result_value jsonb;
begin
  perform private.assert_adult_profile_action();

  select coalesce(jsonb_agg(item.payload order by item.created_at desc, item.public_id desc),'[]'::jsonb)
  into result_value
  from (
    select
      commitment.created_at,
      commitment.public_id,
      jsonb_build_object(
        'publicId',commitment.public_id,
        'campaignPublicId',campaign.public_id,
        'title',project_version.title,
        'paymentState',coalesce(transaction_row.state::text,'pending'),
        'requestedMinor',commitment.amount_minor,
        'authorizedMinor',coalesce(transaction_row.authorized_minor,0),
        'capturedMinor',coalesce(transaction_row.captured_minor,0),
        'refundedMinor',coalesce(transaction_row.refunded_minor,0),
        'currency',version_row.body ->> 'currency',
        'supporterAnonymous',commitment.supporter_anonymous,
        'badge',case when badge_row.funding_commitment_id is null then null else jsonb_build_object(
          'key',badge_row.badge_key,
          'visibility',badge_row.visibility
        ) end,
        'materialChangeState',material_change.state::text,
        'refundRequestState',refund_request.state::text,
        'createdAt',commitment.created_at,
        'updatedAt',greatest(
          commitment.created_at,
          coalesce(transaction_row.updated_at,commitment.created_at),
          coalesce(badge_row.updated_at,commitment.created_at),
          coalesce(material_change.created_at,commitment.created_at),
          coalesce(refund_request.created_at,commitment.created_at)
        )
      ) as payload
    from public.funding_commitments commitment
    join public.campaign_term_versions version_row on version_row.id=commitment.campaign_term_version_id
    join public.campaigns campaign on campaign.id=version_row.campaign_id
    join public.project_versions project_version
      on project_version.project_id=campaign.project_id
     and project_version.revision=version_row.project_revision
    left join public.payment_transactions transaction_row on transaction_row.funding_commitment_id=commitment.id
    left join public.supporter_badges badge_row on badge_row.funding_commitment_id=commitment.id
    left join lateral (
      select request.state, request.created_at
      from public.funding_change_requests request
      where request.funding_commitment_id=commitment.id and request.kind='material_change'
      order by request.created_at desc, request.id desc
      limit 1
    ) material_change on true
    left join lateral (
      select request.state, request.created_at
      from public.funding_change_requests request
      where request.funding_commitment_id=commitment.id and request.kind='refund'
      order by request.created_at desc, request.id desc
      limit 1
    ) refund_request on true
    where commitment.supporter_user_id=auth.uid()
  ) item;

  return result_value;
end;
$$;

create or replace function public.register_funding_material_change(
  requested_commitment_public_id text,
  requested_expected_delivery_window text,
  requested_reason text,
  requested_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $$
declare
  commitment_row public.funding_commitments%rowtype;
  campaign_row public.campaigns%rowtype;
  original_version public.campaign_term_versions%rowtype;
  source_version public.campaign_term_versions%rowtype;
  target_version public.campaign_term_versions%rowtype;
  existing_request public.funding_change_requests%rowtype;
  request_row public.funding_change_requests%rowtype;
  normalized_delivery text := trim(coalesce(requested_expected_delivery_window,''));
  normalized_reason text := trim(coalesce(requested_reason,''));
  normalized_key text := trim(coalesce(requested_idempotency_key,''));
  normalized_body jsonb;
  target_hash text;
  next_version integer;
  candidate_public_id text;
begin
  if not private.request_is_service_role() then
    raise exception 'funding_material_change_not_allowed' using errcode = '42501';
  end if;

  if trim(coalesce(requested_commitment_public_id,'')) !~ '^fnd[0-9a-f]{24}$'
     or char_length(normalized_delivery) not between 3 and 240
     or normalized_delivery ~ '[[:cntrl:]]'
     or char_length(normalized_reason) not between 3 and 1000
     or normalized_reason ~ '[[:cntrl:]]'
     or char_length(normalized_key) not between 8 and 128
     or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception 'invalid_funding_material_change' using errcode = '22023';
  end if;

  select * into commitment_row
  from public.funding_commitments commitment
  where commitment.public_id=trim(requested_commitment_public_id)
  for update;

  if commitment_row.id is null then
    raise exception 'funding_commitment_not_found' using errcode = '22023';
  end if;

  select * into existing_request
  from public.funding_change_requests request
  where request.funding_commitment_id=commitment_row.id
    and request.idempotency_key=normalized_key
  limit 1;

  if existing_request.id is not null then
    if existing_request.kind <> 'material_change'
       or existing_request.reason is distinct from normalized_reason
       or existing_request.campaign_term_version_id is null then
      raise exception 'funding_change_idempotency_conflict' using errcode = '22023';
    end if;

    select * into target_version
    from public.campaign_term_versions version_row
    where version_row.id=existing_request.campaign_term_version_id;

    if target_version.id is null
       or target_version.body ->> 'expectedDeliveryWindow' is distinct from normalized_delivery then
      raise exception 'funding_change_idempotency_conflict' using errcode = '22023';
    end if;

    return jsonb_build_object(
      'requestPublicId',existing_request.public_id,
      'state',existing_request.state,
      'termsVersion',target_version.version,
      'termsHash',target_version.terms_hash,
      'expectedDeliveryWindow',target_version.body ->> 'expectedDeliveryWindow'
    );
  end if;

  select * into original_version
  from public.campaign_term_versions version_row
  where version_row.id=commitment_row.campaign_term_version_id;

  if original_version.id is null then
    raise exception 'funding_terms_not_found' using errcode = '22023';
  end if;

  select * into campaign_row
  from public.campaigns campaign
  where campaign.id=original_version.campaign_id
  for update;

  if campaign_row.id is null
     or campaign_row.state not in ('published','funding_closed') then
    raise exception 'funding_material_change_not_allowed' using errcode = '42501';
  end if;

  select * into source_version
  from public.campaign_term_versions version_row
  where version_row.campaign_id=campaign_row.id
    and version_row.version=coalesce(campaign_row.current_terms_version,original_version.version)
  limit 1;

  if source_version.id is null then
    source_version := original_version;
  end if;

  normalized_body := private.validate_campaign_terms(
    jsonb_set(source_version.body,'{expectedDeliveryWindow}',to_jsonb(normalized_delivery),true)
  );
  target_hash := encode(extensions.digest(convert_to(normalized_body::text,'UTF8'),'sha256'),'hex');

  if target_hash = source_version.terms_hash then
    raise exception 'funding_material_change_not_material' using errcode = '22023';
  end if;

  select * into target_version
  from public.campaign_term_versions version_row
  where version_row.campaign_id=campaign_row.id and version_row.terms_hash=target_hash
  limit 1;

  if target_version.id is null then
    select coalesce(max(version),0)+1 into next_version
    from public.campaign_term_versions
    where campaign_id=campaign_row.id;

    insert into public.campaign_term_versions(
      campaign_id,version,project_revision,contract_term_version_id,body,terms_hash,created_by_user_id
    ) values (
      campaign_row.id,next_version,source_version.project_revision,source_version.contract_term_version_id,
      normalized_body,target_hash,source_version.created_by_user_id
    ) returning * into target_version;
  end if;

  update public.campaigns
  set current_terms_version=target_version.version,
      updated_at=now()
  where id=campaign_row.id;

  select * into request_row
  from public.funding_change_requests request
  where request.funding_commitment_id=commitment_row.id
    and request.kind='material_change'
    and request.campaign_term_version_id=target_version.id
  order by request.created_at desc, request.id desc
  limit 1;

  if request_row.id is null then
    loop
      candidate_public_id := 'chg' || encode(extensions.gen_random_bytes(12),'hex');
      exit when not exists(select 1 from public.funding_change_requests request where request.public_id=candidate_public_id);
    end loop;

    insert into public.funding_change_requests(
      public_id,funding_commitment_id,kind,campaign_term_version_id,state,idempotency_key,reason
    ) values (
      candidate_public_id,commitment_row.id,'material_change',target_version.id,'pending',normalized_key,normalized_reason
    ) returning * into request_row;
  else
    if request_row.reason is distinct from normalized_reason then
      raise exception 'funding_change_target_conflict' using errcode = '22023';
    end if;
  end if;

  perform private.write_audit(
    null,'funding_material_change_registered','success','funding-material-change',null,
    jsonb_build_object(
      'commitmentPublicId',commitment_row.public_id,
      'campaignPublicId',campaign_row.public_id,
      'requestPublicId',request_row.public_id,
      'termsVersion',target_version.version,
      'termsHash',target_version.terms_hash
    )
  );

  return jsonb_build_object(
    'requestPublicId',request_row.public_id,
    'state',request_row.state,
    'termsVersion',target_version.version,
    'termsHash',target_version.terms_hash,
    'expectedDeliveryWindow',target_version.body ->> 'expectedDeliveryWindow'
  );
end;
$$;

create or replace function public.get_funding_commitment(requested_commitment_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  commitment_row public.funding_commitments%rowtype;
  version_row public.campaign_term_versions%rowtype;
  campaign_row public.campaigns%rowtype;
  project_version_row public.project_versions%rowtype;
  transaction_row public.payment_transactions%rowtype;
  badge_row public.supporter_badges%rowtype;
  change_row public.funding_change_requests%rowtype;
  change_version_row public.campaign_term_versions%rowtype;
  refund_row public.funding_change_requests%rowtype;
  updated_at_value timestamptz;
begin
  perform private.assert_adult_profile_action();

  select * into commitment_row
  from public.funding_commitments commitment
  where commitment.public_id=trim(coalesce(requested_commitment_public_id,''))
    and commitment.supporter_user_id=auth.uid();

  if commitment_row.id is null then return null; end if;

  select * into version_row from public.campaign_term_versions where id=commitment_row.campaign_term_version_id;
  select * into campaign_row from public.campaigns where id=version_row.campaign_id;
  select * into project_version_row
  from public.project_versions project_version
  where project_version.project_id=campaign_row.project_id
    and project_version.revision=version_row.project_revision
  limit 1;
  select * into transaction_row from public.payment_transactions where funding_commitment_id=commitment_row.id;
  select * into badge_row from public.supporter_badges where funding_commitment_id=commitment_row.id;
  select * into change_row from public.funding_change_requests
    where funding_commitment_id=commitment_row.id and kind='material_change'
    order by created_at desc, id desc limit 1;
  if change_row.id is not null and change_row.campaign_term_version_id is not null then
    select * into change_version_row
    from public.campaign_term_versions
    where id=change_row.campaign_term_version_id;
  end if;
  select * into refund_row from public.funding_change_requests
    where funding_commitment_id=commitment_row.id and kind='refund'
    order by created_at desc, id desc limit 1;

  updated_at_value := greatest(
    commitment_row.created_at,
    coalesce(transaction_row.updated_at,commitment_row.created_at),
    coalesce(badge_row.updated_at,commitment_row.created_at),
    coalesce(change_row.created_at,commitment_row.created_at),
    coalesce(refund_row.created_at,commitment_row.created_at)
  );

  return jsonb_build_object(
    'publicId',commitment_row.public_id,
    'campaignPublicId',campaign_row.public_id,
    'title',project_version_row.title,
    'amountMinor',commitment_row.amount_minor,
    'requestedMinor',commitment_row.amount_minor,
    'currency',version_row.body ->> 'currency',
    'supporterAnonymous',commitment_row.supporter_anonymous,
    'termsVersion',version_row.version,
    'termsHash',version_row.terms_hash,
    'expectedDeliveryWindow',version_row.body ->> 'expectedDeliveryWindow',
    'paymentState',coalesce(transaction_row.state::text,'pending'),
    'authorizedMinor',coalesce(transaction_row.authorized_minor,0),
    'capturedMinor',coalesce(transaction_row.captured_minor,0),
    'refundedMinor',coalesce(transaction_row.refunded_minor,0),
    'badge',case when badge_row.funding_commitment_id is null then null else jsonb_build_object('key',badge_row.badge_key,'visibility',badge_row.visibility) end,
    'materialChange',case when change_row.id is null then null else jsonb_build_object(
      'requestPublicId',change_row.public_id,
      'state',change_row.state,
      'termsVersion',change_version_row.version,
      'termsHash',change_version_row.terms_hash,
      'previousExpectedDeliveryWindow',version_row.body ->> 'expectedDeliveryWindow',
      'nextExpectedDeliveryWindow',change_version_row.body ->> 'expectedDeliveryWindow',
      'reason',change_row.reason
    ) end,
    'refundRequest',case when refund_row.id is null then null else jsonb_build_object(
      'requestPublicId',refund_row.public_id,
      'state',refund_row.state,
      'amountMinor',refund_row.requested_amount_minor,
      'reason',refund_row.reason
    ) end,
    'createdAt',commitment_row.created_at,
    'updatedAt',updated_at_value
  );
end;
$$;

create or replace function public.request_funding_refund(
  requested_commitment_public_id text,
  requested_amount_minor bigint,
  requested_reason text,
  requested_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $$
declare
  commitment_row public.funding_commitments%rowtype;
  transaction_row public.payment_transactions%rowtype;
  existing_row public.funding_change_requests%rowtype;
  normalized_reason text := trim(coalesce(requested_reason,''));
  normalized_key text := trim(coalesce(requested_idempotency_key,''));
  candidate_public_id text;
  refundable_minor bigint;
begin
  perform private.assert_adult_profile_action();

  if requested_amount_minor is null or requested_amount_minor <= 0
     or char_length(normalized_reason) not between 3 and 1000
     or normalized_reason ~ '[[:cntrl:]]'
     or char_length(normalized_key) not between 8 and 128
     or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception 'invalid_refund_request' using errcode = '22023';
  end if;

  select * into commitment_row
  from public.funding_commitments commitment
  where commitment.public_id=trim(coalesce(requested_commitment_public_id,''))
    and commitment.supporter_user_id=auth.uid()
  for update;

  if commitment_row.id is null then
    raise exception 'refund_not_allowed' using errcode = '42501';
  end if;

  select * into existing_row
  from public.funding_change_requests request
  where request.funding_commitment_id=commitment_row.id and request.idempotency_key=normalized_key
  limit 1;

  if existing_row.id is not null then
    if existing_row.kind <> 'refund'
       or existing_row.requested_amount_minor is distinct from requested_amount_minor
       or existing_row.reason is distinct from normalized_reason then
      raise exception 'funding_change_idempotency_conflict' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'requestPublicId',existing_row.public_id,
      'state',existing_row.state,
      'amountMinor',existing_row.requested_amount_minor,
      'reason',existing_row.reason
    );
  end if;

  select * into transaction_row
  from public.payment_transactions transaction
  where transaction.funding_commitment_id=commitment_row.id
  for update;

  refundable_minor := case
    when transaction_row.id is null then 0
    when transaction_row.state in ('authorized','captured','partially_refunded')
      then greatest(transaction_row.authorized_minor,transaction_row.captured_minor)-transaction_row.refunded_minor
    else 0
  end;

  if requested_amount_minor > refundable_minor then
    raise exception 'invalid_refund_amount' using errcode = '22023';
  end if;

  loop
    candidate_public_id := 'chg' || encode(extensions.gen_random_bytes(12),'hex');
    exit when not exists(select 1 from public.funding_change_requests request where request.public_id=candidate_public_id);
  end loop;

  insert into public.funding_change_requests(
    public_id,funding_commitment_id,kind,state,requested_amount_minor,idempotency_key,reason
  ) values (
    candidate_public_id,commitment_row.id,'refund','requested',requested_amount_minor,normalized_key,normalized_reason
  ) returning * into existing_row;

  perform private.write_audit(
    auth.uid(),'funding_refund_requested','success','/app/funding/'||commitment_row.public_id,null,
    jsonb_build_object('commitmentPublicId',commitment_row.public_id,'requestPublicId',existing_row.public_id,'amountMinor',existing_row.requested_amount_minor)
  );

  return jsonb_build_object(
    'requestPublicId',existing_row.public_id,
    'state',existing_row.state,
    'amountMinor',existing_row.requested_amount_minor,
    'reason',existing_row.reason
  );
end;
$$;

comment on function public.list_funding_commitments() is
  'Returns only the signed-in supporter safe funding dashboard projection. Internal UUIDs and processor references are omitted.';
comment on function public.register_funding_material_change(text,text,text,text) is
  'Service-only Slice 10 material campaign-term change registration. Creates an immutable terms version and pending supporter action without mutating the original commitment.';
comment on function public.get_funding_commitment(text) is
  'Returns only the signed-in supporter safe funding detail projection with exact original and pending changed-term state; internal UUIDs and processor references are omitted.';

revoke all on function public.list_funding_commitments() from public, anon, authenticated;
grant execute on function public.list_funding_commitments() to authenticated;

revoke all on function public.register_funding_material_change(text,text,text,text) from public, anon, authenticated;
grant execute on function public.register_funding_material_change(text,text,text,text) to service_role;

revoke all on function public.get_funding_commitment(text) from public, anon, authenticated;
grant execute on function public.get_funding_commitment(text) to authenticated;

revoke all on function public.request_funding_refund(text,bigint,text,text) from public, anon, authenticated;
grant execute on function public.request_funding_refund(text,bigint,text,text) to authenticated;

notify pgrst,'reload schema';
