create table public.project_term_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null check (version >= 1),
  project_revision integer not null check (project_revision >= 1),
  terms jsonb not null check (jsonb_typeof(terms)='object'),
  terms_hash text not null check (terms_hash ~ '^[0-9a-f]{64}$'),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(project_id, version),
  unique(project_id, terms_hash)
);

create table public.participant_acceptances (
  id uuid primary key default gen_random_uuid(),
  term_version_id uuid not null references public.project_term_versions(id) on delete cascade,
  participant_user_id uuid not null references auth.users(id) on delete cascade,
  participant_role text not null,
  accepted_hash text not null check (accepted_hash ~ '^[0-9a-f]{64}$'),
  step_up_proof_hash text not null check (step_up_proof_hash ~ '^[0-9a-f]{64}$'),
  accepted_at timestamptz not null default now(),
  superseded_at timestamptz,
  unique(term_version_id, participant_user_id)
);

create table public.depicted_person_consents (
  id uuid primary key default gen_random_uuid(),
  term_version_id uuid not null references public.project_term_versions(id) on delete cascade,
  performer_user_id uuid not null references auth.users(id) on delete cascade,
  consented_hash text not null check (consented_hash ~ '^[0-9a-f]{64}$'),
  step_up_proof_hash text not null check (step_up_proof_hash ~ '^[0-9a-f]{64}$'),
  consented_at timestamptz not null default now(),
  superseded_at timestamptz,
  unique(term_version_id, performer_user_id)
);

create table public.contract_lock_receipts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  term_version_id uuid not null unique references public.project_term_versions(id) on delete restrict,
  terms_hash text not null check (terms_hash ~ '^[0-9a-f]{64}$'),
  locked_by_user_id uuid not null references auth.users(id) on delete restrict,
  locked_at timestamptz not null default now()
);

create index project_terms_project_version_idx on public.project_term_versions(project_id,version desc);
create index participant_acceptances_user_idx on public.participant_acceptances(participant_user_id,accepted_at desc);
create index depicted_consents_user_idx on public.depicted_person_consents(performer_user_id,consented_at desc);

alter table public.project_term_versions enable row level security;
alter table public.participant_acceptances enable row level security;
alter table public.depicted_person_consents enable row level security;
alter table public.contract_lock_receipts enable row level security;
revoke all on public.project_term_versions from public,anon,authenticated;
revoke all on public.participant_acceptances from public,anon,authenticated;
revoke all on public.depicted_person_consents from public,anon,authenticated;
revoke all on public.contract_lock_receipts from public,anon,authenticated;

create or replace function private.validate_project_terms(candidate jsonb)
returns jsonb
language plpgsql
immutable
set search_path=pg_catalog,public
as $$
declare participant jsonb;
begin
  if candidate is null or jsonb_typeof(candidate)<>'object' or octet_length(candidate::text)>20000 then
    raise exception 'invalid_project_terms' using errcode='22023';
  end if;
  if jsonb_typeof(candidate->'participants')<>'array' or jsonb_array_length(candidate->'participants')<1 or jsonb_array_length(candidate->'participants')>50 then
    raise exception 'invalid_project_participants' using errcode='22023';
  end if;
  for participant in select value from jsonb_array_elements(candidate->'participants') item(value) loop
    if jsonb_typeof(participant)<>'object'
       or lower(trim(coalesce(participant->>'handle',''))) !~ '^[a-z0-9_]{3,30}$'
       or lower(trim(coalesce(participant->>'role',''))) !~ '^[a-z0-9][a-z0-9 _-]{1,63}$'
       or jsonb_typeof(participant->'depicted') is distinct from 'boolean' then
      raise exception 'invalid_project_participant' using errcode='22023';
    end if;
  end loop;
  if jsonb_typeof(candidate->'boundaries')<>'array' or jsonb_typeof(candidate->'collaborators')<>'array'
     or char_length(trim(coalesce(candidate->>'compensation',''))) not between 3 and 240
     or char_length(trim(coalesce(candidate->>'distributionScope',''))) not between 3 and 240
     or char_length(trim(coalesce(candidate->>'rightsScope',''))) not between 3 and 240
     or char_length(trim(coalesce(candidate->>'schedule',''))) not between 3 and 240
     or char_length(trim(coalesce(candidate->>'cancellation',''))) not between 3 and 500
     or jsonb_typeof(candidate->'finalCutApprovalRequired') is distinct from 'boolean' then
    raise exception 'invalid_project_terms' using errcode='22023';
  end if;
  return candidate;
end;
$$;

create or replace function private.latest_project_terms(project_row_id uuid)
returns public.project_term_versions
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select terms.* from public.project_term_versions terms
  where terms.project_id=project_row_id order by terms.version desc limit 1;
$$;

create or replace function private.project_term_participant(term_row public.project_term_versions, subject_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select participant.value
  from public.profiles profile
  cross join lateral jsonb_array_elements(term_row.terms->'participants') participant(value)
  where profile.user_id=subject_user_id and lower(participant.value->>'handle')=profile.handle
  limit 1;
$$;

create or replace function public.publish_project_terms(requested_project_public_id text,expected_project_revision integer,requested_terms jsonb)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare project_row public.projects%rowtype; normalized jsonb; next_version integer; hash_value text; created_row public.project_term_versions%rowtype;
begin
  perform private.assert_creator_project_action();
  select project.* into project_row from public.projects project where project.public_id=trim(requested_project_public_id) and project.owner_user_id=auth.uid() for update;
  if project_row.id is null or project_row.state<>'draft' then raise exception 'project_terms_not_editable' using errcode='42501'; end if;
  if expected_project_revision is distinct from project_row.current_revision then raise exception 'project_revision_conflict' using errcode='40001'; end if;
  normalized:=private.validate_project_terms(requested_terms);
  hash_value:=encode(digest(convert_to(normalized::text,'UTF8'),'sha256'),'hex');
  select coalesce(max(version),0)+1 into next_version from public.project_term_versions where project_id=project_row.id;
  begin
    insert into public.project_term_versions(project_id,version,project_revision,terms,terms_hash,created_by_user_id)
    values(project_row.id,next_version,project_row.current_revision,normalized,hash_value,auth.uid()) returning * into created_row;
  exception when unique_violation then
    select * into created_row from public.project_term_versions where project_id=project_row.id and terms_hash=hash_value;
    return jsonb_build_object('version',created_row.version,'hash',created_row.terms_hash,'projectRevision',created_row.project_revision);
  end;
  update public.participant_acceptances acceptance set superseded_at=coalesce(superseded_at,now())
  where acceptance.term_version_id in (select id from public.project_term_versions where project_id=project_row.id and id<>created_row.id) and acceptance.superseded_at is null;
  update public.depicted_person_consents consent set superseded_at=coalesce(superseded_at,now())
  where consent.term_version_id in (select id from public.project_term_versions where project_id=project_row.id and id<>created_row.id) and consent.superseded_at is null;
  perform private.write_audit(auth.uid(),'project_terms_published','success','/studio/projects/'||project_row.public_id||'/terms','creator',jsonb_build_object('projectPublicId',project_row.public_id,'termsVersion',created_row.version,'termsHash',created_row.terms_hash));
  return jsonb_build_object('version',created_row.version,'hash',created_row.terms_hash,'projectRevision',created_row.project_revision);
end;
$$;

create or replace function public.accept_project_terms(requested_project_public_id text,requested_terms_hash text,step_up_proof text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare project_row public.projects%rowtype; term_row public.project_term_versions%rowtype; participant jsonb; depicted boolean; proof_hash text;
begin
  perform private.assert_adult_profile_action();
  select project.* into project_row from public.projects project where project.public_id=trim(requested_project_public_id) limit 1;
  if project_row.id is null or project_row.state<>'draft' then raise exception 'terms_acceptance_not_allowed' using errcode='42501'; end if;
  term_row:=private.latest_project_terms(project_row.id);
  if term_row.id is null or term_row.terms_hash<>lower(trim(requested_terms_hash)) then raise exception 'terms_acceptance_not_allowed' using errcode='42501'; end if;
  participant:=private.project_term_participant(term_row,auth.uid());
  if participant is null or not private.verification_is_current(auth.uid(),'v2') then raise exception 'terms_acceptance_not_allowed' using errcode='42501'; end if;
  depicted:=coalesce((participant->>'depicted')::boolean,false);
  if depicted and not private.verification_is_current(auth.uid(),'v3') then raise exception 'terms_acceptance_not_allowed' using errcode='42501'; end if;
  if step_up_proof is null or char_length(trim(step_up_proof))<8 or char_length(trim(step_up_proof))>512 then raise exception 'terms_acceptance_not_allowed' using errcode='42501'; end if;
  proof_hash:=encode(digest(convert_to(trim(step_up_proof),'UTF8'),'sha256'),'hex');
  insert into public.participant_acceptances(term_version_id,participant_user_id,participant_role,accepted_hash,step_up_proof_hash)
  values(term_row.id,auth.uid(),lower(trim(participant->>'role')),term_row.terms_hash,proof_hash)
  on conflict(term_version_id,participant_user_id) do nothing;
  perform private.write_audit(auth.uid(),'project_terms_accepted','success','/studio/projects/'||project_row.public_id||'/terms',private.current_active_role(auth.uid()),jsonb_build_object('projectPublicId',project_row.public_id,'termsHash',term_row.terms_hash));
  return jsonb_build_object('hash',term_row.terms_hash,'accepted',true,'depicted',depicted);
end;
$$;

create or replace function public.record_depicted_consent(requested_project_public_id text,requested_terms_hash text,step_up_proof text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare project_row public.projects%rowtype; term_row public.project_term_versions%rowtype; participant jsonb; proof_hash text;
begin
  perform private.assert_adult_profile_action();
  select project.* into project_row from public.projects project where project.public_id=trim(requested_project_public_id) limit 1;
  if project_row.id is null or project_row.state<>'draft' then raise exception 'depicted_consent_not_allowed' using errcode='42501'; end if;
  term_row:=private.latest_project_terms(project_row.id);
  participant:=private.project_term_participant(term_row,auth.uid());
  if term_row.id is null or term_row.terms_hash<>lower(trim(requested_terms_hash)) or participant is null
     or coalesce((participant->>'depicted')::boolean,false)<>true
     or not private.verification_is_current(auth.uid(),'v3')
     or not exists(select 1 from public.participant_acceptances acceptance where acceptance.term_version_id=term_row.id and acceptance.participant_user_id=auth.uid() and acceptance.superseded_at is null and acceptance.accepted_hash=term_row.terms_hash) then
    raise exception 'depicted_consent_not_allowed' using errcode='42501';
  end if;
  if step_up_proof is null or char_length(trim(step_up_proof))<8 or char_length(trim(step_up_proof))>512 then raise exception 'depicted_consent_not_allowed' using errcode='42501'; end if;
  proof_hash:=encode(digest(convert_to(trim(step_up_proof),'UTF8'),'sha256'),'hex');
  insert into public.depicted_person_consents(term_version_id,performer_user_id,consented_hash,step_up_proof_hash)
  values(term_row.id,auth.uid(),term_row.terms_hash,proof_hash) on conflict(term_version_id,performer_user_id) do nothing;
  perform private.write_audit(auth.uid(),'depicted_person_consent_recorded','success','/studio/projects/'||project_row.public_id||'/terms',private.current_active_role(auth.uid()),jsonb_build_object('projectPublicId',project_row.public_id,'termsHash',term_row.terms_hash));
  return jsonb_build_object('hash',term_row.terms_hash,'consented',true);
end;
$$;

create or replace function public.lock_project_contract(requested_project_public_id text,requested_terms_hash text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare project_row public.projects%rowtype; term_row public.project_term_versions%rowtype; existing_receipt public.contract_lock_receipts%rowtype;
begin
  perform private.assert_creator_project_action();
  select project.* into project_row from public.projects project where project.public_id=trim(requested_project_public_id) and project.owner_user_id=auth.uid() for update;
  if project_row.id is null then raise exception 'contract_lock_not_allowed' using errcode='42501'; end if;
  select receipt.* into existing_receipt from public.contract_lock_receipts receipt where receipt.project_id=project_row.id limit 1;
  if existing_receipt.id is not null then
    if existing_receipt.terms_hash=lower(trim(requested_terms_hash)) then return jsonb_build_object('locked',true,'hash',existing_receipt.terms_hash); end if;
    raise exception 'contract_lock_not_allowed' using errcode='42501';
  end if;
  if project_row.state<>'draft' then raise exception 'contract_lock_not_allowed' using errcode='42501'; end if;
  term_row:=private.latest_project_terms(project_row.id);
  if term_row.id is null or term_row.terms_hash<>lower(trim(requested_terms_hash)) then raise exception 'contract_lock_not_allowed' using errcode='42501'; end if;
  if exists(
    select 1 from jsonb_array_elements(term_row.terms->'participants') participant(value)
    left join public.profiles profile on profile.handle=lower(participant.value->>'handle')
    where profile.user_id is null
       or not private.verification_is_current(profile.user_id,'v2')
       or (coalesce((participant.value->>'depicted')::boolean,false) and not private.verification_is_current(profile.user_id,'v3'))
       or not exists(select 1 from public.participant_acceptances acceptance where acceptance.term_version_id=term_row.id and acceptance.participant_user_id=profile.user_id and acceptance.superseded_at is null and acceptance.accepted_hash=term_row.terms_hash)
       or (coalesce((participant.value->>'depicted')::boolean,false) and not exists(select 1 from public.depicted_person_consents consent where consent.term_version_id=term_row.id and consent.performer_user_id=profile.user_id and consent.superseded_at is null and consent.consented_hash=term_row.terms_hash))
  ) then raise exception 'contract_lock_not_allowed' using errcode='42501'; end if;
  insert into public.contract_lock_receipts(project_id,term_version_id,terms_hash,locked_by_user_id) values(project_row.id,term_row.id,term_row.terms_hash,auth.uid()) returning * into existing_receipt;
  update public.projects set state='contract_locked',updated_at=now() where id=project_row.id;
  perform private.write_audit(auth.uid(),'project_contract_locked','success','/studio/projects/'||project_row.public_id||'/terms','creator',jsonb_build_object('projectPublicId',project_row.public_id,'termsHash',term_row.terms_hash));
  return jsonb_build_object('locked',true,'hash',term_row.terms_hash,'lockedAt',existing_receipt.locked_at);
end;
$$;

create or replace function public.get_project_contract_context(requested_project_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare project_row public.projects%rowtype; term_row public.project_term_versions%rowtype; participant jsonb; owner_allowed boolean; viewer_acceptance boolean; viewer_consent boolean; lock_row public.contract_lock_receipts%rowtype;
begin
  perform private.assert_current_session();
  select project.* into project_row from public.projects project where project.public_id=trim(requested_project_public_id) limit 1;
  if project_row.id is null then return null; end if;
  term_row:=private.latest_project_terms(project_row.id);
  participant:=case when term_row.id is null then null else private.project_term_participant(term_row,auth.uid()) end;
  owner_allowed:=project_row.owner_user_id=auth.uid() or private.can_manage_project_communication(project_row.id,auth.uid());
  if not owner_allowed and participant is null then return null; end if;
  viewer_acceptance:=term_row.id is not null and exists(select 1 from public.participant_acceptances acceptance where acceptance.term_version_id=term_row.id and acceptance.participant_user_id=auth.uid() and acceptance.superseded_at is null);
  viewer_consent:=term_row.id is not null and exists(select 1 from public.depicted_person_consents consent where consent.term_version_id=term_row.id and consent.performer_user_id=auth.uid() and consent.superseded_at is null);
  select * into lock_row from public.contract_lock_receipts where project_id=project_row.id limit 1;
  return jsonb_build_object('projectPublicId',project_row.public_id,'projectState',project_row.state,'projectRevision',project_row.current_revision,'isOwner',project_row.owner_user_id=auth.uid(),'terms',case when term_row.id is null then null else jsonb_build_object('version',term_row.version,'hash',term_row.terms_hash,'projectRevision',term_row.project_revision,'body',term_row.terms,'createdAt',term_row.created_at) end,'viewerParticipant',participant,'viewerAccepted',viewer_acceptance,'viewerConsented',viewer_consent,'locked',lock_row.id is not null);
end;
$$;

revoke all on function private.validate_project_terms(jsonb) from public,anon,authenticated;
revoke all on function private.latest_project_terms(uuid) from public,anon,authenticated;
revoke all on function private.project_term_participant(public.project_term_versions,uuid) from public,anon,authenticated;
revoke all on function public.publish_project_terms(text,integer,jsonb) from public,anon,authenticated;
revoke all on function public.accept_project_terms(text,text,text) from public,anon,authenticated;
revoke all on function public.record_depicted_consent(text,text,text) from public,anon,authenticated;
revoke all on function public.lock_project_contract(text,text) from public,anon,authenticated;
revoke all on function public.get_project_contract_context(text) from public,anon,authenticated;
grant execute on function public.publish_project_terms(text,integer,jsonb) to authenticated;
grant execute on function public.accept_project_terms(text,text,text) to authenticated;
grant execute on function public.record_depicted_consent(text,text,text) to authenticated;
grant execute on function public.lock_project_contract(text,text) to authenticated;
grant execute on function public.get_project_contract_context(text) to authenticated;
