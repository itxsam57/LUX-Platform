create type public.project_state as enum ('draft', 'contract_ready', 'contract_locked', 'cancelled');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_demand_id uuid unique references public.demands(id) on delete set null,
  current_revision integer not null default 1 check (current_revision >= 1),
  state public.project_state not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_public_id_format check (public_id ~ '^prj[0-9a-f]{24}$')
);

create table public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  revision integer not null check (revision >= 1),
  title text not null check (char_length(trim(title)) between 4 and 120),
  public_synopsis text not null check (char_length(trim(public_synopsis)) between 20 and 600),
  private_brief text not null check (char_length(trim(private_brief)) between 20 and 4000),
  category text not null check (category ~ '^[a-z0-9][a-z0-9_-]{1,47}$'),
  format text not null check (format ~ '^[a-z0-9][a-z0-9_-]{1,47}$'),
  boundaries text[] not null default '{}'::text[] check (cardinality(boundaries) <= 16),
  compensation_model text not null check (compensation_model in ('fixed','revenue_share','hybrid','unpaid')),
  distribution_scope text not null check (char_length(trim(distribution_scope)) between 4 and 240),
  rights_declarations text[] not null default '{}'::text[] check (cardinality(rights_declarations) <= 16),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(project_id, revision)
);

create table public.project_participant_requirements (
  id uuid primary key default gen_random_uuid(),
  project_version_id uuid not null references public.project_versions(id) on delete cascade,
  role_name text not null check (role_name ~ '^[a-z0-9][a-z0-9 _-]{1,63}$'),
  depicted boolean not null default false,
  required boolean not null default true,
  quantity integer not null default 1 check (quantity between 1 and 100),
  created_at timestamptz not null default now()
);

create index projects_owner_updated_idx on public.projects(owner_user_id, updated_at desc);
create index project_versions_project_revision_idx on public.project_versions(project_id, revision desc);
create index project_requirements_version_idx on public.project_participant_requirements(project_version_id);

alter table public.projects enable row level security;
alter table public.project_versions enable row level security;
alter table public.project_participant_requirements enable row level security;

revoke all on public.projects from public, anon, authenticated;
revoke all on public.project_versions from public, anon, authenticated;
revoke all on public.project_participant_requirements from public, anon, authenticated;

create or replace function private.assert_creator_project_action()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  perform private.assert_adult_profile_action();
  if private.current_active_role(auth.uid()) is distinct from 'creator'::public.app_role then
    raise exception 'creator_workspace_required' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.normalize_project_input(project_input jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  normalized_title text;
  normalized_public text;
  normalized_private text;
  normalized_category text;
  normalized_format text;
  normalized_compensation text;
  normalized_distribution text;
  normalized_boundaries jsonb;
  normalized_rights jsonb;
begin
  if project_input is null or jsonb_typeof(project_input) <> 'object' then
    raise exception 'invalid_project_input' using errcode = '22023';
  end if;

  normalized_title := trim(coalesce(project_input ->> 'title', ''));
  normalized_public := trim(coalesce(project_input ->> 'publicSynopsis', ''));
  normalized_private := trim(coalesce(project_input ->> 'privateBrief', ''));
  normalized_category := lower(trim(coalesce(project_input ->> 'category', '')));
  normalized_format := lower(trim(coalesce(project_input ->> 'format', '')));
  normalized_compensation := lower(trim(coalesce(project_input ->> 'compensationModel', '')));
  normalized_distribution := trim(coalesce(project_input ->> 'distributionScope', ''));

  if char_length(normalized_title) not between 4 and 120 or normalized_title ~ '[[:cntrl:]]' then
    raise exception 'invalid_project_title' using errcode = '22023';
  end if;
  if char_length(normalized_public) not between 20 and 600 or normalized_public ~ '[[:cntrl:]]' then
    raise exception 'invalid_project_public_synopsis' using errcode = '22023';
  end if;
  if char_length(normalized_private) not between 20 and 4000 or normalized_private ~ '[[:cntrl:]]' then
    raise exception 'invalid_project_private_brief' using errcode = '22023';
  end if;
  if normalized_category !~ '^[a-z0-9][a-z0-9_-]{1,47}$' or normalized_format !~ '^[a-z0-9][a-z0-9_-]{1,47}$' then
    raise exception 'invalid_project_classification' using errcode = '22023';
  end if;
  if normalized_compensation not in ('fixed','revenue_share','hybrid','unpaid') then
    raise exception 'invalid_project_compensation' using errcode = '22023';
  end if;
  if char_length(normalized_distribution) not between 4 and 240 or normalized_distribution ~ '[[:cntrl:]]' then
    raise exception 'invalid_project_distribution_scope' using errcode = '22023';
  end if;

  if project_input ? 'boundaries' and jsonb_typeof(project_input -> 'boundaries') <> 'array' then
    raise exception 'invalid_project_boundaries' using errcode = '22023';
  end if;
  if project_input ? 'rightsDeclarations' and jsonb_typeof(project_input -> 'rightsDeclarations') <> 'array' then
    raise exception 'invalid_project_rights' using errcode = '22023';
  end if;
  if coalesce(jsonb_array_length(coalesce(project_input -> 'boundaries', '[]'::jsonb)), 0) > 16
     or coalesce(jsonb_array_length(coalesce(project_input -> 'rightsDeclarations', '[]'::jsonb)), 0) > 16 then
    raise exception 'invalid_project_list' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements_text(coalesce(project_input -> 'boundaries','[]'::jsonb)) item(value)
    where lower(trim(value)) !~ '^[a-z0-9][a-z0-9 _-]{1,63}$'
  ) then
    raise exception 'invalid_project_boundaries' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(coalesce(project_input -> 'rightsDeclarations','[]'::jsonb)) item(value)
    where lower(trim(value)) !~ '^[a-z0-9][a-z0-9_-]{1,63}$'
  ) then
    raise exception 'invalid_project_rights' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(value order by value), '[]'::jsonb)
  into normalized_boundaries
  from (
    select distinct lower(trim(item.value)) as value
    from jsonb_array_elements_text(coalesce(project_input -> 'boundaries','[]'::jsonb)) item(value)
  ) normalized;

  select coalesce(jsonb_agg(value order by value), '[]'::jsonb)
  into normalized_rights
  from (
    select distinct lower(trim(item.value)) as value
    from jsonb_array_elements_text(coalesce(project_input -> 'rightsDeclarations','[]'::jsonb)) item(value)
  ) normalized;

  return jsonb_build_object(
    'title', normalized_title,
    'publicSynopsis', normalized_public,
    'privateBrief', normalized_private,
    'category', normalized_category,
    'format', normalized_format,
    'boundaries', normalized_boundaries,
    'compensationModel', normalized_compensation,
    'distributionScope', normalized_distribution,
    'rightsDeclarations', normalized_rights
  );
end;
$$;

create or replace function private.insert_project_version(
  project_row_id uuid,
  revision_number integer,
  actor_user_id uuid,
  normalized jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  version_id uuid;
begin
  insert into public.project_versions(
    project_id, revision, title, public_synopsis, private_brief, category, format,
    boundaries, compensation_model, distribution_scope, rights_declarations, created_by_user_id
  ) values (
    project_row_id,
    revision_number,
    normalized ->> 'title',
    normalized ->> 'publicSynopsis',
    normalized ->> 'privateBrief',
    normalized ->> 'category',
    normalized ->> 'format',
    array(select jsonb_array_elements_text(normalized -> 'boundaries')),
    normalized ->> 'compensationModel',
    normalized ->> 'distributionScope',
    array(select jsonb_array_elements_text(normalized -> 'rightsDeclarations')),
    actor_user_id
  ) returning id into version_id;
  return version_id;
end;
$$;

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
    candidate_public_id := 'prj' || encode(gen_random_bytes(12), 'hex');
    exit when not exists (select 1 from public.projects project where project.public_id = candidate_public_id);
  end loop;

  insert into public.projects(public_id, owner_user_id, source_demand_id)
  values (candidate_public_id, project_owner_user_id, source_demand_row_id)
  returning * into created_project;

  perform private.insert_project_version(created_project.id, 1, project_owner_user_id, normalized);
  return created_project;
end;
$$;

create or replace function public.create_project_draft(project_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  normalized jsonb;
  created_project public.projects%rowtype;
begin
  perform private.assert_creator_project_action();
  normalized := private.normalize_project_input(project_input);
  created_project := private.insert_project(auth.uid(), normalized, null);

  perform private.write_audit(
    auth.uid(), 'project_draft_created', 'success', '/studio/projects/new', 'creator',
    jsonb_build_object('projectPublicId', created_project.public_id, 'revision', 1)
  );

  return jsonb_build_object('publicId', created_project.public_id, 'revision', 1, 'state', created_project.state);
end;
$$;

create or replace function public.convert_demand_to_project(
  requested_demand_public_id text,
  project_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  provenance jsonb;
  normalized jsonb;
  source_demand_row public.demands%rowtype;
  created_project public.projects%rowtype;
begin
  provenance := private.require_demand_conversion_provenance(trim(requested_demand_public_id));
  normalized := private.normalize_project_input(project_input);

  select demand.* into source_demand_row
  from public.demands demand
  where demand.id = (provenance ->> 'sourceDemandId')::uuid
  for update;

  if source_demand_row.id is null
     or private.demand_effective_state(source_demand_row.state, source_demand_row.expires_at) <> 'creator_interested'
     or exists (select 1 from public.projects project where project.source_demand_id = source_demand_row.id) then
    raise exception 'demand_conversion_not_allowed' using errcode = '42501';
  end if;

  begin
    created_project := private.insert_project(auth.uid(), normalized, source_demand_row.id);
  exception when unique_violation then
    raise exception 'demand_conversion_not_allowed' using errcode = '42501';
  end;

  update public.demands
  set state = 'converted', updated_at = now()
  where id = source_demand_row.id;

  perform private.write_audit(
    auth.uid(), 'demand_converted_to_project', 'success', '/studio/projects', 'creator',
    jsonb_build_object('demandPublicId', source_demand_row.public_id, 'projectPublicId', created_project.public_id)
  );

  return jsonb_build_object(
    'publicId', created_project.public_id,
    'revision', 1,
    'state', created_project.state,
    'sourceDemandPublicId', source_demand_row.public_id
  );
end;
$$;

create or replace function public.update_project_draft(
  requested_public_id text,
  expected_revision integer,
  project_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  project_row public.projects%rowtype;
  normalized jsonb;
  next_revision integer;
begin
  perform private.assert_creator_project_action();
  normalized := private.normalize_project_input(project_input);

  select project.* into project_row
  from public.projects project
  where project.public_id = trim(requested_public_id)
  for update;

  if project_row.id is null or project_row.owner_user_id <> auth.uid() or project_row.state <> 'draft' then
    raise exception 'project_not_editable' using errcode = '42501';
  end if;
  if expected_revision is null or expected_revision <> project_row.current_revision then
    raise exception 'project_revision_conflict' using errcode = '40001';
  end if;

  next_revision := project_row.current_revision + 1;
  perform private.insert_project_version(project_row.id, next_revision, auth.uid(), normalized);
  update public.projects
  set current_revision = next_revision, updated_at = now()
  where id = project_row.id;

  perform private.write_audit(
    auth.uid(), 'project_draft_revised', 'success', '/studio/projects/' || project_row.public_id, 'creator',
    jsonb_build_object('projectPublicId', project_row.public_id, 'fromRevision', project_row.current_revision, 'toRevision', next_revision)
  );

  return jsonb_build_object('publicId', project_row.public_id, 'revision', next_revision, 'state', project_row.state);
end;
$$;

create or replace function public.get_project_private(requested_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  project_row public.projects%rowtype;
  version_row public.project_versions%rowtype;
begin
  perform private.assert_current_session();
  select project.* into project_row
  from public.projects project
  where project.public_id = trim(requested_public_id)
    and project.owner_user_id = auth.uid()
  limit 1;
  if project_row.id is null then return null; end if;

  select version.* into version_row
  from public.project_versions version
  where version.project_id = project_row.id and version.revision = project_row.current_revision
  limit 1;

  return jsonb_build_object(
    'publicId', project_row.public_id,
    'state', project_row.state,
    'revision', project_row.current_revision,
    'title', version_row.title,
    'publicSynopsis', version_row.public_synopsis,
    'privateBrief', version_row.private_brief,
    'category', version_row.category,
    'format', version_row.format,
    'boundaries', to_jsonb(version_row.boundaries),
    'compensationModel', version_row.compensation_model,
    'distributionScope', version_row.distribution_scope,
    'rightsDeclarations', to_jsonb(version_row.rights_declarations),
    'createdAt', project_row.created_at,
    'updatedAt', project_row.updated_at
  );
end;
$$;

create or replace function public.get_project_public_synopsis(requested_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  project_row public.projects%rowtype;
  version_row public.project_versions%rowtype;
begin
  perform private.assert_current_session();
  select project.* into project_row
  from public.projects project
  where project.public_id = trim(requested_public_id)
    and project.owner_user_id = auth.uid()
  limit 1;
  if project_row.id is null then return null; end if;

  select version.* into version_row
  from public.project_versions version
  where version.project_id = project_row.id and version.revision = project_row.current_revision
  limit 1;

  return jsonb_build_object(
    'publicId', project_row.public_id,
    'state', project_row.state,
    'revision', project_row.current_revision,
    'title', version_row.title,
    'publicSynopsis', version_row.public_synopsis,
    'category', version_row.category,
    'format', version_row.format
  );
end;
$$;

create or replace function public.list_my_projects()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
  select coalesce(jsonb_agg(item order by item ->> 'updatedAt' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'publicId', project.public_id,
      'state', project.state,
      'revision', project.current_revision,
      'title', version.title,
      'publicSynopsis', version.public_synopsis,
      'updatedAt', project.updated_at
    ) as item
    from public.projects project
    join public.project_versions version
      on version.project_id = project.id and version.revision = project.current_revision
    where project.owner_user_id = auth.uid()
      and coalesce(private.session_is_current(auth.uid()), false)
  ) rows;
$$;

revoke all on function private.assert_creator_project_action() from public, anon, authenticated;
revoke all on function private.normalize_project_input(jsonb) from public, anon, authenticated;
revoke all on function private.insert_project_version(uuid, integer, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.insert_project(uuid, jsonb, uuid) from public, anon, authenticated;

revoke all on function public.create_project_draft(jsonb) from public, anon, authenticated;
revoke all on function public.convert_demand_to_project(text, jsonb) from public, anon, authenticated;
revoke all on function public.update_project_draft(text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.get_project_private(text) from public, anon, authenticated;
revoke all on function public.get_project_public_synopsis(text) from public, anon, authenticated;
revoke all on function public.list_my_projects() from public, anon, authenticated;

grant execute on function public.create_project_draft(jsonb) to authenticated;
grant execute on function public.convert_demand_to_project(text, jsonb) to authenticated;
grant execute on function public.update_project_draft(text, integer, jsonb) to authenticated;
grant execute on function public.get_project_private(text) to authenticated;
grant execute on function public.get_project_public_synopsis(text) to authenticated;
grant execute on function public.list_my_projects() to authenticated;
