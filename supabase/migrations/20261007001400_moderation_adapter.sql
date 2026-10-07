-- Persist normalized public-content moderation results without storing submitted text.

create table public.content_screening_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  subject_kind text not null check (subject_kind in ('demand','offer')),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  provider_key text not null check (provider_key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  provider_reference text,
  decision text not null check (decision in ('allow','review','block')),
  labels text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  constraint content_screen_provider_reference check (
    provider_reference is null
    or (char_length(provider_reference) between 3 and 255 and provider_reference !~ '[[:cntrl:]]')
  ),
  constraint content_screen_labels_count check (cardinality(labels) between 0 and 32),
  unique(user_id,subject_kind,content_hash,provider_key)
);

create index content_screening_user_created_idx on public.content_screening_receipts(user_id,created_at desc);

alter table public.content_screening_receipts enable row level security;
revoke all on public.content_screening_receipts from public,anon,authenticated;

create trigger content_screening_receipts_immutable
before update or delete on public.content_screening_receipts
for each row execute function private.reject_admin_history_mutation();

create or replace function public.record_content_screening_receipt(
  requested_subject_kind text,
  requested_content_hash text,
  requested_provider_key text,
  requested_provider_reference text,
  requested_decision text,
  requested_labels text[]
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare
  subject_value text:=lower(trim(coalesce(requested_subject_kind,'')));
  hash_value text:=lower(trim(coalesce(requested_content_hash,'')));
  provider_value text:=lower(trim(coalesce(requested_provider_key,'')));
  reference_value text:=nullif(trim(coalesce(requested_provider_reference,'')),'');
  decision_value text:=lower(trim(coalesce(requested_decision,'')));
  labels_value text[]:=coalesce(requested_labels,'{}'::text[]);
  row_value public.content_screening_receipts%rowtype;
begin
  perform private.assert_adult_profile_action();

  if subject_value not in ('demand','offer')
     or hash_value !~ '^[0-9a-f]{64}$'
     or provider_value !~ '^[a-z0-9][a-z0-9_-]{1,63}$'
     or decision_value not in ('allow','review','block')
     or cardinality(labels_value)>32
     or exists(select 1 from unnest(labels_value) label where label !~ '^[a-z0-9][a-z0-9_-]{1,63}$')
     or (reference_value is not null and (char_length(reference_value) not between 3 and 255 or reference_value ~ '[[:cntrl:]]')) then
    raise exception 'invalid_content_screening_receipt' using errcode='22023';
  end if;

  select * into row_value
  from public.content_screening_receipts receipt
  where receipt.user_id=auth.uid()
    and receipt.subject_kind=subject_value
    and receipt.content_hash=hash_value
    and receipt.provider_key=provider_value;

  if row_value.id is not null then
    if row_value.provider_reference is distinct from reference_value
       or row_value.decision<>decision_value
       or row_value.labels<>labels_value then
      raise exception 'content_screening_receipt_conflict' using errcode='40001';
    end if;
  else
    insert into public.content_screening_receipts(
      user_id,subject_kind,content_hash,provider_key,provider_reference,decision,labels
    ) values(
      auth.uid(),subject_value,hash_value,provider_value,reference_value,decision_value,labels_value
    ) returning * into row_value;
  end if;

  perform private.write_audit(
    auth.uid(),'content_screening_recorded','success','content-screening',
    private.current_active_role(auth.uid()),
    jsonb_build_object(
      'subjectKind',subject_value,'contentHash',hash_value,'providerKey',provider_value,
      'decision',decision_value,'labels',labels_value
    )
  );

  return jsonb_build_object(
    'decision',row_value.decision,'providerKey',row_value.provider_key,
    'labels',to_jsonb(row_value.labels),'createdAt',row_value.created_at
  );
end;
$$;

revoke all on function public.record_content_screening_receipt(text,text,text,text,text,text[]) from public,anon,authenticated;
grant execute on function public.record_content_screening_receipt(text,text,text,text,text,text[]) to authenticated;

notify pgrst,'reload schema';
