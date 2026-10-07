-- Complete project draft/revision structure with script, budget, schedule, and readiness.
-- Defaults preserve every historical project version while new revisions carry the richer shape.

alter table public.project_versions
  add column if not exists script_version text not null default 'draft-1',
  add column if not exists budget_minor bigint,
  add column if not exists budget_currency text,
  add column if not exists production_schedule text not null default 'To be scheduled',
  add column if not exists readiness_items text[] not null default '{}'::text[];

alter table public.project_versions
  drop constraint if exists project_versions_script_version_check,
  drop constraint if exists project_versions_budget_complete_check,
  drop constraint if exists project_versions_budget_amount_check,
  drop constraint if exists project_versions_budget_currency_check,
  drop constraint if exists project_versions_schedule_check,
  drop constraint if exists project_versions_readiness_count_check;

alter table public.project_versions
  add constraint project_versions_script_version_check
    check (char_length(trim(script_version)) between 1 and 120 and script_version !~ '[[:cntrl:]]'),
  add constraint project_versions_budget_complete_check
    check ((budget_minor is null and budget_currency is null) or (budget_minor is not null and budget_currency is not null)),
  add constraint project_versions_budget_amount_check
    check (budget_minor is null or budget_minor between 0 and 9007199254740991),
  add constraint project_versions_budget_currency_check
    check (budget_currency is null or budget_currency ~ '^[A-Z]{3}$'),
  add constraint project_versions_schedule_check
    check (char_length(trim(production_schedule)) between 3 and 1000 and production_schedule !~ '[[:cntrl:]]'),
  add constraint project_versions_readiness_count_check
    check (cardinality(readiness_items) between 0 and 20);

create or replace function private.normalize_project_input(project_input jsonb)
returns jsonb
language plpgsql
immutable
set search_path=pg_catalog,public
as $$
declare
  normalized_title text;
  normalized_public text;
  normalized_private text;
  normalized_category text;
  normalized_format text;
  normalized_compensation text;
  normalized_distribution text;
  normalized_script_version text;
  normalized_schedule text;
  normalized_budget_minor bigint;
  normalized_budget_currency text;
  normalized_boundaries jsonb;
  normalized_rights jsonb;
  normalized_readiness jsonb;
begin
  if project_input is null or jsonb_typeof(project_input)<>'object' then
    raise exception 'invalid_project_input' using errcode='22023';
  end if;

  normalized_title:=trim(coalesce(project_input->>'title',''));
  normalized_public:=trim(coalesce(project_input->>'publicSynopsis',''));
  normalized_private:=trim(coalesce(project_input->>'privateBrief',''));
  normalized_category:=lower(trim(coalesce(project_input->>'category','')));
  normalized_format:=lower(trim(coalesce(project_input->>'format','')));
  normalized_compensation:=lower(trim(coalesce(project_input->>'compensationModel','')));
  normalized_distribution:=trim(coalesce(project_input->>'distributionScope',''));
  normalized_script_version:=trim(coalesce(nullif(project_input->>'scriptVersion',''),'draft-1'));
  normalized_schedule:=trim(coalesce(nullif(project_input->>'productionSchedule',''),'To be scheduled'));

  if char_length(normalized_title) not between 4 and 120 or normalized_title ~ '[[:cntrl:]]' then raise exception 'invalid_project_title' using errcode='22023'; end if;
  if char_length(normalized_public) not between 20 and 600 or normalized_public ~ '[[:cntrl:]]' then raise exception 'invalid_project_public_synopsis' using errcode='22023'; end if;
  if char_length(normalized_private) not between 20 and 4000 or normalized_private ~ '[[:cntrl:]]' then raise exception 'invalid_project_private_brief' using errcode='22023'; end if;
  if normalized_category !~ '^[a-z0-9][a-z0-9_-]{1,47}$' or normalized_format !~ '^[a-z0-9][a-z0-9_-]{1,47}$' then raise exception 'invalid_project_classification' using errcode='22023'; end if;
  if normalized_compensation not in ('fixed','revenue_share','hybrid','unpaid') then raise exception 'invalid_project_compensation' using errcode='22023'; end if;
  if char_length(normalized_distribution) not between 4 and 240 or normalized_distribution ~ '[[:cntrl:]]' then raise exception 'invalid_project_distribution_scope' using errcode='22023'; end if;
  if char_length(normalized_script_version) not between 1 and 120 or normalized_script_version ~ '[[:cntrl:]]' then raise exception 'invalid_project_script_version' using errcode='22023'; end if;
  if char_length(normalized_schedule) not between 3 and 1000 or normalized_schedule ~ '[[:cntrl:]]' then raise exception 'invalid_project_schedule' using errcode='22023'; end if;

  if project_input ? 'budget' and project_input->'budget' <> 'null'::jsonb then
    if jsonb_typeof(project_input->'budget')<>'object'
       or jsonb_typeof(project_input->'budget'->'minor')<>'number'
       or jsonb_typeof(project_input->'budget'->'currency')<>'string'
       or (project_input->'budget'->>'minor') !~ '^[0-9]+$' then
      raise exception 'invalid_project_budget' using errcode='22023';
    end if;
    begin normalized_budget_minor:=(project_input->'budget'->>'minor')::bigint;
    exception when others then raise exception 'invalid_project_budget' using errcode='22023'; end;
    normalized_budget_currency:=upper(trim(project_input->'budget'->>'currency'));
    if normalized_budget_minor<0 or normalized_budget_minor>9007199254740991 or normalized_budget_currency !~ '^[A-Z]{3}$' then
      raise exception 'invalid_project_budget' using errcode='22023';
    end if;
  end if;

  if project_input ? 'boundaries' and jsonb_typeof(project_input->'boundaries')<>'array' then raise exception 'invalid_project_boundaries' using errcode='22023'; end if;
  if project_input ? 'rightsDeclarations' and jsonb_typeof(project_input->'rightsDeclarations')<>'array' then raise exception 'invalid_project_rights' using errcode='22023'; end if;
  if project_input ? 'readinessItems' and jsonb_typeof(project_input->'readinessItems')<>'array' then raise exception 'invalid_project_readiness' using errcode='22023'; end if;

  if coalesce(jsonb_array_length(coalesce(project_input->'boundaries','[]'::jsonb)),0)>16
     or coalesce(jsonb_array_length(coalesce(project_input->'rightsDeclarations','[]'::jsonb)),0)>16
     or coalesce(jsonb_array_length(coalesce(project_input->'readinessItems','[]'::jsonb)),0)>20 then
    raise exception 'invalid_project_list' using errcode='22023';
  end if;

  if exists(select 1 from jsonb_array_elements_text(coalesce(project_input->'boundaries','[]'::jsonb)) item(value)
    where lower(trim(value)) !~ '^[a-z0-9][a-z0-9 _-]{1,63}$') then raise exception 'invalid_project_boundaries' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(project_input->'rightsDeclarations','[]'::jsonb)) item(value)
    where lower(trim(value)) !~ '^[a-z0-9][a-z0-9_-]{1,63}$') then raise exception 'invalid_project_rights' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(project_input->'readinessItems','[]'::jsonb)) item(value)
    where char_length(trim(value)) not between 3 and 160 or trim(value) ~ '[[:cntrl:]]') then raise exception 'invalid_project_readiness' using errcode='22023'; end if;

  select coalesce(jsonb_agg(value order by value),'[]'::jsonb) into normalized_boundaries
  from (select distinct lower(trim(item.value)) value from jsonb_array_elements_text(coalesce(project_input->'boundaries','[]'::jsonb)) item(value)) normalized;
  select coalesce(jsonb_agg(value order by value),'[]'::jsonb) into normalized_rights
  from (select distinct lower(trim(item.value)) value from jsonb_array_elements_text(coalesce(project_input->'rightsDeclarations','[]'::jsonb)) item(value)) normalized;
  select coalesce(jsonb_agg(value order by value),'[]'::jsonb) into normalized_readiness
  from (select distinct trim(item.value) value from jsonb_array_elements_text(coalesce(project_input->'readinessItems','[]'::jsonb)) item(value)) normalized;

  return jsonb_build_object(
    'title',normalized_title,
    'publicSynopsis',normalized_public,
    'privateBrief',normalized_private,
    'category',normalized_category,
    'format',normalized_format,
    'boundaries',normalized_boundaries,
    'compensationModel',normalized_compensation,
    'distributionScope',normalized_distribution,
    'rightsDeclarations',normalized_rights,
    'scriptVersion',normalized_script_version,
    'budget',case when normalized_budget_minor is null then null else jsonb_build_object('minor',normalized_budget_minor,'currency',normalized_budget_currency) end,
    'productionSchedule',normalized_schedule,
    'readinessItems',normalized_readiness
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
set search_path=pg_catalog,public,private,auth
as $$
declare version_id uuid;
begin
  insert into public.project_versions(
    project_id,revision,title,public_synopsis,private_brief,category,format,
    boundaries,compensation_model,distribution_scope,rights_declarations,
    script_version,budget_minor,budget_currency,production_schedule,readiness_items,created_by_user_id
  ) values(
    project_row_id,revision_number,normalized->>'title',normalized->>'publicSynopsis',normalized->>'privateBrief',
    normalized->>'category',normalized->>'format',
    array(select jsonb_array_elements_text(normalized->'boundaries')),
    normalized->>'compensationModel',normalized->>'distributionScope',
    array(select jsonb_array_elements_text(normalized->'rightsDeclarations')),
    normalized->>'scriptVersion',
    case when normalized->'budget'='null'::jsonb then null else (normalized->'budget'->>'minor')::bigint end,
    case when normalized->'budget'='null'::jsonb then null else normalized->'budget'->>'currency' end,
    normalized->>'productionSchedule',
    array(select jsonb_array_elements_text(normalized->'readinessItems')),
    actor_user_id
  ) returning id into version_id;
  return version_id;
end;
$$;

create or replace function public.get_project_private(requested_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare project_row public.projects%rowtype; version_row public.project_versions%rowtype;
begin
  perform private.assert_current_session();
  select project.* into project_row from public.projects project
  where project.public_id=trim(requested_public_id) and project.owner_user_id=auth.uid() limit 1;
  if project_row.id is null then return null; end if;

  select version.* into version_row from public.project_versions version
  where version.project_id=project_row.id and version.revision=project_row.current_revision limit 1;

  return jsonb_build_object(
    'publicId',project_row.public_id,'state',project_row.state,'revision',project_row.current_revision,
    'title',version_row.title,'publicSynopsis',version_row.public_synopsis,'privateBrief',version_row.private_brief,
    'category',version_row.category,'format',version_row.format,'boundaries',to_jsonb(version_row.boundaries),
    'compensationModel',version_row.compensation_model,'distributionScope',version_row.distribution_scope,
    'rightsDeclarations',to_jsonb(version_row.rights_declarations),
    'scriptVersion',version_row.script_version,
    'budget',case when version_row.budget_minor is null then null else jsonb_build_object('minor',version_row.budget_minor,'currency',version_row.budget_currency) end,
    'productionSchedule',version_row.production_schedule,
    'readinessItems',to_jsonb(version_row.readiness_items),
    'createdAt',project_row.created_at,'updatedAt',project_row.updated_at
  );
end;
$$;

notify pgrst,'reload schema';
