create table public.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^mod[0-9a-f]{24}$'),
  subject_type text not null check (subject_type in ('profile','project','campaign','release','support_case')),
  subject_public_id text not null check (char_length(trim(subject_public_id)) between 3 and 120 and subject_public_id !~ '[[:cntrl:]]'),
  summary text not null check (char_length(trim(summary)) between 8 and 500 and summary !~ '[[:cntrl:]]'),
  state text not null default 'open' check (state in ('open','in_review','resolved')),
  opened_by_user_id uuid not null references auth.users(id) on delete restrict,
  resolved_by_user_id uuid references auth.users(id) on delete restrict,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check ((state='resolved' and resolved_at is not null and resolved_by_user_id is not null) or state<>'resolved')
);

create table public.moderation_case_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.moderation_cases(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('opened','review_started','resolved')),
  reason text not null check (char_length(trim(reason)) between 8 and 1000 and reason !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now()
);

create table public.support_cases (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^sup[0-9a-f]{24}$'),
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  subject text not null check (char_length(trim(subject)) between 8 and 160 and subject !~ '[[:cntrl:]]'),
  body text not null check (char_length(trim(body)) between 20 and 4000 and body !~ '[[:cntrl:]]'),
  state text not null default 'open' check (state in ('open','in_progress','resolved')),
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.support_case_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.support_cases(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('opened','assigned','in_progress','resolved')),
  reason text not null check (char_length(trim(reason)) between 8 and 1000 and reason !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now()
);

create table public.operational_configuration (
  key text primary key check (key ~ '^[a-z][a-z0-9_.:-]{2,63}$'),
  value jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  updated_by_user_id uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.operational_configuration_events (
  id bigint generated always as identity primary key,
  config_key text not null,
  revision bigint not null check (revision >= 1),
  value jsonb not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 8 and 1000 and reason !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now()
);

create table public.operational_incidents (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^inc[0-9a-f]{24}$'),
  scope_key text not null check (char_length(trim(scope_key)) between 8 and 120 and scope_key !~ '[[:cntrl:]]'),
  severity text not null default 'high' check (severity in ('low','medium','high','critical')),
  summary text not null check (char_length(trim(summary)) between 8 and 1000 and summary !~ '[[:cntrl:]]'),
  state text not null default 'open' check (state in ('open','resolved')),
  opened_by_user_id uuid not null references auth.users(id) on delete restrict,
  resolved_by_user_id uuid references auth.users(id) on delete restrict,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  check ((state='resolved' and resolved_at is not null and resolved_by_user_id is not null) or state='open')
);

create table public.operational_incident_events (
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.operational_incidents(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('opened','resolved')),
  reason text not null check (char_length(trim(reason)) between 8 and 1000 and reason !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now()
);

create table public.legal_holds (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^lgh[0-9a-f]{24}$'),
  target_public_id text not null check (char_length(trim(target_public_id)) between 8 and 120 and target_public_id !~ '[[:cntrl:]]'),
  state text not null default 'active' check (state in ('active','released')),
  reason text not null check (char_length(trim(reason)) between 8 and 1000 and reason !~ '[[:cntrl:]]'),
  placed_by_user_id uuid not null references auth.users(id) on delete restrict,
  released_by_user_id uuid references auth.users(id) on delete restrict,
  placed_at timestamptz not null default now(),
  released_at timestamptz,
  check ((state='released' and released_at is not null and released_by_user_id is not null) or state='active')
);

create table public.legal_hold_events (
  id bigint generated always as identity primary key,
  hold_id uuid not null references public.legal_holds(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('placed','released')),
  reason text not null check (char_length(trim(reason)) between 8 and 1000 and reason !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now()
);

create table public.abuse_holds (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^abh[0-9a-f]{24}$'),
  target_public_id text not null check (char_length(trim(target_public_id)) between 8 and 120 and target_public_id !~ '[[:cntrl:]]'),
  state text not null default 'active' check (state in ('active','released')),
  reason text not null check (char_length(trim(reason)) between 8 and 1000 and reason !~ '[[:cntrl:]]'),
  placed_by_user_id uuid not null references auth.users(id) on delete restrict,
  released_by_user_id uuid references auth.users(id) on delete restrict,
  placed_at timestamptz not null default now(),
  released_at timestamptz,
  check ((state='released' and released_at is not null and released_by_user_id is not null) or state='active')
);

create table public.abuse_hold_events (
  id bigint generated always as identity primary key,
  hold_id uuid not null references public.abuse_holds(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('placed','released')),
  reason text not null check (char_length(trim(reason)) between 8 and 1000 and reason !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now()
);

create table public.operational_rate_limits (
  key text primary key check (key ~ '^[a-z][a-z0-9_.:-]{2,63}$'),
  max_requests integer not null check (max_requests between 1 and 10000),
  window_seconds integer not null check (window_seconds between 1 and 86400),
  enabled boolean not null default true,
  revision bigint not null default 1 check (revision >= 1),
  updated_by_user_id uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.operational_rate_limit_events (
  id bigint generated always as identity primary key,
  limit_key text not null,
  revision bigint not null check (revision >= 1),
  max_requests integer not null check (max_requests between 1 and 10000),
  window_seconds integer not null check (window_seconds between 1 and 86400),
  enabled boolean not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 8 and 1000 and reason !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now()
);

create table public.operational_rate_limit_buckets (
  limit_key text not null references public.operational_rate_limits(key) on delete restrict,
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 1),
  updated_at timestamptz not null default now(),
  primary key(limit_key,subject_hash)
);

create index moderation_cases_state_updated_idx on public.moderation_cases(state,updated_at desc);
create index support_cases_state_updated_idx on public.support_cases(state,updated_at desc);
create index operational_incidents_state_opened_idx on public.operational_incidents(state,opened_at desc);
create index legal_holds_state_placed_idx on public.legal_holds(state,placed_at desc);
create index abuse_holds_state_placed_idx on public.abuse_holds(state,placed_at desc);
create index operational_rate_limit_buckets_updated_idx on public.operational_rate_limit_buckets(updated_at);

alter table public.moderation_cases enable row level security;
alter table public.moderation_case_events enable row level security;
alter table public.support_cases enable row level security;
alter table public.support_case_events enable row level security;
alter table public.operational_configuration enable row level security;
alter table public.operational_configuration_events enable row level security;
alter table public.operational_incidents enable row level security;
alter table public.operational_incident_events enable row level security;
alter table public.legal_holds enable row level security;
alter table public.legal_hold_events enable row level security;
alter table public.abuse_holds enable row level security;
alter table public.abuse_hold_events enable row level security;
alter table public.operational_rate_limits enable row level security;
alter table public.operational_rate_limit_events enable row level security;
alter table public.operational_rate_limit_buckets enable row level security;

revoke all on public.moderation_cases from public,anon,authenticated;
revoke all on public.moderation_case_events from public,anon,authenticated;
revoke all on public.support_cases from public,anon,authenticated;
revoke all on public.support_case_events from public,anon,authenticated;
revoke all on public.operational_configuration from public,anon,authenticated;
revoke all on public.operational_configuration_events from public,anon,authenticated;
revoke all on public.operational_incidents from public,anon,authenticated;
revoke all on public.operational_incident_events from public,anon,authenticated;
revoke all on public.legal_holds from public,anon,authenticated;
revoke all on public.legal_hold_events from public,anon,authenticated;
revoke all on public.abuse_holds from public,anon,authenticated;
revoke all on public.abuse_hold_events from public,anon,authenticated;
revoke all on public.operational_rate_limits from public,anon,authenticated;
revoke all on public.operational_rate_limit_events from public,anon,authenticated;
revoke all on public.operational_rate_limit_buckets from public,anon,authenticated;

create or replace function private.reject_admin_history_mutation()
returns trigger
language plpgsql
set search_path=pg_catalog
as $$
begin
  raise exception 'immutable_admin_history' using errcode='55000';
end;
$$;

create trigger audit_events_immutable
before update or delete on public.audit_events
for each row execute function private.reject_admin_history_mutation();
create trigger moderation_case_events_immutable
before update or delete on public.moderation_case_events
for each row execute function private.reject_admin_history_mutation();
create trigger support_case_events_immutable
before update or delete on public.support_case_events
for each row execute function private.reject_admin_history_mutation();
create trigger operational_configuration_events_immutable
before update or delete on public.operational_configuration_events
for each row execute function private.reject_admin_history_mutation();
create trigger operational_incident_events_immutable
before update or delete on public.operational_incident_events
for each row execute function private.reject_admin_history_mutation();
create trigger legal_hold_events_immutable
before update or delete on public.legal_hold_events
for each row execute function private.reject_admin_history_mutation();
create trigger abuse_hold_events_immutable
before update or delete on public.abuse_hold_events
for each row execute function private.reject_admin_history_mutation();
create trigger operational_rate_limit_events_immutable
before update or delete on public.operational_rate_limit_events
for each row execute function private.reject_admin_history_mutation();

create or replace function private.new_admin_public_id(prefix_value text)
returns text
language sql
volatile
set search_path=pg_catalog,extensions
as $$
  select prefix_value || encode(extensions.gen_random_bytes(12),'hex');
$$;

create or replace function private.staff_can_access_admin_queue(subject_user_id uuid, queue_key text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
  select case private.current_active_role(subject_user_id)
    when 'reviewer'::public.app_role then queue_key in ('verification','review')
    when 'moderator'::public.app_role then queue_key in ('moderation')
    when 'finance'::public.app_role then queue_key in ('finance','payouts')
    when 'copyright'::public.app_role then queue_key in ('copyright')
    when 'support'::public.app_role then queue_key in ('users','support')
    when 'super_admin'::public.app_role then queue_key in (
      'users','roles','verification','projects','campaigns','moderation','review','copyright',
      'finance','payouts','support','configuration','audit','incidents'
    )
    else false
  end;
$$;

create or replace function private.assert_admin_queue(queue_key text)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare active_role public.app_role;
begin
  perform private.assert_current_session();
  active_role:=private.current_active_role(auth.uid());
  if not coalesce(private.staff_can_access_admin_queue(auth.uid(),queue_key),false) then
    perform private.write_audit(
      auth.uid(),
      'admin_queue_access',
      'denied'::public.audit_outcome,
      'workspace-staff-admin',
      active_role,
      jsonb_build_object('queue',queue_key)
    );
    raise exception 'admin_queue_forbidden' using errcode='42501';
  end if;
end;
$$;

create or replace function private.consume_operational_rate_limit(limit_key text, subject_user_id uuid)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private,extensions
as $$
declare allowed_requests integer;
declare configured_window integer;
declare configured_enabled boolean;
declare normalized_subject_hash text;
declare bucket_window timestamptz;
declare bucket_count integer;
begin
  if subject_user_id is null then
    raise exception 'rate_limit_subject_required' using errcode='22023';
  end if;

  select config.max_requests,config.window_seconds,config.enabled
  into allowed_requests,configured_window,configured_enabled
  from public.operational_rate_limits config
  where config.key=limit_key;

  if not found or not configured_enabled then
    return;
  end if;

  normalized_subject_hash:=encode(extensions.digest(subject_user_id::text,'sha256'),'hex');
  bucket_window:=to_timestamp(
    floor(extract(epoch from clock_timestamp()) / configured_window) * configured_window
  );

  insert into public.operational_rate_limit_buckets(
    limit_key,subject_hash,window_started_at,request_count,updated_at
  ) values (
    limit_key,normalized_subject_hash,bucket_window,1,now()
  )
  on conflict (limit_key,subject_hash) do update
  set window_started_at=excluded.window_started_at,
      request_count=case
        when public.operational_rate_limit_buckets.window_started_at=excluded.window_started_at
          then public.operational_rate_limit_buckets.request_count+1
        else 1
      end,
      updated_at=now()
  returning request_count into bucket_count;

  if bucket_count>allowed_requests then
    raise exception 'rate_limit_exceeded' using errcode='42501';
  end if;
end;
$$;

insert into public.operational_rate_limits(key,max_requests,window_seconds,enabled)
values
  ('admin_search',60,60,true),
  ('admin_critical_action',12,60,true)
on conflict (key) do nothing;

insert into public.operational_configuration(key,value)
values
  ('launch.release_mode',jsonb_build_object('mode','candidate')),
  ('launch.legal_pages_required',jsonb_build_object('required',true))
on conflict (key) do nothing;

create or replace function public.get_admin_overview()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare result jsonb;
begin
  perform private.assert_admin_queue('configuration');
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'pendingRoles', (select count(*) from public.workspace_memberships where status='requested'),
    'verification', (select count(*) from public.verification_subjects where status in ('pending','needs_review')),
    'projects', (select count(*) from public.projects where state<>'cancelled'),
    'campaigns', (select count(*) from public.campaigns where state not in ('cancelled','funding_closed')),
    'moderation', (select count(*) from public.moderation_cases where state<>'resolved'),
    'review', (select count(*) from public.delivery_review_cases where state not in ('approved','rejected')),
    'copyright', (select count(*) from public.copyright_cases where stage not in ('closed_false_positive','closed')),
    'finance', (select count(*) from public.finance_reconciliation_cases where state='open'),
    'payouts', (select count(*) from public.payout_requests where state in ('requested','processing','failed')),
    'support', (select count(*) from public.support_cases where state<>'resolved'),
    'incidents', (select count(*) from public.operational_incidents where state='open'),
    'legalHolds', (select count(*) from public.legal_holds where state='active'),
    'abuseHolds', (select count(*) from public.abuse_holds where state='active')
  ) into result;

  perform private.write_audit(auth.uid(),'admin_overview_viewed','success'::public.audit_outcome,'workspace-staff-admin','super_admin'::public.app_role,'{}'::jsonb);
  return result;
end;
$$;

create or replace function public.list_audit_explorer(limit_count integer default 100)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare normalized_limit integer:=least(greatest(coalesce(limit_count,100),1),200);
declare result jsonb;
begin
  if not private.staff_can_access_admin_queue(auth.uid(), 'audit') then
    perform private.assert_admin_queue('audit');
  end if;
  perform private.assert_current_session();

  select coalesce(jsonb_agg(entry order by sort_at desc),'[]'::jsonb)
  into result
  from (
    select
      event.created_at as sort_at,
      jsonb_build_object(
        'eventType',event.event_type,
        'outcome',event.outcome,
        'routeKey',event.route_key,
        'targetRole',event.target_role,
        'actorHandle',profile.handle,
        'createdAt',event.created_at
      ) as entry
    from public.audit_events event
    left join public.profiles profile on profile.user_id=event.actor_user_id
    order by event.created_at desc,event.id desc
    limit normalized_limit
  ) rows;
  return result;
end;
$$;

create or replace function public.list_operational_incidents()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare result jsonb;
begin
  perform private.assert_admin_queue('incidents');
  select jsonb_build_object(
    'incidents',coalesce((
      select jsonb_agg(jsonb_build_object(
        'publicId',item.public_id,'scopeKey',item.scope_key,'severity',item.severity,
        'summary',item.summary,'state',item.state,'openedAt',item.opened_at,'resolvedAt',item.resolved_at
      ) order by item.opened_at desc)
      from (select * from public.operational_incidents order by opened_at desc limit 100) item
    ),'[]'::jsonb),
    'legalHolds',coalesce((
      select jsonb_agg(jsonb_build_object(
        'publicId',item.public_id,'targetPublicId',item.target_public_id,'state',item.state,
        'reason',item.reason,'placedAt',item.placed_at,'releasedAt',item.released_at
      ) order by item.placed_at desc)
      from (select * from public.legal_holds order by placed_at desc limit 100) item
    ),'[]'::jsonb),
    'abuseHolds',coalesce((
      select jsonb_agg(jsonb_build_object(
        'publicId',item.public_id,'targetPublicId',item.target_public_id,'state',item.state,
        'reason',item.reason,'placedAt',item.placed_at,'releasedAt',item.released_at
      ) order by item.placed_at desc)
      from (select * from public.abuse_holds order by placed_at desc limit 100) item
    ),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.list_operational_rate_limits()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare result jsonb;
begin
  perform private.assert_admin_queue('configuration');
  select coalesce(jsonb_agg(jsonb_build_object(
    'key',config.key,
    'maxRequests',config.max_requests,
    'windowSeconds',config.window_seconds,
    'enabled',config.enabled,
    'revision',config.revision,
    'updatedAt',config.updated_at
  ) order by config.key),'[]'::jsonb)
  into result
  from public.operational_rate_limits config;
  return result;
end;
$$;

create or replace function public.list_operational_configuration()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare result jsonb;
begin
  perform private.assert_admin_queue('configuration');
  select coalesce(jsonb_agg(jsonb_build_object(
    'key',config.key,'value',config.value,'revision',config.revision,'updatedAt',config.updated_at
  ) order by config.key),'[]'::jsonb)
  into result
  from public.operational_configuration config;
  return result;
end;
$$;

create or replace function public.list_admin_queue(queue_key text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare normalized_queue text:=lower(trim(coalesce(queue_key,'')));
declare result jsonb:='[]'::jsonb;
begin
  perform private.assert_current_session();
  if not private.staff_can_access_admin_queue(auth.uid(), normalized_queue) then
    perform private.assert_admin_queue(normalized_queue);
  end if;

  if normalized_queue='users' then
    select coalesce(jsonb_agg(entry order by sort_at desc),'[]'::jsonb) into result from (
      select p.created_at sort_at,jsonb_build_object(
        'kind','user','handle',p.handle,'displayName',p.display_name,'visibility',p.visibility,'createdAt',p.created_at
      ) entry from public.profiles p order by p.created_at desc limit 100
    ) q;
  elsif normalized_queue='roles' then
    select coalesce(jsonb_agg(entry order by sort_at desc),'[]'::jsonb) into result from (
      select m.requested_at sort_at,jsonb_build_object(
        'kind','role','handle',p.handle,'role',m.role,'status',m.status,'requestedAt',m.requested_at,'reviewedAt',m.reviewed_at
      ) entry from public.workspace_memberships m join public.profiles p on p.user_id=m.user_id
      order by m.requested_at desc limit 100
    ) q;
  elsif normalized_queue='verification' then
    select coalesce(jsonb_agg(entry order by sort_at desc),'[]'::jsonb) into result from (
      select v.updated_at sort_at,jsonb_build_object(
        'kind','verification','handle',p.handle,'level',v.level,'status',v.status,'expiresAt',v.expires_at,'updatedAt',v.updated_at
      ) entry from public.verification_subjects v join public.profiles p on p.user_id=v.user_id
      order by v.updated_at desc limit 100
    ) q;
  elsif normalized_queue='projects' then
    select coalesce(jsonb_agg(entry order by sort_at desc),'[]'::jsonb) into result from (
      select p.updated_at sort_at,jsonb_build_object(
        'kind','project','publicId',p.public_id,'state',p.state,'title',v.title,'category',v.category,'updatedAt',p.updated_at
      ) entry from public.projects p
      join public.project_versions v on v.project_id=p.id and v.revision=p.current_revision
      order by p.updated_at desc limit 100
    ) q;
  elsif normalized_queue='campaigns' then
    select coalesce(jsonb_agg(entry order by sort_at desc),'[]'::jsonb) into result from (
      select c.updated_at sort_at,jsonb_build_object(
        'kind','campaign','publicId',c.public_id,'projectPublicId',p.public_id,'state',c.state,'title',v.title,'updatedAt',c.updated_at
      ) entry from public.campaigns c join public.projects p on p.id=c.project_id
      join public.project_versions v on v.project_id=p.id and v.revision=p.current_revision
      order by c.updated_at desc limit 100
    ) q;
  elsif normalized_queue='moderation' then
    select coalesce(jsonb_agg(entry order by sort_at desc),'[]'::jsonb) into result from (
      select c.updated_at sort_at,jsonb_build_object(
        'kind','moderation','publicId',c.public_id,'subjectType',c.subject_type,'subjectPublicId',c.subject_public_id,
        'summary',c.summary,'state',c.state,'updatedAt',c.updated_at
      ) entry from public.moderation_cases c order by c.updated_at desc limit 100
    ) q;
  elsif normalized_queue='review' then
    select coalesce(jsonb_agg(entry order by sort_at desc),'[]'::jsonb) into result from (
      select r.updated_at sort_at,jsonb_build_object(
        'kind','review','publicId',r.public_id,'state',r.state,'deliveryPublicId',d.public_id,'projectPublicId',p.public_id,'updatedAt',r.updated_at
      ) entry from public.delivery_review_cases r
      join public.final_delivery_versions d on d.id=r.delivery_version_id
      join public.projects p on p.id=d.project_id order by r.updated_at desc limit 100
    ) q;
  elsif normalized_queue='copyright' then
    select coalesce(jsonb_agg(entry order by sort_at desc),'[]'::jsonb) into result from (
      select c.updated_at sort_at,jsonb_build_object(
        'kind','copyright','publicId',c.public_id,'stage',c.stage,'noticeStatus',c.notice_status,
        'repeatInfringer',c.repeat_infringer_flag,'updatedAt',c.updated_at
      ) entry from public.copyright_cases c order by c.updated_at desc limit 100
    ) q;
  elsif normalized_queue='finance' then
    select coalesce(jsonb_agg(entry order by sort_at desc),'[]'::jsonb) into result from (
      select c.created_at sort_at,jsonb_build_object(
        'kind','finance','publicId',c.public_id,'projectPublicId',p.public_id,'caseKind',c.kind,'currency',c.currency,
        'expectedMinor',c.expected_minor,'observedMinor',c.observed_minor,'state',c.state,'createdAt',c.created_at
      ) entry from public.finance_reconciliation_cases c join public.projects p on p.id=c.project_id
      order by c.created_at desc limit 100
    ) q;
  elsif normalized_queue='payouts' then
    select coalesce(jsonb_agg(entry order by sort_at desc),'[]'::jsonb) into result from (
      select payout.updated_at sort_at,jsonb_build_object(
        'kind','payout','publicId',payout.public_id,'projectPublicId',project.public_id,'currency',payout.currency,
        'amountMinor',payout.amount_minor,'state',payout.state,'attemptCount',payout.attempt_count,'updatedAt',payout.updated_at
      ) entry from public.payout_requests payout join public.projects project on project.id=payout.project_id
      order by payout.updated_at desc limit 100
    ) q;
  elsif normalized_queue='support' then
    select coalesce(jsonb_agg(entry order by sort_at desc),'[]'::jsonb) into result from (
      select c.updated_at sort_at,jsonb_build_object(
        'kind','support','publicId',c.public_id,'requesterHandle',p.handle,'subject',c.subject,'state',c.state,
        'createdAt',c.created_at,'updatedAt',c.updated_at
      ) entry from public.support_cases c join public.profiles p on p.user_id=c.requester_user_id
      order by c.updated_at desc limit 100
    ) q;
  elsif normalized_queue='configuration' then
    select coalesce(jsonb_agg(entry order by sort_at desc),'[]'::jsonb) into result from (
      select config.updated_at sort_at,jsonb_build_object(
        'kind','configuration','key',config.key,'revision',config.revision,'updatedAt',config.updated_at
      ) entry from public.operational_configuration config order by config.updated_at desc limit 100
    ) q;
  elsif normalized_queue='audit' then
    return public.list_audit_explorer(100);
  elsif normalized_queue='incidents' then
    return public.list_operational_incidents();
  else
    raise exception 'unknown_admin_queue' using errcode='22023';
  end if;

  perform private.write_audit(
    auth.uid(),'admin_queue_viewed','success'::public.audit_outcome,'workspace-staff-admin',private.current_active_role(auth.uid()),
    jsonb_build_object('queue',normalized_queue)
  );
  return result;
end;
$$;

create or replace function public.search_operations(search_query text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare normalized_search text:=trim(coalesce(search_query,''));
declare needle text;
declare result jsonb:='[]'::jsonb;
begin
  perform private.assert_current_session();
  if char_length(normalized_search) not between 1 and 120 then
    raise exception 'invalid_operational_search' using errcode='22023';
  end if;
  perform private.consume_operational_rate_limit('admin_search',auth.uid());
  needle:=lower(normalized_search);

  if private.staff_can_access_admin_queue(auth.uid(),'users') then
    result:=result||coalesce((select jsonb_agg(jsonb_build_object(
      'kind','user','handle',p.handle,'label',p.display_name,'state',p.visibility,'path','/u/'||p.handle
    )) from (select * from public.profiles where position(needle in lower(handle||' '||display_name))>0 order by updated_at desc limit 20) p),'[]'::jsonb);
  end if;
  if private.staff_can_access_admin_queue(auth.uid(),'projects') then
    result:=result||coalesce((select jsonb_agg(jsonb_build_object(
      'kind','project','publicId',p.public_id,'label',v.title,'state',p.state,'path','/studio/projects/'||p.public_id
    )) from public.projects p join public.project_versions v on v.project_id=p.id and v.revision=p.current_revision
      where position(needle in lower(p.public_id||' '||v.title||' '||v.public_synopsis))>0 limit 20),'[]'::jsonb);
  end if;
  if private.staff_can_access_admin_queue(auth.uid(),'campaigns') then
    result:=result||coalesce((select jsonb_agg(jsonb_build_object(
      'kind','campaign','publicId',c.public_id,'label',v.title,'state',c.state,'path','/app/funding/'||c.public_id
    )) from public.campaigns c join public.projects p on p.id=c.project_id
      join public.project_versions v on v.project_id=p.id and v.revision=p.current_revision
      where position(needle in lower(c.public_id||' '||v.title||' '||v.public_synopsis))>0 limit 20),'[]'::jsonb);
  end if;
  if private.staff_can_access_admin_queue(auth.uid(),'moderation') then
    result:=result||coalesce((select jsonb_agg(jsonb_build_object(
      'kind','moderation','publicId',c.public_id,'label',c.summary,'state',c.state
    )) from public.moderation_cases c
      where position(needle in lower(c.public_id||' '||c.subject_public_id||' '||c.summary))>0 limit 20),'[]'::jsonb);
  end if;
  if private.staff_can_access_admin_queue(auth.uid(),'review') then
    result:=result||coalesce((select jsonb_agg(jsonb_build_object(
      'kind','review','publicId',c.public_id,'label',project.public_id,'state',c.state,'path','/workspace/staff/delivery-review'
    )) from public.delivery_review_cases c join public.final_delivery_versions delivery on delivery.id=c.delivery_version_id
      join public.projects project on project.id=delivery.project_id
      where position(needle in lower(c.public_id||' '||project.public_id||' '||delivery.public_id))>0 limit 20),'[]'::jsonb);
  end if;
  if private.staff_can_access_admin_queue(auth.uid(),'copyright') then
    result:=result||coalesce((select jsonb_agg(jsonb_build_object(
      'kind','copyright','publicId',c.public_id,'label',c.public_id,'state',c.stage,'path','/workspace/staff/copyright'
    )) from public.copyright_cases c where position(needle in lower(c.public_id||' '||c.stage))>0 limit 20),'[]'::jsonb);
  end if;
  if private.staff_can_access_admin_queue(auth.uid(),'finance') then
    result:=result||coalesce((select jsonb_agg(jsonb_build_object(
      'kind','finance','publicId',c.public_id,'label',project.public_id,'state',c.state,'path','/workspace/staff/finance'
    )) from public.finance_reconciliation_cases c join public.projects project on project.id=c.project_id
      where position(needle in lower(c.public_id||' '||project.public_id||' '||c.kind))>0 limit 20),'[]'::jsonb);
  end if;
  if private.staff_can_access_admin_queue(auth.uid(),'payouts') then
    result:=result||coalesce((select jsonb_agg(jsonb_build_object(
      'kind','payout','publicId',payout.public_id,'label',project.public_id,'state',payout.state,'path','/workspace/staff/finance'
    )) from public.payout_requests payout join public.projects project on project.id=payout.project_id
      where position(needle in lower(payout.public_id||' '||project.public_id||' '||payout.state))>0 limit 20),'[]'::jsonb);
  end if;
  if private.staff_can_access_admin_queue(auth.uid(),'support') then
    result:=result||coalesce((select jsonb_agg(jsonb_build_object(
      'kind','support','publicId',c.public_id,'label',c.subject,'state',c.state
    )) from public.support_cases c join public.profiles p on p.user_id=c.requester_user_id
      where position(needle in lower(c.public_id||' '||p.handle||' '||c.subject))>0 limit 20),'[]'::jsonb);
  end if;

  perform private.write_audit(
    auth.uid(),'operational_search','success'::public.audit_outcome,'workspace-staff-admin',private.current_active_role(auth.uid()),
    jsonb_build_object('queryLength',char_length(normalized_search),'resultCount',jsonb_array_length(result))
  );
  return result;
end;
$$;

create or replace function public.create_support_case(subject_value text, body_value text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare normalized_subject text:=trim(coalesce(subject_value,''));
declare normalized_body text:=trim(coalesce(body_value,''));
declare created_case public.support_cases%rowtype;
begin
  perform private.assert_current_session();
  if char_length(normalized_subject) not between 8 and 160 or normalized_subject ~ '[[:cntrl:]]'
     or char_length(normalized_body) not between 20 and 4000 or normalized_body ~ '[[:cntrl:]]' then
    raise exception 'invalid_support_case' using errcode='22023';
  end if;
  insert into public.support_cases(public_id,requester_user_id,subject,body)
  values(private.new_admin_public_id('sup'),auth.uid(),normalized_subject,normalized_body)
  returning * into created_case;
  insert into public.support_case_events(case_id,actor_user_id,event_type,reason)
  values(created_case.id,auth.uid(),'opened','Support request submitted by account holder');
  perform private.write_audit(auth.uid(),'support_case_created','success'::public.audit_outcome,'help',private.current_active_role(auth.uid()),jsonb_build_object('casePublicId',created_case.public_id));
  return jsonb_build_object('publicId',created_case.public_id,'state',created_case.state,'createdAt',created_case.created_at);
end;
$$;

create or replace function public.open_moderation_case(subject_type_value text, subject_public_id_value text, summary_value text, reason_value text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare normalized_type text:=lower(trim(coalesce(subject_type_value,'')));
declare normalized_target text:=trim(coalesce(subject_public_id_value,''));
declare normalized_summary text:=trim(coalesce(summary_value,''));
declare normalized_reason text:=trim(coalesce(reason_value,''));
declare created_case public.moderation_cases%rowtype;
begin
  perform private.assert_admin_queue('moderation');
  if normalized_type not in ('profile','project','campaign','release','support_case')
     or char_length(normalized_target) not between 3 and 120
     or char_length(normalized_summary) not between 8 and 500
     or char_length(normalized_reason) not between 8 and 1000 then
    raise exception 'invalid_moderation_case' using errcode='22023';
  end if;
  insert into public.moderation_cases(public_id,subject_type,subject_public_id,summary,opened_by_user_id)
  values(private.new_admin_public_id('mod'),normalized_type,normalized_target,normalized_summary,auth.uid())
  returning * into created_case;
  insert into public.moderation_case_events(case_id,actor_user_id,event_type,reason)
  values(created_case.id,auth.uid(),'opened',normalized_reason);
  perform private.write_audit(auth.uid(),'moderation_case_opened','success'::public.audit_outcome,'workspace-staff-admin',private.current_active_role(auth.uid()),jsonb_build_object('casePublicId',created_case.public_id));
  return jsonb_build_object('publicId',created_case.public_id,'state',created_case.state);
end;
$$;

create or replace function public.resolve_admin_case(queue_key text, case_public_id text, reason_value text, confirmation_value text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare normalized_queue text:=lower(trim(coalesce(queue_key,'')));
declare normalized_public_id text:=trim(coalesce(case_public_id,''));
declare normalized_reason text:=trim(coalesce(reason_value,''));
begin
  perform private.assert_admin_queue(normalized_queue);
  if normalized_queue not in ('moderation','support')
     or confirmation_value<>'CONFIRM'
     or char_length(normalized_reason) not between 8 and 1000 then
    raise exception 'invalid_case_resolution' using errcode='22023';
  end if;

  if normalized_queue='moderation' then
    update public.moderation_cases set state='resolved',resolved_by_user_id=auth.uid(),resolved_at=now(),updated_at=now()
    where public_id=normalized_public_id and state<>'resolved';
    if not found then raise exception 'moderation_case_not_open' using errcode='22023'; end if;
    insert into public.moderation_case_events(case_id,actor_user_id,event_type,reason)
    select id,auth.uid(),'resolved',normalized_reason from public.moderation_cases where public_id=normalized_public_id;
  else
    update public.support_cases set state='resolved',assigned_to_user_id=coalesce(assigned_to_user_id,auth.uid()),resolved_at=now(),updated_at=now()
    where public_id=normalized_public_id and state<>'resolved';
    if not found then raise exception 'support_case_not_open' using errcode='22023'; end if;
    insert into public.support_case_events(case_id,actor_user_id,event_type,reason)
    select id,auth.uid(),'resolved',normalized_reason from public.support_cases where public_id=normalized_public_id;
  end if;
  perform private.write_audit(auth.uid(),'admin_case_resolved','success'::public.audit_outcome,'workspace-staff-admin',private.current_active_role(auth.uid()),jsonb_build_object('queue',normalized_queue,'casePublicId',normalized_public_id));
  return jsonb_build_object('publicId',normalized_public_id,'state','resolved');
end;
$$;

create or replace function public.perform_critical_admin_action(action_key text, target_public_id text, reason_value text, confirmation_value text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare normalized_action text:=lower(trim(coalesce(action_key,'')));
declare normalized_target text:=trim(coalesce(target_public_id,''));
declare normalized_reason text:=trim(coalesce(reason_value,''));
declare created_public_id text;
declare target_uuid uuid;
begin
  perform private.assert_current_session();
  if normalized_action in ('apply_abuse_hold','release_abuse_hold') then
    perform private.assert_admin_queue('moderation');
  else
    perform private.assert_admin_queue('incidents');
  end if;
  perform private.consume_operational_rate_limit('admin_critical_action',auth.uid());

  if normalized_action not in ('open_incident','resolve_incident','place_legal_hold','release_legal_hold','apply_abuse_hold','release_abuse_hold')
     or char_length(normalized_target) not between 8 and 120
     or char_length(normalized_reason) not between 8 and 1000
     or confirmation_value <> 'CONFIRM' then
    raise exception 'invalid_critical_admin_action' using errcode='22023';
  end if;

  if normalized_action='open_incident' then
    created_public_id:=private.new_admin_public_id('inc');
    insert into public.operational_incidents(public_id,scope_key,severity,summary,opened_by_user_id)
    values(created_public_id,normalized_target,'high',normalized_reason,auth.uid()) returning id into target_uuid;
    insert into public.operational_incident_events(incident_id,actor_user_id,event_type,reason)
    values(target_uuid,auth.uid(),'opened',normalized_reason);
  elsif normalized_action='resolve_incident' then
    update public.operational_incidents set state='resolved',resolved_by_user_id=auth.uid(),resolved_at=now()
    where public_id=normalized_target and state='open' returning id,public_id into target_uuid,created_public_id;
    if not found then raise exception 'incident_not_open' using errcode='22023'; end if;
    insert into public.operational_incident_events(incident_id,actor_user_id,event_type,reason)
    values(target_uuid,auth.uid(),'resolved',normalized_reason);
  elsif normalized_action='place_legal_hold' then
    created_public_id:=private.new_admin_public_id('lgh');
    insert into public.legal_holds(public_id,target_public_id,reason,placed_by_user_id)
    values(created_public_id,normalized_target,normalized_reason,auth.uid()) returning id into target_uuid;
    insert into public.legal_hold_events(hold_id,actor_user_id,event_type,reason)
    values(target_uuid,auth.uid(),'placed',normalized_reason);
  elsif normalized_action='release_legal_hold' then
    update public.legal_holds set state='released',released_by_user_id=auth.uid(),released_at=now()
    where public_id=normalized_target and state='active' returning id,public_id into target_uuid,created_public_id;
    if not found then raise exception 'legal_hold_not_active' using errcode='22023'; end if;
    insert into public.legal_hold_events(hold_id,actor_user_id,event_type,reason)
    values(target_uuid,auth.uid(),'released',normalized_reason);
  elsif normalized_action='apply_abuse_hold' then
    created_public_id:=private.new_admin_public_id('abh');
    insert into public.abuse_holds(public_id,target_public_id,reason,placed_by_user_id)
    values(created_public_id,normalized_target,normalized_reason,auth.uid()) returning id into target_uuid;
    insert into public.abuse_hold_events(hold_id,actor_user_id,event_type,reason)
    values(target_uuid,auth.uid(),'placed',normalized_reason);
  elsif normalized_action='release_abuse_hold' then
    update public.abuse_holds set state='released',released_by_user_id=auth.uid(),released_at=now()
    where public_id=normalized_target and state='active' returning id,public_id into target_uuid,created_public_id;
    if not found then raise exception 'abuse_hold_not_active' using errcode='22023'; end if;
    insert into public.abuse_hold_events(hold_id,actor_user_id,event_type,reason)
    values(target_uuid,auth.uid(),'released',normalized_reason);
  end if;

  perform private.write_audit(
    auth.uid(),'admin_critical_action','success'::public.audit_outcome,'workspace-staff-admin',private.current_active_role(auth.uid()),
    jsonb_build_object('action',normalized_action,'targetPublicId',normalized_target,'resultPublicId',created_public_id)
  );
  return jsonb_build_object('action',normalized_action,'publicId',created_public_id,'state','recorded');
end;
$$;

create or replace function public.update_operational_rate_limit(limit_key text, limit_count integer, window_seconds integer, enabled_value boolean, reason_value text, confirmation_value text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare normalized_key text:=lower(trim(coalesce(limit_key,'')));
declare normalized_reason text:=trim(coalesce(reason_value,''));
declare new_revision bigint;
begin
  perform private.assert_admin_queue('configuration');
  perform private.consume_operational_rate_limit('admin_critical_action',auth.uid());
  if normalized_key !~ '^[a-z][a-z0-9_.:-]{2,63}$'
     or limit_count not between 1 and 10000
     or window_seconds not between 1 and 86400
     or char_length(normalized_reason) not between 8 and 1000
     or confirmation_value<>'CONFIRM' then
    raise exception 'invalid_rate_limit_configuration' using errcode='22023';
  end if;

  insert into public.operational_rate_limits(key,max_requests,window_seconds,enabled,revision,updated_by_user_id,updated_at)
  values(normalized_key,limit_count,window_seconds,coalesce(enabled_value,false),1,auth.uid(),now())
  on conflict (key) do update set
    max_requests=excluded.max_requests,
    window_seconds=excluded.window_seconds,
    enabled=excluded.enabled,
    revision=public.operational_rate_limits.revision+1,
    updated_by_user_id=auth.uid(),
    updated_at=now()
  returning revision into new_revision;

  insert into public.operational_rate_limit_events(limit_key,revision,max_requests,window_seconds,enabled,actor_user_id,reason)
  values(normalized_key,new_revision,limit_count,window_seconds,coalesce(enabled_value,false),auth.uid(),normalized_reason);
  perform private.write_audit(auth.uid(),'rate_limit_configuration_changed','success'::public.audit_outcome,'workspace-staff-admin','super_admin'::public.app_role,jsonb_build_object('key',normalized_key,'revision',new_revision));
  return jsonb_build_object('key',normalized_key,'revision',new_revision,'maxRequests',limit_count,'windowSeconds',window_seconds,'enabled',coalesce(enabled_value,false));
end;
$$;

create or replace function public.update_operational_configuration(config_key text, config_value jsonb, reason_value text, confirmation_value text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare normalized_key text:=lower(trim(coalesce(config_key,'')));
declare normalized_reason text:=trim(coalesce(reason_value,''));
declare new_revision bigint;
begin
  perform private.assert_admin_queue('configuration');
  perform private.consume_operational_rate_limit('admin_critical_action',auth.uid());
  if normalized_key !~ '^[a-z][a-z0-9_.:-]{2,63}$'
     or config_value is null
     or char_length(normalized_reason) not between 8 and 1000
     or confirmation_value<>'CONFIRM' then
    raise exception 'invalid_operational_configuration' using errcode='22023';
  end if;

  insert into public.operational_configuration(key,value,revision,updated_by_user_id,updated_at)
  values(normalized_key,config_value,1,auth.uid(),now())
  on conflict (key) do update set
    value=excluded.value,
    revision=public.operational_configuration.revision+1,
    updated_by_user_id=auth.uid(),
    updated_at=now()
  returning revision into new_revision;

  insert into public.operational_configuration_events(config_key,revision,value,actor_user_id,reason)
  values(normalized_key,new_revision,config_value,auth.uid(),normalized_reason);
  perform private.write_audit(auth.uid(),'operational_configuration_changed','success'::public.audit_outcome,'workspace-staff-admin','super_admin'::public.app_role,jsonb_build_object('key',normalized_key,'revision',new_revision));
  return jsonb_build_object('key',normalized_key,'revision',new_revision,'value',config_value);
end;
$$;

revoke all on function private.new_admin_public_id(text) from public,anon,authenticated;
revoke all on function private.staff_can_access_admin_queue(uuid,text) from public,anon,authenticated;
revoke all on function private.assert_admin_queue(text) from public,anon,authenticated;
revoke all on function private.consume_operational_rate_limit(text,uuid) from public,anon,authenticated;
revoke all on function public.get_admin_overview() from public,anon;
revoke all on function public.list_admin_queue(text) from public,anon;
revoke all on function public.search_operations(text) from public,anon;
revoke all on function public.list_audit_explorer(integer) from public,anon;
revoke all on function public.list_operational_incidents() from public,anon;
revoke all on function public.list_operational_rate_limits() from public,anon;
revoke all on function public.list_operational_configuration() from public,anon;
revoke all on function public.create_support_case(text,text) from public,anon;
revoke all on function public.open_moderation_case(text,text,text,text) from public,anon;
revoke all on function public.resolve_admin_case(text,text,text,text) from public,anon;
revoke all on function public.perform_critical_admin_action(text,text,text,text) from public,anon;
revoke all on function public.update_operational_rate_limit(text,integer,integer,boolean,text,text) from public,anon;
revoke all on function public.update_operational_configuration(text,jsonb,text,text) from public,anon;

grant execute on function public.get_admin_overview() to authenticated;
grant execute on function public.list_admin_queue(text) to authenticated;
grant execute on function public.search_operations(text) to authenticated;
grant execute on function public.list_audit_explorer(integer) to authenticated;
grant execute on function public.list_operational_incidents() to authenticated;
grant execute on function public.list_operational_rate_limits() to authenticated;
grant execute on function public.list_operational_configuration() to authenticated;
grant execute on function public.create_support_case(text,text) to authenticated;
grant execute on function public.open_moderation_case(text,text,text,text) to authenticated;
grant execute on function public.resolve_admin_case(text,text,text,text) to authenticated;
grant execute on function public.perform_critical_admin_action(text,text,text,text) to authenticated;
grant execute on function public.update_operational_rate_limit(text,integer,integer,boolean,text,text) to authenticated;
grant execute on function public.update_operational_configuration(text,jsonb,text,text) to authenticated;
