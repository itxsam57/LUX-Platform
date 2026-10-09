create type public.production_status as enum ('planned','active','delayed','at_risk','complete');
create type public.production_task_status as enum ('todo','in_progress','blocked','done');
create type public.production_update_kind as enum ('progress','delay','risk');
create type public.production_update_state as enum ('draft','approved','published');
create type public.production_approval_state as enum ('approved','rejected');
create type public.production_asset_kind as enum ('script','media','evidence');

create table public.production_workspaces (
  project_id uuid primary key references public.projects(id) on delete cascade,
  status public.production_status not null default 'planned',
  revised_estimate timestamptz,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.project_access_revocations (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  revoked_by_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  primary key(project_id,user_id)
);

create table public.production_milestones (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^mil[0-9a-f]{24}$'),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 160),
  due_at timestamptz,
  status public.production_task_status not null default 'todo',
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.production_tasks (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^tsk[0-9a-f]{24}$'),
  project_id uuid not null references public.projects(id) on delete cascade,
  milestone_id uuid references public.production_milestones(id) on delete set null,
  title text not null check (char_length(trim(title)) between 3 and 200),
  assignee_user_id uuid references auth.users(id) on delete set null,
  role_name text not null check (role_name ~ '^[a-z0-9][a-z0-9 _-]{1,63}$'),
  status public.production_task_status not null default 'todo',
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.production_assets (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^ast[0-9a-f]{24}$'),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind public.production_asset_kind not null,
  object_path text not null unique check (char_length(object_path) between 20 and 500),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.production_asset_access_tokens (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.production_assets(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table public.production_updates (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^upd[0-9a-f]{24}$'),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind public.production_update_kind not null,
  state public.production_update_state not null default 'draft',
  body text not null check (char_length(trim(body)) between 3 and 4000),
  revised_estimate timestamptz,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  approved_by_user_id uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_update_state_timestamps check (
    (state='draft' and approved_at is null and published_at is null)
    or (state='approved' and approved_at is not null and published_at is null)
    or (state='published' and approved_at is not null and published_at is not null)
  )
);

create table public.production_approvals (
  project_id uuid not null references public.projects(id) on delete cascade,
  milestone_id uuid references public.production_milestones(id) on delete cascade,
  task_id uuid references public.production_tasks(id) on delete cascade,
  approver_user_id uuid not null references auth.users(id) on delete cascade,
  state public.production_approval_state not null,
  note text check (note is null or char_length(trim(note)) between 1 and 1000),
  updated_at timestamptz not null default now(),
  constraint production_approval_one_target check ((milestone_id is null) <> (task_id is null)),
  unique(milestone_id,approver_user_id),
  unique(task_id,approver_user_id)
);

create index production_milestones_project_idx on public.production_milestones(project_id,due_at,created_at);
create index production_tasks_project_idx on public.production_tasks(project_id,status,created_at);
create index production_tasks_assignee_idx on public.production_tasks(assignee_user_id,status) where assignee_user_id is not null;
create index production_updates_project_idx on public.production_updates(project_id,state,created_at desc);
create index production_asset_tokens_actor_idx on public.production_asset_access_tokens(actor_user_id,expires_at desc);

alter table public.production_workspaces enable row level security;
alter table public.project_access_revocations enable row level security;
alter table public.production_milestones enable row level security;
alter table public.production_tasks enable row level security;
alter table public.production_assets enable row level security;
alter table public.production_asset_access_tokens enable row level security;
alter table public.production_updates enable row level security;
alter table public.production_approvals enable row level security;

revoke all on public.production_workspaces from public,anon,authenticated;
revoke all on public.project_access_revocations from public,anon,authenticated;
revoke all on public.production_milestones from public,anon,authenticated;
revoke all on public.production_tasks from public,anon,authenticated;
revoke all on public.production_assets from public,anon,authenticated;
revoke all on public.production_asset_access_tokens from public,anon,authenticated;
revoke all on public.production_updates from public,anon,authenticated;
revoke all on public.production_approvals from public,anon,authenticated;

create or replace function private.user_has_project_production_access(
  project_row_id uuid,
  actor_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
  select actor_user_id is not null
    and not exists(
      select 1 from public.project_access_revocations revoked
      where revoked.project_id=project_row_id and revoked.user_id=actor_user_id
    )
    and (
      exists(select 1 from public.projects project where project.id=project_row_id and project.owner_user_id=actor_user_id)
      or exists(
        select 1
        from public.project_invitations invitation
        where invitation.project_id=project_row_id
          and invitation.recipient_user_id=actor_user_id
          and invitation.state='accepted'
          and invitation.accepted_proposal_version is not null
          and invitation.invalidated_at is null
      )
    );
$$;

create or replace function private.user_owns_project(project_row_id uuid, actor_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
  select exists(select 1 from public.projects project where project.id=project_row_id and project.owner_user_id=actor_user_id);
$$;

create or replace function private.require_production_project(requested_project_public_id text)
returns uuid
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare project_row_id uuid;
begin
  perform private.assert_current_session();
  select project.id into project_row_id
  from public.projects project
  where project.public_id=trim(coalesce(requested_project_public_id,''));
  if project_row_id is null or not private.user_has_project_production_access(project_row_id,auth.uid()) then
    raise exception 'production_project_access_denied' using errcode='42501';
  end if;
  return project_row_id;
end;
$$;

create or replace function private.require_production_owner(requested_project_public_id text)
returns uuid
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare project_row_id uuid;
begin
  perform private.assert_current_session();
  select project.id into project_row_id
  from public.projects project
  where project.public_id=trim(coalesce(requested_project_public_id,'')) and project.owner_user_id=auth.uid();
  if project_row_id is null then raise exception 'production_owner_required' using errcode='42501'; end if;
  return project_row_id;
end;
$$;

create or replace function public.get_production_workspace(requested_project_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare
  project_row_id uuid;
  project_row public.projects%rowtype;
  version_row public.project_versions%rowtype;
  workspace_row public.production_workspaces%rowtype;
begin
  project_row_id:=private.require_production_project(requested_project_public_id);
  select * into project_row from public.projects where id=project_row_id;
  select * into version_row from public.project_versions where project_id=project_row_id and revision=project_row.current_revision;
  select * into workspace_row from public.production_workspaces where project_id=project_row_id;

  return jsonb_build_object(
    'projectPublicId',project_row.public_id,
    'title',version_row.title,
    'projectState',project_row.state,
    'isOwner',private.user_owns_project(project_row_id,auth.uid()),
    'status',coalesce(workspace_row.status::text,'planned'),
    'revisedEstimate',workspace_row.revised_estimate,
    'milestones',coalesce((select jsonb_agg(jsonb_build_object(
      'publicId',m.public_id,'title',m.title,'dueAt',m.due_at,'status',m.status,'updatedAt',m.updated_at
    ) order by m.due_at nulls last,m.created_at) from public.production_milestones m where m.project_id=project_row_id),'[]'::jsonb),
    'tasks',coalesce((select jsonb_agg(jsonb_build_object(
      'publicId',t.public_id,'title',t.title,'roleName',t.role_name,'status',t.status,
      'assignedToMe',t.assignee_user_id=auth.uid(),'milestonePublicId',m.public_id,'updatedAt',t.updated_at
    ) order by t.created_at) from public.production_tasks t left join public.production_milestones m on m.id=t.milestone_id where t.project_id=project_row_id),'[]'::jsonb),
    'assets',coalesce((select jsonb_agg(jsonb_build_object(
      'publicId',a.public_id,'kind',a.kind,'sha256',a.sha256,'createdAt',a.created_at
    ) order by a.created_at desc) from public.production_assets a where a.project_id=project_row_id),'[]'::jsonb),
    'updates',coalesce((select jsonb_agg(jsonb_build_object(
      'publicId',u.public_id,'kind',u.kind,'state',u.state,'body',u.body,'revisedEstimate',u.revised_estimate,
      'createdAt',u.created_at,'publishedAt',u.published_at
    ) order by u.created_at desc) from public.production_updates u where u.project_id=project_row_id),'[]'::jsonb),
    'approvals',coalesce((select jsonb_agg(jsonb_build_object(
      'targetPublicId',coalesce(m.public_id,t.public_id),'state',a.state,'note',a.note,
      'isMine',a.approver_user_id=auth.uid(),'updatedAt',a.updated_at
    ) order by a.updated_at desc)
      from public.production_approvals a
      left join public.production_milestones m on m.id=a.milestone_id
      left join public.production_tasks t on t.id=a.task_id
      where a.project_id=project_row_id),'[]'::jsonb)
  );
end;
$$;

create or replace function public.set_production_status(
  requested_project_public_id text,
  requested_status text,
  requested_revised_estimate timestamptz,
  requested_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare
  project_row_id uuid;
  next_status public.production_status;
  previous_status public.production_status;
  normalized_reason text:=trim(coalesce(requested_reason,''));
begin
  project_row_id:=private.require_production_owner(requested_project_public_id);
  begin next_status:=lower(trim(requested_status))::public.production_status;
  exception when others then raise exception 'invalid_production_status' using errcode='22023'; end;
  if next_status in ('delayed','at_risk') and (char_length(normalized_reason) not between 3 and 1000 or requested_revised_estimate is null) then
    raise exception 'production_status_reason_required' using errcode='22023';
  end if;

  select status into previous_status from public.production_workspaces where project_id=project_row_id for update;
  insert into public.production_workspaces(project_id,status,revised_estimate,updated_by_user_id)
  values(project_row_id,next_status,requested_revised_estimate,auth.uid())
  on conflict(project_id) do update set status=excluded.status,revised_estimate=excluded.revised_estimate,updated_by_user_id=excluded.updated_by_user_id,updated_at=now();

  perform private.write_audit(auth.uid(),'production_status_changed','success','production-status','creator',jsonb_build_object(
    'projectPublicId',trim(requested_project_public_id),'fromStatus',previous_status,'toStatus',next_status,
    'revisedEstimate',requested_revised_estimate,'reason',normalized_reason
  ));
  return jsonb_build_object('status',next_status,'revisedEstimate',requested_revised_estimate);
end;
$$;

create or replace function public.create_production_milestone(
  requested_project_public_id text,
  requested_title text,
  requested_due_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare project_row_id uuid; candidate text; created_row public.production_milestones%rowtype; normalized_title text:=trim(coalesce(requested_title,''));
begin
  project_row_id:=private.require_production_owner(requested_project_public_id);
  if char_length(normalized_title) not between 3 and 160 or normalized_title ~ '[[:cntrl:]]' then raise exception 'invalid_milestone' using errcode='22023'; end if;
  loop candidate:='mil'||encode(extensions.gen_random_bytes(12),'hex'); exit when not exists(select 1 from public.production_milestones where public_id=candidate); end loop;
  insert into public.production_milestones(public_id,project_id,title,due_at,created_by_user_id)
  values(candidate,project_row_id,normalized_title,requested_due_at,auth.uid()) returning * into created_row;
  perform private.write_audit(auth.uid(),'production_milestone_created','success','production-milestone','creator',jsonb_build_object('projectPublicId',trim(requested_project_public_id),'milestonePublicId',candidate));
  return jsonb_build_object('publicId',candidate,'status',created_row.status);
end;
$$;

create or replace function public.create_production_task(
  requested_project_public_id text,
  requested_title text,
  requested_assignee_handle text,
  requested_role_name text,
  requested_milestone_public_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare
  project_row_id uuid; candidate text; assignee_id uuid; milestone_row_id uuid; normalized_title text:=trim(coalesce(requested_title,'')); normalized_role text:=lower(trim(coalesce(requested_role_name,'')));
begin
  project_row_id:=private.require_production_owner(requested_project_public_id);
  if char_length(normalized_title) not between 3 and 200 or normalized_title ~ '[[:cntrl:]]' or normalized_role !~ '^[a-z0-9][a-z0-9 _-]{1,63}$' then raise exception 'invalid_production_task' using errcode='22023'; end if;
  if nullif(trim(coalesce(requested_assignee_handle,'')),'') is not null then
    select profile.user_id into assignee_id from public.profiles profile where profile.handle=lower(trim(requested_assignee_handle));
    if assignee_id is null or not private.user_has_project_production_access(project_row_id,assignee_id) then raise exception 'production_task_assignee_denied' using errcode='42501'; end if;
  end if;
  if nullif(trim(coalesce(requested_milestone_public_id,'')),'') is not null then
    select id into milestone_row_id from public.production_milestones where project_id=project_row_id and public_id=trim(requested_milestone_public_id);
    if milestone_row_id is null then raise exception 'production_milestone_not_found' using errcode='22023'; end if;
  end if;
  loop candidate:='tsk'||encode(extensions.gen_random_bytes(12),'hex'); exit when not exists(select 1 from public.production_tasks where public_id=candidate); end loop;
  insert into public.production_tasks(public_id,project_id,milestone_id,title,assignee_user_id,role_name,created_by_user_id)
  values(candidate,project_row_id,milestone_row_id,normalized_title,assignee_id,normalized_role,auth.uid());
  perform private.write_audit(auth.uid(),'production_task_created','success','production-task','creator',jsonb_build_object('projectPublicId',trim(requested_project_public_id),'taskPublicId',candidate,'roleName',normalized_role));
  return jsonb_build_object('publicId',candidate,'status','todo');
end;
$$;

create or replace function public.set_production_task_status(requested_task_public_id text, requested_status text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare task_row public.production_tasks%rowtype; next_status public.production_task_status; project_public_id text;
begin
  perform private.assert_current_session();
  begin next_status:=lower(trim(requested_status))::public.production_task_status;
  exception when others then raise exception 'invalid_production_task_status' using errcode='22023'; end;
  select * into task_row from public.production_tasks where public_id=trim(requested_task_public_id) for update;
  if task_row.id is null or not private.user_has_project_production_access(task_row.project_id,auth.uid())
     or not (private.user_owns_project(task_row.project_id,auth.uid()) or task_row.assignee_user_id=auth.uid()) then
    raise exception 'production_task_update_denied' using errcode='42501';
  end if;
  update public.production_tasks set status=next_status,updated_at=now() where id=task_row.id;
  select public_id into project_public_id from public.projects where id=task_row.project_id;
  perform private.write_audit(auth.uid(),'production_task_status_changed','success','production-task',private.current_active_role(auth.uid()),jsonb_build_object('projectPublicId',project_public_id,'taskPublicId',task_row.public_id,'fromStatus',task_row.status,'toStatus',next_status));
  return jsonb_build_object('publicId',task_row.public_id,'status',next_status);
end;
$$;

create or replace function public.record_production_approval(
  requested_project_public_id text,
  requested_target_public_id text,
  requested_state text,
  requested_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare project_row_id uuid; milestone_row_id uuid; task_row_id uuid; next_state public.production_approval_state; normalized_note text:=nullif(trim(coalesce(requested_note,'')),'');
begin
  project_row_id:=private.require_production_project(requested_project_public_id);
  begin next_state:=lower(trim(requested_state))::public.production_approval_state;
  exception when others then raise exception 'invalid_production_approval' using errcode='22023'; end;
  if normalized_note is not null and (char_length(normalized_note)>1000 or normalized_note ~ '[[:cntrl:]]') then raise exception 'invalid_production_approval_note' using errcode='22023'; end if;
  select id into milestone_row_id from public.production_milestones where project_id=project_row_id and public_id=trim(requested_target_public_id);
  if milestone_row_id is null then select id into task_row_id from public.production_tasks where project_id=project_row_id and public_id=trim(requested_target_public_id); end if;
  if milestone_row_id is null and task_row_id is null then raise exception 'production_approval_target_not_found' using errcode='22023'; end if;
  if milestone_row_id is not null then
    insert into public.production_approvals(project_id,milestone_id,approver_user_id,state,note)
    values(project_row_id,milestone_row_id,auth.uid(),next_state,normalized_note)
    on conflict(milestone_id,approver_user_id) do update set state=excluded.state,note=excluded.note,updated_at=now();
  else
    insert into public.production_approvals(project_id,task_id,approver_user_id,state,note)
    values(project_row_id,task_row_id,auth.uid(),next_state,normalized_note)
    on conflict(task_id,approver_user_id) do update set state=excluded.state,note=excluded.note,updated_at=now();
  end if;
  perform private.write_audit(auth.uid(),'production_approval_recorded','success','production-approval',private.current_active_role(auth.uid()),jsonb_build_object('projectPublicId',trim(requested_project_public_id),'targetPublicId',trim(requested_target_public_id),'state',next_state));
  return jsonb_build_object('targetPublicId',trim(requested_target_public_id),'state',next_state);
end;
$$;

create or replace function public.register_production_asset(
  requested_project_public_id text,
  requested_kind text,
  requested_object_path text,
  requested_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare project_row_id uuid; candidate text; asset_kind public.production_asset_kind; normalized_path text:=trim(coalesce(requested_object_path,'')); normalized_sha text:=lower(trim(coalesce(requested_sha256,'')));
begin
  project_row_id:=private.require_production_owner(requested_project_public_id);
  begin asset_kind:=lower(trim(requested_kind))::public.production_asset_kind;
  exception when others then raise exception 'invalid_production_asset_kind' using errcode='22023'; end;
  if normalized_path !~ ('^'||trim(requested_project_public_id)||'/[A-Za-z0-9._/-]+$')
     or length(split_part(normalized_path, '/', 2)) < 8
     or length(split_part(normalized_path, '/', 2)) > 420
     or normalized_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_production_asset' using errcode='22023';
  end if;
  loop candidate:='ast'||encode(extensions.gen_random_bytes(12),'hex'); exit when not exists(select 1 from public.production_assets where public_id=candidate); end loop;
  insert into public.production_assets(public_id,project_id,kind,object_path,sha256,created_by_user_id)
  values(candidate,project_row_id,asset_kind,normalized_path,normalized_sha,auth.uid());
  perform private.write_audit(auth.uid(),'production_asset_registered','success','production-asset','creator',jsonb_build_object('projectPublicId',trim(requested_project_public_id),'assetPublicId',candidate,'kind',asset_kind,'sha256',normalized_sha));
  return jsonb_build_object('publicId',candidate,'kind',asset_kind,'sha256',normalized_sha);
end;
$$;

create or replace function public.issue_production_asset_access(requested_asset_public_id text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare asset_row public.production_assets%rowtype; raw_token text; token_hash_value text; expiry timestamptz:=now()+interval '5 minutes';
begin
  perform private.assert_current_session();
  select * into asset_row from public.production_assets where public_id=trim(requested_asset_public_id);
  if asset_row.id is null or not private.user_has_project_production_access(asset_row.project_id,auth.uid()) then raise exception 'production_asset_access_denied' using errcode='42501'; end if;
  raw_token:=encode(extensions.gen_random_bytes(32),'hex');
  token_hash_value:=encode(extensions.digest(convert_to(raw_token,'UTF8'),'sha256'),'hex');
  insert into public.production_asset_access_tokens(asset_id,actor_user_id,token_hash,expires_at) values(asset_row.id,auth.uid(),token_hash_value,expiry);
  perform private.write_audit(auth.uid(),'production_asset_access_issued','success','production-asset',private.current_active_role(auth.uid()),jsonb_build_object('assetPublicId',asset_row.public_id,'expiresAt',expiry));
  return jsonb_build_object('downloadPath','/production-assets/'||raw_token,'expiresAt',expiry);
end;
$$;

create or replace function public.resolve_production_asset_access(requested_token text)
returns text
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare token_row public.production_asset_access_tokens%rowtype; asset_row public.production_assets%rowtype; digest_value text;
begin
  perform private.assert_current_session();
  if trim(coalesce(requested_token,'')) !~ '^[0-9a-f]{64}$' then return null; end if;
  digest_value:=encode(extensions.digest(convert_to(trim(requested_token),'UTF8'),'sha256'),'hex');
  select * into token_row from public.production_asset_access_tokens where token_hash=digest_value and actor_user_id=auth.uid() and expires_at>now() for update;
  if token_row.id is null then return null; end if;
  select * into asset_row from public.production_assets where id=token_row.asset_id;
  if asset_row.id is null or not private.user_has_project_production_access(asset_row.project_id,auth.uid()) then return null; end if;
  update public.production_asset_access_tokens set last_accessed_at=now() where id=token_row.id;
  perform private.write_audit(auth.uid(),'production_asset_accessed','success','production-asset',private.current_active_role(auth.uid()),jsonb_build_object('assetPublicId',asset_row.public_id));
  return asset_row.object_path;
end;
$$;

create or replace function public.create_production_update(
  requested_project_public_id text,
  requested_kind text,
  requested_body text,
  requested_revised_estimate timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare project_row_id uuid; update_kind public.production_update_kind; normalized_body text:=trim(coalesce(requested_body,'')); candidate text;
begin
  project_row_id:=private.require_production_owner(requested_project_public_id);
  begin update_kind:=lower(trim(requested_kind))::public.production_update_kind;
  exception when others then raise exception 'invalid_production_update_kind' using errcode='22023'; end;
  if char_length(normalized_body) not between 3 and 4000 or normalized_body ~ '[[:cntrl:]]' or (update_kind in ('delay','risk') and requested_revised_estimate is null) then raise exception 'invalid_production_update' using errcode='22023'; end if;
  loop candidate:='upd'||encode(extensions.gen_random_bytes(12),'hex'); exit when not exists(select 1 from public.production_updates where public_id=candidate); end loop;
  insert into public.production_updates(public_id,project_id,kind,body,revised_estimate,created_by_user_id) values(candidate,project_row_id,update_kind,normalized_body,requested_revised_estimate,auth.uid());
  perform private.write_audit(auth.uid(),'production_update_created','success','production-update','creator',jsonb_build_object('projectPublicId',trim(requested_project_public_id),'updatePublicId',candidate,'kind',update_kind));
  return jsonb_build_object('publicId',candidate,'state','draft');
end;
$$;

create or replace function public.set_production_update_state(requested_update_public_id text, requested_state text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare update_row public.production_updates%rowtype; next_state public.production_update_state; project_public_id text;
begin
  perform private.assert_current_session();
  begin next_state:=lower(trim(requested_state))::public.production_update_state;
  exception when others then raise exception 'invalid_production_update_state' using errcode='22023'; end;
  select * into update_row from public.production_updates where public_id=trim(requested_update_public_id) for update;
  if update_row.id is null or not private.user_owns_project(update_row.project_id,auth.uid()) then raise exception 'production_update_state_denied' using errcode='42501'; end if;
  if not ((update_row.state='draft' and next_state='approved') or (update_row.state='approved' and next_state='published')) then raise exception 'production_update_transition_denied' using errcode='42501'; end if;
  update public.production_updates
  set state=next_state,approved_by_user_id=case when next_state='approved' then auth.uid() else approved_by_user_id end,
      approved_at=case when next_state='approved' then now() else approved_at end,published_at=case when next_state='published' then now() else null end,updated_at=now()
  where id=update_row.id;
  select public_id into project_public_id from public.projects where id=update_row.project_id;
  perform private.write_audit(auth.uid(),'production_update_state_changed','success','production-update','creator',jsonb_build_object('projectPublicId',project_public_id,'updatePublicId',update_row.public_id,'fromState',update_row.state,'toState',next_state));
  return jsonb_build_object('publicId',update_row.public_id,'state',next_state);
end;
$$;

create or replace function public.list_supporter_production_updates(requested_campaign_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare project_row_id uuid;
begin
  perform private.assert_current_session();
  select campaign.project_id into project_row_id
  from public.campaigns campaign
  where campaign.public_id=trim(coalesce(requested_campaign_public_id,''))
    and exists(
      select 1
      from public.funding_commitments commitment
      join public.campaign_term_versions terms on terms.id=commitment.campaign_term_version_id
      left join public.payment_transactions payment on payment.funding_commitment_id=commitment.id
      where terms.campaign_id=campaign.id and commitment.supporter_user_id=auth.uid()
        and coalesce(payment.captured_minor,0)>coalesce(payment.refunded_minor,0)
    );
  if project_row_id is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'publicId',u.public_id,'kind',u.kind,'body',u.body,'revisedEstimate',u.revised_estimate,'publishedAt',u.published_at
  ) order by u.published_at desc) from public.production_updates u where u.project_id=project_row_id and u.state='published'),'[]'::jsonb);
end;
$$;

create or replace function public.revoke_project_collaborator_access(
  requested_project_public_id text,
  requested_collaborator_handle text,
  requested_reason text
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare project_row_id uuid; collaborator_id uuid; normalized_reason text:=trim(coalesce(requested_reason,''));
begin
  project_row_id:=private.require_production_owner(requested_project_public_id);
  if char_length(normalized_reason) not between 3 and 500 or normalized_reason ~ '[[:cntrl:]]' then raise exception 'invalid_access_revocation_reason' using errcode='22023'; end if;
  select profile.user_id into collaborator_id from public.profiles profile where profile.handle=lower(trim(coalesce(requested_collaborator_handle,'')));
  if collaborator_id is null or not exists(select 1 from public.project_invitations invitation where invitation.project_id=project_row_id and invitation.recipient_user_id=collaborator_id and invitation.state='accepted') then raise exception 'project_collaborator_not_found' using errcode='22023'; end if;
  insert into public.project_access_revocations(project_id,user_id,revoked_by_user_id,reason)
  values(project_row_id,collaborator_id,auth.uid(),normalized_reason)
  on conflict(project_id,user_id) do update set revoked_by_user_id=excluded.revoked_by_user_id,reason=excluded.reason,created_at=now();
  perform private.write_audit(auth.uid(),'project_collaborator_access_revoked','success','production-access','creator',jsonb_build_object('projectPublicId',trim(requested_project_public_id),'collaboratorHandle',lower(trim(requested_collaborator_handle)),'reason',normalized_reason));
end;
$$;

insert into storage.buckets(id,name,public,file_size_limit)
values('production-assets','production-assets',false,1073741824)
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;

drop policy if exists production_assets_insert_owner on storage.objects;
create policy production_assets_insert_owner on storage.objects for insert to authenticated
with check (
  bucket_id='production-assets'
  and exists(
    select 1 from public.projects project
    where project.public_id=(storage.foldername(name))[1]
      and project.owner_user_id=auth.uid()
  )
);

drop policy if exists production_assets_read_member on storage.objects;
create policy production_assets_read_member on storage.objects for select to authenticated
using (
  bucket_id='production-assets'
  and exists(
    select 1 from public.projects project
    where project.public_id=(storage.foldername(name))[1]
      and private.user_has_project_production_access(project.id,auth.uid())
  )
);

drop policy if exists production_assets_delete_owner on storage.objects;
create policy production_assets_delete_owner on storage.objects for delete to authenticated
using (
  bucket_id='production-assets'
  and exists(
    select 1 from public.projects project
    where project.public_id=(storage.foldername(name))[1]
      and project.owner_user_id=auth.uid()
  )
);

revoke all on function private.user_has_project_production_access(uuid,uuid) from public,anon,authenticated;
revoke all on function private.user_owns_project(uuid,uuid) from public,anon,authenticated;
revoke all on function private.require_production_project(text) from public,anon,authenticated;
revoke all on function private.require_production_owner(text) from public,anon,authenticated;

revoke all on function public.get_production_workspace(text) from public,anon,authenticated;
revoke all on function public.set_production_status(text,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.create_production_milestone(text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.create_production_task(text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.set_production_task_status(text,text) from public,anon,authenticated;
revoke all on function public.record_production_approval(text,text,text,text) from public,anon,authenticated;
revoke all on function public.register_production_asset(text,text,text,text) from public,anon,authenticated;
revoke all on function public.issue_production_asset_access(text) from public,anon,authenticated;
revoke all on function public.resolve_production_asset_access(text) from public,anon,authenticated;
revoke all on function public.create_production_update(text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.set_production_update_state(text,text) from public,anon,authenticated;
revoke all on function public.list_supporter_production_updates(text) from public,anon,authenticated;
revoke all on function public.revoke_project_collaborator_access(text,text,text) from public,anon,authenticated;

grant execute on function public.get_production_workspace(text) to authenticated;
grant execute on function public.set_production_status(text,text,timestamptz,text) to authenticated;
grant execute on function public.create_production_milestone(text,text,timestamptz) to authenticated;
grant execute on function public.create_production_task(text,text,text,text,text) to authenticated;
grant execute on function public.set_production_task_status(text,text) to authenticated;
grant execute on function public.record_production_approval(text,text,text,text) to authenticated;
grant execute on function public.register_production_asset(text,text,text,text) to authenticated;
grant execute on function public.issue_production_asset_access(text) to authenticated;
grant execute on function public.resolve_production_asset_access(text) to authenticated;
grant execute on function public.create_production_update(text,text,text,timestamptz) to authenticated;
grant execute on function public.set_production_update_state(text,text) to authenticated;
grant execute on function public.list_supporter_production_updates(text) to authenticated;
grant execute on function public.revoke_project_collaborator_access(text,text,text) to authenticated;
