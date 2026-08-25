create or replace function public.get_verification_review_queue()
returns table (
  user_id uuid,
  handle text,
  level public.verification_level,
  status public.verification_status,
  latest_session_id uuid,
  latest_session_status public.verification_status,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  perform private.assert_verification_reviewer();

  return query
  select
    subject.user_id,
    profile.handle,
    subject.level,
    subject.status,
    latest_session.id,
    latest_session.status,
    subject.updated_at
  from public.verification_subjects subject
  join public.profiles profile
    on profile.user_id = subject.user_id
  left join lateral (
    select session.id, session.status
    from public.verification_sessions session
    where session.user_id = subject.user_id
      and session.target_level = subject.level
    order by session.created_at desc
    limit 1
  ) latest_session on true
  order by subject.updated_at asc, profile.handle asc, subject.level asc;
end;
$$;

revoke all on function public.get_verification_review_queue() from public, anon;
grant execute on function public.get_verification_review_queue() to authenticated;

notify pgrst, 'reload schema';
