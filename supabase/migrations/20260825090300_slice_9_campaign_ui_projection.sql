create or replace function public.get_campaign_editor_context(requested_project_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  project_row public.projects%rowtype;
  campaign_row public.campaigns%rowtype;
  version_row public.campaign_term_versions%rowtype;
begin
  perform private.assert_adult_profile_action();

  select project.* into project_row
  from public.projects project
  where project.public_id = trim(coalesce(requested_project_public_id,''));

  if project_row.id is null
     or project_row.owner_user_id <> auth.uid()
     or private.current_active_role(auth.uid()) is distinct from 'creator'::public.app_role then
    raise exception 'campaign_read_not_allowed' using errcode = '42501';
  end if;

  select campaign.* into campaign_row
  from public.campaigns campaign
  where campaign.project_id = project_row.id;

  if campaign_row.id is null then
    return jsonb_build_object(
      'projectPublicId', project_row.public_id,
      'projectState', project_row.state,
      'campaignPublicId', null,
      'campaignState', null,
      'termsVersion', null,
      'termsHash', null,
      'terms', null
    );
  end if;

  if campaign_row.current_terms_version is not null then
    select version.* into version_row
    from public.campaign_term_versions version
    where version.campaign_id = campaign_row.id
      and version.version = campaign_row.current_terms_version;
  end if;

  return jsonb_build_object(
    'projectPublicId', project_row.public_id,
    'projectState', project_row.state,
    'campaignPublicId', campaign_row.public_id,
    'campaignState', campaign_row.state,
    'termsVersion', campaign_row.current_terms_version,
    'termsHash', version_row.terms_hash,
    'terms', version_row.body
  );
end;
$$;

revoke all on function public.get_campaign_editor_context(text) from public, anon, authenticated;
grant execute on function public.get_campaign_editor_context(text) to authenticated;

comment on function public.get_campaign_editor_context(text) is
  'Owner-only Slice 9 campaign editor projection. Returns no internal UUIDs, supporter identities, legal evidence, or private project brief.';

notify pgrst, 'reload schema';
