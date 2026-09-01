-- Slice 7 forward fix: stale optimistic-concurrency writes are logical HTTP
-- conflicts, not PostgreSQL serialization failures. PostgREST versions before
-- the transaction-retry fix may retry SQLSTATE 40001 indefinitely, so expose
-- the supported PT409 custom status instead while preserving every existing
-- authorization, ownership, state, locking, versioning, and audit boundary.

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
    raise exception 'project_revision_conflict' using errcode = 'PT409';
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
