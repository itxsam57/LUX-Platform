-- Storage policies must not require callers to read private project tables.
-- Match the profile-media boundary: resolve authorization inside a scoped helper.
create function private.can_access_production_object(object_name text, owner_only boolean)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, private, auth, storage
as $$
  select exists (
    select 1 from public.projects project
    where project.public_id = (storage.foldername(object_name))[1]
      and case when owner_only then project.owner_user_id = auth.uid()
        else private.user_has_project_production_access(project.id, auth.uid()) end
  );
$$;
revoke all on function private.can_access_production_object(text,boolean) from public, anon, authenticated;
grant execute on function private.can_access_production_object(text,boolean) to authenticated;

alter policy production_assets_insert_owner on storage.objects
with check (bucket_id = 'production-assets' and private.can_access_production_object(name, true));
alter policy production_assets_read_member on storage.objects
using (bucket_id = 'production-assets' and private.can_access_production_object(name, false));
alter policy production_assets_delete_owner on storage.objects
using (bucket_id = 'production-assets' and private.can_access_production_object(name, true));
