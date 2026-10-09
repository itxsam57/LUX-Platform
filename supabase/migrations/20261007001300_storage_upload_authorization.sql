-- Storage-provider-independent production upload authorization.
-- The browser receives only a short-lived provider upload session after this owner check.

create or replace function public.authorize_production_asset_upload(requested_project_public_id text)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
begin
  perform private.require_production_owner(trim(coalesce(requested_project_public_id,'')));
  perform private.write_audit(
    auth.uid(),'production_asset_upload_authorized','success','production-asset-upload',
    private.current_active_role(auth.uid()),
    jsonb_build_object('projectPublicId',trim(coalesce(requested_project_public_id,'')))
  );
  return true;
end;
$$;

revoke all on function public.authorize_production_asset_upload(text) from public,anon,authenticated;
grant execute on function public.authorize_production_asset_upload(text) to authenticated;

notify pgrst,'reload schema';
