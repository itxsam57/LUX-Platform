-- SQL column names take precedence over same-named parameters. Bind each subject explicitly.
create or replace function private.active_agency_representation(
  agency_owner_user_id uuid,
  performer_user_id uuid,
  requested_capability text default null
)
returns public.agency_representation_agreements
language sql
stable
security definer
set search_path=pg_catalog,public,private
as $$
  select agreement.*
  from public.agency_representation_agreements agreement
  join public.agency_profiles agency on agency.id=agreement.agency_id
  where agency.owner_user_id=$1
    and agency.verification_status='approved'
    and agreement.performer_user_id=$2
    and (
      agreement.status='accepted'
      or (agreement.status='revocation_pending' and agreement.revocation_effective_at>now())
    )
    and case $3
      when 'communications' then agreement.scope_communications
      when 'opportunities' then agreement.scope_opportunities
      when 'negotiations' then agreement.scope_negotiations
      when 'project_admin' then agreement.scope_project_admin
      when 'contract_admin' then agreement.scope_contract_admin
      when 'earnings' then agreement.scope_earnings
      else true
    end
  order by agreement.accepted_at desc
  limit 1;
$$;
