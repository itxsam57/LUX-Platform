create or replace function private.insert_project(
  project_owner_user_id uuid,
  normalized jsonb,
  source_demand_row_id uuid default null
)
returns public.projects
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  candidate_public_id text;
  created_project public.projects%rowtype;
begin
  loop
    candidate_public_id := 'prj' || encode(extensions.gen_random_bytes(12), 'hex');
    exit when not exists (
      select 1 from public.projects project where project.public_id = candidate_public_id
    );
  end loop;

  insert into public.projects(public_id, owner_user_id, source_demand_id)
  values (candidate_public_id, project_owner_user_id, source_demand_row_id)
  returning * into created_project;

  perform private.insert_project_version(created_project.id, 1, project_owner_user_id, normalized);
  return created_project;
end;
$$;
