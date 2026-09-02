create or replace function public.set_project_funding_restriction(
  requested_project_public_id text,
  restriction_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  project_row public.projects%rowtype;
  normalized_public_id text := trim(coalesce(requested_project_public_id, ''));
begin
  if normalized_public_id !~ '^prj[0-9a-f]{24}$' or restriction_enabled is null then
    raise exception 'invalid_funding_restriction_request' using errcode = '22023';
  end if;

  update public.projects
  set funding_restricted = restriction_enabled,
      updated_at = now()
  where public_id = normalized_public_id
  returning * into project_row;

  if project_row.id is null then
    raise exception 'unknown_project' using errcode = '22023';
  end if;

  perform private.write_audit(
    null,
    'project_funding_restriction_changed',
    'success',
    'internal-funding-restriction',
    null,
    jsonb_build_object(
      'projectPublicId', project_row.public_id,
      'fundingRestricted', project_row.funding_restricted
    )
  );

  return jsonb_build_object(
    'projectPublicId', project_row.public_id,
    'fundingRestricted', project_row.funding_restricted
  );
end;
$$;

revoke all on function public.set_project_funding_restriction(text, boolean) from public, anon, authenticated;
grant execute on function public.set_project_funding_restriction(text, boolean) to service_role;

notify pgrst, 'reload schema';
