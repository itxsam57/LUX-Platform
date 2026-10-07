-- Complete the immutable contract term shape. New fields are normalized into the
-- hashed JSON body so personal acceptance binds them exactly. Legacy callers receive
-- conservative explicit defaults rather than silently omitting legal dimensions.

create or replace function private.validate_project_terms(candidate jsonb)
returns jsonb
language plpgsql
immutable
set search_path=pg_catalog,public
as $$
declare
  participant jsonb;
  split_item jsonb;
  normalized_script_hash text:=lower(trim(coalesce(candidate->>'scriptHash',repeat('0',64))));
  normalized_territory text:=trim(coalesce(nullif(candidate->>'territory',''),'Platform distribution territories only'));
  normalized_duration text:=trim(coalesce(nullif(candidate->>'duration',''),'For the duration of the project and release rights stated here'));
  normalized_withdrawal text:=trim(coalesce(nullif(candidate->>'withdrawal',''),'Before contract lock, participation may be withdrawn. After lock, withdrawal follows the cancellation and dispute terms.'));
  normalized_dispute text:=trim(coalesce(nullif(candidate->>'disputeResolution',''),'Use the LUX dispute process first; legal rights and mandatory jurisdiction rules remain unaffected.'));
  normalized_splits jsonb:=candidate->'revenueSplits';
  participant_handles text[];
  split_total integer:=0;
begin
  if candidate is null or jsonb_typeof(candidate)<>'object' or octet_length(candidate::text)>30000 then
    raise exception 'invalid_project_terms' using errcode='22023';
  end if;

  if jsonb_typeof(candidate->'participants')<>'array'
     or jsonb_array_length(candidate->'participants')<1
     or jsonb_array_length(candidate->'participants')>50 then
    raise exception 'invalid_project_participants' using errcode='22023';
  end if;

  participant_handles:='{}'::text[];
  for participant in select value from jsonb_array_elements(candidate->'participants') item(value) loop
    if jsonb_typeof(participant)<>'object'
       or lower(trim(coalesce(participant->>'handle',''))) !~ '^[a-z0-9_]{3,30}$'
       or lower(trim(coalesce(participant->>'role',''))) !~ '^[a-z0-9][a-z0-9 _-]{1,63}$'
       or jsonb_typeof(participant->'depicted') is distinct from 'boolean' then
      raise exception 'invalid_project_participant' using errcode='22023';
    end if;
    participant_handles:=array_append(participant_handles,lower(trim(participant->>'handle')));
  end loop;

  if jsonb_typeof(candidate->'boundaries')<>'array'
     or jsonb_typeof(candidate->'collaborators')<>'array'
     or char_length(trim(coalesce(candidate->>'compensation',''))) not between 3 and 240
     or char_length(trim(coalesce(candidate->>'distributionScope',''))) not between 3 and 240
     or char_length(trim(coalesce(candidate->>'rightsScope',''))) not between 3 and 240
     or char_length(trim(coalesce(candidate->>'schedule',''))) not between 3 and 240
     or char_length(trim(coalesce(candidate->>'cancellation',''))) not between 3 and 500
     or jsonb_typeof(candidate->'finalCutApprovalRequired') is distinct from 'boolean' then
    raise exception 'invalid_project_terms' using errcode='22023';
  end if;

  if normalized_script_hash !~ '^[0-9a-f]{64}$'
     or char_length(normalized_territory) not between 3 and 500
     or normalized_territory ~ '[[:cntrl:]]'
     or char_length(normalized_duration) not between 3 and 500
     or normalized_duration ~ '[[:cntrl:]]'
     or char_length(normalized_withdrawal) not between 20 and 2000
     or normalized_withdrawal ~ '[[:cntrl:]]'
     or char_length(normalized_dispute) not between 20 and 2000
     or normalized_dispute ~ '[[:cntrl:]]' then
    raise exception 'invalid_project_legal_terms' using errcode='22023';
  end if;

  if normalized_splits is null then
    normalized_splits:=jsonb_build_array(jsonb_build_object(
      'handle',participant_handles[1],
      'basisPoints',10000
    ));
  end if;

  if jsonb_typeof(normalized_splits)<>'array'
     or jsonb_array_length(normalized_splits)<1
     or jsonb_array_length(normalized_splits)>50 then
    raise exception 'invalid_project_revenue_splits' using errcode='22023';
  end if;

  for split_item in select value from jsonb_array_elements(normalized_splits) item(value) loop
    if jsonb_typeof(split_item)<>'object'
       or lower(trim(coalesce(split_item->>'handle',''))) !~ '^[a-z0-9_]{3,30}$'
       or not (lower(trim(split_item->>'handle'))=any(participant_handles))
       or jsonb_typeof(split_item->'basisPoints') is distinct from 'number'
       or (split_item->>'basisPoints') !~ '^[0-9]+$'
       or (split_item->>'basisPoints')::integer<0
       or (split_item->>'basisPoints')::integer>10000 then
      raise exception 'invalid_project_revenue_splits' using errcode='22023';
    end if;
    split_total:=split_total+(split_item->>'basisPoints')::integer;
  end loop;

  if split_total<>10000 then
    raise exception 'invalid_project_revenue_splits' using errcode='22023';
  end if;

  return candidate || jsonb_build_object(
    'scriptHash',normalized_script_hash,
    'territory',normalized_territory,
    'duration',normalized_duration,
    'withdrawal',normalized_withdrawal,
    'disputeResolution',normalized_dispute,
    'revenueSplits',normalized_splits
  );
end;
$$;

create or replace function private.notify_contract_term_event()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  project_row public.projects%rowtype;
  participant jsonb;
  participant_user_id uuid;
begin
  select * into project_row from public.projects where id=new.project_id;
  if project_row.id is null then return new; end if;

  for participant in select value from jsonb_array_elements(new.terms->'participants') item(value) loop
    select profile.user_id into participant_user_id
    from public.profiles profile
    where profile.handle=lower(trim(participant->>'handle'))
    limit 1;

    if participant_user_id is not null then
      perform private.emit_notification(
        participant_user_id,
        new.created_by_user_id,
        'contract_action'::public.notification_type,
        '/studio/projects/'||project_row.public_id||'/terms'
      );
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists project_terms_notification on public.project_term_versions;
create trigger project_terms_notification
after insert on public.project_term_versions
for each row execute function private.notify_contract_term_event();

revoke all on function private.notify_contract_term_event() from public,anon,authenticated;

notify pgrst,'reload schema';
