alter table public.account_security_state
  add column if not exists sessions_revoked_before timestamptz;

create or replace function private.session_is_current(subject_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
  select case
    when subject_user_id is null then false
    when security.sessions_revoked_before is null then
      case
        when security.sessions_revoked_before_epoch is null then true
        else private.jwt_issued_at_epoch() > security.sessions_revoked_before_epoch
      end
    else coalesce(
      (
        select session_row.created_at > security.sessions_revoked_before
        from auth.sessions session_row
        where session_row.id = private.jwt_session_id()
          and session_row.user_id = subject_user_id
        limit 1
      ),
      to_timestamp(private.jwt_issued_at_epoch()) > security.sessions_revoked_before
    )
  end
  from public.account_security_state security
  where security.user_id = subject_user_id;
$$;

create or replace function public.revoke_all_app_sessions()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  revoked_at timestamptz := clock_timestamp();
  revoked_epoch bigint := floor(extract(epoch from revoked_at))::bigint;
begin
  perform private.assert_current_session();

  update public.account_security_state
  set sessions_revoked_before = revoked_at,
      sessions_revoked_before_epoch = revoked_epoch,
      updated_at = revoked_at
  where user_id = auth.uid();

  perform private.write_audit(auth.uid(), 'logout_all_devices', 'success', 'auth');
  return revoked_epoch;
end;
$$;

revoke all on function public.revoke_all_app_sessions() from public, anon;
grant execute on function public.revoke_all_app_sessions() to authenticated;

notify pgrst, 'reload schema';
