-- Consumer trust, reporting, disputes, and appeals.
-- Extends Slice 17 staff operations with user-facing resolution workflows without exposing raw case tables.

create table public.consumer_disputes (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^dsp[0-9a-f]{24}$'),
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  subject_type text not null check (subject_type in ('funding_commitment','release')),
  subject_public_id text not null check (char_length(trim(subject_public_id)) between 8 and 120 and subject_public_id !~ '[[:cntrl:]]'),
  category text not null check (category in ('payment','refund','delivery','access','quality','other')),
  summary text not null check (char_length(trim(summary)) between 8 and 240 and summary !~ '[[:cntrl:]]'),
  detail text not null check (char_length(trim(detail)) between 20 and 4000 and detail !~ '[[:cntrl:]]'),
  state text not null default 'open' check (state in ('open','in_review','resolved','rejected','withdrawn')),
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  resolution_note text check (resolution_note is null or (char_length(trim(resolution_note)) between 8 and 2000 and resolution_note !~ '[[:cntrl:]]')),
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (
    (state in ('resolved','rejected','withdrawn') and resolved_at is not null)
    or (state in ('open','in_review') and resolved_at is null)
  )
);

create table public.consumer_dispute_events (
  id bigint generated always as identity primary key,
  dispute_id uuid not null references public.consumer_disputes(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('opened','review_started','resolved','rejected','withdrawn','reopened')),
  reason text not null check (char_length(trim(reason)) between 8 and 2000 and reason !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now()
);

create table public.appeal_cases (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^apl[0-9a-f]{24}$'),
  appellant_user_id uuid not null references auth.users(id) on delete restrict,
  source_type text not null check (source_type in ('support_case','consumer_dispute')),
  source_public_id text not null check (char_length(trim(source_public_id)) between 8 and 120 and source_public_id !~ '[[:cntrl:]]'),
  reason text not null check (char_length(trim(reason)) between 20 and 4000 and reason !~ '[[:cntrl:]]'),
  state text not null default 'open' check (state in ('open','in_review','upheld','overturned','closed')),
  reviewer_user_id uuid references auth.users(id) on delete set null,
  decision_note text check (decision_note is null or (char_length(trim(decision_note)) between 8 and 2000 and decision_note !~ '[[:cntrl:]]')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz,
  unique(appellant_user_id, source_type, source_public_id),
  check (
    (state in ('upheld','overturned','closed') and decided_at is not null and reviewer_user_id is not null)
    or (state in ('open','in_review') and decided_at is null)
  )
);

create table public.appeal_case_events (
  id bigint generated always as identity primary key,
  appeal_id uuid not null references public.appeal_cases(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('opened','review_started','upheld','overturned','closed')),
  reason text not null check (char_length(trim(reason)) between 8 and 2000 and reason !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now()
);

create index consumer_disputes_requester_updated_idx on public.consumer_disputes(requester_user_id,updated_at desc);
create index consumer_disputes_state_updated_idx on public.consumer_disputes(state,updated_at desc);
create index appeal_cases_appellant_updated_idx on public.appeal_cases(appellant_user_id,updated_at desc);
create index appeal_cases_state_updated_idx on public.appeal_cases(state,updated_at desc);

alter table public.consumer_disputes enable row level security;
alter table public.consumer_dispute_events enable row level security;
alter table public.appeal_cases enable row level security;
alter table public.appeal_case_events enable row level security;

revoke all on public.consumer_disputes from public,anon,authenticated;
revoke all on public.consumer_dispute_events from public,anon,authenticated;
revoke all on public.appeal_cases from public,anon,authenticated;
revoke all on public.appeal_case_events from public,anon,authenticated;

create trigger consumer_dispute_events_immutable
before update or delete on public.consumer_dispute_events
for each row execute function private.reject_admin_history_mutation();

create trigger appeal_case_events_immutable
before update or delete on public.appeal_case_events
for each row execute function private.reject_admin_history_mutation();

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
    when 'finance'::public.app_role then queue_key in ('finance','payouts','disputes')
    when 'copyright'::public.app_role then queue_key in ('copyright')
    when 'support'::public.app_role then queue_key in ('users','support','disputes','appeals')
    when 'super_admin'::public.app_role then queue_key in (
      'users','roles','verification','projects','campaigns','moderation','review','copyright',
      'finance','payouts','support','disputes','appeals','configuration','audit','incidents'
    )
    else false
  end;
$$;

insert into public.operational_rate_limits(key,max_requests,window_seconds,enabled)
values
  ('consumer_report_create',12,3600,true),
  ('consumer_dispute_create',8,3600,true),
  ('consumer_appeal_create',6,3600,true),
  ('consumer_support_create',8,3600,true)
on conflict (key) do nothing;

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
  perform private.consume_operational_rate_limit('consumer_support_create',auth.uid());
  if char_length(normalized_subject) not between 8 and 160 or normalized_subject ~ '[[:cntrl:]]'
     or char_length(normalized_body) not between 20 and 4000 or normalized_body ~ '[[:cntrl:]]' then
    raise exception 'invalid_support_case' using errcode='22023';
  end if;
  insert into public.support_cases(public_id,requester_user_id,subject,body)
  values(private.new_admin_public_id('sup'),auth.uid(),normalized_subject,normalized_body)
  returning * into created_case;
  insert into public.support_case_events(case_id,actor_user_id,event_type,reason)
  values(created_case.id,auth.uid(),'opened','Support request submitted by account holder');
  perform private.write_audit(auth.uid(),'support_case_created','success'::public.audit_outcome,'/app/support',private.current_active_role(auth.uid()),jsonb_build_object('casePublicId',created_case.public_id));
  return jsonb_build_object('publicId',created_case.public_id,'state',created_case.state,'createdAt',created_case.created_at);
end;
$$;

create or replace function public.report_content(
  subject_type_value text,
  subject_public_id_value text,
  summary_value text,
  reason_value text
)
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
declare target_exists boolean:=false;
begin
  perform private.assert_current_session();
  perform private.consume_operational_rate_limit('consumer_report_create',auth.uid());

  if normalized_type not in ('profile','project','campaign','release')
     or char_length(normalized_target) not between 3 and 120
     or normalized_target ~ '[[:cntrl:]]'
     or char_length(normalized_summary) not between 8 and 500
     or normalized_summary ~ '[[:cntrl:]]'
     or char_length(normalized_reason) not between 8 and 1000
     or normalized_reason ~ '[[:cntrl:]]' then
    raise exception 'invalid_content_report' using errcode='22023';
  end if;

  if normalized_type='profile' then
    select exists(select 1 from public.profiles where handle=lower(normalized_target)) into target_exists;
  elsif normalized_type='project' then
    select exists(select 1 from public.projects where public_id=normalized_target) into target_exists;
  elsif normalized_type='campaign' then
    select exists(select 1 from public.campaigns where public_id=normalized_target) into target_exists;
  else
    select exists(select 1 from public.releases where public_id=normalized_target) into target_exists;
  end if;
  if not target_exists then raise exception 'report_target_not_found' using errcode='22023'; end if;

  insert into public.moderation_cases(public_id,subject_type,subject_public_id,summary,opened_by_user_id)
  values(private.new_admin_public_id('mod'),normalized_type,normalized_target,normalized_summary,auth.uid())
  returning * into created_case;
  insert into public.moderation_case_events(case_id,actor_user_id,event_type,reason)
  values(created_case.id,auth.uid(),'opened',normalized_reason);
  perform private.write_audit(auth.uid(),'content_report_created','success'::public.audit_outcome,'/app/support',private.current_active_role(auth.uid()),jsonb_build_object(
    'casePublicId',created_case.public_id,'subjectType',normalized_type,'subjectPublicId',normalized_target
  ));
  return jsonb_build_object('publicId',created_case.public_id,'state',created_case.state,'createdAt',created_case.opened_at);
end;
$$;

create or replace function public.create_consumer_dispute(
  subject_type_value text,
  subject_public_id_value text,
  category_value text,
  summary_value text,
  detail_value text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare normalized_type text:=lower(trim(coalesce(subject_type_value,'')));
declare normalized_target text:=trim(coalesce(subject_public_id_value,''));
declare normalized_category text:=lower(trim(coalesce(category_value,'')));
declare normalized_summary text:=trim(coalesce(summary_value,''));
declare normalized_detail text:=trim(coalesce(detail_value,''));
declare created_case public.consumer_disputes%rowtype;
declare target_allowed boolean:=false;
begin
  perform private.assert_current_session();
  perform private.consume_operational_rate_limit('consumer_dispute_create',auth.uid());

  if normalized_type not in ('funding_commitment','release')
     or normalized_category not in ('payment','refund','delivery','access','quality','other')
     or char_length(normalized_target) not between 8 and 120
     or normalized_target ~ '[[:cntrl:]]'
     or char_length(normalized_summary) not between 8 and 240
     or normalized_summary ~ '[[:cntrl:]]'
     or char_length(normalized_detail) not between 20 and 4000
     or normalized_detail ~ '[[:cntrl:]]' then
    raise exception 'invalid_consumer_dispute' using errcode='22023';
  end if;

  if normalized_type='funding_commitment' then
    select exists(
      select 1 from public.funding_commitments
      where public_id=normalized_target and supporter_user_id=auth.uid()
    ) into target_allowed;
  else
    select exists(
      select 1
      from public.releases release
      join public.release_entitlements entitlement on entitlement.release_id=release.id
      where release.public_id=normalized_target and entitlement.supporter_user_id=auth.uid()
    ) into target_allowed;
  end if;
  if not target_allowed then raise exception 'dispute_target_not_allowed' using errcode='42501'; end if;

  insert into public.consumer_disputes(
    public_id,requester_user_id,subject_type,subject_public_id,category,summary,detail
  ) values(
    private.new_admin_public_id('dsp'),auth.uid(),normalized_type,normalized_target,normalized_category,normalized_summary,normalized_detail
  ) returning * into created_case;

  insert into public.consumer_dispute_events(dispute_id,actor_user_id,event_type,reason)
  values(created_case.id,auth.uid(),'opened','Consumer dispute submitted by account holder');

  perform private.write_audit(auth.uid(),'consumer_dispute_created','success'::public.audit_outcome,'/app/support',private.current_active_role(auth.uid()),jsonb_build_object(
    'casePublicId',created_case.public_id,'subjectType',created_case.subject_type,'subjectPublicId',created_case.subject_public_id,'category',created_case.category
  ));

  return jsonb_build_object('publicId',created_case.public_id,'state',created_case.state,'createdAt',created_case.opened_at);
end;
$$;

create or replace function public.withdraw_consumer_dispute(requested_public_id text, reason_value text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare normalized_id text:=trim(coalesce(requested_public_id,''));
declare normalized_reason text:=trim(coalesce(reason_value,''));
declare dispute_row public.consumer_disputes%rowtype;
begin
  perform private.assert_current_session();
  if normalized_id !~ '^dsp[0-9a-f]{24}$'
     or char_length(normalized_reason) not between 8 and 1000
     or normalized_reason ~ '[[:cntrl:]]' then
    raise exception 'invalid_dispute_withdrawal' using errcode='22023';
  end if;

  select * into dispute_row
  from public.consumer_disputes
  where public_id=normalized_id and requester_user_id=auth.uid()
  for update;
  if dispute_row.id is null or dispute_row.state not in ('open','in_review') then
    raise exception 'dispute_not_withdrawable' using errcode='42501';
  end if;

  update public.consumer_disputes
  set state='withdrawn',resolution_note=normalized_reason,resolved_at=now(),updated_at=now()
  where id=dispute_row.id
  returning * into dispute_row;
  insert into public.consumer_dispute_events(dispute_id,actor_user_id,event_type,reason)
  values(dispute_row.id,auth.uid(),'withdrawn',normalized_reason);
  perform private.write_audit(auth.uid(),'consumer_dispute_withdrawn','success'::public.audit_outcome,'/app/support',private.current_active_role(auth.uid()),jsonb_build_object('casePublicId',dispute_row.public_id));
  return jsonb_build_object('publicId',dispute_row.public_id,'state',dispute_row.state);
end;
$$;

create or replace function public.create_appeal(
  source_type_value text,
  source_public_id_value text,
  reason_value text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare normalized_type text:=lower(trim(coalesce(source_type_value,'')));
declare normalized_source text:=trim(coalesce(source_public_id_value,''));
declare normalized_reason text:=trim(coalesce(reason_value,''));
declare source_allowed boolean:=false;
declare created_case public.appeal_cases%rowtype;
begin
  perform private.assert_current_session();
  perform private.consume_operational_rate_limit('consumer_appeal_create',auth.uid());

  if normalized_type not in ('support_case','consumer_dispute')
     or char_length(normalized_source) not between 8 and 120
     or normalized_source ~ '[[:cntrl:]]'
     or char_length(normalized_reason) not between 20 and 4000
     or normalized_reason ~ '[[:cntrl:]]' then
    raise exception 'invalid_appeal' using errcode='22023';
  end if;

  if normalized_type='support_case' then
    select exists(
      select 1 from public.support_cases
      where public_id=normalized_source and requester_user_id=auth.uid() and state='resolved'
    ) into source_allowed;
  else
    select exists(
      select 1 from public.consumer_disputes
      where public_id=normalized_source and requester_user_id=auth.uid() and state in ('resolved','rejected')
    ) into source_allowed;
  end if;
  if not source_allowed then raise exception 'appeal_source_not_allowed' using errcode='42501'; end if;

  insert into public.appeal_cases(public_id,appellant_user_id,source_type,source_public_id,reason)
  values(private.new_admin_public_id('apl'),auth.uid(),normalized_type,normalized_source,normalized_reason)
  returning * into created_case;

  insert into public.appeal_case_events(appeal_id,actor_user_id,event_type,reason)
  values(created_case.id,auth.uid(),'opened','Appeal submitted by account holder');
  perform private.write_audit(auth.uid(),'appeal_created','success'::public.audit_outcome,'/app/support',private.current_active_role(auth.uid()),jsonb_build_object(
    'appealPublicId',created_case.public_id,'sourceType',created_case.source_type,'sourcePublicId',created_case.source_public_id
  ));
  return jsonb_build_object('publicId',created_case.public_id,'state',created_case.state,'createdAt',created_case.created_at);
exception
  when unique_violation then
    raise exception 'appeal_already_exists' using errcode='23505';
end;
$$;

create or replace function public.list_my_trust_cases()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
begin
  perform private.assert_current_session();
  return jsonb_build_object(
    'support',coalesce((
      select jsonb_agg(jsonb_build_object(
        'publicId',c.public_id,'subject',c.subject,'state',c.state,'createdAt',c.created_at,'updatedAt',c.updated_at,'resolvedAt',c.resolved_at
      ) order by c.updated_at desc)
      from public.support_cases c where c.requester_user_id=auth.uid()
    ),'[]'::jsonb),
    'reports',coalesce((
      select jsonb_agg(jsonb_build_object(
        'publicId',c.public_id,'subjectType',c.subject_type,'subjectPublicId',c.subject_public_id,'summary',c.summary,
        'state',c.state,'createdAt',c.opened_at,'updatedAt',c.updated_at,'resolvedAt',c.resolved_at
      ) order by c.updated_at desc)
      from public.moderation_cases c where c.opened_by_user_id=auth.uid()
    ),'[]'::jsonb),
    'disputes',coalesce((
      select jsonb_agg(jsonb_build_object(
        'publicId',c.public_id,'subjectType',c.subject_type,'subjectPublicId',c.subject_public_id,'category',c.category,
        'summary',c.summary,'state',c.state,'resolutionNote',c.resolution_note,'createdAt',c.opened_at,'updatedAt',c.updated_at,'resolvedAt',c.resolved_at
      ) order by c.updated_at desc)
      from public.consumer_disputes c where c.requester_user_id=auth.uid()
    ),'[]'::jsonb),
    'appeals',coalesce((
      select jsonb_agg(jsonb_build_object(
        'publicId',a.public_id,'sourceType',a.source_type,'sourcePublicId',a.source_public_id,'state',a.state,
        'decisionNote',a.decision_note,'createdAt',a.created_at,'updatedAt',a.updated_at,'decidedAt',a.decided_at
      ) order by a.updated_at desc)
      from public.appeal_cases a where a.appellant_user_id=auth.uid()
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.list_trust_staff_queue(queue_key text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare normalized_queue text:=lower(trim(coalesce(queue_key,'')));
declare result jsonb:='[]'::jsonb;
begin
  if normalized_queue not in ('disputes','appeals') then
    raise exception 'unknown_trust_queue' using errcode='22023';
  end if;
  perform private.assert_admin_queue(normalized_queue);

  if normalized_queue='disputes' then
    select coalesce(jsonb_agg(entry order by sort_at desc),'[]'::jsonb) into result from (
      select d.updated_at sort_at,jsonb_build_object(
        'kind','dispute','publicId',d.public_id,'requesterHandle',p.handle,'subjectType',d.subject_type,
        'subjectPublicId',d.subject_public_id,'category',d.category,'summary',d.summary,'state',d.state,
        'createdAt',d.opened_at,'updatedAt',d.updated_at
      ) entry
      from public.consumer_disputes d join public.profiles p on p.user_id=d.requester_user_id
      order by d.updated_at desc limit 100
    ) q;
  else
    select coalesce(jsonb_agg(entry order by sort_at desc),'[]'::jsonb) into result from (
      select a.updated_at sort_at,jsonb_build_object(
        'kind','appeal','publicId',a.public_id,'requesterHandle',p.handle,'sourceType',a.source_type,
        'sourcePublicId',a.source_public_id,'state',a.state,'createdAt',a.created_at,'updatedAt',a.updated_at
      ) entry
      from public.appeal_cases a join public.profiles p on p.user_id=a.appellant_user_id
      order by a.updated_at desc limit 100
    ) q;
  end if;

  perform private.write_audit(auth.uid(),'trust_queue_viewed','success'::public.audit_outcome,'workspace-staff-admin',private.current_active_role(auth.uid()),jsonb_build_object('queue',normalized_queue));
  return result;
end;
$$;

create or replace function public.review_consumer_dispute(
  requested_public_id text,
  decision_value text,
  reason_value text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare normalized_id text:=trim(coalesce(requested_public_id,''));
declare normalized_decision text:=lower(trim(coalesce(decision_value,'')));
declare normalized_reason text:=trim(coalesce(reason_value,''));
declare dispute_row public.consumer_disputes%rowtype;
declare next_state text;
declare event_value text;
begin
  perform private.assert_admin_queue('disputes');
  if normalized_id !~ '^dsp[0-9a-f]{24}$'
     or normalized_decision not in ('start_review','resolve','reject')
     or char_length(normalized_reason) not between 8 and 2000
     or normalized_reason ~ '[[:cntrl:]]' then
    raise exception 'invalid_dispute_review' using errcode='22023';
  end if;

  select * into dispute_row from public.consumer_disputes where public_id=normalized_id for update;
  if dispute_row.id is null then raise exception 'dispute_not_found' using errcode='22023'; end if;

  if normalized_decision='start_review' then
    if dispute_row.state<>'open' then raise exception 'dispute_transition_invalid' using errcode='40001'; end if;
    next_state:='in_review'; event_value:='review_started';
    update public.consumer_disputes set state=next_state,assigned_to_user_id=auth.uid(),updated_at=now() where id=dispute_row.id;
  elsif normalized_decision='resolve' then
    if dispute_row.state not in ('open','in_review') then raise exception 'dispute_transition_invalid' using errcode='40001'; end if;
    next_state:='resolved'; event_value:='resolved';
    update public.consumer_disputes set state=next_state,assigned_to_user_id=auth.uid(),resolution_note=normalized_reason,resolved_at=now(),updated_at=now() where id=dispute_row.id;
  else
    if dispute_row.state not in ('open','in_review') then raise exception 'dispute_transition_invalid' using errcode='40001'; end if;
    next_state:='rejected'; event_value:='rejected';
    update public.consumer_disputes set state=next_state,assigned_to_user_id=auth.uid(),resolution_note=normalized_reason,resolved_at=now(),updated_at=now() where id=dispute_row.id;
  end if;

  insert into public.consumer_dispute_events(dispute_id,actor_user_id,event_type,reason)
  values(dispute_row.id,auth.uid(),event_value,normalized_reason);
  perform private.write_audit(auth.uid(),'consumer_dispute_reviewed','success'::public.audit_outcome,'workspace-staff-admin',private.current_active_role(auth.uid()),jsonb_build_object(
    'casePublicId',normalized_id,'decision',normalized_decision,'state',next_state
  ));
  return jsonb_build_object('publicId',normalized_id,'state',next_state);
end;
$$;

create or replace function public.review_appeal(
  requested_public_id text,
  decision_value text,
  reason_value text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare normalized_id text:=trim(coalesce(requested_public_id,''));
declare normalized_decision text:=lower(trim(coalesce(decision_value,'')));
declare normalized_reason text:=trim(coalesce(reason_value,''));
declare appeal_row public.appeal_cases%rowtype;
declare next_state text;
declare event_value text;
begin
  perform private.assert_admin_queue('appeals');
  if normalized_id !~ '^apl[0-9a-f]{24}$'
     or normalized_decision not in ('start_review','uphold','overturn','close')
     or char_length(normalized_reason) not between 8 and 2000
     or normalized_reason ~ '[[:cntrl:]]' then
    raise exception 'invalid_appeal_review' using errcode='22023';
  end if;

  select * into appeal_row from public.appeal_cases where public_id=normalized_id for update;
  if appeal_row.id is null then raise exception 'appeal_not_found' using errcode='22023'; end if;

  if normalized_decision='start_review' then
    if appeal_row.state<>'open' then raise exception 'appeal_transition_invalid' using errcode='40001'; end if;
    next_state:='in_review'; event_value:='review_started';
    update public.appeal_cases set state=next_state,reviewer_user_id=auth.uid(),updated_at=now() where id=appeal_row.id;
  else
    if appeal_row.state not in ('open','in_review') then raise exception 'appeal_transition_invalid' using errcode='40001'; end if;
    if normalized_decision='uphold' then next_state:='upheld'; event_value:='upheld';
    elsif normalized_decision='overturn' then next_state:='overturned'; event_value:='overturned';
    else next_state:='closed'; event_value:='closed';
    end if;

    update public.appeal_cases
    set state=next_state,reviewer_user_id=auth.uid(),decision_note=normalized_reason,decided_at=now(),updated_at=now()
    where id=appeal_row.id;

    if normalized_decision='overturn' and appeal_row.source_type='support_case' then
      update public.support_cases set state='in_progress',resolved_at=null,updated_at=now()
      where public_id=appeal_row.source_public_id and requester_user_id=appeal_row.appellant_user_id;
      insert into public.support_case_events(case_id,actor_user_id,event_type,reason)
      select id,auth.uid(),'in_progress','Appeal overturned the prior support resolution' from public.support_cases
      where public_id=appeal_row.source_public_id and requester_user_id=appeal_row.appellant_user_id;
    elsif normalized_decision='overturn' and appeal_row.source_type='consumer_dispute' then
      update public.consumer_disputes
      set state='in_review',assigned_to_user_id=auth.uid(),resolution_note=null,resolved_at=null,updated_at=now()
      where public_id=appeal_row.source_public_id and requester_user_id=appeal_row.appellant_user_id;
      insert into public.consumer_dispute_events(dispute_id,actor_user_id,event_type,reason)
      select id,auth.uid(),'reopened','Appeal overturned the prior dispute decision' from public.consumer_disputes
      where public_id=appeal_row.source_public_id and requester_user_id=appeal_row.appellant_user_id;
    end if;
  end if;

  insert into public.appeal_case_events(appeal_id,actor_user_id,event_type,reason)
  values(appeal_row.id,auth.uid(),event_value,normalized_reason);
  perform private.write_audit(auth.uid(),'appeal_reviewed','success'::public.audit_outcome,'workspace-staff-admin',private.current_active_role(auth.uid()),jsonb_build_object(
    'appealPublicId',normalized_id,'decision',normalized_decision,'state',next_state
  ));
  return jsonb_build_object('publicId',normalized_id,'state',next_state);
end;
$$;


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
    'disputes', (select count(*) from public.consumer_disputes where state in ('open','in_review')),
    'appeals', (select count(*) from public.appeal_cases where state in ('open','in_review')),
    'incidents', (select count(*) from public.operational_incidents where state='open'),
    'legalHolds', (select count(*) from public.legal_holds where state='active'),
    'abuseHolds', (select count(*) from public.abuse_holds where state='active')
  ) into result;

  perform private.write_audit(auth.uid(),'admin_overview_viewed','success'::public.audit_outcome,'workspace-staff-admin','super_admin'::public.app_role,'{}'::jsonb);
  return result;
end;
$$;

comment on function public.list_my_trust_cases() is
  'Returns only the signed-in user trust/support/report/dispute/appeal projections without staff notes or internal UUIDs.';
comment on function public.list_trust_staff_queue(text) is
  'Returns role-scoped dispute or appeal queue projections for authorized staff.';

revoke all on function public.report_content(text,text,text,text) from public,anon,authenticated;
revoke all on function public.create_consumer_dispute(text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.withdraw_consumer_dispute(text,text) from public,anon,authenticated;
revoke all on function public.create_appeal(text,text,text) from public,anon,authenticated;
revoke all on function public.list_my_trust_cases() from public,anon,authenticated;
revoke all on function public.list_trust_staff_queue(text) from public,anon,authenticated;
revoke all on function public.review_consumer_dispute(text,text,text) from public,anon,authenticated;
revoke all on function public.review_appeal(text,text,text) from public,anon,authenticated;
revoke all on function public.create_support_case(text,text) from public,anon,authenticated;

grant execute on function public.report_content(text,text,text,text) to authenticated;
grant execute on function public.create_consumer_dispute(text,text,text,text,text) to authenticated;
grant execute on function public.withdraw_consumer_dispute(text,text) to authenticated;
grant execute on function public.create_appeal(text,text,text) to authenticated;
grant execute on function public.list_my_trust_cases() to authenticated;
grant execute on function public.list_trust_staff_queue(text) to authenticated;
grant execute on function public.review_consumer_dispute(text,text,text) to authenticated;
grant execute on function public.review_appeal(text,text,text) to authenticated;
grant execute on function public.create_support_case(text,text) to authenticated;

notify pgrst,'reload schema';
