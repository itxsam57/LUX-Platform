-- Align agency representation with the dedicated performer workspace while preserving legacy creator-backed performers.

create or replace function public.invite_performer_representation(requested_performer_handle text,requested_terms jsonb)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare agency_row public.agency_profiles%rowtype; performer_id uuid; created_row public.agency_representation_agreements%rowtype; candidate_public_id text; normalized_terms jsonb; commission_numeric numeric; commission_bps integer; notice_numeric numeric; notice_days integer;
begin
  perform private.assert_adult_profile_action();
  if not private.agency_staff_has_capability(auth.uid(),'opportunities') then raise exception 'agency_representation_invite_denied' using errcode='42501'; end if;
  select * into agency_row from public.agency_profiles where id=private.current_agency_id(auth.uid()) and verification_status='approved';
  select user_id into performer_id from public.profiles where handle=lower(trim(coalesce(requested_performer_handle,''))) limit 1;
  if agency_row.id is null
     or performer_id is null
     or performer_id=agency_row.owner_user_id
     or not exists(
       select 1
       from public.workspace_memberships
       where user_id=performer_id
         and role in ('creator'::public.app_role,'performer'::public.app_role)
         and status='approved'
     ) then
    raise exception 'performer_representation_unavailable' using errcode='42501';
  end if;
  if requested_terms is null or jsonb_typeof(requested_terms)<>'object' or requested_terms-'communications'-'opportunities'-'negotiations'-'projectAdmin'-'contractAdmin'-'earningsVisibility'-'commissionBasisPoints'-'revocationNoticeDays'<>'{}'::jsonb then raise exception 'invalid_representation_terms' using errcode='22023'; end if;
  if jsonb_typeof(requested_terms->'communications')<>'boolean' or jsonb_typeof(requested_terms->'opportunities')<>'boolean' or jsonb_typeof(requested_terms->'negotiations')<>'boolean' or jsonb_typeof(requested_terms->'projectAdmin')<>'boolean' or jsonb_typeof(requested_terms->'contractAdmin')<>'boolean' or jsonb_typeof(requested_terms->'earningsVisibility')<>'boolean' then raise exception 'invalid_representation_terms' using errcode='22023'; end if;
  begin commission_numeric:=(requested_terms->>'commissionBasisPoints')::numeric; notice_numeric:=(requested_terms->>'revocationNoticeDays')::numeric; exception when others then raise exception 'invalid_representation_terms' using errcode='22023'; end;
  if commission_numeric<>trunc(commission_numeric) or commission_numeric not between 0 and 5000 or notice_numeric<>trunc(notice_numeric) or notice_numeric not between 0 and 90 then raise exception 'invalid_representation_terms' using errcode='22023'; end if;
  commission_bps:=commission_numeric::integer; notice_days:=notice_numeric::integer;
  if not ((requested_terms->>'communications')::boolean or (requested_terms->>'opportunities')::boolean or (requested_terms->>'negotiations')::boolean or (requested_terms->>'projectAdmin')::boolean or (requested_terms->>'contractAdmin')::boolean or (requested_terms->>'earningsVisibility')::boolean) or (commission_bps>0 and not (requested_terms->>'earningsVisibility')::boolean) then raise exception 'invalid_representation_terms' using errcode='22023'; end if;
  normalized_terms:=jsonb_build_object('communications',(requested_terms->>'communications')::boolean,'opportunities',(requested_terms->>'opportunities')::boolean,'negotiations',(requested_terms->>'negotiations')::boolean,'projectAdmin',(requested_terms->>'projectAdmin')::boolean,'contractAdmin',(requested_terms->>'contractAdmin')::boolean,'earningsVisibility',(requested_terms->>'earningsVisibility')::boolean,'commissionBasisPoints',commission_bps,'revocationNoticeDays',notice_days);
  if exists(select 1 from public.agency_representation_agreements where agency_id=agency_row.id and performer_user_id=performer_id and status in ('proposed','accepted','revocation_pending')) then raise exception 'representation_already_active' using errcode='23505'; end if;
  loop candidate_public_id:='agr'||encode(extensions.gen_random_bytes(12),'hex'); exit when not exists(select 1 from public.agency_representation_agreements where public_id=candidate_public_id); end loop;
  insert into public.agency_representation_agreements(public_id,agency_id,performer_user_id,proposed_by_user_id,scope_communications,scope_opportunities,scope_negotiations,scope_project_admin,scope_contract_admin,scope_earnings,commission_basis_points,revocation_notice_days,terms_hash)
  values(candidate_public_id,agency_row.id,performer_id,auth.uid(),(normalized_terms->>'communications')::boolean,(normalized_terms->>'opportunities')::boolean,(normalized_terms->>'negotiations')::boolean,(normalized_terms->>'projectAdmin')::boolean,(normalized_terms->>'contractAdmin')::boolean,(normalized_terms->>'earningsVisibility')::boolean,commission_bps,notice_days,encode(extensions.digest(convert_to(normalized_terms::text,'UTF8'),'sha256'),'hex')) returning * into created_row;
  perform private.append_agency_representation_event(created_row.id,auth.uid(),'proposed',normalized_terms);
  perform private.write_audit(auth.uid(),'agency_representation_proposed','success','/workspace/agency','agency',jsonb_build_object('agreementPublicId',created_row.public_id,'performerHandle',lower(trim(requested_performer_handle))));
  return jsonb_build_object('publicId',created_row.public_id,'status',created_row.status);
end;
$$;

notify pgrst,'reload schema';
