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
  resolved_agency_user_id uuid;
begin
  perform private.assert_creator_project_action();
  select project.* into project_row
  from public.projects project
  where project.public_id = trim(requested_project_public_id)
    and project.owner_user_id = auth.uid()
  limit 1;

  if project_row.id is null or project_row.state <> 'draft' then
    raise exception 'project_communication_not_allowed' using errcode = '42501';
  end if;

  select profile.user_id into resolved_agency_user_id
  from public.profiles profile
  where profile.handle = lower(trim(requested_agency_handle))
    and exists (
      select 1
      from public.workspace_memberships membership
      where membership.user_id = profile.user_id
        and membership.role = 'agency'
        and membership.status = 'approved'
    )
  limit 1;

  if resolved_agency_user_id is null
     or resolved_agency_user_id = auth.uid()
     or private.demand_relationship_blocked(auth.uid(), resolved_agency_user_id) then
    raise exception 'agency_unavailable' using errcode = '42501';
  end if;

  insert into public.project_agency_authorities(
    project_id,
    agency_user_id,
    granted_by_user_id,
    active
  )
  values(
    project_row.id,
    resolved_agency_user_id,
    auth.uid(),
    coalesce(enabled, false)
  )
  on conflict(project_id, agency_user_id) do update
    set active = excluded.active,
        granted_by_user_id = excluded.granted_by_user_id,
        updated_at = now();

  perform private.write_audit(
    auth.uid(),
    'project_agency_authority_changed',
    'success',
    '/studio/projects/' || project_row.public_id,
    'creator',
    jsonb_build_object(
      'projectPublicId', project_row.public_id,
      'agencyHandle', lower(trim(requested_agency_handle)),
      'enabled', coalesce(enabled, false)
    )
  );
end;
$$;
