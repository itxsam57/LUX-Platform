create type public.final_delivery_processing_state as enum ('uploaded','processing','ready','failed');
create type public.final_cut_approval_state as enum ('pending','approved','changes_requested');
create type public.delivery_review_state as enum ('pending','in_review','changes_requested','held','escalated','approved','rejected');
create type public.delivery_review_check_state as enum ('pending','pass','fail');
create type public.delivery_review_decision as enum ('approve','reject','request_changes','escalate','hold');

create table public.final_delivery_versions (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^fdv[0-9a-f]{24}$'),
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null check (version >= 1),
  production_asset_id uuid not null references public.production_assets(id) on delete restrict,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  contract_term_version_id uuid not null references public.project_term_versions(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 120 and idempotency_key ~ '^[A-Za-z0-9._:-]+$'),
  submitted_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(project_id,version),
  unique(project_id,idempotency_key)
);

create table public.final_delivery_processing (
  delivery_version_id uuid primary key references public.final_delivery_versions(id) on delete cascade,
  state public.final_delivery_processing_state not null default 'uploaded',
  note text,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (note is null or (char_length(trim(note)) between 3 and 1000 and note !~ '[[:cntrl:]]'))
);

create table public.final_delivery_processing_events (
  id bigint generated always as identity primary key,
  delivery_version_id uuid not null references public.final_delivery_versions(id) on delete cascade,
  state public.final_delivery_processing_state not null,
  note text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (note is null or (char_length(trim(note)) between 3 and 1000 and note !~ '[[:cntrl:]]'))
);

create table public.final_cut_approvals (
  delivery_version_id uuid not null references public.final_delivery_versions(id) on delete cascade,
  performer_user_id uuid not null references auth.users(id) on delete cascade,
  state public.final_cut_approval_state not null default 'pending',
  note text,
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(delivery_version_id,performer_user_id),
  check (note is null or (char_length(trim(note)) between 3 and 1000 and note !~ '[[:cntrl:]]')),
  check ((state='pending' and responded_at is null) or (state<>'pending' and responded_at is not null))
);

create table public.final_cut_approval_events (
  id bigint generated always as identity primary key,
  delivery_version_id uuid not null references public.final_delivery_versions(id) on delete cascade,
  performer_user_id uuid not null references auth.users(id) on delete cascade,
  state public.final_cut_approval_state not null check (state <> 'pending'),
  note text,
  created_at timestamptz not null default now(),
  check (note is null or (char_length(trim(note)) between 3 and 1000 and note !~ '[[:cntrl:]]'))
);

create table public.delivery_review_cases (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^rvc[0-9a-f]{24}$'),
  delivery_version_id uuid not null unique references public.final_delivery_versions(id) on delete cascade,
  state public.delivery_review_state not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.delivery_review_checklist_items (
  review_case_id uuid not null references public.delivery_review_cases(id) on delete cascade,
  item_key text not null check (item_key in ('legality','consent','copyright','quality')),
  label text not null check (char_length(trim(label)) between 3 and 120),
  required boolean not null default true,
  state public.delivery_review_check_state not null default 'pending',
  note text,
  checked_by_user_id uuid references auth.users(id) on delete set null,
  checked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(review_case_id,item_key),
  check (note is null or (char_length(trim(note)) between 3 and 1000 and note !~ '[[:cntrl:]]')),
  check ((state='pending' and checked_at is null) or (state<>'pending' and checked_at is not null))
);

create table public.delivery_review_check_events (
  id bigint generated always as identity primary key,
  review_case_id uuid not null references public.delivery_review_cases(id) on delete cascade,
  item_key text not null,
  state public.delivery_review_check_state not null check (state <> 'pending'),
  note text not null check (char_length(trim(note)) between 3 and 1000 and note !~ '[[:cntrl:]]'),
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.delivery_review_decisions (
  id bigint generated always as identity primary key,
  review_case_id uuid not null references public.delivery_review_cases(id) on delete cascade,
  decision public.delivery_review_decision not null,
  reason text not null check (char_length(trim(reason)) between 3 and 2000 and reason !~ '[[:cntrl:]]'),
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.delivery_creator_responses (
  id bigint generated always as identity primary key,
  review_case_id uuid not null references public.delivery_review_cases(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 3 and 2000 and body !~ '[[:cntrl:]]'),
  creator_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index final_delivery_project_version_idx on public.final_delivery_versions(project_id,version desc);
create index final_delivery_asset_idx on public.final_delivery_versions(production_asset_id);
create index final_cut_performer_idx on public.final_cut_approvals(performer_user_id,state);
create index review_case_state_idx on public.delivery_review_cases(state,updated_at desc);
create index review_decisions_case_idx on public.delivery_review_decisions(review_case_id,created_at desc);
create index creator_responses_case_idx on public.delivery_creator_responses(review_case_id,created_at desc);

alter table public.final_delivery_versions enable row level security;
alter table public.final_delivery_processing enable row level security;
alter table public.final_delivery_processing_events enable row level security;
alter table public.final_cut_approvals enable row level security;
alter table public.final_cut_approval_events enable row level security;
alter table public.delivery_review_cases enable row level security;
alter table public.delivery_review_checklist_items enable row level security;
alter table public.delivery_review_check_events enable row level security;
alter table public.delivery_review_decisions enable row level security;
alter table public.delivery_creator_responses enable row level security;

revoke all on public.final_delivery_versions from public,anon,authenticated;
revoke all on public.final_delivery_processing from public,anon,authenticated;
revoke all on public.final_delivery_processing_events from public,anon,authenticated;
revoke all on public.final_cut_approvals from public,anon,authenticated;
revoke all on public.final_cut_approval_events from public,anon,authenticated;
revoke all on public.delivery_review_cases from public,anon,authenticated;
revoke all on public.delivery_review_checklist_items from public,anon,authenticated;
revoke all on public.delivery_review_check_events from public,anon,authenticated;
revoke all on public.delivery_review_decisions from public,anon,authenticated;
revoke all on public.delivery_creator_responses from public,anon,authenticated;

create or replace function private.reject_delivery_history_mutation()
returns trigger
language plpgsql
set search_path=pg_catalog
as $$
begin
  raise exception 'immutable_delivery_review_history' using errcode='55000';
end;
$$;

create trigger final_delivery_versions_immutable
before update or delete on public.final_delivery_versions
for each row execute function private.reject_delivery_history_mutation();
create trigger final_delivery_processing_events_immutable
before update or delete on public.final_delivery_processing_events
for each row execute function private.reject_delivery_history_mutation();
create trigger final_cut_approval_events_immutable
before update or delete on public.final_cut_approval_events
for each row execute function private.reject_delivery_history_mutation();
create trigger delivery_review_check_events_immutable
before update or delete on public.delivery_review_check_events
for each row execute function private.reject_delivery_history_mutation();
create trigger delivery_review_decisions_immutable
before update or delete on public.delivery_review_decisions
for each row execute function private.reject_delivery_history_mutation();
create trigger delivery_creator_responses_immutable
before update or delete on public.delivery_creator_responses
for each row execute function private.reject_delivery_history_mutation();

create or replace function private.delivery_review_reason(value text, max_length integer default 2000)
returns text
language plpgsql
immutable
set search_path=pg_catalog
as $$
declare normalized text:=trim(coalesce(value,''));
begin
  if char_length(normalized) not between 3 and max_length or normalized ~ '[[:cntrl:]]' then
    raise exception 'invalid_delivery_review_reason' using errcode='22023';
  end if;
  return normalized;
end;
$$;

create or replace function private.delivery_has_personal_final_cut_access(
  delivery_row_id uuid,
  actor_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
  select actor_user_id is not null and exists(
    select 1 from public.final_cut_approvals approval
    where approval.delivery_version_id=delivery_row_id and approval.performer_user_id=actor_user_id
  );
$$;

create or replace function private.user_can_access_delivery_asset(
  asset_row_id uuid,
  actor_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
  select actor_user_id is not null and exists(
    select 1
    from public.production_assets asset
    where asset.id=asset_row_id
      and (
        private.user_has_project_production_access(asset.project_id,actor_user_id)
        or private.is_verification_reviewer(actor_user_id)
        or exists(
          select 1 from public.final_delivery_versions delivery
          where delivery.production_asset_id=asset.id
            and private.delivery_has_personal_final_cut_access(delivery.id,actor_user_id)
        )
      )
  );
$$;

create or replace function private.delivery_is_release_ready(delivery_row_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select exists(
    select 1
    from public.final_delivery_processing processing
    join public.delivery_review_cases review_case on review_case.delivery_version_id=processing.delivery_version_id
    where processing.delivery_version_id=delivery_row_id
      and processing.state='ready'
      and review_case.state='approved'
      and not exists(
        select 1 from public.final_cut_approvals approval
        where approval.delivery_version_id=delivery_row_id and approval.state<>'approved'
      )
      and not exists(
        select 1 from public.delivery_review_checklist_items item
        where item.review_case_id=review_case.id and item.required and item.state<>'pass'
      )
  );
$$;

create or replace function public.submit_final_delivery(
  requested_project_public_id text,
  requested_asset_public_id text,
  requested_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare
  project_row public.projects%rowtype;
  asset_row public.production_assets%rowtype;
  lock_row public.contract_lock_receipts%rowtype;
  term_row public.project_term_versions%rowtype;
  existing_row public.final_delivery_versions%rowtype;
  created_row public.final_delivery_versions%rowtype;
  review_row public.delivery_review_cases%rowtype;
  next_version integer;
  candidate text;
  review_candidate text;
  normalized_key text:=trim(coalesce(requested_idempotency_key,''));
  participant jsonb;
  performer_id uuid;
begin
  perform private.assert_current_session();
  select project.* into project_row
  from public.projects project
  where project.public_id=trim(coalesce(requested_project_public_id,'')) and project.owner_user_id=auth.uid()
  for update;
  if project_row.id is null then raise exception 'final_delivery_owner_required' using errcode='42501'; end if;
  if normalized_key !~ '^[A-Za-z0-9._:-]{8,120}$' then raise exception 'invalid_final_delivery_idempotency_key' using errcode='22023'; end if;

  select * into asset_row from public.production_assets
  where public_id=trim(coalesce(requested_asset_public_id,'')) and project_id=project_row.id and kind='media';
  if asset_row.id is null then raise exception 'final_delivery_asset_invalid' using errcode='22023'; end if;

  select * into lock_row from public.contract_lock_receipts where project_id=project_row.id;
  if lock_row.id is null then raise exception 'final_delivery_contract_required' using errcode='42501'; end if;
  select * into term_row from public.project_term_versions where id=lock_row.term_version_id;
  if term_row.id is null or term_row.terms_hash<>lock_row.terms_hash then raise exception 'final_delivery_contract_invalid' using errcode='42501'; end if;

  select * into existing_row from public.final_delivery_versions
  where project_id=project_row.id and idempotency_key=normalized_key;
  if existing_row.id is not null then
    if existing_row.production_asset_id<>asset_row.id then raise exception 'final_delivery_idempotency_conflict' using errcode='40001'; end if;
    return jsonb_build_object(
      'publicId',existing_row.public_id,'version',existing_row.version,'sha256',existing_row.sha256,
      'processingState',(select state from public.final_delivery_processing where delivery_version_id=existing_row.id),
      'status',(select state from public.delivery_review_cases where delivery_version_id=existing_row.id),
      'releaseReady',private.delivery_is_release_ready(existing_row.id)
    );
  end if;

  select coalesce(max(version),0)+1 into next_version from public.final_delivery_versions where project_id=project_row.id;
  loop candidate:='fdv'||encode(extensions.gen_random_bytes(12),'hex'); exit when not exists(select 1 from public.final_delivery_versions where public_id=candidate); end loop;
  insert into public.final_delivery_versions(
    public_id,project_id,version,production_asset_id,sha256,contract_term_version_id,idempotency_key,submitted_by_user_id
  ) values(candidate,project_row.id,next_version,asset_row.id,asset_row.sha256,term_row.id,normalized_key,auth.uid()) returning * into created_row;
  insert into public.final_delivery_processing(delivery_version_id,state,updated_by_user_id) values(created_row.id,'uploaded',auth.uid());
  insert into public.final_delivery_processing_events(delivery_version_id,state,actor_user_id) values(created_row.id,'uploaded',auth.uid());

  loop review_candidate:='rvc'||encode(extensions.gen_random_bytes(12),'hex'); exit when not exists(select 1 from public.delivery_review_cases where public_id=review_candidate); end loop;
  insert into public.delivery_review_cases(public_id,delivery_version_id) values(review_candidate,created_row.id) returning * into review_row;
  insert into public.delivery_review_checklist_items(review_case_id,item_key,label,required) values
    (review_row.id,'legality','Legality and contract scope',true),
    (review_row.id,'consent','Consent and depicted-person evidence',true),
    (review_row.id,'copyright','Copyright and rights evidence',true),
    (review_row.id,'quality','Technical and content quality',true);

  if coalesce((term_row.terms->>'finalCutApprovalRequired')::boolean,false) then
    for participant in select value from jsonb_array_elements(term_row.terms->'participants') item(value) loop
      if coalesce((participant->>'depicted')::boolean,false) then
        select profile.user_id into performer_id from public.profiles profile where profile.handle=lower(trim(participant->>'handle')) limit 1;
        if performer_id is null then raise exception 'final_delivery_contract_participant_missing' using errcode='42501'; end if;
        insert into public.final_cut_approvals(delivery_version_id,performer_user_id) values(created_row.id,performer_id);
      end if;
    end loop;
  end if;

  perform private.write_audit(
    auth.uid(),'final_delivery_submitted','success','/studio/projects/'||project_row.public_id||'/review','creator',
    jsonb_build_object('projectPublicId',project_row.public_id,'deliveryPublicId',created_row.public_id,'version',created_row.version,'assetPublicId',asset_row.public_id,'sha256',created_row.sha256,'termsHash',term_row.terms_hash)
  );
  return jsonb_build_object('publicId',created_row.public_id,'version',created_row.version,'sha256',created_row.sha256,'processingState','uploaded','status','pending','releaseReady',false);
end;
$$;

create or replace function public.set_final_delivery_processing(
  requested_delivery_public_id text,
  requested_state text,
  requested_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare delivery_row public.final_delivery_versions%rowtype; next_state public.final_delivery_processing_state; normalized_note text;
begin
  if auth.role()<>'service_role' then perform private.assert_verification_reviewer(); end if;
  select * into delivery_row from public.final_delivery_versions where public_id=trim(coalesce(requested_delivery_public_id,''));
  if delivery_row.id is null then raise exception 'final_delivery_not_found' using errcode='22023'; end if;
  begin next_state:=lower(trim(coalesce(requested_state,'')))::public.final_delivery_processing_state;
  exception when others then raise exception 'invalid_final_delivery_processing_state' using errcode='22023'; end;
  normalized_note:=nullif(trim(coalesce(requested_note,'')),'');
  if normalized_note is not null and (char_length(normalized_note) not between 3 and 1000 or normalized_note ~ '[[:cntrl:]]') then raise exception 'invalid_delivery_review_reason' using errcode='22023'; end if;
  if next_state in ('ready','failed') and normalized_note is null then raise exception 'invalid_delivery_review_reason' using errcode='22023'; end if;
  update public.final_delivery_processing set state=next_state,note=normalized_note,updated_by_user_id=case when auth.role()='service_role' then null else auth.uid() end,updated_at=now()
  where delivery_version_id=delivery_row.id;
  insert into public.final_delivery_processing_events(delivery_version_id,state,note,actor_user_id)
  values(delivery_row.id,next_state,normalized_note,case when auth.role()='service_role' then null else auth.uid() end);
  perform private.write_audit(case when auth.role()='service_role' then null else auth.uid() end,'final_delivery_processing_changed','success','delivery-review',case when auth.role()='service_role' then null else private.current_active_role(auth.uid()) end,jsonb_build_object('deliveryPublicId',delivery_row.public_id,'state',next_state));
  return jsonb_build_object('publicId',delivery_row.public_id,'processingState',next_state);
end;
$$;

create or replace function public.record_final_cut_approval(
  requested_delivery_public_id text,
  requested_state text,
  requested_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare delivery_row public.final_delivery_versions%rowtype; approval_row public.final_cut_approvals%rowtype; next_state public.final_cut_approval_state; normalized_note text;
begin
  perform private.assert_current_session();
  select * into delivery_row from public.final_delivery_versions where public_id=trim(coalesce(requested_delivery_public_id,''));
  if delivery_row.id is null then raise exception 'final_cut_approval_denied' using errcode='42501'; end if;
  select * into approval_row from public.final_cut_approvals where delivery_version_id=delivery_row.id and performer_user_id=auth.uid() for update;
  if approval_row.delivery_version_id is null or not private.verification_is_current(auth.uid(),'v3') then raise exception 'final_cut_approval_denied' using errcode='42501'; end if;
  begin next_state:=lower(trim(coalesce(requested_state,'')))::public.final_cut_approval_state;
  exception when others then raise exception 'invalid_final_cut_approval_state' using errcode='22023'; end;
  if next_state='pending' then raise exception 'invalid_final_cut_approval_state' using errcode='22023'; end if;
  normalized_note:=nullif(trim(coalesce(requested_note,'')),'');
  if next_state='changes_requested' then normalized_note:=private.delivery_review_reason(normalized_note,1000);
  elsif normalized_note is not null and (char_length(normalized_note) not between 3 and 1000 or normalized_note ~ '[[:cntrl:]]') then raise exception 'invalid_delivery_review_reason' using errcode='22023'; end if;
  update public.final_cut_approvals set state=next_state,note=normalized_note,responded_at=now(),updated_at=now()
  where delivery_version_id=delivery_row.id and performer_user_id=auth.uid();
  insert into public.final_cut_approval_events(delivery_version_id,performer_user_id,state,note) values(delivery_row.id,auth.uid(),next_state,normalized_note);
  if next_state='changes_requested' then update public.delivery_review_cases set state='changes_requested',updated_at=now() where delivery_version_id=delivery_row.id; end if;
  perform private.write_audit(auth.uid(),'final_cut_approval_recorded','success','delivery-review',private.current_active_role(auth.uid()),jsonb_build_object('deliveryPublicId',delivery_row.public_id,'state',next_state));
  return jsonb_build_object('deliveryPublicId',delivery_row.public_id,'state',next_state,'releaseReady',private.delivery_is_release_ready(delivery_row.id));
end;
$$;

create or replace function public.set_delivery_review_check(
  requested_delivery_public_id text,
  requested_item_key text,
  requested_state text,
  requested_note text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare delivery_row public.final_delivery_versions%rowtype; review_row public.delivery_review_cases%rowtype; next_state public.delivery_review_check_state; normalized_key text:=lower(trim(coalesce(requested_item_key,''))); normalized_note text;
begin
  perform private.assert_verification_reviewer();
  select * into delivery_row from public.final_delivery_versions where public_id=trim(coalesce(requested_delivery_public_id,''));
  if delivery_row.id is null then raise exception 'final_delivery_not_found' using errcode='22023'; end if;
  select * into review_row from public.delivery_review_cases where delivery_version_id=delivery_row.id for update;
  begin next_state:=lower(trim(coalesce(requested_state,'')))::public.delivery_review_check_state;
  exception when others then raise exception 'invalid_delivery_review_check_state' using errcode='22023'; end;
  if next_state='pending' then raise exception 'invalid_delivery_review_check_state' using errcode='22023'; end if;
  normalized_note:=private.delivery_review_reason(requested_note,1000);
  update public.delivery_review_checklist_items set state=next_state,note=normalized_note,checked_by_user_id=auth.uid(),checked_at=now(),updated_at=now()
  where review_case_id=review_row.id and item_key=normalized_key;
  if not found then raise exception 'delivery_review_check_not_found' using errcode='22023'; end if;
  insert into public.delivery_review_check_events(review_case_id,item_key,state,note,reviewer_user_id) values(review_row.id,normalized_key,next_state,normalized_note,auth.uid());
  if review_row.state='pending' then update public.delivery_review_cases set state='in_review',updated_at=now() where id=review_row.id; end if;
  perform private.write_audit(auth.uid(),'delivery_review_check_recorded','success','delivery-review',private.current_active_role(auth.uid()),jsonb_build_object('deliveryPublicId',delivery_row.public_id,'itemKey',normalized_key,'state',next_state));
  return jsonb_build_object('deliveryPublicId',delivery_row.public_id,'itemKey',normalized_key,'state',next_state);
end;
$$;

create or replace function public.decide_delivery_review(
  requested_delivery_public_id text,
  requested_decision text,
  requested_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare delivery_row public.final_delivery_versions%rowtype; review_row public.delivery_review_cases%rowtype; next_decision public.delivery_review_decision; next_state public.delivery_review_state; normalized_reason text;
begin
  perform private.assert_verification_reviewer();
  select * into delivery_row from public.final_delivery_versions where public_id=trim(coalesce(requested_delivery_public_id,''));
  if delivery_row.id is null then raise exception 'final_delivery_not_found' using errcode='22023'; end if;
  select * into review_row from public.delivery_review_cases where delivery_version_id=delivery_row.id for update;
  begin next_decision:=lower(trim(coalesce(requested_decision,'')))::public.delivery_review_decision;
  exception when others then raise exception 'invalid_delivery_review_decision' using errcode='22023'; end;
  normalized_reason:=private.delivery_review_reason(requested_reason,2000);
  if next_decision='approve' then
    if not exists(select 1 from public.final_delivery_processing where delivery_version_id=delivery_row.id and state='ready')
       or exists(select 1 from public.final_cut_approvals where delivery_version_id=delivery_row.id and state<>'approved')
       or exists(select 1 from public.delivery_review_checklist_items where review_case_id=review_row.id and required and state<>'pass') then
      raise exception 'delivery_review_blocked' using errcode='42501';
    end if;
    next_state:='approved';
  elsif next_decision='reject' then next_state:='rejected';
  elsif next_decision='request_changes' then next_state:='changes_requested';
  elsif next_decision='escalate' then next_state:='escalated';
  else next_state:='held';
  end if;
  insert into public.delivery_review_decisions(review_case_id,decision,reason,reviewer_user_id) values(review_row.id,next_decision,normalized_reason,auth.uid());
  update public.delivery_review_cases set state=next_state,updated_at=now() where id=review_row.id;
  perform private.write_audit(auth.uid(),'delivery_review_decided','success','delivery-review',private.current_active_role(auth.uid()),jsonb_build_object('deliveryPublicId',delivery_row.public_id,'decision',next_decision,'state',next_state,'reason',normalized_reason));
  return jsonb_build_object('deliveryPublicId',delivery_row.public_id,'status',next_state,'releaseReady',private.delivery_is_release_ready(delivery_row.id));
end;
$$;

create or replace function public.respond_to_delivery_review(
  requested_delivery_public_id text,
  requested_body text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare delivery_row public.final_delivery_versions%rowtype; project_row public.projects%rowtype; review_row public.delivery_review_cases%rowtype; normalized_body text;
begin
  perform private.assert_current_session();
  select delivery.* into delivery_row
  from public.final_delivery_versions delivery
  where delivery.public_id=trim(coalesce(requested_delivery_public_id,''));
  if delivery_row.id is not null then
    select project.* into project_row
    from public.projects project
    where project.id=delivery_row.project_id and project.owner_user_id=auth.uid();
  end if;
  if delivery_row.id is null or project_row.id is null then raise exception 'delivery_review_creator_required' using errcode='42501'; end if;
  select * into review_row from public.delivery_review_cases where delivery_version_id=delivery_row.id;
  normalized_body:=private.delivery_review_reason(requested_body,2000);
  insert into public.delivery_creator_responses(review_case_id,body,creator_user_id) values(review_row.id,normalized_body,auth.uid());
  perform private.write_audit(auth.uid(),'delivery_review_creator_responded','success','delivery-review','creator',jsonb_build_object('deliveryPublicId',delivery_row.public_id));
  return jsonb_build_object('deliveryPublicId',delivery_row.public_id,'recorded',true);
end;
$$;

create or replace function public.get_delivery_review_context(requested_project_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare
  project_row public.projects%rowtype;
  project_version_row public.project_versions%rowtype;
  lock_row public.contract_lock_receipts%rowtype;
  term_row public.project_term_versions%rowtype;
  delivery_row public.final_delivery_versions%rowtype;
  processing_row public.final_delivery_processing%rowtype;
  review_row public.delivery_review_cases%rowtype;
  participant_evidence jsonb:='[]'::jsonb;
begin
  perform private.assert_current_session();
  select * into project_row from public.projects where public_id=trim(coalesce(requested_project_public_id,''));
  if project_row.id is null then return null; end if;
  if not private.user_has_project_production_access(project_row.id,auth.uid()) and not private.is_verification_reviewer(auth.uid()) then
    raise exception 'delivery_review_access_denied' using errcode='42501';
  end if;
  select * into project_version_row from public.project_versions where project_id=project_row.id and revision=project_row.current_revision;
  select * into lock_row from public.contract_lock_receipts where project_id=project_row.id;
  if lock_row.id is not null then select * into term_row from public.project_term_versions where id=lock_row.term_version_id; end if;
  select * into delivery_row from public.final_delivery_versions where project_id=project_row.id order by version desc limit 1;
  if delivery_row.id is not null then
    select * into processing_row from public.final_delivery_processing where delivery_version_id=delivery_row.id;
    select * into review_row from public.delivery_review_cases where delivery_version_id=delivery_row.id;
  end if;
  if term_row.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'handle',lower(participant.value->>'handle'),
      'role',lower(participant.value->>'role'),
      'depicted',coalesce((participant.value->>'depicted')::boolean,false),
      'accepted',profile.user_id is not null and exists(
        select 1 from public.participant_acceptances acceptance
        where acceptance.term_version_id=term_row.id and acceptance.participant_user_id=profile.user_id
          and acceptance.superseded_at is null and acceptance.accepted_hash=term_row.terms_hash),
      'consentRecorded',case when coalesce((participant.value->>'depicted')::boolean,false) then
        profile.user_id is not null and exists(
          select 1 from public.depicted_person_consents consent
          where consent.term_version_id=term_row.id and consent.performer_user_id=profile.user_id
            and consent.superseded_at is null and consent.consented_hash=term_row.terms_hash)
        else null end
    ) order by lower(participant.value->>'handle')),'[]'::jsonb)
    into participant_evidence
    from jsonb_array_elements(term_row.terms->'participants') participant(value)
    left join public.profiles profile on profile.handle=lower(participant.value->>'handle');
  end if;
  return jsonb_build_object(
    'project',jsonb_build_object('publicId',project_row.public_id,'title',project_version_row.title,'state',project_row.state),
    'contract',case when term_row.id is null then null else jsonb_build_object(
      'version',term_row.version,'termsHash',term_row.terms_hash,'body',term_row.terms,'participants',participant_evidence) end,
    'current',case when delivery_row.id is null then null else jsonb_build_object(
      'publicId',delivery_row.public_id,
      'version',delivery_row.version,
      'assetPublicId',(select asset.public_id from public.production_assets asset where asset.id=delivery_row.production_asset_id),
      'sha256',delivery_row.sha256,
      'processingState',processing_row.state,
      'processingNote',processing_row.note,
      'status',review_row.state,
      'releaseReady',private.delivery_is_release_ready(delivery_row.id),
      'submittedAt',delivery_row.created_at,
      'finalCutApprovals',coalesce((
        select jsonb_agg(jsonb_build_object(
          'handle',profile.handle,'state',approval.state,'note',approval.note,'respondedAt',approval.responded_at
        ) order by profile.handle)
        from public.final_cut_approvals approval
        join public.profiles profile on profile.user_id=approval.performer_user_id
        where approval.delivery_version_id=delivery_row.id
      ),'[]'::jsonb),
      'checklist',coalesce((
        select jsonb_agg(jsonb_build_object(
          'key',item.item_key,'label',item.label,'required',item.required,'state',item.state,'note',item.note,'checkedAt',item.checked_at
        ) order by item.item_key)
        from public.delivery_review_checklist_items item where item.review_case_id=review_row.id
      ),'[]'::jsonb)
    ) end,
    'deliveries',coalesce((
      select jsonb_agg(jsonb_build_object(
        'publicId',delivery.public_id,'version',delivery.version,'sha256',delivery.sha256,
        'processingState',processing.state,'status',review_case.state,
        'releaseReady',private.delivery_is_release_ready(delivery.id),'submittedAt',delivery.created_at
      ) order by delivery.version desc)
      from public.final_delivery_versions delivery
      join public.final_delivery_processing processing on processing.delivery_version_id=delivery.id
      join public.delivery_review_cases review_case on review_case.delivery_version_id=delivery.id
      where delivery.project_id=project_row.id
    ),'[]'::jsonb),
    'reviewHistory',coalesce((
      select jsonb_agg(jsonb_build_object(
        'deliveryPublicId',delivery.public_id,'version',delivery.version,'decision',decision.decision,
        'reason',decision.reason,'reviewerHandle',reviewer.handle,'createdAt',decision.created_at
      ) order by decision.created_at desc)
      from public.delivery_review_decisions decision
      join public.delivery_review_cases review_case on review_case.id=decision.review_case_id
      join public.final_delivery_versions delivery on delivery.id=review_case.delivery_version_id
      left join public.profiles reviewer on reviewer.user_id=decision.reviewer_user_id
      where delivery.project_id=project_row.id
    ),'[]'::jsonb),
    'creatorResponses',coalesce((
      select jsonb_agg(jsonb_build_object(
        'deliveryPublicId',delivery.public_id,'version',delivery.version,'body',response.body,'createdAt',response.created_at
      ) order by response.created_at desc)
      from public.delivery_creator_responses response
      join public.delivery_review_cases review_case on review_case.id=response.review_case_id
      join public.final_delivery_versions delivery on delivery.id=review_case.delivery_version_id
      where delivery.project_id=project_row.id
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.get_final_cut_review_context(requested_delivery_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare
  delivery_row public.final_delivery_versions%rowtype;
  approval_row public.final_cut_approvals%rowtype;
  project_row public.projects%rowtype;
  project_version_row public.project_versions%rowtype;
  term_row public.project_term_versions%rowtype;
  processing_row public.final_delivery_processing%rowtype;
  review_row public.delivery_review_cases%rowtype;
begin
  perform private.assert_current_session();
  select * into delivery_row from public.final_delivery_versions where public_id=trim(coalesce(requested_delivery_public_id,''));
  if delivery_row.id is null then return null; end if;
  select * into approval_row from public.final_cut_approvals where delivery_version_id=delivery_row.id and performer_user_id=auth.uid();
  if approval_row.delivery_version_id is null then raise exception 'final_cut_approval_denied' using errcode='42501'; end if;
  select * into project_row from public.projects where id=delivery_row.project_id;
  select * into project_version_row from public.project_versions where project_id=project_row.id and revision=project_row.current_revision;
  select * into term_row from public.project_term_versions where id=delivery_row.contract_term_version_id;
  select * into processing_row from public.final_delivery_processing where delivery_version_id=delivery_row.id;
  select * into review_row from public.delivery_review_cases where delivery_version_id=delivery_row.id;
  return jsonb_build_object(
    'projectPublicId',project_row.public_id,
    'projectTitle',project_version_row.title,
    'delivery',jsonb_build_object(
      'publicId',delivery_row.public_id,'version',delivery_row.version,'sha256',delivery_row.sha256,
      'processingState',processing_row.state,'reviewStatus',review_row.state,'submittedAt',delivery_row.created_at),
    'contract',jsonb_build_object('termsHash',term_row.terms_hash,'finalCutApprovalRequired',coalesce((term_row.terms->>'finalCutApprovalRequired')::boolean,false)),
    'approval',jsonb_build_object('state',approval_row.state,'note',approval_row.note,'respondedAt',approval_row.responded_at)
  );
end;
$$;

create or replace function public.list_delivery_review_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
begin
  perform private.assert_verification_reviewer();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'projectPublicId',project.public_id,
      'title',version.title,
      'deliveryPublicId',delivery.public_id,
      'version',delivery.version,
      'sha256',delivery.sha256,
      'processingState',processing.state,
      'status',review_case.state,
      'releaseReady',private.delivery_is_release_ready(delivery.id),
      'finalCutBlockers',(select count(*) from public.final_cut_approvals approval where approval.delivery_version_id=delivery.id and approval.state<>'approved'),
      'checklistBlockers',(select count(*) from public.delivery_review_checklist_items item where item.review_case_id=review_case.id and item.required and item.state<>'pass'),
      'submittedAt',delivery.created_at
    ) order by delivery.created_at asc)
    from public.projects project
    join public.project_versions version on version.project_id=project.id and version.revision=project.current_revision
    join lateral (
      select candidate.* from public.final_delivery_versions candidate
      where candidate.project_id=project.id order by candidate.version desc limit 1
    ) delivery on true
    join public.final_delivery_processing processing on processing.delivery_version_id=delivery.id
    join public.delivery_review_cases review_case on review_case.delivery_version_id=delivery.id
    where review_case.state<>'approved'
  ),'[]'::jsonb);
end;
$$;

create or replace function public.issue_final_delivery_asset_access(requested_delivery_public_id text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare delivery_row public.final_delivery_versions%rowtype; asset_row public.production_assets%rowtype; raw_token text; token_hash_value text; expiry timestamptz:=now()+interval '5 minutes';
begin
  perform private.assert_current_session();
  select * into delivery_row from public.final_delivery_versions where public_id=trim(coalesce(requested_delivery_public_id,''));
  if delivery_row.id is null then raise exception 'final_delivery_asset_access_denied' using errcode='42501'; end if;
  select * into asset_row from public.production_assets where id=delivery_row.production_asset_id;
  if asset_row.id is null or not private.user_can_access_delivery_asset(asset_row.id,auth.uid()) then raise exception 'final_delivery_asset_access_denied' using errcode='42501'; end if;
  raw_token:=encode(extensions.gen_random_bytes(32),'hex');
  token_hash_value:=encode(extensions.digest(convert_to(raw_token,'UTF8'),'sha256'),'hex');
  insert into public.production_asset_access_tokens(asset_id,actor_user_id,token_hash,expires_at) values(asset_row.id,auth.uid(),token_hash_value,expiry);
  perform private.write_audit(auth.uid(),'final_delivery_asset_access_issued','success','delivery-review',private.current_active_role(auth.uid()),jsonb_build_object('deliveryPublicId',delivery_row.public_id,'assetPublicId',asset_row.public_id,'expiresAt',expiry));
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
  if asset_row.id is null or not private.user_can_access_delivery_asset(asset_row.id,auth.uid()) then return null; end if;
  update public.production_asset_access_tokens set last_accessed_at=now() where id=token_row.id;
  perform private.write_audit(auth.uid(),'production_asset_accessed','success','production-asset',private.current_active_role(auth.uid()),jsonb_build_object('assetPublicId',asset_row.public_id));
  return asset_row.object_path;
end;
$$;

revoke all on function private.reject_delivery_history_mutation() from public,anon,authenticated;
revoke all on function private.delivery_review_reason(text,integer) from public,anon,authenticated;
revoke all on function private.delivery_has_personal_final_cut_access(uuid,uuid) from public,anon,authenticated;
revoke all on function private.user_can_access_delivery_asset(uuid,uuid) from public,anon,authenticated;
revoke all on function private.delivery_is_release_ready(uuid) from public,anon,authenticated;
revoke all on function public.submit_final_delivery(text,text,text) from public,anon,authenticated;
revoke all on function public.set_final_delivery_processing(text,text,text) from public,anon,authenticated;
revoke all on function public.record_final_cut_approval(text,text,text) from public,anon,authenticated;
revoke all on function public.set_delivery_review_check(text,text,text,text) from public,anon,authenticated;
revoke all on function public.decide_delivery_review(text,text,text) from public,anon,authenticated;
revoke all on function public.respond_to_delivery_review(text,text) from public,anon,authenticated;
revoke all on function public.get_delivery_review_context(text) from public,anon,authenticated;
revoke all on function public.get_final_cut_review_context(text) from public,anon,authenticated;
revoke all on function public.list_delivery_review_queue() from public,anon,authenticated;
revoke all on function public.issue_final_delivery_asset_access(text) from public,anon,authenticated;
revoke all on function public.resolve_production_asset_access(text) from public,anon,authenticated;

grant execute on function public.submit_final_delivery(text,text,text) to authenticated;
grant execute on function public.set_final_delivery_processing(text,text,text) to authenticated,service_role;
grant execute on function public.record_final_cut_approval(text,text,text) to authenticated;
grant execute on function public.set_delivery_review_check(text,text,text,text) to authenticated;
grant execute on function public.decide_delivery_review(text,text,text) to authenticated;
grant execute on function public.respond_to_delivery_review(text,text) to authenticated;
grant execute on function public.get_delivery_review_context(text) to authenticated;
grant execute on function public.get_final_cut_review_context(text) to authenticated;
grant execute on function public.list_delivery_review_queue() to authenticated;
grant execute on function public.issue_final_delivery_asset_access(text) to authenticated;
grant execute on function public.resolve_production_asset_access(text) to authenticated;
