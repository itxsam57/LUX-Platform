-- Bind copyright fingerprint/watermark provider work to the actual approved release asset.

create or replace function public.get_creator_media_protection_context(requested_release_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare
  release_row public.releases%rowtype;
  delivery_row public.final_delivery_versions%rowtype;
  asset_row public.production_assets%rowtype;
  rights_row public.copyright_rights_registrations%rowtype;
  job_row public.copyright_watermark_jobs%rowtype;
begin
  perform private.assert_current_session();

  select * into release_row
  from public.releases
  where public_id=trim(coalesce(requested_release_public_id,''));

  if release_row.id is null
     or release_row.creator_user_id<>auth.uid()
     or private.current_active_role(auth.uid())<>'creator'::public.app_role then
    raise exception 'media_protection_context_not_allowed' using errcode='42501';
  end if;

  select * into delivery_row from public.final_delivery_versions where id=release_row.delivery_version_id;
  select * into asset_row from public.production_assets where id=delivery_row.production_asset_id;
  select * into rights_row from public.copyright_rights_registrations where release_id=release_row.id;

  if rights_row.id is not null then
    select * into job_row
    from public.copyright_watermark_jobs
    where rights_registration_id=rights_row.id
    order by requested_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'releasePublicId',release_row.public_id,
    'bucket','production-assets',
    'objectPath',asset_row.object_path,
    'contentSha256',delivery_row.sha256,
    'rightsPublicId',rights_row.public_id,
    'perceptualFingerprint',rights_row.perceptual_fingerprint,
    'watermarkJobPublicId',job_row.public_id,
    'watermarkState',job_row.state
  );
end;
$$;

create or replace function public.apply_media_protection_watermark_result(
  requested_watermark_job_public_id text,
  requested_provider_key text,
  requested_provider_reference text,
  requested_watermark_reference text,
  requested_success boolean
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare
  job_row public.copyright_watermark_jobs%rowtype;
  provider_value text:=lower(trim(coalesce(requested_provider_key,'')));
  provider_reference_value text:=trim(coalesce(requested_provider_reference,''));
  watermark_reference_value text:=nullif(trim(coalesce(requested_watermark_reference,'')),'');
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'media_protection_result_not_allowed' using errcode='42501';
  end if;

  if provider_value !~ '^[a-z0-9][a-z0-9_-]{1,63}$'
     or char_length(provider_reference_value) not between 3 and 180
     or provider_reference_value ~ '[[:cntrl:]]'
     or (
       coalesce(requested_success,false)
       and (
         watermark_reference_value is null
         or char_length(watermark_reference_value) not between 3 and 180
         or watermark_reference_value ~ '[[:cntrl:]]'
       )
     ) then
    raise exception 'invalid_media_protection_result' using errcode='22023';
  end if;

  select * into job_row
  from public.copyright_watermark_jobs
  where public_id=trim(coalesce(requested_watermark_job_public_id,''))
  for update;

  if job_row.id is null then raise exception 'watermark_job_not_found' using errcode='22023'; end if;

  if job_row.state<>'queued' then
    if job_row.provider_reference=provider_reference_value
       and (
         (requested_success and job_row.state='completed' and job_row.watermark_reference=watermark_reference_value)
         or (not requested_success and job_row.state='failed')
       ) then
      return jsonb_build_object('publicId',job_row.public_id,'state',job_row.state,'replayed',true);
    end if;
    raise exception 'watermark_job_already_resolved' using errcode='40001';
  end if;

  update public.copyright_watermark_jobs
  set state=case when requested_success then 'completed' else 'failed' end,
      provider_reference=provider_reference_value,
      watermark_reference=case when requested_success then watermark_reference_value else null end,
      completed_at=case when requested_success then now() else null end,
      updated_at=now()
  where id=job_row.id
  returning * into job_row;

  perform private.write_audit(
    null,'media_protection_watermark_resolved','success','media-protection',null,
    jsonb_build_object(
      'watermarkJobPublicId',job_row.public_id,
      'providerKey',provider_value,
      'state',job_row.state
    )
  );

  return jsonb_build_object('publicId',job_row.public_id,'state',job_row.state,'replayed',false);
end;
$$;

revoke all on function public.get_creator_media_protection_context(text) from public,anon,authenticated;
grant execute on function public.get_creator_media_protection_context(text) to authenticated;
revoke all on function public.apply_media_protection_watermark_result(text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.apply_media_protection_watermark_result(text,text,text,text,boolean) to service_role;

notify pgrst,'reload schema';
