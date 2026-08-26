create type public.project_invitation_state as enum (
  'sent','viewed','interested','considering','negotiating','accepted','declined','expired','withdrawn'
);

create table public.project_agency_authorities (
  project_id uuid not null references public.projects(id) on delete cascade,
  agency_user_id uuid not null references auth.users(id) on delete cascade,
  granted_by_user_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(project_id, agency_user_id)
);

create table public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  project_id uuid not null references public.projects(id) on delete cascade,
  project_revision integer not null check (project_revision >= 1),
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  agency_actor_user_id uuid references auth.users(id) on delete set null,
  role_name text not null check (role_name ~ '^[a-z0-9][a-z0-9 _-]{1,63}$'),
  state public.project_invitation_state not null default 'sent',
  proposal_version integer not null default 1 check (proposal_version >= 1),
  accepted_proposal_version integer,
  seen_at timestamptz,
  responded_at timestamptz,
  invalidated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_invitation_public_id_format check (public_id ~ '^inv[0-9a-f]{24}$'),
  constraint project_invitation_not_self check (sender_user_id <> recipient_user_id),
  constraint project_invitation_expiry_order check (expires_at is null or expires_at > created_at)
);

create table public.project_invitation_proposals (
  invitation_id uuid not null references public.project_invitations(id) on delete cascade,
  proposal_version integer not null check (proposal_version >= 1),
  proposal jsonb not null check (jsonb_typeof(proposal) = 'object'),
  proposed_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(invitation_id, proposal_version),
  constraint invitation_proposal_size check (octet_length(proposal::text) <= 10000)
);

create index project_invitations_recipient_updated_idx on public.project_invitations(recipient_user_id, updated_at desc);
create index project_invitations_project_updated_idx on public.project_invitations(project_id, updated_at desc);
create index project_agency_authorities_agency_idx on public.project_agency_authorities(agency_user_id, active);

alter table public.project_agency_authorities enable row level security;
alter table public.project_invitations enable row level security;
alter table public.project_invitation_proposals enable row level security;
revoke all on public.project_agency_authorities from public, anon, authenticated;
revoke all on public.project_invitations from public, anon, authenticated;
revoke all on public.project_invitation_proposals from public, anon, authenticated;

create or replace function private.can_manage_project_communication(project_row_id uuid, actor_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
  select exists (
    select 1 from public.projects project
    where project.id = project_row_id
      and project.owner_user_id = actor_user_id
  ) or exists (
    select 1
    from public.project_agency_authorities authority
    join public.workspace_memberships membership
      on membership.user_id = authority.agency_user_id
     and membership.role = 'agency'
     and membership.status = 'approved'
    where authority.project_id = project_row_id
      and authority.agency_user_id = actor_user_id
      and authority.active = true
      and private.current_active_role(actor_user_id) = 'agency'::public.app_role
  );
$$;

create or replace function private.invitation_transition_allowed(
  from_state public.project_invitation_state,
  to_state public.project_invitation_state
)
returns boolean
language sql
immutable
as $$
  select case from_state
    when 'sent' then to_state in ('viewed','interested','considering','declined','expired','withdrawn')
    when 'viewed' then to_state in ('interested','considering','negotiating','accepted','declined','expired','withdrawn')
    when 'interested' then to_state in ('considering','negotiating','accepted','declined','expired','withdrawn')
    when 'considering' then to_state in ('interested','negotiating','accepted','declined','expired','withdrawn')
    when 'negotiating' then to_state in ('interested','considering','accepted','declined','expired','withdrawn')
    else false
  end;
$$;

create or replace function public.set_project_agency_authority(
  requested_project_public_id text,
  requested_agency_handle text,
  enabled boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  project_row public.projects%rowtype;
  agency_user_id uuid;
begin
  perform private.assert_creator_project_action();
  select project.* into project_row from public.projects project
  where project.public_id = trim(requested_project_public_id) and project.owner_user_id = auth.uid()
  limit 1;
  if project_row.id is null or project_row.state <> 'draft' then
    raise exception 'project_communication_not_allowed' using errcode = '42501';
  end if;

  select profile.user_id into agency_user_id
  from public.profiles profile
  where profile.handle = lower(trim(requested_agency_handle))
    and exists (
      select 1 from public.workspace_memberships membership
      where membership.user_id = profile.user_id and membership.role = 'agency' and membership.status = 'approved'
    )
  limit 1;
  if agency_user_id is null or agency_user_id = auth.uid()
     or private.demand_relationship_blocked(auth.uid(), agency_user_id) then
    raise exception 'agency_unavailable' using errcode = '42501';
  end if;

  insert into public.project_agency_authorities(project_id,agency_user_id,granted_by_user_id,active)
  values(project_row.id,agency_user_id,auth.uid(),coalesce(enabled,false))
  on conflict(project_id,agency_user_id) do update
    set active=excluded.active, granted_by_user_id=excluded.granted_by_user_id, updated_at=now();

  perform private.write_audit(
    auth.uid(),'project_agency_authority_changed','success','/studio/projects/'||project_row.public_id,'creator',
    jsonb_build_object('projectPublicId',project_row.public_id,'agencyHandle',lower(trim(requested_agency_handle)),'enabled',coalesce(enabled,false))
  );
end;
$$;

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
    candidate_public_id := 'inv'||encode(gen_random_bytes(12),'hex');
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

create or replace function public.respond_project_invitation(
  requested_invitation_public_id text,
  requested_state text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  invitation_row public.project_invitations%rowtype;
  next_state public.project_invitation_state;
begin
  perform private.assert_adult_profile_action();
  begin
    next_state := lower(trim(requested_state))::public.project_invitation_state;
  exception when others then
    raise exception 'invalid_invitation_response' using errcode='22023';
  end;

  select invitation.* into invitation_row
  from public.project_invitations invitation
  where invitation.public_id=trim(requested_invitation_public_id)
    and invitation.recipient_user_id=auth.uid()
  for update;
  if invitation_row.id is null
     or not private.invitation_transition_allowed(invitation_row.state,next_state)
     or next_state in ('withdrawn','expired') then
    raise exception 'invitation_response_not_allowed' using errcode='42501';
  end if;

  update public.project_invitations
  set state=next_state,
      seen_at=coalesce(seen_at,now()),
      responded_at=case when next_state='viewed' then responded_at else now() end,
      accepted_proposal_version=case when next_state='accepted' then proposal_version else null end,
      updated_at=now()
  where id=invitation_row.id;

  perform private.write_audit(
    auth.uid(),'project_invitation_responded','success','/studio/invitations/'||invitation_row.public_id,private.current_active_role(auth.uid()),
    jsonb_build_object('invitationPublicId',invitation_row.public_id,'response',next_state)
  );
  return jsonb_build_object('publicId',invitation_row.public_id,'state',next_state,'proposalVersion',invitation_row.proposal_version);
end;
$$;

create or replace function public.propose_invitation_change(
  requested_invitation_public_id text,
  proposal jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  invitation_row public.project_invitations%rowtype;
  next_version integer;
  authorized boolean;
begin
  perform private.assert_adult_profile_action();
  if proposal is null or jsonb_typeof(proposal)<>'object' or octet_length(proposal::text)>10000 then
    raise exception 'invalid_invitation_proposal' using errcode='22023';
  end if;
  select invitation.* into invitation_row from public.project_invitations invitation
  where invitation.public_id=trim(requested_invitation_public_id) for update;
  if invitation_row.id is null or invitation_row.state in ('declined','expired','withdrawn') then
    raise exception 'invitation_change_not_allowed' using errcode='42501';
  end if;
  authorized := invitation_row.recipient_user_id=auth.uid()
    or private.can_manage_project_communication(invitation_row.project_id,auth.uid());
  if not authorized then raise exception 'invitation_change_not_allowed' using errcode='42501'; end if;

  next_version := invitation_row.proposal_version+1;
  insert into public.project_invitation_proposals(invitation_id,proposal_version,proposal,proposed_by_user_id)
  values(invitation_row.id,next_version,proposal,auth.uid());
  update public.project_invitations
  set proposal_version=next_version,state='negotiating',accepted_proposal_version=null,
      invalidated_at=case when invitation_row.state='accepted' then now() else invalidated_at end,updated_at=now()
  where id=invitation_row.id;

  perform private.write_audit(
    auth.uid(),'project_invitation_proposal_changed','success','/studio/invitations/'||invitation_row.public_id,private.current_active_role(auth.uid()),
    jsonb_build_object('invitationPublicId',invitation_row.public_id,'proposalVersion',next_version)
  );
  return jsonb_build_object('publicId',invitation_row.public_id,'state','negotiating','proposalVersion',next_version);
end;
$$;

create or replace function public.withdraw_project_invitation(requested_invitation_public_id text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare invitation_row public.project_invitations%rowtype;
begin
  perform private.assert_adult_profile_action();
  select invitation.* into invitation_row from public.project_invitations invitation
  where invitation.public_id=trim(requested_invitation_public_id) for update;
  if invitation_row.id is null or invitation_row.state in ('accepted','declined','expired','withdrawn')
     or not private.can_manage_project_communication(invitation_row.project_id,auth.uid()) then
    raise exception 'invitation_withdraw_not_allowed' using errcode='42501';
  end if;
  update public.project_invitations set state='withdrawn',responded_at=now(),updated_at=now() where id=invitation_row.id;
  perform private.write_audit(auth.uid(),'project_invitation_withdrawn','success','/studio/invitations/'||invitation_row.public_id,private.current_active_role(auth.uid()),jsonb_build_object('invitationPublicId',invitation_row.public_id));
end;
$$;

create or replace function public.get_invitation_private(requested_invitation_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  invitation_row public.project_invitations%rowtype;
  project_row public.projects%rowtype;
  project_version_row public.project_versions%rowtype;
  proposal_row public.project_invitation_proposals%rowtype;
  actor_allowed boolean;
begin
  perform private.assert_current_session();
  select invitation.* into invitation_row from public.project_invitations invitation
  where invitation.public_id=trim(requested_invitation_public_id) limit 1;
  if invitation_row.id is null then return null; end if;
  select project.* into project_row from public.projects project where project.id=invitation_row.project_id;
  actor_allowed := invitation_row.recipient_user_id=auth.uid()
    or project_row.owner_user_id=auth.uid()
    or private.can_manage_project_communication(project_row.id,auth.uid());
  if not actor_allowed then return null; end if;
  select version.* into project_version_row from public.project_versions version
  where version.project_id=project_row.id and version.revision=invitation_row.project_revision limit 1;
  select version.* into proposal_row from public.project_invitation_proposals version
  where version.invitation_id=invitation_row.id and version.proposal_version=invitation_row.proposal_version limit 1;

  return jsonb_build_object(
    'publicId',invitation_row.public_id,'state',invitation_row.state,'roleName',invitation_row.role_name,
    'projectPublicId',project_row.public_id,'projectRevision',invitation_row.project_revision,'currentProjectRevision',project_row.current_revision,
    'project',jsonb_build_object('title',project_version_row.title,'publicSynopsis',project_version_row.public_synopsis,'privateBrief',project_version_row.private_brief,'boundaries',to_jsonb(project_version_row.boundaries),'compensationModel',project_version_row.compensation_model,'distributionScope',project_version_row.distribution_scope),
    'proposalVersion',invitation_row.proposal_version,'proposal',proposal_row.proposal,
    'agencyManaged',invitation_row.agency_actor_user_id is not null,
    'stale',invitation_row.project_revision<>project_row.current_revision or invitation_row.invalidated_at is not null,
    'createdAt',invitation_row.created_at,'updatedAt',invitation_row.updated_at
  );
end;
$$;

create or replace function public.list_my_project_invitations()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
  select coalesce(jsonb_agg(item order by item->>'updatedAt' desc),'[]'::jsonb)
  from (
    select jsonb_build_object(
      'publicId',invitation.public_id,'state',invitation.state,'roleName',invitation.role_name,
      'projectPublicId',project.public_id,'projectTitle',version.title,
      'direction',case when invitation.recipient_user_id=auth.uid() then 'received' else 'managed' end,
      'agencyManaged',invitation.agency_actor_user_id is not null,'updatedAt',invitation.updated_at
    ) item
    from public.project_invitations invitation
    join public.projects project on project.id=invitation.project_id
    join public.project_versions version on version.project_id=project.id and version.revision=invitation.project_revision
    where coalesce(private.session_is_current(auth.uid()),false)
      and (invitation.recipient_user_id=auth.uid() or project.owner_user_id=auth.uid() or private.can_manage_project_communication(project.id,auth.uid()))
  ) rows;
$$;

create or replace function private.invalidate_stale_project_invitations()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if new.current_revision is distinct from old.current_revision then
    update public.project_invitations
    set state=case when state='accepted' then 'considering'::public.project_invitation_state else state end,
        accepted_proposal_version=case when state='accepted' then null else accepted_proposal_version end,
        invalidated_at=now(),updated_at=now()
    where project_id=new.id
      and project_revision<>new.current_revision
      and state not in ('declined','expired','withdrawn');
  end if;
  return new;
end;
$$;

create trigger project_revision_invalidates_invitations
after update of current_revision on public.projects
for each row execute function private.invalidate_stale_project_invitations();

revoke all on function private.can_manage_project_communication(uuid,uuid) from public,anon,authenticated;
revoke all on function private.invitation_transition_allowed(public.project_invitation_state,public.project_invitation_state) from public,anon,authenticated;
revoke all on function private.invalidate_stale_project_invitations() from public,anon,authenticated;
revoke all on function public.set_project_agency_authority(text,text,boolean) from public,anon,authenticated;
revoke all on function public.send_project_invitation(text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.respond_project_invitation(text,text) from public,anon,authenticated;
revoke all on function public.propose_invitation_change(text,jsonb) from public,anon,authenticated;
revoke all on function public.withdraw_project_invitation(text) from public,anon,authenticated;
revoke all on function public.get_invitation_private(text) from public,anon,authenticated;
revoke all on function public.list_my_project_invitations() from public,anon,authenticated;

grant execute on function public.set_project_agency_authority(text,text,boolean) to authenticated;
grant execute on function public.send_project_invitation(text,text,text,jsonb) to authenticated;
grant execute on function public.respond_project_invitation(text,text) to authenticated;
grant execute on function public.propose_invitation_change(text,jsonb) to authenticated;
grant execute on function public.withdraw_project_invitation(text) to authenticated;
grant execute on function public.get_invitation_private(text) to authenticated;
grant execute on function public.list_my_project_invitations() to authenticated;
