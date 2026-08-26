create or replace function public.send_project_invitation(
  requested_project_public_id text,
  requested_recipient_handle text,
  requested_role_name text,
  proposal jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  project_row public.projects%rowtype;
  recipient_user_id uuid;
  normalized_role text := lower(trim(requested_role_name));
  candidate_public_id text;
  created_invitation public.project_invitations%rowtype;
  agency_actor uuid;
begin
  perform private.assert_adult_profile_action();
  select project.* into project_row from public.projects project
  where project.public_id = trim(requested_project_public_id) limit 1;
  if project_row.id is null or project_row.state <> 'draft'
     or not private.can_manage_project_communication(project_row.id,auth.uid()) then
    raise exception 'project_communication_not_allowed' using errcode = '42501';
  end if;
  if normalized_role !~ '^[a-z0-9][a-z0-9 _-]{1,63}$' then
    raise exception 'invalid_invitation_role' using errcode = '22023';
  end if;
  if proposal is null or jsonb_typeof(proposal) <> 'object' or octet_length(proposal::text) > 10000 then
    raise exception 'invalid_invitation_proposal' using errcode = '22023';
  end if;

  select profile.user_id into recipient_user_id from public.profiles profile
  where profile.handle = lower(trim(requested_recipient_handle)) limit 1;
  if recipient_user_id is null or recipient_user_id = project_row.owner_user_id
     or private.demand_relationship_blocked(project_row.owner_user_id,recipient_user_id)
     or private.demand_relationship_blocked(auth.uid(),recipient_user_id) then
    raise exception 'invitation_recipient_unavailable' using errcode = '42501';
  end if;

  if auth.uid() <> project_row.owner_user_id then agency_actor := auth.uid(); end if;
  loop
    candidate_public_id := 'inv'||encode(extensions.gen_random_bytes(12),'hex');
    exit when not exists(select 1 from public.project_invitations invitation where invitation.public_id=candidate_public_id);
  end loop;

  insert into public.project_invitations(
    public_id,project_id,project_revision,sender_user_id,recipient_user_id,agency_actor_user_id,role_name,state,proposal_version
  ) values(
    candidate_public_id,project_row.id,project_row.current_revision,auth.uid(),recipient_user_id,agency_actor,normalized_role,'sent',1
  ) returning * into created_invitation;
  insert into public.project_invitation_proposals(invitation_id,proposal_version,proposal,proposed_by_user_id)
  values(created_invitation.id,1,proposal,auth.uid());

  perform private.write_audit(
    auth.uid(),'project_invitation_sent','success','/studio/invitations',private.current_active_role(auth.uid()),
    jsonb_build_object('invitationPublicId',created_invitation.public_id,'projectPublicId',project_row.public_id,'agencyManaged',agency_actor is not null)
  );
  return jsonb_build_object('publicId',created_invitation.public_id,'state',created_invitation.state,'projectRevision',created_invitation.project_revision,'proposalVersion',1);
end;
$$;

create or replace function public.publish_project_terms(
  requested_project_public_id text,
  expected_project_revision integer,
  requested_terms jsonb
)
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
  hash_value:=encode(extensions.digest(convert_to(normalized::text,'UTF8'),'sha256'),'hex');
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

create or replace function public.accept_project_terms(
  requested_project_public_id text,
  requested_terms_hash text,
  step_up_proof text
)
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
  proof_hash:=encode(extensions.digest(convert_to(trim(step_up_proof),'UTF8'),'sha256'),'hex');
  insert into public.participant_acceptances(term_version_id,participant_user_id,participant_role,accepted_hash,step_up_proof_hash)
  values(term_row.id,auth.uid(),lower(trim(participant->>'role')),term_row.terms_hash,proof_hash)
  on conflict(term_version_id,participant_user_id) do nothing;
  perform private.write_audit(auth.uid(),'project_terms_accepted','success','/studio/projects/'||project_row.public_id||'/terms',private.current_active_role(auth.uid()),jsonb_build_object('projectPublicId',project_row.public_id,'termsHash',term_row.terms_hash));
  return jsonb_build_object('hash',term_row.terms_hash,'accepted',true,'depicted',depicted);
end;
$$;

create or replace function public.record_depicted_consent(
  requested_project_public_id text,
  requested_terms_hash text,
  step_up_proof text
)
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
  proof_hash:=encode(extensions.digest(convert_to(trim(step_up_proof),'UTF8'),'sha256'),'hex');
  insert into public.depicted_person_consents(term_version_id,performer_user_id,consented_hash,step_up_proof_hash)
  values(term_row.id,auth.uid(),term_row.terms_hash,proof_hash) on conflict(term_version_id,performer_user_id) do nothing;
  perform private.write_audit(auth.uid(),'depicted_person_consent_recorded','success','/studio/projects/'||project_row.public_id||'/terms',private.current_active_role(auth.uid()),jsonb_build_object('projectPublicId',project_row.public_id,'termsHash',term_row.terms_hash));
  return jsonb_build_object('hash',term_row.terms_hash,'consented',true);
end;
$$;
