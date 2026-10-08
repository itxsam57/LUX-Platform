-- Service-role-only provisioning boundary for restricted staff roles.
-- Keeps workspace membership tables private while supporting controlled bootstrap/ops tooling.

create or replace function public.provision_staff_role(
  target_user_id uuid,
  requested_role public.app_role
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare membership_id uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'staff_provisioning_not_allowed' using errcode='42501';
  end if;

  if target_user_id is null
     or requested_role not in ('reviewer','moderator','finance','copyright','support') then
    raise exception 'invalid_staff_provisioning_request' using errcode='22023';
  end if;

  if not exists(select 1 from auth.users where id=target_user_id) then
    raise exception 'staff_target_not_found' using errcode='22023';
  end if;

  insert into public.workspace_memberships(
    user_id,role,status,reviewed_at,reviewed_by,updated_at
  ) values (
    target_user_id,requested_role,'approved',now(),null,now()
  )
  on conflict(user_id,role) do update
  set status='approved',
      reviewed_at=now(),
      reviewed_by=null,
      updated_at=now()
  returning id into membership_id;

  perform private.write_audit(
    null,'staff_role_provisioned','success','staff-provisioning',
    requested_role,
    jsonb_build_object('targetUserId',target_user_id,'membershipId',membership_id)
  );

  return membership_id;
end;
$$;

revoke all on function public.provision_staff_role(uuid,public.app_role) from public,anon,authenticated;
grant execute on function public.provision_staff_role(uuid,public.app_role) to service_role;

notify pgrst,'reload schema';
