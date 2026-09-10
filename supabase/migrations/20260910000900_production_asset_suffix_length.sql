-- Preserve the bookmark1 regex fix; bound the complete project-relative suffix.
create or replace function public.register_production_asset(
  requested_project_public_id text,
  requested_kind text,
  requested_object_path text,
  requested_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions
as $$
declare project_row_id uuid; candidate text; asset_kind public.production_asset_kind; normalized_path text:=trim(coalesce(requested_object_path,'')); normalized_sha text:=lower(trim(coalesce(requested_sha256,'')));
begin
  project_row_id:=private.require_production_owner(requested_project_public_id);
  begin asset_kind:=lower(trim(requested_kind))::public.production_asset_kind;
  exception when others then raise exception 'invalid_production_asset_kind' using errcode='22023'; end;
  if normalized_path !~ ('^'||trim(requested_project_public_id)||'/[A-Za-z0-9._/-]+$')
     or length(normalized_path) - length(trim(requested_project_public_id)) - 1 < 8
     or length(normalized_path) - length(trim(requested_project_public_id)) - 1 > 420
     or normalized_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_production_asset' using errcode='22023';
  end if;
  loop candidate:='ast'||encode(extensions.gen_random_bytes(12),'hex'); exit when not exists(select 1 from public.production_assets where public_id=candidate); end loop;
  insert into public.production_assets(public_id,project_id,kind,object_path,sha256,created_by_user_id)
  values(candidate,project_row_id,asset_kind,normalized_path,normalized_sha,auth.uid());
  perform private.write_audit(auth.uid(),'production_asset_registered','success','production-asset','creator',jsonb_build_object('projectPublicId',trim(requested_project_public_id),'assetPublicId',candidate,'kind',asset_kind,'sha256',normalized_sha));
  return jsonb_build_object('publicId',candidate,'kind',asset_kind,'sha256',normalized_sha);
end;
$$;
