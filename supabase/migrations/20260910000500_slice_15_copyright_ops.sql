create table public.copyright_rights_registrations (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^crg[0-9a-f]{24}$'),
  release_id uuid not null unique references public.releases(id) on delete restrict,
  registrant_user_id uuid not null references auth.users(id) on delete restrict,
  ownership_kind text not null check (ownership_kind in ('owner','licensee')),
  licence_reference text check (licence_reference is null or (char_length(trim(licence_reference)) between 3 and 180 and licence_reference !~ '[[:cntrl:]]')),
  ownership_evidence_reference text not null check (ownership_evidence_reference ~ '^evidence:[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$'),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  perceptual_fingerprint text not null check (perceptual_fingerprint ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,31}:[0-9a-f]{16,128}$'),
  created_at timestamptz not null default now(),
  check (ownership_kind <> 'licensee' or licence_reference is not null)
);

create table public.copyright_watermark_jobs (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^cwm[0-9a-f]{24}$'),
  rights_registration_id uuid not null references public.copyright_rights_registrations(id) on delete restrict,
  release_id uuid not null references public.releases(id) on delete restrict,
  state text not null default 'queued' check (state in ('queued','completed','failed')),
  provider_reference text check (provider_reference is null or (char_length(trim(provider_reference)) between 3 and 180 and provider_reference !~ '[[:cntrl:]]')),
  watermark_reference text check (watermark_reference is null or (char_length(trim(watermark_reference)) between 3 and 180 and watermark_reference !~ '[[:cntrl:]]')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((state='completed' and watermark_reference is not null and completed_at is not null) or state<>'completed')
);

create table public.copyright_cases (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^cpy[0-9a-f]{24}$'),
  intake_report_id uuid not null unique references public.release_stolen_copy_reports(id) on delete restrict,
  release_id uuid not null references public.releases(id) on delete restrict,
  rights_registration_id uuid references public.copyright_rights_registrations(id) on delete restrict,
  opened_by_user_id uuid not null references auth.users(id) on delete restrict,
  stage text not null default 'report_received' check (stage in (
    'report_received','matching','evidence_ready','notice_drafted','notice_submitted',
    'removed','monitoring','counter_notice','closed_false_positive','closed'
  )),
  source_match_state text not null default 'not_checked' check (source_match_state in ('not_checked','no_match','possible_session_match')),
  source_match_fingerprint text check (source_match_fingerprint is null or source_match_fingerprint ~ '^[0-9a-f]{64}$'),
  source_key_hash text not null check (source_key_hash ~ '^[0-9a-f]{64}$'),
  notice_status text not null default 'not_started' check (notice_status in ('not_started','drafted','submitted','counter_notice','removed')),
  notice_reference text check (notice_reference is null or (char_length(trim(notice_reference)) between 3 and 180 and notice_reference !~ '[[:cntrl:]]')),
  removal_confirmed_at timestamptz,
  recurrence_count integer not null default 0 check (recurrence_count >= 0),
  repeat_infringer_flag boolean not null default false,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.copyright_case_events (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^cev[0-9a-f]{24}$'),
  case_id uuid not null references public.copyright_cases(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete restrict,
  event_type text not null check (event_type in (
    'case_opened','begin_matching','source_match_recorded','prepare_evidence','draft_notice',
    'submit_notice','confirm_removal','record_recurrence','record_counter_notice',
    'mark_false_positive','close_case'
  )),
  stage_after text not null check (stage_after in (
    'report_received','matching','evidence_ready','notice_drafted','notice_submitted',
    'removed','monitoring','counter_notice','closed_false_positive','closed'
  )),
  reason text not null check (char_length(trim(reason)) between 10 and 2000 and reason !~ '[[:cntrl:]]'),
  notice_reference text check (notice_reference is null or (char_length(trim(notice_reference)) between 3 and 180 and notice_reference !~ '[[:cntrl:]]')),
  evidence_reference text check (evidence_reference is null or evidence_reference ~ '^evidence:[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$'),
  created_at timestamptz not null default now()
);

create table public.copyright_evidence_packages (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^evp[0-9a-f]{24}$'),
  case_id uuid not null unique references public.copyright_cases(id) on delete restrict,
  generated_by_user_id uuid not null references auth.users(id) on delete restrict,
  package_reference text not null unique check (package_reference ~ '^evidence:[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$'),
  package_sha256 text not null check (package_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create table public.copyright_notice_records (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^cnt[0-9a-f]{24}$'),
  case_id uuid not null references public.copyright_cases(id) on delete restrict,
  event_type text not null check (event_type in ('drafted','submitted','removal_confirmed','counter_notice')),
  document_reference text not null check (document_reference ~ '^evidence:[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$'),
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  submission_reference text check (submission_reference is null or (char_length(trim(submission_reference)) between 3 and 180 and submission_reference !~ '[[:cntrl:]]')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (event_type <> 'submitted' or submission_reference is not null)
);

create table public.copyright_repeat_infringer_signals (
  source_key_hash text primary key check (source_key_hash ~ '^[0-9a-f]{64}$'),
  case_count integer not null default 0 check (case_count >= 0),
  removal_count integer not null default 0 check (removal_count >= 0),
  recurrence_count integer not null default 0 check (recurrence_count >= 0),
  flagged_at timestamptz,
  updated_at timestamptz not null default now()
);

create index copyright_cases_release_idx on public.copyright_cases(release_id,updated_at desc);
create index copyright_cases_stage_idx on public.copyright_cases(stage,updated_at desc);
create index copyright_case_events_case_idx on public.copyright_case_events(case_id,created_at asc);
create index copyright_notice_records_case_idx on public.copyright_notice_records(case_id,created_at asc);
create index copyright_watermark_jobs_release_idx on public.copyright_watermark_jobs(release_id,requested_at desc);

alter table public.copyright_rights_registrations enable row level security;
alter table public.copyright_watermark_jobs enable row level security;
alter table public.copyright_cases enable row level security;
alter table public.copyright_case_events enable row level security;
alter table public.copyright_evidence_packages enable row level security;
alter table public.copyright_notice_records enable row level security;
alter table public.copyright_repeat_infringer_signals enable row level security;

revoke all on public.copyright_rights_registrations from public,anon,authenticated;
revoke all on public.copyright_watermark_jobs from public,anon,authenticated;
revoke all on public.copyright_cases from public,anon,authenticated;
revoke all on public.copyright_case_events from public,anon,authenticated;
revoke all on public.copyright_evidence_packages from public,anon,authenticated;
revoke all on public.copyright_notice_records from public,anon,authenticated;
revoke all on public.copyright_repeat_infringer_signals from public,anon,authenticated;

create trigger copyright_rights_registrations_immutable
before update or delete on public.copyright_rights_registrations
for each row execute function private.reject_release_history_mutation();

create trigger copyright_case_events_immutable
before update or delete on public.copyright_case_events
for each row execute function private.reject_release_history_mutation();

create trigger copyright_evidence_packages_immutable
before update or delete on public.copyright_evidence_packages
for each row execute function private.reject_release_history_mutation();

create trigger copyright_notice_records_immutable
before update or delete on public.copyright_notice_records
for each row execute function private.reject_release_history_mutation();

create or replace function private.guard_copyright_watermark_job_history()
returns trigger
language plpgsql
set search_path=pg_catalog
as $$
begin
  if tg_op='DELETE' then
    raise exception 'immutable_copyright_history' using errcode='55000';
  end if;
  if old.id<>new.id
    or old.public_id<>new.public_id
    or old.rights_registration_id<>new.rights_registration_id
    or old.release_id<>new.release_id
    or old.requested_at<>new.requested_at
    or old.state<>'queued'
    or new.state not in ('completed','failed') then
    raise exception 'immutable_copyright_history' using errcode='55000';
  end if;
  return new;
end;
$$;

create trigger copyright_watermark_jobs_history_guard
before update or delete on public.copyright_watermark_jobs
for each row execute function private.guard_copyright_watermark_job_history();

create or replace function private.copyright_staff_allowed(subject_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,private
as $$
  select subject_user_id is not null
    and private.current_active_role(subject_user_id) in ('copyright'::public.app_role,'super_admin'::public.app_role);
$$;

create or replace function private.new_copyright_public_id(prefix_value text,table_name text)
returns text
language plpgsql
volatile
security definer
set search_path=pg_catalog,public,extensions
as $$
declare candidate text;
begin
  if prefix_value not in ('crg','cwm','cpy','cev','evp','cnt') then raise exception 'copyright_id_prefix_invalid'; end if;
  loop
    candidate:=prefix_value||encode(extensions.gen_random_bytes(12),'hex');
    if table_name='copyright_rights_registrations' and not exists(select 1 from public.copyright_rights_registrations where public_id=candidate) then return candidate; end if;
    if table_name='copyright_watermark_jobs' and not exists(select 1 from public.copyright_watermark_jobs where public_id=candidate) then return candidate; end if;
    if table_name='copyright_cases' and not exists(select 1 from public.copyright_cases where public_id=candidate) then return candidate; end if;
    if table_name='copyright_case_events' and not exists(select 1 from public.copyright_case_events where public_id=candidate) then return candidate; end if;
    if table_name='copyright_evidence_packages' and not exists(select 1 from public.copyright_evidence_packages where public_id=candidate) then return candidate; end if;
    if table_name='copyright_notice_records' and not exists(select 1 from public.copyright_notice_records where public_id=candidate) then return candidate; end if;
  end loop;
end;
$$;

create or replace function private.copyright_case_summary(case_row public.copyright_cases)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select jsonb_build_object(
    'publicId',case_row.public_id,
    'releasePublicId',release.public_id,
    'releaseTitle',release.title,
    'stage',case_row.stage,
    'reportedUrl',report.reported_url,
    'evidencePackageAvailable',exists(select 1 from public.copyright_evidence_packages package where package.case_id=case_row.id),
    'sourceMatchState',case_row.source_match_state,
    'noticeStatus',case_row.notice_status,
    'removalConfirmedAt',case_row.removal_confirmed_at,
    'recurrenceCount',case_row.recurrence_count,
    'openedAt',case_row.opened_at,
    'updatedAt',case_row.updated_at
  )
  from public.releases release
  join public.release_stolen_copy_reports report on report.id=case_row.intake_report_id
  where release.id=case_row.release_id;
$$;

create or replace function private.append_copyright_case_event(
  case_row_id uuid,
  event_name text,
  stage_value text,
  reason_value text,
  notice_value text default null,
  evidence_value text default null,
  actor_value uuid default null
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare event_public_id text;
begin
  event_public_id:=private.new_copyright_public_id('cev','copyright_case_events');
  insert into public.copyright_case_events(public_id,case_id,actor_user_id,event_type,stage_after,reason,notice_reference,evidence_reference)
  values(event_public_id,case_row_id,actor_value,event_name,stage_value,reason_value,notice_value,evidence_value);
end;
$$;

create or replace function public.register_release_rights(
  requested_release_public_id text,
  requested_ownership_kind text,
  requested_licence_reference text,
  requested_ownership_evidence_reference text,
  requested_content_sha256 text,
  requested_perceptual_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  release_row public.releases%rowtype;
  existing_row public.copyright_rights_registrations%rowtype;
  created_row public.copyright_rights_registrations%rowtype;
  registration_public_id text;
  watermark_public_id text;
  ownership_value text:=lower(trim(coalesce(requested_ownership_kind,'')));
  licence_value text:=nullif(trim(coalesce(requested_licence_reference,'')),'');
  evidence_value text:=trim(coalesce(requested_ownership_evidence_reference,''));
  sha_value text:=lower(trim(coalesce(requested_content_sha256,'')));
  fingerprint_value text:=trim(coalesce(requested_perceptual_fingerprint,''));
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select * into release_row from public.releases where public_id=trim(coalesce(requested_release_public_id,''));
  if release_row.id is null or release_row.creator_user_id<>auth.uid() then raise exception 'rights_registration_not_allowed' using errcode='42501'; end if;
  if private.current_active_role(auth.uid())<>'creator'::public.app_role then raise exception 'creator_workspace_required' using errcode='42501'; end if;
  if ownership_value not in ('owner','licensee') then raise exception 'rights_ownership_kind_invalid'; end if;
  if ownership_value='licensee' and (licence_value is null or char_length(licence_value) not between 3 and 180) then raise exception 'rights_licence_reference_required'; end if;
  if licence_value is not null and (char_length(licence_value) not between 3 and 180 or licence_value ~ '[[:cntrl:]]') then raise exception 'rights_licence_reference_invalid'; end if;
  if evidence_value !~ '^evidence:[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$' then raise exception 'rights_evidence_reference_invalid'; end if;
  if sha_value !~ '^[0-9a-f]{64}$' then raise exception 'rights_sha256_invalid'; end if;
  if fingerprint_value !~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,31}:[0-9a-f]{16,128}$' then raise exception 'rights_perceptual_fingerprint_invalid'; end if;

  select * into existing_row from public.copyright_rights_registrations where release_id=release_row.id;
  if existing_row.id is not null then
    if existing_row.registrant_user_id<>auth.uid()
      or existing_row.ownership_kind<>ownership_value
      or existing_row.licence_reference is distinct from licence_value
      or existing_row.ownership_evidence_reference<>evidence_value
      or existing_row.content_sha256<>sha_value
      or existing_row.perceptual_fingerprint<>fingerprint_value then
      raise exception 'rights_registration_conflict' using errcode='40001';
    end if;
    return jsonb_build_object('publicId',existing_row.public_id,'releasePublicId',release_row.public_id,'ownershipKind',existing_row.ownership_kind,'registeredAt',existing_row.created_at);
  end if;

  registration_public_id:=private.new_copyright_public_id('crg','copyright_rights_registrations');
  insert into public.copyright_rights_registrations(public_id,release_id,registrant_user_id,ownership_kind,licence_reference,ownership_evidence_reference,content_sha256,perceptual_fingerprint)
  values(registration_public_id,release_row.id,auth.uid(),ownership_value,licence_value,evidence_value,sha_value,fingerprint_value)
  returning * into created_row;

  watermark_public_id:=private.new_copyright_public_id('cwm','copyright_watermark_jobs');
  insert into public.copyright_watermark_jobs(public_id,rights_registration_id,release_id,state)
  values(watermark_public_id,created_row.id,release_row.id,'queued');

  update public.copyright_cases
  set rights_registration_id=created_row.id,updated_at=now()
  where release_id=release_row.id and rights_registration_id is null;

  perform private.write_audit(auth.uid(),'copyright_rights_registered','success','/releases/'||release_row.public_id,'creator',jsonb_build_object(
    'releasePublicId',release_row.public_id,'rightsPublicId',created_row.public_id,'ownershipKind',created_row.ownership_kind,
    'contentSha256',created_row.content_sha256,'perceptualFingerprint',created_row.perceptual_fingerprint,'watermarkJobPublicId',watermark_public_id));
  return jsonb_build_object('publicId',created_row.public_id,'releasePublicId',release_row.public_id,'ownershipKind',created_row.ownership_kind,'registeredAt',created_row.created_at,'watermarkState','queued');
end;
$$;

create or replace function public.list_creator_copyright_cases()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private
as $$
declare result jsonb;
begin
  if auth.uid() is null or private.current_active_role(auth.uid())<>'creator'::public.app_role then raise exception 'creator_workspace_required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(private.copyright_case_summary(c) order by c.updated_at desc),'[]'::jsonb)
  into result
  from public.copyright_cases c
  join public.releases r on r.id=c.release_id
  where r.creator_user_id=auth.uid();
  return result;
end;
$$;

create or replace function public.list_creator_rights_registry()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private
as $$
declare result jsonb;
begin
  if auth.uid() is null or private.current_active_role(auth.uid())<>'creator'::public.app_role then raise exception 'creator_workspace_required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'releasePublicId',release.public_id,
    'releaseTitle',release.title,
    'releasedAt',release.released_at,
    'rightsPublicId',rights.public_id,
    'ownershipKind',rights.ownership_kind,
    'registeredAt',rights.created_at,
    'watermarkState',watermark.state
  ) order by release.released_at desc),'[]'::jsonb)
  into result
  from public.releases release
  left join public.copyright_rights_registrations rights on rights.release_id=release.id
  left join lateral (
    select job.state
    from public.copyright_watermark_jobs job
    where job.release_id=release.id
    order by job.requested_at desc
    limit 1
  ) watermark on true
  where release.creator_user_id=auth.uid();
  return result;
end;
$$;

create or replace function public.list_copyright_intake_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private
as $$
declare result jsonb;
begin
  if not private.copyright_staff_allowed(auth.uid()) then raise exception 'copyright_staff_required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'reportPublicId',report.public_id,
    'releasePublicId',release.public_id,
    'releaseTitle',release.title,
    'reportedUrl',report.reported_url,
    'reportCreatedAt',report.created_at,
    'casePublicId',case_row.public_id
  ) order by report.created_at desc),'[]'::jsonb)
  into result
  from public.release_stolen_copy_reports report
  join public.releases release on release.id=report.release_id
  left join public.copyright_cases case_row on case_row.intake_report_id=report.id;
  return result;
end;
$$;

create or replace function public.list_copyright_staff_cases()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private
as $$
declare result jsonb;
begin
  if not private.copyright_staff_allowed(auth.uid()) then raise exception 'copyright_staff_required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(
    private.copyright_case_summary(c) || jsonb_build_object(
      'reportPublicId',report.public_id,
      'rightsRegistered',c.rights_registration_id is not null,
      'repeatInfringerFlag',c.repeat_infringer_flag
    ) order by c.updated_at desc
  ),'[]'::jsonb)
  into result
  from public.copyright_cases c
  join public.release_stolen_copy_reports report on report.id=c.intake_report_id;
  return result;
end;
$$;

create or replace function public.open_copyright_case_from_report(requested_report_public_id text,requested_reason text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  report_row public.release_stolen_copy_reports%rowtype;
  release_row public.releases%rowtype;
  rights_row public.copyright_rights_registrations%rowtype;
  existing_row public.copyright_cases%rowtype;
  created_row public.copyright_cases%rowtype;
  case_public_id text;
  reason_value text:=trim(coalesce(requested_reason,''));
begin
  if not private.copyright_staff_allowed(auth.uid()) then raise exception 'copyright_staff_required' using errcode='42501'; end if;
  if char_length(reason_value) not between 10 and 2000 or reason_value ~ '[[:cntrl:]]' then raise exception 'copyright_reason_invalid'; end if;
  select * into report_row from public.release_stolen_copy_reports where public_id=trim(coalesce(requested_report_public_id,''));
  if report_row.id is null then raise exception 'copyright_report_not_found'; end if;
  select * into release_row from public.releases where id=report_row.release_id;
  select * into existing_row from public.copyright_cases where intake_report_id=report_row.id;
  if existing_row.id is not null then return private.copyright_case_summary(existing_row); end if;
  select * into rights_row from public.copyright_rights_registrations where release_id=report_row.release_id;
  case_public_id:=private.new_copyright_public_id('cpy','copyright_cases');
  insert into public.copyright_cases(public_id,intake_report_id,release_id,rights_registration_id,opened_by_user_id,source_key_hash)
  values(case_public_id,report_row.id,report_row.release_id,rights_row.id,auth.uid(),report_row.url_hash)
  returning * into created_row;
  insert into public.copyright_repeat_infringer_signals(source_key_hash,case_count,updated_at)
  values(report_row.url_hash,1,now())
  on conflict(source_key_hash) do update set case_count=public.copyright_repeat_infringer_signals.case_count+1,updated_at=now();
  perform private.append_copyright_case_event(created_row.id,'case_opened','report_received',reason_value,null,null,auth.uid());
  perform private.write_audit(auth.uid(),'copyright_case_opened','success','/workspace/staff/copyright','copyright',jsonb_build_object(
    'casePublicId',created_row.public_id,'reportPublicId',report_row.public_id,'releasePublicId',release_row.public_id));
  return private.copyright_case_summary(created_row);
end;
$$;

create or replace function public.record_copyright_source_match(
  requested_case_public_id text,
  requested_state text,
  requested_source_fingerprint text,
  requested_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  case_row public.copyright_cases%rowtype;
  state_value text:=lower(trim(coalesce(requested_state,'')));
  fingerprint_value text:=nullif(lower(trim(coalesce(requested_source_fingerprint,''))), '');
  reason_value text:=trim(coalesce(requested_reason,''));
  actor_value uuid:=case when auth.role()='service_role' then null else auth.uid() end;
begin
  if auth.role()<>'service_role' and not private.copyright_staff_allowed(auth.uid()) then raise exception 'copyright_staff_required' using errcode='42501'; end if;
  if state_value not in ('no_match','possible_session_match') then raise exception 'copyright_source_match_invalid'; end if;
  if fingerprint_value is not null and fingerprint_value !~ '^[0-9a-f]{64}$' then raise exception 'copyright_source_fingerprint_invalid'; end if;
  if state_value='possible_session_match' and fingerprint_value is null then raise exception 'copyright_source_fingerprint_required'; end if;
  if char_length(reason_value) not between 10 and 2000 or reason_value ~ '[[:cntrl:]]' then raise exception 'copyright_reason_invalid'; end if;
  select * into case_row from public.copyright_cases where public_id=trim(coalesce(requested_case_public_id,'')) for update;
  if case_row.id is null then raise exception 'copyright_case_not_found'; end if;
  if case_row.stage in ('closed_false_positive','closed') then raise exception 'copyright_case_closed' using errcode='40001'; end if;
  update public.copyright_cases set
    source_match_state=state_value,
    source_match_fingerprint=fingerprint_value,
    stage=case when stage='report_received' then 'matching' else stage end,
    updated_at=now()
  where id=case_row.id returning * into case_row;
  perform private.append_copyright_case_event(case_row.id,'source_match_recorded',case_row.stage,reason_value,null,null,actor_value);
  perform private.write_audit(actor_value,'copyright_source_match_recorded','success','copyright-source-match',case when actor_value is null then null else private.current_active_role(actor_value) end,jsonb_build_object(
    'casePublicId',case_row.public_id,'state',case_row.source_match_state,'sourceFingerprint',case_row.source_match_fingerprint));
  return private.copyright_case_summary(case_row);
end;
$$;

create or replace function public.record_copyright_watermark_job(
  requested_release_public_id text,
  requested_state text,
  requested_provider_reference text,
  requested_watermark_reference text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  release_row public.releases%rowtype;
  job_row public.copyright_watermark_jobs%rowtype;
  state_value text:=lower(trim(coalesce(requested_state,'')));
  provider_value text:=nullif(trim(coalesce(requested_provider_reference,'')),'');
  watermark_value text:=nullif(trim(coalesce(requested_watermark_reference,'')),'');
  actor_value uuid:=case when auth.role()='service_role' then null else auth.uid() end;
begin
  if auth.role()<>'service_role' and not private.copyright_staff_allowed(auth.uid()) then raise exception 'copyright_staff_required' using errcode='42501'; end if;
  if state_value not in ('completed','failed') then raise exception 'copyright_watermark_state_invalid'; end if;
  if provider_value is null or char_length(provider_value) not between 3 and 180 or provider_value ~ '[[:cntrl:]]' then raise exception 'copyright_watermark_provider_reference_invalid'; end if;
  if state_value='completed' and (watermark_value is null or char_length(watermark_value) not between 3 and 180 or watermark_value ~ '[[:cntrl:]]') then raise exception 'copyright_watermark_reference_required'; end if;
  select * into release_row from public.releases where public_id=trim(coalesce(requested_release_public_id,''));
  if release_row.id is null then raise exception 'release_not_found'; end if;
  select * into job_row from public.copyright_watermark_jobs where release_id=release_row.id and state='queued' order by requested_at asc limit 1 for update;
  if job_row.id is null then raise exception 'copyright_watermark_job_not_found'; end if;
  update public.copyright_watermark_jobs set
    state=state_value,provider_reference=provider_value,watermark_reference=case when state_value='completed' then watermark_value else null end,
    completed_at=case when state_value='completed' then now() else null end,updated_at=now()
  where id=job_row.id returning * into job_row;
  perform private.write_audit(actor_value,'copyright_watermark_job_recorded','success','copyright-watermark',case when actor_value is null then null else private.current_active_role(actor_value) end,jsonb_build_object(
    'releasePublicId',release_row.public_id,'watermarkJobPublicId',job_row.public_id,'state',job_row.state,'providerReference',job_row.provider_reference));
  return jsonb_build_object('publicId',job_row.public_id,'releasePublicId',release_row.public_id,'state',job_row.state,'completedAt',job_row.completed_at);
end;
$$;

create or replace function public.advance_copyright_case(
  requested_case_public_id text,
  requested_action text,
  requested_reason text,
  requested_notice_reference text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,extensions
as $$
declare
  case_row public.copyright_cases%rowtype;
  action_value text:=lower(trim(coalesce(requested_action,'')));
  reason_value text:=trim(coalesce(requested_reason,''));
  notice_value text:=nullif(trim(coalesce(requested_notice_reference,'')),'');
  event_evidence_reference text;
  package_public_id text;
  package_reference_value text;
  package_hash text;
  notice_public_id text;
  notice_document_reference text;
  notice_document_sha256 text;
  notice_record public.copyright_notice_records%rowtype;
  signal_row public.copyright_repeat_infringer_signals%rowtype;
begin
  if not private.copyright_staff_allowed(auth.uid()) then raise exception 'copyright_staff_required' using errcode='42501'; end if;
  if action_value not in ('begin_matching','prepare_evidence','draft_notice','submit_notice','confirm_removal','record_recurrence','record_counter_notice','mark_false_positive','close_case') then raise exception 'copyright_action_invalid'; end if;
  if char_length(reason_value) not between 10 and 2000 or reason_value ~ '[[:cntrl:]]' then raise exception 'copyright_reason_invalid'; end if;
  if notice_value is not null and (char_length(notice_value) not between 3 and 180 or notice_value ~ '[[:cntrl:]]') then raise exception 'copyright_notice_reference_invalid'; end if;
  if action_value='submit_notice' and notice_value is null then raise exception 'copyright_notice_reference_required'; end if;
  select * into case_row from public.copyright_cases where public_id=trim(coalesce(requested_case_public_id,'')) for update;
  if case_row.id is null then raise exception 'copyright_case_not_found'; end if;

  if action_value='begin_matching' then
    if case_row.stage<>'report_received' then raise exception 'copyright_transition_invalid' using errcode='40001'; end if;
    case_row.stage:='matching';
  elsif action_value='prepare_evidence' then
    if case_row.stage<>'matching' then raise exception 'copyright_transition_invalid' using errcode='40001'; end if;
    if case_row.rights_registration_id is null then raise exception 'copyright_rights_registration_required' using errcode='40001'; end if;
    package_public_id:=private.new_copyright_public_id('evp','copyright_evidence_packages');
    package_reference_value:='evidence:copyright-package-'||substr(package_public_id,4);
    package_hash:=encode(extensions.digest(convert_to(case_row.public_id||':'||case_row.source_key_hash||':'||case_row.rights_registration_id::text,'UTF8'),'sha256'),'hex');
    insert into public.copyright_evidence_packages(public_id,case_id,generated_by_user_id,package_reference,package_sha256)
    values(package_public_id,case_row.id,auth.uid(),package_reference_value,package_hash)
    on conflict(case_id) do nothing;
    select package_reference into event_evidence_reference from public.copyright_evidence_packages where case_id=case_row.id;
    case_row.stage:='evidence_ready';
  elsif action_value='draft_notice' then
    if case_row.stage<>'evidence_ready' then raise exception 'copyright_transition_invalid' using errcode='40001'; end if;
    select package_reference into package_reference_value from public.copyright_evidence_packages where case_id=case_row.id;
    if package_reference_value is null then raise exception 'copyright_evidence_package_required' using errcode='40001'; end if;
    notice_public_id:=private.new_copyright_public_id('cnt','copyright_notice_records');
    notice_document_reference:='evidence:copyright-notice-'||substr(notice_public_id,4);
    notice_document_sha256:=encode(extensions.digest(convert_to(jsonb_build_object(
      'casePublicId',case_row.public_id,
      'evidencePackageReference',package_reference_value,
      'sourceMatchState',case_row.source_match_state,
      'sourceMatchFingerprint',case_row.source_match_fingerprint,
      'requestedRelief','remove_or_disable_access_to_reported_url'
    )::text,'UTF8'),'sha256'),'hex');
    insert into public.copyright_notice_records(public_id,case_id,event_type,document_reference,document_sha256,submission_reference,created_by_user_id)
    values(notice_public_id,case_row.id,'drafted',notice_document_reference,notice_document_sha256,null,auth.uid());
    case_row.stage:='notice_drafted'; case_row.notice_status:='drafted';
  elsif action_value='submit_notice' then
    if case_row.stage<>'notice_drafted' then raise exception 'copyright_transition_invalid' using errcode='40001'; end if;
    select * into notice_record from public.copyright_notice_records where case_id=case_row.id and event_type='drafted' order by created_at desc limit 1;
    if notice_record.id is null then raise exception 'copyright_notice_document_required' using errcode='40001'; end if;
    notice_public_id:=private.new_copyright_public_id('cnt','copyright_notice_records');
    insert into public.copyright_notice_records(public_id,case_id,event_type,document_reference,document_sha256,submission_reference,created_by_user_id)
    values(notice_public_id,case_row.id,'submitted',notice_record.document_reference,notice_record.document_sha256,notice_value,auth.uid());
    case_row.stage:='notice_submitted'; case_row.notice_status:='submitted'; case_row.notice_reference:=notice_value;
  elsif action_value='confirm_removal' then
    if case_row.stage not in ('notice_submitted','counter_notice') then raise exception 'copyright_transition_invalid' using errcode='40001'; end if;
    select * into notice_record from public.copyright_notice_records where case_id=case_row.id and event_type='drafted' order by created_at desc limit 1;
    if notice_record.id is null then raise exception 'copyright_notice_document_required' using errcode='40001'; end if;
    notice_public_id:=private.new_copyright_public_id('cnt','copyright_notice_records');
    insert into public.copyright_notice_records(public_id,case_id,event_type,document_reference,document_sha256,submission_reference,created_by_user_id)
    values(notice_public_id,case_row.id,'removal_confirmed',notice_record.document_reference,notice_record.document_sha256,case_row.notice_reference,auth.uid());
    case_row.stage:='removed'; case_row.notice_status:='removed'; case_row.removal_confirmed_at:=now();
    update public.copyright_repeat_infringer_signals set removal_count=removal_count+1,updated_at=now() where source_key_hash=case_row.source_key_hash;
  elsif action_value='record_recurrence' then
    if case_row.stage not in ('removed','monitoring') then raise exception 'copyright_transition_invalid' using errcode='40001'; end if;
    case_row.stage:='monitoring'; case_row.recurrence_count:=case_row.recurrence_count+1;
    update public.copyright_repeat_infringer_signals set recurrence_count=recurrence_count+1,updated_at=now() where source_key_hash=case_row.source_key_hash returning * into signal_row;
    if signal_row.case_count+signal_row.removal_count+signal_row.recurrence_count>=3 then
      case_row.repeat_infringer_flag:=true;
      update public.copyright_repeat_infringer_signals set flagged_at=coalesce(flagged_at,now()),updated_at=now() where source_key_hash=case_row.source_key_hash;
    end if;
  elsif action_value='record_counter_notice' then
    if case_row.stage not in ('notice_submitted','removed','monitoring') then raise exception 'copyright_transition_invalid' using errcode='40001'; end if;
    select * into notice_record from public.copyright_notice_records where case_id=case_row.id and event_type='drafted' order by created_at desc limit 1;
    if notice_record.id is null then raise exception 'copyright_notice_document_required' using errcode='40001'; end if;
    notice_public_id:=private.new_copyright_public_id('cnt','copyright_notice_records');
    insert into public.copyright_notice_records(public_id,case_id,event_type,document_reference,document_sha256,submission_reference,created_by_user_id)
    values(notice_public_id,case_row.id,'counter_notice',notice_record.document_reference,notice_record.document_sha256,case_row.notice_reference,auth.uid());
    case_row.stage:='counter_notice'; case_row.notice_status:='counter_notice';
  elsif action_value='mark_false_positive' then
    if case_row.stage not in ('report_received','matching','evidence_ready') then raise exception 'copyright_transition_invalid' using errcode='40001'; end if;
    case_row.stage:='closed_false_positive';
  elsif action_value='close_case' then
    if case_row.stage not in ('removed','monitoring','counter_notice') then raise exception 'copyright_transition_invalid' using errcode='40001'; end if;
    case_row.stage:='closed';
  end if;

  update public.copyright_cases set
    stage=case_row.stage,notice_status=case_row.notice_status,notice_reference=case_row.notice_reference,
    removal_confirmed_at=case_row.removal_confirmed_at,recurrence_count=case_row.recurrence_count,
    repeat_infringer_flag=case_row.repeat_infringer_flag,updated_at=now()
  where id=case_row.id returning * into case_row;
  perform private.append_copyright_case_event(case_row.id,action_value,case_row.stage,reason_value,coalesce(notice_value,case_row.notice_reference),event_evidence_reference,auth.uid());
  perform private.write_audit(auth.uid(),'copyright_case_advanced','success','/workspace/staff/copyright','copyright',jsonb_build_object(
    'casePublicId',case_row.public_id,'action',action_value,'stage',case_row.stage,'noticeStatus',case_row.notice_status,'recurrenceCount',case_row.recurrence_count,'repeatInfringerFlag',case_row.repeat_infringer_flag));
  return private.copyright_case_summary(case_row);
end;
$$;

create or replace function public.get_copyright_case_evidence(requested_case_public_id text,requested_access_reason text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  case_row public.copyright_cases%rowtype;
  release_row public.releases%rowtype;
  report_row public.release_stolen_copy_reports%rowtype;
  rights_row public.copyright_rights_registrations%rowtype;
  package_row public.copyright_evidence_packages%rowtype;
  notice_row public.copyright_notice_records%rowtype;
  reason_value text:=trim(coalesce(requested_access_reason,''));
  history jsonb;
  notice_history jsonb;
begin
  if not private.copyright_staff_allowed(auth.uid()) then raise exception 'copyright_staff_required' using errcode='42501'; end if;
  if char_length(reason_value) not between 10 and 500 or reason_value ~ '[[:cntrl:]]' then raise exception 'copyright_evidence_access_reason_invalid'; end if;
  select * into case_row from public.copyright_cases where public_id=trim(coalesce(requested_case_public_id,''));
  if case_row.id is null then raise exception 'copyright_case_not_found'; end if;
  select * into release_row from public.releases where id=case_row.release_id;
  select * into report_row from public.release_stolen_copy_reports where id=case_row.intake_report_id;
  select * into rights_row from public.copyright_rights_registrations where id=case_row.rights_registration_id;
  select * into package_row from public.copyright_evidence_packages where case_id=case_row.id;
  select * into notice_row from public.copyright_notice_records where case_id=case_row.id and event_type='drafted' order by created_at desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventPublicId',event.public_id,'eventType',event.event_type,'stageAfter',event.stage_after,'reason',event.reason,
    'noticeReference',event.notice_reference,'evidenceReference',event.evidence_reference,'createdAt',event.created_at
  ) order by event.created_at asc),'[]'::jsonb) into history
  from public.copyright_case_events event where event.case_id=case_row.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'recordPublicId',notice.public_id,
    'eventType',notice.event_type,
    'documentReference',notice.document_reference,
    'documentSha256',notice.document_sha256,
    'submissionReference',notice.submission_reference,
    'createdAt',notice.created_at
  ) order by notice.created_at asc),'[]'::jsonb) into notice_history
  from public.copyright_notice_records notice where notice.case_id=case_row.id;
  perform private.write_audit(auth.uid(),'copyright_evidence_accessed','success','/workspace/staff/copyright','copyright',jsonb_build_object(
    'casePublicId',case_row.public_id,'releasePublicId',release_row.public_id,'reason',reason_value));
  return jsonb_build_object(
    'casePublicId',case_row.public_id,'releasePublicId',release_row.public_id,'releaseTitle',release_row.title,
    'reportedUrl',report_row.reported_url,'reportNote',report_row.note,'reportCreatedAt',report_row.created_at,
    'ownershipKind',rights_row.ownership_kind,'licenceReference',rights_row.licence_reference,
    'ownershipEvidenceReference',rights_row.ownership_evidence_reference,'contentSha256',rights_row.content_sha256,
    'perceptualFingerprint',rights_row.perceptual_fingerprint,'sourceMatchState',case_row.source_match_state,
    'sourceMatchFingerprint',case_row.source_match_fingerprint,'noticeReference',case_row.notice_reference,
    'noticeDocumentReference',notice_row.document_reference,'noticeDocumentSha256',notice_row.document_sha256,
    'noticeHistory',notice_history,
    'evidencePackageReference',package_row.package_reference,'evidencePackageSha256',package_row.package_sha256,
    'removalConfirmedAt',case_row.removal_confirmed_at,'recurrenceCount',case_row.recurrence_count,'history',history
  );
end;
$$;

revoke all on function private.copyright_staff_allowed(uuid) from public,anon,authenticated;
revoke all on function private.new_copyright_public_id(text,text) from public,anon,authenticated;
revoke all on function private.copyright_case_summary(public.copyright_cases) from public,anon,authenticated;
revoke all on function private.append_copyright_case_event(uuid,text,text,text,text,text,uuid) from public,anon,authenticated;

revoke all on function public.register_release_rights(text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.list_creator_rights_registry() from public,anon,authenticated;
revoke all on function public.list_creator_copyright_cases() from public,anon,authenticated;
revoke all on function public.list_copyright_intake_queue() from public,anon,authenticated;
revoke all on function public.list_copyright_staff_cases() from public,anon,authenticated;
revoke all on function public.open_copyright_case_from_report(text,text) from public,anon,authenticated;
revoke all on function public.record_copyright_source_match(text,text,text,text) from public,anon,authenticated;
revoke all on function public.record_copyright_watermark_job(text,text,text,text) from public,anon,authenticated;
revoke all on function public.advance_copyright_case(text,text,text,text) from public,anon,authenticated;
revoke all on function public.get_copyright_case_evidence(text,text) from public,anon,authenticated;

grant execute on function public.register_release_rights(text,text,text,text,text,text) to authenticated;
grant execute on function public.list_creator_rights_registry() to authenticated;
grant execute on function public.list_creator_copyright_cases() to authenticated;
grant execute on function public.list_copyright_intake_queue() to authenticated;
grant execute on function public.list_copyright_staff_cases() to authenticated;
grant execute on function public.open_copyright_case_from_report(text,text) to authenticated;
grant execute on function public.record_copyright_source_match(text,text,text,text) to authenticated,service_role;
grant execute on function public.record_copyright_watermark_job(text,text,text,text) to authenticated,service_role;
grant execute on function public.advance_copyright_case(text,text,text,text) to authenticated;
grant execute on function public.get_copyright_case_evidence(text,text) to authenticated;
