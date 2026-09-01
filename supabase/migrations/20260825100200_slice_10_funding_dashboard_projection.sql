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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'publicId', commitment.public_id,
        'campaignPublicId', campaign.public_id,
        'title', project_version.title,
        'amountMinor', commitment.amount_minor,
        'currency', original_terms.body ->> 'currency',
        'supporterAnonymous', commitment.supporter_anonymous,
        'termsVersion', original_terms.version,
        'termsHash', original_terms.terms_hash,
        'expectedDeliveryWindow', original_terms.body ->> 'expectedDeliveryWindow',
        'paymentState', case when payment.id is null then 'pending' else payment.state end,
        'requestedMinor', commitment.amount_minor,
        'authorizedMinor', case when payment.id is null then 0 else payment.authorized_minor end,
        'capturedMinor', case when payment.id is null then 0 else payment.captured_minor end,
        'refundedMinor', case when payment.id is null then 0 else payment.refunded_minor end,
        'sandbox', case when payment.id is null then false else payment.provider_key = 'sandbox' end,
        'badge', case
          when badge.funding_commitment_id is null then null
          else jsonb_build_object('key',badge.badge_key,'visibility',badge.visibility)
        end,
        'materialChangeState', material.request_state,
        'refundRequestState', refund.request_state,
        'materialChange', case
          when material.request_id is null then null
          else jsonb_build_object(
            'requestPublicId', material.request_public_id,
            'state', material.request_state,
            'termsVersion', material.target_version,
            'termsHash', material.target_hash,
            'previousExpectedDeliveryWindow', original_terms.body ->> 'expectedDeliveryWindow',
            'nextExpectedDeliveryWindow', material.target_body ->> 'expectedDeliveryWindow',
            'reason', material.reason
          )
        end,
        'refundRequest', case
          when refund.request_id is null then null
          else jsonb_build_object(
            'requestPublicId', refund.request_public_id,
            'state', refund.request_state,
            'amountMinor', refund.requested_amount_minor,
            'reason', refund.reason
          )
        end,
        'createdAt', commitment.created_at,
        'updatedAt', greatest(
          commitment.updated_at,
          coalesce(payment.updated_at, commitment.updated_at),
          coalesce(badge.updated_at, commitment.updated_at),
          coalesce(material.changed_at, commitment.updated_at),
          coalesce(refund.changed_at, commitment.updated_at)
        )
      ) order by commitment.created_at desc, commitment.public_id desc
    ),
    '[]'::jsonb
  ) into result_value
  from public.funding_commitments commitment
  join public.campaign_term_versions original_terms
    on original_terms.id = commitment.campaign_term_version_id
  join public.campaigns campaign
    on campaign.id = original_terms.campaign_id
  join public.project_versions project_version
    on project_version.project_id = campaign.project_id
   and project_version.revision = original_terms.project_revision
  left join public.payment_transactions payment
    on payment.funding_commitment_id = commitment.id
  left join public.supporter_badges badge
    on badge.funding_commitment_id = commitment.id
  left join lateral (
    select
      change_request.id as request_id,
      change_request.public_id as request_public_id,
      change_request.state as request_state,
      change_request.reason,
      coalesce(change_request.resolved_at,change_request.created_at) as changed_at,
      target.version as target_version,
      target.terms_hash as target_hash,
      target.body as target_body
    from public.funding_change_requests change_request
    join public.campaign_term_versions target
      on target.id = change_request.campaign_term_version_id
    where change_request.funding_commitment_id = commitment.id
      and change_request.kind = 'material_change'
    order by change_request.created_at desc, change_request.id desc
    limit 1
  ) material on true
  left join lateral (
    select
      change_request.id as request_id,
      change_request.public_id as request_public_id,
      change_request.state as request_state,
      change_request.requested_amount_minor,
      change_request.reason,
      coalesce(change_request.resolved_at,change_request.created_at) as changed_at
    from public.funding_change_requests change_request
    where change_request.funding_commitment_id = commitment.id
      and change_request.kind = 'refund'
    order by change_request.created_at desc, change_request.id desc
    limit 1
  ) refund on true
  where commitment.supporter_user_id = auth.uid();

  return result_value;
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
  item jsonb;
begin
  for item in select value from jsonb_array_elements(public.list_funding_commitments()) loop
    if item ->> 'publicId' = trim(coalesce(requested_commitment_public_id,'')) then
      return item;
    end if;
  end loop;
  return null;
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
  normalized_window text := trim(coalesce(requested_expected_delivery_window,''));
  normalized_reason text := trim(coalesce(requested_reason,''));
  normalized_key text := trim(coalesce(requested_idempotency_key,''));
  candidate_body jsonb;
  normalized_body jsonb;
  target_hash text;
  next_version integer;
  candidate_public_id text;
begin
  if not private.request_is_service_role() then
    raise exception 'funding_material_change_not_allowed' using errcode = '42501';
  end if;

  if trim(coalesce(requested_commitment_public_id,'')) !~ '^fnd[0-9a-f]{24}$'
     or char_length(normalized_window) not between 3 and 240
     or normalized_window ~ '[[:cntrl:]]'
     or char_length(normalized_reason) not between 3 and 1000
     or normalized_reason ~ '[[:cntrl:]]'
     or char_length(normalized_key) not between 8 and 128
     or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception 'invalid_funding_material_change' using errcode = '22023';
  end if;

  select * into commitment_row
  from public.funding_commitments commitment
  where commitment.public_id = trim(requested_commitment_public_id)
  for update;

  if commitment_row.id is null then
    raise exception 'funding_commitment_not_found' using errcode = '22023';
  end if;

  select * into existing_request
  from public.funding_change_requests change_request
  where change_request.funding_commitment_id = commitment_row.id
    and change_request.idempotency_key = normalized_key
  limit 1;

  if existing_request.id is not null then
    if existing_request.kind <> 'material_change'
       or coalesce(existing_request.reason,'') <> normalized_reason then
      raise exception 'funding_material_change_idempotency_conflict' using errcode = '22023';
    end if;

    select * into target_version
    from public.campaign_term_versions version
    where version.id = existing_request.campaign_term_version_id;

    if target_version.id is null
       or target_version.body ->> 'expectedDeliveryWindow' <> normalized_window then
      raise exception 'funding_material_change_idempotency_conflict' using errcode = '22023';
    end if;

    return jsonb_build_object(
      'requestPublicId', existing_request.public_id,
      'state', existing_request.state,
      'termsVersion', target_version.version,
      'termsHash', target_version.terms_hash,
      'expectedDeliveryWindow', target_version.body ->> 'expectedDeliveryWindow'
    );
  end if;

  select * into original_version
  from public.campaign_term_versions version
  where version.id = commitment_row.campaign_term_version_id;

  if original_version.id is null then
    raise exception 'funding_material_change_not_available' using errcode = '22023';
  end if;

  select * into campaign_row
  from public.campaigns campaign
  where campaign.id=original_version.campaign_id
  for update;

  if campaign_row.id is null or campaign_row.state not in ('published','funding_closed') then
    raise exception 'funding_material_change_not_allowed' using errcode = '42501';
  end if;

  select * into source_version
  from public.campaign_term_versions version
  where version.campaign_id=campaign_row.id
    and version.version=campaign_row.current_terms_version
  limit 1;
  if source_version.id is null then source_version := original_version; end if;

  candidate_body := jsonb_set(
    source_version.body,
    '{expectedDeliveryWindow}',
    to_jsonb(normalized_window),
    true
  );
  normalized_body := private.validate_campaign_terms(candidate_body);
  target_hash := encode(extensions.digest(convert_to(normalized_body::text,'UTF8'),'sha256'),'hex');

  if target_hash = source_version.terms_hash then
    raise exception 'funding_material_change_not_material' using errcode = '22023';
  end if;

  select * into target_version
  from public.campaign_term_versions version
  where version.campaign_id = source_version.campaign_id
    and version.terms_hash = target_hash
  limit 1;

  if target_version.id is null then
    select coalesce(max(version),0) + 1 into next_version
    from public.campaign_term_versions
    where campaign_id = source_version.campaign_id;

    insert into public.campaign_term_versions(
      campaign_id,
      version,
      project_revision,
      contract_term_version_id,
      body,
      terms_hash,
      created_by_user_id
    ) values (
      source_version.campaign_id,
      next_version,
      source_version.project_revision,
      source_version.contract_term_version_id,
      normalized_body,
      target_hash,
      source_version.created_by_user_id
    ) returning * into target_version;
  end if;

  update public.campaigns
  set current_terms_version=target_version.version,
      updated_at=now()
  where id=campaign_row.id;

  loop
    candidate_public_id := 'chg' || encode(extensions.gen_random_bytes(12),'hex');
    exit when not exists(
      select 1 from public.funding_change_requests existing
      where existing.public_id = candidate_public_id
    );
  end loop;

  insert into public.funding_change_requests(
    public_id,
    funding_commitment_id,
    kind,
    campaign_term_version_id,
    state,
    idempotency_key,
    reason
  ) values (
    candidate_public_id,
    commitment_row.id,
    'material_change',
    target_version.id,
    'pending',
    normalized_key,
    normalized_reason
  ) returning * into request_row;

  perform private.write_audit(
    null,
    'funding_material_change_registered',
    'success',
    'funding-material-change',
    null,
    jsonb_build_object(
      'commitmentPublicId', commitment_row.public_id,
      'campaignPublicId', campaign_row.public_id,
      'requestPublicId', request_row.public_id,
      'termsVersion', target_version.version,
      'termsHash', target_version.terms_hash
    )
  );

  return jsonb_build_object(
    'requestPublicId', request_row.public_id,
    'state', request_row.state,
    'termsVersion', target_version.version,
    'termsHash', target_version.terms_hash,
    'expectedDeliveryWindow', target_version.body ->> 'expectedDeliveryWindow'
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
  request_row public.funding_change_requests%rowtype;
  normalized_reason text := trim(coalesce(requested_reason,''));
  normalized_key text := trim(coalesce(requested_idempotency_key,''));
  candidate_public_id text;
  refundable_minor bigint;
begin
  perform private.assert_adult_profile_action();

  select * into commitment_row
  from public.funding_commitments commitment
  where commitment.public_id=trim(coalesce(requested_commitment_public_id,''))
    and commitment.supporter_user_id=auth.uid()
  for update;

  if commitment_row.id is null then
    raise exception 'funding_commitment_not_found' using errcode = '42501';
  end if;

  select * into request_row
  from public.funding_change_requests change_request
  where change_request.funding_commitment_id=commitment_row.id
    and change_request.idempotency_key=normalized_key
  limit 1;

  if request_row.id is not null then
    if request_row.kind <> 'refund'
       or request_row.requested_amount_minor is distinct from requested_amount_minor
       or coalesce(request_row.reason,'') <> normalized_reason then
      raise exception 'refund_idempotency_conflict' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'requestPublicId',request_row.public_id,
      'state',request_row.state,
      'amountMinor',request_row.requested_amount_minor,
      'reason',request_row.reason
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

  if requested_amount_minor is null or requested_amount_minor < 1
     or requested_amount_minor > refundable_minor then
    raise exception 'invalid_refund_amount' using errcode = '22023';
  end if;

  if char_length(normalized_reason) not between 3 and 1000
     or normalized_reason ~ '[[:cntrl:]]'
     or char_length(normalized_key) not between 8 and 128
     or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception 'invalid_refund_request' using errcode = '22023';
  end if;

  loop
    candidate_public_id := 'chg' || encode(extensions.gen_random_bytes(12),'hex');
    exit when not exists(select 1 from public.funding_change_requests existing where existing.public_id=candidate_public_id);
  end loop;

  insert into public.funding_change_requests(
    public_id,funding_commitment_id,kind,requested_amount_minor,state,idempotency_key,reason
  ) values (
    candidate_public_id,commitment_row.id,'refund',requested_amount_minor,'requested',normalized_key,normalized_reason
  ) returning * into request_row;

  perform private.write_audit(
    auth.uid(),'funding_refund_requested','success','/app/funding/'||commitment_row.public_id,null,
    jsonb_build_object('commitmentPublicId',commitment_row.public_id,'requestPublicId',request_row.public_id,'amountMinor',request_row.requested_amount_minor)
  );

  return jsonb_build_object(
    'requestPublicId',request_row.public_id,
    'state',request_row.state,
    'amountMinor',request_row.requested_amount_minor,
    'reason',request_row.reason
  );
end;
$$;

comment on function public.list_funding_commitments() is
  'Returns only the signed-in supporter safe funding dashboard projection. Internal UUIDs and processor references are omitted.';
comment on function public.register_funding_material_change(text,text,text,text) is
  'Service-only Slice 10 material campaign-term change registration. Creates an immutable terms version and pending supporter action without mutating the original commitment.';

revoke all on function public.list_funding_commitments() from public, anon, authenticated;
grant execute on function public.list_funding_commitments() to authenticated;

revoke all on function public.register_funding_material_change(text,text,text,text) from public, anon, authenticated;
grant execute on function public.register_funding_material_change(text,text,text,text) to service_role;

revoke all on function public.get_funding_commitment(text) from public, anon, authenticated;
grant execute on function public.get_funding_commitment(text) to authenticated;

revoke all on function public.request_funding_refund(text,bigint,text,text) from public, anon, authenticated;
grant execute on function public.request_funding_refund(text,bigint,text,text) to authenticated;

notify pgrst, 'reload schema';
