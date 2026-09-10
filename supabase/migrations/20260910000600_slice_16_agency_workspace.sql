create table public.agency_profiles (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  owner_user_id uuid not null unique references auth.users(id) on delete restrict,
  display_name text not null,
  jurisdiction_code text not null,
  verification_status text not null default 'pending',
  verification_provider text,
  verification_evidence_reference text,
  verification_reason text,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agency_profile_public_id_format check (public_id ~ '^agy[0-9a-f]{24}$'),
  constraint agency_profile_display_name check (char_length(trim(display_name)) between 2 and 120),
  constraint agency_profile_jurisdiction check (jurisdiction_code ~ '^[A-Z]{2}$'),
  constraint agency_profile_verification_status check (verification_status in ('pending','approved','rejected','revoked')),
  constraint agency_profile_provider check (verification_provider is null or verification_provider ~ '^[a-z0-9][a-z0-9._-]{1,63}$'),
  constraint agency_profile_evidence check (verification_evidence_reference is null or char_length(verification_evidence_reference) between 8 and 220),
  constraint agency_profile_reason check (verification_reason is null or char_length(trim(verification_reason)) between 3 and 500)
);

create table public.agency_staff_memberships (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agency_profiles(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  staff_role text not null,
  active boolean not null default true,
  added_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(agency_id,user_id),
  constraint agency_staff_role_allowed check (staff_role in ('owner','manager','agent','finance','viewer'))
);

create table public.agency_representation_agreements (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  agency_id uuid not null references public.agency_profiles(id) on delete restrict,
  performer_user_id uuid not null references auth.users(id) on delete restrict,
  proposed_by_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'proposed',
  scope_communications boolean not null default false,
  scope_opportunities boolean not null default false,
  scope_negotiations boolean not null default false,
  scope_project_admin boolean not null default false,
  scope_contract_admin boolean not null default false,
  scope_earnings boolean not null default false,
  commission_basis_points integer not null default 0,
  revocation_notice_days integer not null default 0,
  terms_hash text not null,
  proposed_at timestamptz not null default now(),
  accepted_at timestamptz,
  declined_at timestamptz,
  revoked_requested_at timestamptz,
  revocation_effective_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint agency_representation_public_id_format check (public_id ~ '^agr[0-9a-f]{24}$'),
  constraint agency_representation_status_allowed check (status in ('proposed','accepted','declined','revocation_pending','revoked')),
  constraint agency_representation_commission check (commission_basis_points between 0 and 5000),
  constraint agency_representation_notice check (revocation_notice_days between 0 and 90),
  constraint agency_representation_terms_hash check (terms_hash ~ '^[0-9a-f]{64}$'),
  constraint agency_representation_scope_nonempty check (
    scope_communications or scope_opportunities or scope_negotiations or scope_project_admin or scope_contract_admin or scope_earnings
  ),
  constraint agency_representation_commission_scope check (commission_basis_points=0 or scope_earnings)
);

create unique index agency_representation_one_current_idx
  on public.agency_representation_agreements(agency_id,performer_user_id)
  where status in ('proposed','accepted','revocation_pending');

create table public.agency_representation_events (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  agreement_id uuid not null references public.agency_representation_agreements(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint agency_representation_event_public_id_format check (public_id ~ '^are[0-9a-f]{24}$'),
  constraint agency_representation_event_type_allowed check (event_type in (
    'proposed','accepted','declined','revocation_requested','revoked','opportunity_created','negotiation_updated','project_authority_changed'
  )),
  constraint agency_representation_event_details_object check (jsonb_typeof(details)='object' and octet_length(details::text)<=8000)
);

create table public.agency_opportunities (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  agreement_id uuid not null references public.agency_representation_agreements(id) on delete restrict,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  title text not null,
  summary text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agency_opportunity_public_id_format check (public_id ~ '^opp[0-9a-f]{24}$'),
  constraint agency_opportunity_title check (char_length(trim(title)) between 3 and 120),
  constraint agency_opportunity_summary check (char_length(trim(summary)) between 10 and 1200),
  constraint agency_opportunity_status_allowed check (status in ('open','negotiating','won','lost','withdrawn'))
);

create table public.agency_negotiation_events (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  opportunity_id uuid not null references public.agency_opportunities(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  stage text not null,
  note text not null,
  created_at timestamptz not null default now(),
  constraint agency_negotiation_public_id_format check (public_id ~ '^neg[0-9a-f]{24}$'),
  constraint agency_negotiation_stage_allowed check (stage in ('proposed','countered','accepted','declined','closed')),
  constraint agency_negotiation_note check (char_length(trim(note)) between 3 and 1200)
);

create index agency_staff_agency_active_idx on public.agency_staff_memberships(agency_id,active);
create index agency_representation_performer_idx on public.agency_representation_agreements(performer_user_id,updated_at desc);
create index agency_representation_agency_idx on public.agency_representation_agreements(agency_id,updated_at desc);
create index agency_representation_events_agreement_idx on public.agency_representation_events(agreement_id,created_at desc);
create index agency_opportunities_agreement_idx on public.agency_opportunities(agreement_id,updated_at desc);
create index agency_negotiation_events_opportunity_idx on public.agency_negotiation_events(opportunity_id,created_at desc);

alter table public.agency_profiles enable row level security;
alter table public.agency_staff_memberships enable row level security;
alter table public.agency_representation_agreements enable row level security;
alter table public.agency_representation_events enable row level security;
alter table public.agency_opportunities enable row level security;
alter table public.agency_negotiation_events enable row level security;

revoke all on public.agency_profiles from public,anon,authenticated;
revoke all on public.agency_staff_memberships from public,anon,authenticated;
revoke all on public.agency_representation_agreements from public,anon,authenticated;
revoke all on public.agency_representation_events from public,anon,authenticated;
revoke all on public.agency_opportunities from public,anon,authenticated;
revoke all on public.agency_negotiation_events from public,anon,authenticated;

create or replace function private.reject_agency_history_mutation()
returns trigger
language plpgsql
set search_path=pg_catalog
as $$
begin
  raise exception 'immutable_agency_history' using errcode='55000';
end;
$$;

create trigger agency_representation_events_immutable before update or delete on public.agency_representation_events
for each row execute function private.reject_agency_history_mutation();
create trigger agency_negotiation_events_immutable before update or delete on public.agency_negotiation_events
for each row execute function private.reject_agency_history_mutation();

create or replace function private.current_agency_id(actor_user_id uuid default auth.uid())
returns uuid
language sql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
  select membership.agency_id
  from public.agency_staff_memberships membership
  where membership.user_id=actor_user_id and membership.active=true
  limit 1;
$$;

create or replace function private.agency_staff_has_capability(actor_user_id uuid, requested_capability text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
  select exists(
    select 1
    from public.agency_staff_memberships membership
    join public.agency_profiles agency on agency.id=membership.agency_id
    where membership.user_id=actor_user_id
      and membership.active=true
      and agency.verification_status='approved'
      and private.current_active_role(actor_user_id)='agency'::public.app_role
      and (
        membership.staff_role='owner'
        or (membership.staff_role='manager' and requested_capability in ('staff','communications','opportunities','negotiations','project_admin','contract_admin','earnings','read'))
        or (membership.staff_role='agent' and requested_capability in ('communications','opportunities','negotiations','project_admin','contract_admin','read'))
        or (membership.staff_role='finance' and requested_capability in ('earnings','read'))
        or (membership.staff_role='viewer' and requested_capability='read')
      )
  );
$$;

create or replace function private.active_agency_representation(
  agency_owner_user_id uuid,
  performer_user_id uuid,
  requested_capability text default null
)
returns public.agency_representation_agreements
language sql
stable
security definer
set search_path=pg_catalog,public,private
as $$
  select agreement.*
  from public.agency_representation_agreements agreement
  join public.agency_profiles agency on agency.id=agreement.agency_id
  where agency.owner_user_id=agency_owner_user_id
    and agency.verification_status='approved'
    and agreement.performer_user_id=performer_user_id
    and (
      agreement.status='accepted'
      or (agreement.status='revocation_pending' and agreement.revocation_effective_at>now())
    )
    and case requested_capability
      when 'communications' then agreement.scope_communications
      when 'opportunities' then agreement.scope_opportunities
      when 'negotiations' then agreement.scope_negotiations
      when 'project_admin' then agreement.scope_project_admin
      when 'contract_admin' then agreement.scope_contract_admin
      when 'earnings' then agreement.scope_earnings
      else true
    end
  order by agreement.accepted_at desc
  limit 1;
$$;

create or replace function private.append_agency_representation_event(
  agreement_row_id uuid,
  actor_user_id uuid,
  requested_event_type text,
  requested_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private,extensions
as $$
declare candidate_public_id text;
begin
  loop
    candidate_public_id:='are'||encode(extensions.gen_random_bytes(12),'hex');
    exit when not exists(select 1 from public.agency_representation_events where public_id=candidate_public_id);
  end loop;
  insert into public.agency_representation_events(public_id,agreement_id,actor_user_id,event_type,details)
  values(candidate_public_id,agreement_row_id,actor_user_id,requested_event_type,coalesce(requested_details,'{}'::jsonb));
end;
$$;

create or replace function public.ensure_agency_profile(requested_display_name text,requested_jurisdiction_code text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare existing_row public.agency_profiles%rowtype; candidate_public_id text;
begin
  perform private.assert_adult_profile_action();
  if private.current_active_role(auth.uid()) is distinct from 'agency'::public.app_role then raise exception 'agency_workspace_required' using errcode='42501'; end if;
  if char_length(trim(coalesce(requested_display_name,''))) not between 2 and 120 or upper(trim(coalesce(requested_jurisdiction_code,''))) !~ '^[A-Z]{2}$' then raise exception 'invalid_agency_profile' using errcode='22023'; end if;
  select * into existing_row from public.agency_profiles where owner_user_id=auth.uid();
  if existing_row.id is not null then
    return jsonb_build_object('publicId',existing_row.public_id,'displayName',existing_row.display_name,'jurisdictionCode',existing_row.jurisdiction_code,'verificationStatus',existing_row.verification_status);
  end if;
  loop candidate_public_id:='agy'||encode(extensions.gen_random_bytes(12),'hex'); exit when not exists(select 1 from public.agency_profiles where public_id=candidate_public_id); end loop;
  insert into public.agency_profiles(public_id,owner_user_id,display_name,jurisdiction_code)
  values(candidate_public_id,auth.uid(),trim(requested_display_name),upper(trim(requested_jurisdiction_code))) returning * into existing_row;
  insert into public.agency_staff_memberships(agency_id,user_id,staff_role,active,added_by_user_id)
  values(existing_row.id,auth.uid(),'owner',true,auth.uid());
  perform private.write_audit(auth.uid(),'agency_profile_created','success','/workspace/agency','agency',jsonb_build_object('agencyPublicId',existing_row.public_id));
  return jsonb_build_object('publicId',existing_row.public_id,'displayName',existing_row.display_name,'jurisdictionCode',existing_row.jurisdiction_code,'verificationStatus',existing_row.verification_status);
end;
$$;

create or replace function public.submit_agency_verification(requested_agency_public_id text,requested_provider text,requested_evidence_reference text)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare agency_row public.agency_profiles%rowtype;
begin
  perform private.assert_adult_profile_action();
  select agency.* into agency_row from public.agency_profiles agency
  join public.agency_staff_memberships membership on membership.agency_id=agency.id
  where agency.public_id=trim(requested_agency_public_id) and membership.user_id=auth.uid() and membership.active=true and membership.staff_role='owner' limit 1;
  if agency_row.id is null then raise exception 'agency_verification_not_allowed' using errcode='42501'; end if;
  if lower(trim(coalesce(requested_provider,''))) !~ '^[a-z0-9][a-z0-9._-]{1,63}$' or char_length(trim(coalesce(requested_evidence_reference,''))) not between 8 and 220 then raise exception 'invalid_agency_verification' using errcode='22023'; end if;
  update public.agency_profiles set verification_status='pending',verification_provider=lower(trim(requested_provider)),verification_evidence_reference=trim(requested_evidence_reference),verification_reason=null,reviewed_by_user_id=null,reviewed_at=null,updated_at=now() where id=agency_row.id;
  perform private.write_audit(auth.uid(),'agency_verification_submitted','success','/workspace/agency','agency',jsonb_build_object('agencyPublicId',agency_row.public_id,'provider',lower(trim(requested_provider))));
end;
$$;

create or replace function public.review_agency_verification(requested_agency_public_id text,requested_decision text,requested_reason text)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare agency_row public.agency_profiles%rowtype; normalized_decision text:=lower(trim(coalesce(requested_decision,'')));
begin
  perform private.assert_current_session();
  if private.current_active_role(auth.uid()) not in ('reviewer'::public.app_role,'super_admin'::public.app_role) then raise exception 'agency_verification_review_denied' using errcode='42501'; end if;
  if normalized_decision not in ('approved','rejected','revoked') or char_length(trim(coalesce(requested_reason,''))) not between 3 and 500 then raise exception 'invalid_agency_verification_review' using errcode='22023'; end if;
  select * into agency_row from public.agency_profiles where public_id=trim(requested_agency_public_id) for update;
  if agency_row.id is null then raise exception 'agency_not_found' using errcode='22023'; end if;
  update public.agency_profiles set verification_status=normalized_decision,verification_reason=trim(requested_reason),reviewed_by_user_id=auth.uid(),reviewed_at=now(),updated_at=now() where id=agency_row.id;
  perform private.write_audit(auth.uid(),'agency_verification_reviewed','success','/workspace/staff/agency-verification',private.current_active_role(auth.uid()),jsonb_build_object('agencyPublicId',agency_row.public_id,'decision',normalized_decision,'reason',trim(requested_reason)));
end;
$$;

create or replace function public.list_agency_verification_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
begin
  perform private.assert_current_session();
  if private.current_active_role(auth.uid()) not in ('reviewer'::public.app_role,'super_admin'::public.app_role) then
    raise exception 'agency_verification_review_denied' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'agencyPublicId',agency.public_id,
      'displayName',agency.display_name,
      'jurisdictionCode',agency.jurisdiction_code,
      'verificationStatus',agency.verification_status,
      'verificationProvider',agency.verification_provider,
      'verificationReason',agency.verification_reason,
      'updatedAt',agency.updated_at
    ) order by case agency.verification_status when 'pending' then 0 else 1 end,agency.updated_at desc)
    from public.agency_profiles agency
  ),'[]'::jsonb);
end;
$$;

create or replace function public.upsert_agency_staff_member(requested_handle text,requested_staff_role text,requested_reason text,enabled boolean)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare agency_row public.agency_profiles%rowtype; target_user_id uuid; normalized_role text:=lower(trim(coalesce(requested_staff_role,'')));
begin
  perform private.assert_adult_profile_action();
  if not private.agency_staff_has_capability(auth.uid(),'staff') then raise exception 'agency_staff_admin_denied' using errcode='42501'; end if;
  select * into agency_row from public.agency_profiles where id=private.current_agency_id(auth.uid());
  select user_id into target_user_id from public.profiles where handle=lower(trim(coalesce(requested_handle,''))) limit 1;
  if target_user_id is null or normalized_role not in ('manager','agent','finance','viewer') or char_length(trim(coalesce(requested_reason,''))) not between 3 and 500 then raise exception 'invalid_agency_staff_member' using errcode='22023'; end if;
  if not exists(select 1 from public.workspace_memberships where user_id=target_user_id and role='agency'::public.app_role and status='approved') then raise exception 'agency_staff_workspace_required' using errcode='42501'; end if;
  insert into public.agency_staff_memberships(agency_id,user_id,staff_role,active,added_by_user_id)
  values(agency_row.id,target_user_id,normalized_role,coalesce(enabled,false),auth.uid())
  on conflict(user_id) do update set staff_role=excluded.staff_role,active=excluded.active,added_by_user_id=excluded.added_by_user_id,updated_at=now()
  where public.agency_staff_memberships.agency_id=excluded.agency_id;
  if not found then raise exception 'agency_staff_cross_tenant_conflict' using errcode='42501'; end if;
  perform private.write_audit(auth.uid(),'agency_staff_changed','success','/workspace/agency','agency',jsonb_build_object('agencyPublicId',agency_row.public_id,'staffHandle',lower(trim(requested_handle)),'staffRole',normalized_role,'enabled',coalesce(enabled,false),'reason',trim(requested_reason)));
end;
$$;

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
  if agency_row.id is null or performer_id is null or performer_id=agency_row.owner_user_id or not exists(select 1 from public.workspace_memberships where user_id=performer_id and role='creator'::public.app_role and status='approved') then raise exception 'performer_representation_unavailable' using errcode='42501'; end if;
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

create or replace function public.respond_agency_representation(requested_agreement_public_id text,requested_decision text)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare agreement_row public.agency_representation_agreements%rowtype; normalized_decision text:=lower(trim(coalesce(requested_decision,'')));
begin
  perform private.assert_adult_profile_action();
  select * into agreement_row from public.agency_representation_agreements where public_id=trim(requested_agreement_public_id) and performer_user_id = auth.uid() for update;
  if agreement_row.id is null or agreement_row.status<>'proposed' or normalized_decision not in ('accept','decline') then raise exception 'representation_response_not_allowed' using errcode='42501'; end if;
  if normalized_decision='accept' then
    update public.agency_representation_agreements set status='accepted',accepted_at=now(),updated_at=now() where id=agreement_row.id;
    perform private.append_agency_representation_event(agreement_row.id,auth.uid(),'accepted',jsonb_build_object('termsHash',agreement_row.terms_hash));
  else
    update public.agency_representation_agreements set status='declined',declined_at=now(),updated_at=now() where id=agreement_row.id;
    perform private.append_agency_representation_event(agreement_row.id,auth.uid(),'declined','{}'::jsonb);
  end if;
  perform private.write_audit(auth.uid(),'agency_representation_'||case when normalized_decision='accept' then 'accepted' else 'declined' end,'success','/app/representation','creator',jsonb_build_object('agreementPublicId',agreement_row.public_id));
end;
$$;

create or replace function public.revoke_agency_representation(requested_agreement_public_id text,requested_reason text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare agreement_row public.agency_representation_agreements%rowtype; effective_at timestamptz; resulting_status text;
begin
  perform private.assert_adult_profile_action();
  select * into agreement_row from public.agency_representation_agreements where public_id=trim(requested_agreement_public_id) and performer_user_id=auth.uid() for update;
  if agreement_row.id is null or agreement_row.status not in ('accepted','revocation_pending') or char_length(trim(coalesce(requested_reason,''))) not between 3 and 500 then raise exception 'representation_revocation_not_allowed' using errcode='42501'; end if;
  if agreement_row.status='revocation_pending' then return jsonb_build_object('publicId',agreement_row.public_id,'status',agreement_row.status,'effectiveAt',agreement_row.revocation_effective_at); end if;
  effective_at:=now()+make_interval(days=>agreement_row.revocation_notice_days);
  resulting_status:=case when agreement_row.revocation_notice_days=0 then 'revoked' else 'revocation_pending' end;
  update public.agency_representation_agreements set status=resulting_status,revoked_requested_at=now(),revocation_effective_at=effective_at,updated_at=now() where id=agreement_row.id;
  perform private.append_agency_representation_event(agreement_row.id,auth.uid(),'revocation_requested',jsonb_build_object('reason',trim(requested_reason),'effectiveAt',effective_at,'noticeDays',agreement_row.revocation_notice_days));
  if resulting_status='revoked' then perform private.append_agency_representation_event(agreement_row.id,auth.uid(),'revoked',jsonb_build_object('reason',trim(requested_reason),'effectiveAt',effective_at)); end if;
  update public.project_agency_authorities authority set active=false,updated_at=now()
  from public.projects project,public.agency_profiles agency
  where authority.project_id=project.id and authority.agency_user_id=agency.owner_user_id and agency.id=agreement_row.agency_id and project.owner_user_id=agreement_row.performer_user_id and resulting_status='revoked';
  perform private.write_audit(auth.uid(),'agency_representation_revocation_requested','success','/app/representation','creator',jsonb_build_object('agreementPublicId',agreement_row.public_id,'effectiveAt',effective_at,'reason',trim(requested_reason)));
  return jsonb_build_object('publicId',agreement_row.public_id,'status',resulting_status,'effectiveAt',effective_at);
end;
$$;

create or replace function public.list_my_agency_representations()
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'publicId',agreement.public_id,'agencyPublicId',agency.public_id,'agencyName',agency.display_name,'agencyVerificationStatus',agency.verification_status,
    'status',case when agreement.status='revocation_pending' and agreement.revocation_effective_at<=now() then 'revoked' else agreement.status end,
    'scopes',jsonb_build_object('communications',agreement.scope_communications,'opportunities',agreement.scope_opportunities,'negotiations',agreement.scope_negotiations,'projectAdmin',agreement.scope_project_admin,'contractAdmin',agreement.scope_contract_admin,'earningsVisibility',agreement.scope_earnings),
    'commissionBasisPoints',agreement.commission_basis_points,'revocationNoticeDays',agreement.revocation_notice_days,'termsHash',agreement.terms_hash,
    'proposedAt',agreement.proposed_at,'acceptedAt',agreement.accepted_at,'revocationEffectiveAt',agreement.revocation_effective_at,
    'activity',coalesce((select jsonb_agg(jsonb_build_object('publicId',event.public_id,'eventType',event.event_type,'details',event.details,'createdAt',event.created_at) order by event.created_at desc) from public.agency_representation_events event where event.agreement_id=agreement.id),'[]'::jsonb)
  ) order by agreement.updated_at desc),'[]'::jsonb)
  from public.agency_representation_agreements agreement
  join public.agency_profiles agency on agency.id=agreement.agency_id
  where agreement.performer_user_id=auth.uid();
$$;

create or replace function public.list_agency_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare agency_row public.agency_profiles%rowtype; actor_membership public.agency_staff_memberships%rowtype;
begin
  perform private.assert_current_session();
  select membership.* into actor_membership from public.agency_staff_memberships membership where membership.user_id=auth.uid() and membership.active=true limit 1;
  if actor_membership.id is null or private.current_active_role(auth.uid()) is distinct from 'agency'::public.app_role then raise exception 'agency_workspace_required' using errcode='42501'; end if;
  select * into agency_row from public.agency_profiles where id=actor_membership.agency_id;
  return jsonb_build_object(
    'agency',jsonb_build_object('publicId',agency_row.public_id,'displayName',agency_row.display_name,'jurisdictionCode',agency_row.jurisdiction_code,'verificationStatus',agency_row.verification_status,'staffRole',actor_membership.staff_role),
    'staff',coalesce((select jsonb_agg(jsonb_build_object('handle',profile.handle,'staffRole',membership.staff_role,'active',membership.active) order by membership.created_at) from public.agency_staff_memberships membership join public.profiles profile on profile.user_id=membership.user_id where membership.agency_id=agency_row.id),'[]'::jsonb),
    'representations',coalesce((select jsonb_agg(jsonb_build_object('publicId',agreement.public_id,'performerHandle',profile.handle,'status',case when agreement.status='revocation_pending' and agreement.revocation_effective_at<=now() then 'revoked' else agreement.status end,'scopes',jsonb_build_object('communications',agreement.scope_communications,'opportunities',agreement.scope_opportunities,'negotiations',agreement.scope_negotiations,'projectAdmin',agreement.scope_project_admin,'contractAdmin',agreement.scope_contract_admin,'earningsVisibility',agreement.scope_earnings),'commissionBasisPoints',agreement.commission_basis_points,'revocationNoticeDays',agreement.revocation_notice_days,'acceptedAt',agreement.accepted_at,'revocationEffectiveAt',agreement.revocation_effective_at,'activity',coalesce((select jsonb_agg(jsonb_build_object('publicId',event.public_id,'eventType',event.event_type,'details',event.details,'createdAt',event.created_at) order by event.created_at desc) from public.agency_representation_events event where event.agreement_id=agreement.id),'[]'::jsonb)) order by agreement.updated_at desc) from public.agency_representation_agreements agreement join public.profiles profile on profile.user_id=agreement.performer_user_id where agreement.agency_id=agency_row.id),'[]'::jsonb),
    'opportunities',coalesce((select jsonb_agg(jsonb_build_object('publicId',opportunity.public_id,'agreementPublicId',agreement.public_id,'performerHandle',profile.handle,'title',opportunity.title,'summary',opportunity.summary,'status',opportunity.status,'createdAt',opportunity.created_at,'updatedAt',opportunity.updated_at,'negotiationHistory',coalesce((select jsonb_agg(jsonb_build_object('publicId',event.public_id,'stage',event.stage,'note',event.note,'createdAt',event.created_at) order by event.created_at desc) from public.agency_negotiation_events event where event.opportunity_id=opportunity.id),'[]'::jsonb)) order by opportunity.updated_at desc) from public.agency_opportunities opportunity join public.agency_representation_agreements agreement on agreement.id=opportunity.agreement_id join public.profiles profile on profile.user_id=agreement.performer_user_id where agreement.agency_id=agency_row.id),'[]'::jsonb)
  );
end;
$$;

create or replace function public.create_agency_opportunity(requested_agreement_public_id text,requested_title text,requested_summary text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare agreement_row public.agency_representation_agreements%rowtype; agency_row public.agency_profiles%rowtype; created_row public.agency_opportunities%rowtype; candidate_public_id text;
begin
  perform private.assert_adult_profile_action();
  if not private.agency_staff_has_capability(auth.uid(),'opportunities') then raise exception 'agency_opportunity_denied' using errcode='42501'; end if;
  select agreement.* into agreement_row from public.agency_representation_agreements agreement where agreement.public_id=trim(requested_agreement_public_id) and agreement.agency_id=private.current_agency_id(auth.uid()) for update;
  select * into agency_row from public.agency_profiles where id=agreement_row.agency_id;
  if agreement_row.id is null or (private.active_agency_representation(agency_row.owner_user_id,agreement_row.performer_user_id,'opportunities')).id is null then raise exception 'agency_opportunity_denied' using errcode='42501'; end if;
  if char_length(trim(coalesce(requested_title,''))) not between 3 and 120 or char_length(trim(coalesce(requested_summary,''))) not between 10 and 1200 then raise exception 'invalid_agency_opportunity' using errcode='22023'; end if;
  loop candidate_public_id:='opp'||encode(extensions.gen_random_bytes(12),'hex'); exit when not exists(select 1 from public.agency_opportunities where public_id=candidate_public_id); end loop;
  insert into public.agency_opportunities(public_id,agreement_id,created_by_user_id,title,summary) values(candidate_public_id,agreement_row.id,auth.uid(),trim(requested_title),trim(requested_summary)) returning * into created_row;
  perform private.append_agency_representation_event(agreement_row.id,auth.uid(),'opportunity_created',jsonb_build_object('opportunityPublicId',created_row.public_id,'title',created_row.title));
  perform private.write_audit(auth.uid(),'agency_opportunity_created','success','/workspace/agency','agency',jsonb_build_object('agreementPublicId',agreement_row.public_id,'opportunityPublicId',created_row.public_id));
  return jsonb_build_object('publicId',created_row.public_id,'status',created_row.status);
end;
$$;

create or replace function public.advance_agency_negotiation(requested_opportunity_public_id text,requested_stage text,requested_note text)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare opportunity_row public.agency_opportunities%rowtype; agreement_row public.agency_representation_agreements%rowtype; agency_row public.agency_profiles%rowtype; normalized_stage text:=lower(trim(coalesce(requested_stage,''))); candidate_public_id text; resulting_status text;
begin
  perform private.assert_adult_profile_action();
  if not private.agency_staff_has_capability(auth.uid(),'negotiations') then raise exception 'agency_negotiation_denied' using errcode='42501'; end if;
  select opportunity.* into opportunity_row from public.agency_opportunities opportunity join public.agency_representation_agreements agreement on agreement.id=opportunity.agreement_id where opportunity.public_id=trim(requested_opportunity_public_id) and agreement.agency_id=private.current_agency_id(auth.uid()) for update;
  select * into agreement_row from public.agency_representation_agreements where id=opportunity_row.agreement_id;
  select * into agency_row from public.agency_profiles where id=agreement_row.agency_id;
  if opportunity_row.id is null or (private.active_agency_representation(agency_row.owner_user_id,agreement_row.performer_user_id,'negotiations')).id is null then raise exception 'agency_negotiation_denied' using errcode='42501'; end if;
  if normalized_stage not in ('proposed','countered','accepted','declined','closed') or char_length(trim(coalesce(requested_note,''))) not between 3 and 1200 then raise exception 'invalid_agency_negotiation' using errcode='22023'; end if;
  resulting_status:=case normalized_stage when 'accepted' then 'won' when 'declined' then 'lost' when 'closed' then 'withdrawn' else 'negotiating' end;
  update public.agency_opportunities set status=resulting_status,updated_at=now() where id=opportunity_row.id;
  loop candidate_public_id:='neg'||encode(extensions.gen_random_bytes(12),'hex'); exit when not exists(select 1 from public.agency_negotiation_events where public_id=candidate_public_id); end loop;
  insert into public.agency_negotiation_events(public_id,opportunity_id,actor_user_id,stage,note) values(candidate_public_id,opportunity_row.id,auth.uid(),normalized_stage,trim(requested_note));
  perform private.append_agency_representation_event(agreement_row.id,auth.uid(),'negotiation_updated',jsonb_build_object('opportunityPublicId',opportunity_row.public_id,'stage',normalized_stage));
  perform private.write_audit(auth.uid(),'agency_negotiation_updated','success','/workspace/agency','agency',jsonb_build_object('opportunityPublicId',opportunity_row.public_id,'stage',normalized_stage));
end;
$$;

create or replace function public.list_agency_earnings_statements()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare agency_row public.agency_profiles%rowtype;
begin
  if not private.agency_staff_has_capability(auth.uid(),'earnings') then raise exception 'agency_earnings_denied' using errcode='42501'; end if;
  select * into agency_row from public.agency_profiles where id=private.current_agency_id(auth.uid());
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'projectPublicId',project.public_id,
      'projectTitle',version.title,
      'currency',account.currency,
      'balanceMinor',coalesce((select sum(case posting.side when 'credit' then posting.amount_minor else -posting.amount_minor end) from public.ledger_postings posting where posting.ledger_account_id=account.id),0),
      'commissionBasisPoints',coalesce((select line.basis_points from public.project_revenue_rule_lines line join public.project_revenue_rules rule on rule.id=line.revenue_rule_id where rule.project_id=project.id and line.line_kind='agency_share' and line.recipient_user_id=agency_row.owner_user_id order by rule.version desc limit 1),0)
    ) order by project.updated_at desc)
    from public.ledger_accounts account
    join public.projects project on project.id=account.project_id
    join public.project_versions version on version.project_id=project.id and version.revision=project.current_revision
    where account.owner_user_id=agency_row.owner_user_id and account.account_code='agency_restricted'
  ),'[]'::jsonb);
end;
$$;

create or replace function private.can_manage_project_communication(project_row_id uuid, actor_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
  select exists(select 1 from public.projects project where project.id=project_row_id and project.owner_user_id=actor_user_id)
  or exists(
    select 1
    from public.projects project
    join public.project_agency_authorities authority on authority.project_id=project.id and authority.active=true
    join public.agency_profiles agency on agency.owner_user_id=authority.agency_user_id and agency.verification_status='approved'
    join public.agency_staff_memberships membership on membership.agency_id=agency.id and membership.user_id=actor_user_id and membership.active=true
    join public.agency_representation_agreements agreement on agreement.agency_id=agency.id and agreement.performer_user_id=project.owner_user_id
    where project.id=project_row_id
      and private.current_active_role(actor_user_id)='agency'::public.app_role
      and private.agency_staff_has_capability(actor_user_id,'communications')
      and agreement.scope_communications=true
      and agreement.scope_project_admin=true
      and (agreement.status='accepted' or (agreement.status='revocation_pending' and agreement.revocation_effective_at>now()))
  );
$$;

create or replace function public.set_project_agency_authority(requested_project_public_id text,requested_agency_handle text,enabled boolean)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare project_row public.projects%rowtype; agency_row public.agency_profiles%rowtype; agreement_row public.agency_representation_agreements%rowtype;
begin
  perform private.assert_creator_project_action();
  select * into project_row from public.projects where public_id=trim(requested_project_public_id) and owner_user_id=auth.uid() limit 1;
  if project_row.id is null or project_row.state<>'draft' then raise exception 'project_communication_not_allowed' using errcode='42501'; end if;
  select agency.* into agency_row from public.profiles profile join public.agency_profiles agency on agency.owner_user_id=profile.user_id where profile.handle=lower(trim(requested_agency_handle)) and agency.verification_status='approved' limit 1;
  if agency_row.id is null or agency_row.owner_user_id=auth.uid() or private.demand_relationship_blocked(auth.uid(),agency_row.owner_user_id) then raise exception 'agency_unavailable' using errcode='42501'; end if;
  select * into agreement_row from private.active_agency_representation(agency_row.owner_user_id,auth.uid(),'project_admin');
  if coalesce(enabled,false) and (agreement_row.id is null or agreement_row.scope_communications=false or agreement_row.scope_project_admin=false) then raise exception 'agency_representation_scope_required' using errcode='42501'; end if;
  insert into public.project_agency_authorities(project_id,agency_user_id,granted_by_user_id,active)
  values(project_row.id,agency_row.owner_user_id,auth.uid(),coalesce(enabled,false))
  on conflict(project_id,agency_user_id) do update set active=excluded.active,granted_by_user_id=excluded.granted_by_user_id,updated_at=now();
  if agreement_row.id is not null then perform private.append_agency_representation_event(agreement_row.id,auth.uid(),'project_authority_changed',jsonb_build_object('projectPublicId',project_row.public_id,'enabled',coalesce(enabled,false))); end if;
  perform private.write_audit(auth.uid(),'project_agency_authority_changed','success','/studio/projects/'||project_row.public_id,'creator',jsonb_build_object('projectPublicId',project_row.public_id,'agencyHandle',lower(trim(requested_agency_handle)),'enabled',coalesce(enabled,false),'representationRequired',true));
end;
$$;

create or replace function public.configure_project_revenue_rules(requested_project_public_id text,requested_rules jsonb,requested_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare
  project_row public.projects%rowtype; contract_row public.contract_lock_receipts%rowtype; term_row public.project_term_versions%rowtype; existing_row public.project_revenue_rules%rowtype; created_row public.project_revenue_rules%rowtype;
  line jsonb; normalized_kind text; normalized_handle text; recipient_id uuid; bps_numeric numeric; bps integer; bps_total integer:=0; platform_count integer:=0; participant_count integer:=0; position_value integer:=0; rules_hash_value text; normalized_key text:=trim(coalesce(requested_idempotency_key,'')); agency_row public.agency_profiles%rowtype; agency_agreement public.agency_representation_agreements%rowtype;
begin
  perform private.assert_creator_project_action();
  select * into project_row from public.projects where public_id=trim(coalesce(requested_project_public_id,'')) and owner_user_id=auth.uid() for update;
  if project_row.id is null then raise exception 'revenue_rules_not_allowed' using errcode='42501'; end if;
  select * into contract_row from public.contract_lock_receipts where project_id=project_row.id;
  if contract_row.id is null then raise exception 'revenue_rules_require_locked_contract' using errcode='42501'; end if;
  select * into term_row from public.project_term_versions where id=contract_row.term_version_id;
  if jsonb_typeof(requested_rules) is distinct from 'object' or jsonb_typeof(requested_rules->'lines') is distinct from 'array' or jsonb_array_length(requested_rules->'lines') not between 2 and 50 or char_length(normalized_key) not between 8 and 128 or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then raise exception 'invalid_revenue_rules' using errcode='22023'; end if;
  rules_hash_value:=encode(extensions.digest(convert_to(requested_rules::text,'UTF8'),'sha256'),'hex');
  select * into existing_row from public.project_revenue_rules where project_id=project_row.id and idempotency_key=normalized_key;
  if existing_row.id is not null then if existing_row.rules_hash<>rules_hash_value then raise exception 'revenue_rules_idempotency_conflict' using errcode='40001'; end if; return jsonb_build_object('projectPublicId',project_row.public_id,'version',existing_row.version,'hash',existing_row.rules_hash); end if;
  for line in select value from jsonb_array_elements(requested_rules->'lines') item(value) loop
    normalized_kind:=lower(trim(coalesce(line->>'kind','')));
    begin bps_numeric:=(line->>'basisPoints')::numeric; exception when others then raise exception 'invalid_revenue_rule_line' using errcode='22023'; end;
    if bps_numeric<>trunc(bps_numeric) or bps_numeric<0 or bps_numeric>10000 or normalized_kind not in ('platform_fee','agency_share','reserve','participant') then raise exception 'invalid_revenue_rule_line' using errcode='22023'; end if;
    bps:=bps_numeric::integer;
    if normalized_kind='platform_fee' then platform_count:=platform_count+1; end if;
    if normalized_kind='participant' then participant_count:=participant_count+1; end if;
    if normalized_kind in ('participant','agency_share') then
      normalized_handle:=lower(trim(coalesce(line->>'handle',''))); select user_id into recipient_id from public.profiles where handle=normalized_handle;
      if recipient_id is null then raise exception 'invalid_revenue_rule_recipient' using errcode='22023'; end if;
      if normalized_kind='participant' and not exists(select 1 from jsonb_array_elements(term_row.terms->'participants') participant(value) where lower(participant.value->>'handle')=normalized_handle) then raise exception 'invalid_revenue_rule_recipient' using errcode='22023'; end if;
      if normalized_kind='agency_share' then
        select * into agency_row from public.agency_profiles where owner_user_id=recipient_id and verification_status='approved';
        select * into agency_agreement from private.active_agency_representation(recipient_id,project_row.owner_user_id,'earnings');
        if agency_row.id is null or agency_agreement.id is null or agency_agreement.commission_basis_points<>bps then raise exception 'invalid_agency_commission_rule' using errcode='42501'; end if;
      end if;
    elsif nullif(trim(coalesce(line->>'handle','')),'') is not null then raise exception 'invalid_revenue_rule_recipient' using errcode='22023'; end if;
    bps_total:=bps_total+bps;
  end loop;
  if bps_total<>10000 or platform_count<>1 or participant_count<1 then raise exception 'invalid_revenue_rules' using errcode='22023'; end if;
  insert into public.project_revenue_rules(project_id,contract_lock_receipt_id,version,rules_hash,idempotency_key,created_by_user_id) values(project_row.id,contract_row.id,coalesce((select max(version) from public.project_revenue_rules where project_id=project_row.id),0)+1,rules_hash_value,normalized_key,auth.uid()) returning * into created_row;
  for line in select value from jsonb_array_elements(requested_rules->'lines') item(value) loop
    position_value:=position_value+1; normalized_kind:=lower(trim(line->>'kind')); recipient_id:=null;
    if normalized_kind in ('participant','agency_share') then select user_id into recipient_id from public.profiles where handle=lower(trim(line->>'handle')); end if;
    insert into public.project_revenue_rule_lines(revenue_rule_id,line_kind,recipient_user_id,basis_points,position) values(created_row.id,normalized_kind,recipient_id,(line->>'basisPoints')::integer,position_value);
  end loop;
  perform private.write_audit(auth.uid(),'project_revenue_rules_configured','success','/studio/projects/'||project_row.public_id||'/earnings','creator',jsonb_build_object('projectPublicId',project_row.public_id,'version',created_row.version,'rulesHash',created_row.rules_hash));
  return jsonb_build_object('projectPublicId',project_row.public_id,'version',created_row.version,'hash',created_row.rules_hash);
end;
$$;

revoke all on function private.current_agency_id(uuid) from public,anon,authenticated;
revoke all on function private.agency_staff_has_capability(uuid,text) from public,anon,authenticated;
revoke all on function private.active_agency_representation(uuid,uuid,text) from public,anon,authenticated;
revoke all on function private.append_agency_representation_event(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function private.reject_agency_history_mutation() from public,anon,authenticated;

revoke all on function public.ensure_agency_profile(text,text) from public,anon;
revoke all on function public.submit_agency_verification(text,text,text) from public,anon;
revoke all on function public.review_agency_verification(text,text,text) from public,anon;
revoke all on function public.list_agency_verification_queue() from public,anon;
revoke all on function public.upsert_agency_staff_member(text,text,text,boolean) from public,anon;
revoke all on function public.invite_performer_representation(text,jsonb) from public,anon;
revoke all on function public.respond_agency_representation(text,text) from public,anon;
revoke all on function public.revoke_agency_representation(text,text) from public,anon;
revoke all on function public.list_my_agency_representations() from public,anon;
revoke all on function public.list_agency_workspace() from public,anon;
revoke all on function public.create_agency_opportunity(text,text,text) from public,anon;
revoke all on function public.advance_agency_negotiation(text,text,text) from public,anon;
revoke all on function public.list_agency_earnings_statements() from public,anon;

grant execute on function public.ensure_agency_profile(text,text) to authenticated;
grant execute on function public.submit_agency_verification(text,text,text) to authenticated;
grant execute on function public.review_agency_verification(text,text,text) to authenticated;
grant execute on function public.list_agency_verification_queue() to authenticated;
grant execute on function public.upsert_agency_staff_member(text,text,text,boolean) to authenticated;
grant execute on function public.invite_performer_representation(text,jsonb) to authenticated;
grant execute on function public.respond_agency_representation(text,text) to authenticated;
grant execute on function public.revoke_agency_representation(text,text) to authenticated;
grant execute on function public.list_my_agency_representations() to authenticated;
grant execute on function public.list_agency_workspace() to authenticated;
grant execute on function public.create_agency_opportunity(text,text,text) to authenticated;
grant execute on function public.advance_agency_negotiation(text,text,text) to authenticated;
grant execute on function public.list_agency_earnings_statements() to authenticated;
