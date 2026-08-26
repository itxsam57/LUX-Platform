begin;

create extension if not exists pgtap with schema extensions;
select plan(19);

select has_table('public', 'projects', 'Slice 7 stores creator-owned projects');
select has_table('public', 'project_versions', 'Slice 7 stores immutable project revisions');
select has_table('public', 'project_participant_requirements', 'Slice 7 stores version-bound participant requirements');
select has_function('public', 'create_project_draft', array['jsonb'], 'creator can create a project draft through an RPC');
select has_function('public', 'update_project_draft', array['text','integer','jsonb'], 'project updates require an expected revision');
select has_function('public', 'convert_demand_to_project', array['text','jsonb'], 'eligible creator can atomically convert a demand');
select has_function('public', 'get_project_private', array['text'], 'private project read model exists');

select ok(
  coalesce(has_table_privilege('authenticated', 'public.projects', 'INSERT'), false) = false,
  'authenticated clients cannot directly insert project rows'
);
select ok(
  coalesce(has_table_privilege('authenticated', 'public.project_versions', 'UPDATE'), false) = false,
  'authenticated clients cannot mutate immutable project versions directly'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000091',
  'authenticated', 'authenticated', 'slice7-fan@lux.test', crypt('LuxTestPassword1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
),
(
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000092',
  'authenticated', 'authenticated', 'slice7-creator@lux.test', crypt('LuxTestPassword1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

update public.profiles
set handle = case user_id
  when '10000000-0000-0000-0000-000000000091' then 'slice7_fan'
  else 'slice7_creator'
end,
display_name = case user_id
  when '10000000-0000-0000-0000-000000000091' then 'Slice 7 Fan'
  else 'Slice 7 Creator'
end,
visibility = 'public'
where user_id in ('10000000-0000-0000-0000-000000000091','10000000-0000-0000-0000-000000000092');

insert into public.age_assurance_records(user_id, method, status, jurisdiction_code, policy_version, expires_at)
select id, 'self_attestation', 'accepted', 'PK', 'slice-7-project-test', now() + interval '1 year'
from auth.users
where id in ('10000000-0000-0000-0000-000000000091','10000000-0000-0000-0000-000000000092');

insert into public.workspace_memberships(user_id, role, status, reviewed_at, reviewed_by)
values ('10000000-0000-0000-0000-000000000092','creator','approved',now(),'10000000-0000-0000-0000-000000000092');

update public.active_workspaces active
set membership_id = membership.id, updated_at = now()
from public.workspace_memberships membership
where active.user_id = '10000000-0000-0000-0000-000000000092'
  and membership.user_id = active.user_id
  and membership.role = 'creator'
  and membership.status = 'approved';

insert into public.demands (
  public_id, author_user_id, title, brief, category, format,
  suggested_creator_user_id, state, created_at, updated_at
) values (
  'demaaaaaaaaaaaaaaaaaaaaaaaa',
  '10000000-0000-0000-0000-000000000091',
  'Slice 7 creator-owned project conversion',
  'A demand fixture proving one-time creator-controlled conversion without giving the fan project control.',
  'concept','video','10000000-0000-0000-0000-000000000092','creator_interested',now(),now()
);
insert into public.demand_creator_responses(demand_id, creator_user_id, response)
select id, '10000000-0000-0000-0000-000000000092', 'interested'
from public.demands where public_id = 'demaaaaaaaaaaaaaaaaaaaaaaaa';

select set_config('request.jwt.claims', jsonb_build_object('sub','10000000-0000-0000-0000-000000000091','role','authenticated')::text, true);
select throws_ok(
  $$ select public.convert_demand_to_project('demaaaaaaaaaaaaaaaaaaaaaaaa', jsonb_build_object(
    'title','Fan must not own this project',
    'publicSynopsis','A long enough public synopsis that must never make the original fan the project owner.',
    'privateBrief','A sufficiently long private production brief that should remain invisible to the demand author.',
    'category','concept','format','video','boundaries',jsonb_build_array('closed-set'),
    'compensationModel','fixed','distributionScope','Platform release only','rightsDeclarations',jsonb_build_array('original-concept')
  )) $$,
  '42501', 'demand_conversion_not_allowed',
  'original fan cannot convert the demand into a controlled project'
);

select set_config('request.jwt.claims', jsonb_build_object('sub','10000000-0000-0000-0000-000000000092','role','authenticated')::text, true);
create temp table slice7_project_result(payload jsonb);
insert into slice7_project_result
select public.convert_demand_to_project('demaaaaaaaaaaaaaaaaaaaaaaaa', jsonb_build_object(
  'title','Creator owned project',
  'publicSynopsis','A public-safe creator-led synopsis with no private collaborator or legal identity data.',
  'privateBrief','A private production brief that contains scheduling, boundaries, collaborator context, and internal planning.',
  'category','concept','format','video','boundaries',jsonb_build_array('closed-set'),
  'compensationModel','fixed','distributionScope','Platform release only','rightsDeclarations',jsonb_build_array('original-concept')
));

select ok(
  (select payload ->> 'publicId' from slice7_project_result limit 1) like 'prj%',
  'conversion returns an opaque project public ID'
);
select is((select owner_user_id::text from public.projects limit 1), '10000000-0000-0000-0000-000000000092', 'converted project belongs only to the interested creator');
select is((select state::text from public.demands where public_id='demaaaaaaaaaaaaaaaaaaaaaaaa'), 'converted', 'successful conversion atomically marks the source demand converted');
select throws_ok(
  $$ select public.convert_demand_to_project('demaaaaaaaaaaaaaaaaaaaaaaaa', '{}'::jsonb) $$,
  '42501', 'demand_conversion_not_allowed',
  'the same demand cannot be converted twice'
);

select throws_ok(
  format($q$ select public.update_project_draft(%L, 0, jsonb_build_object(
    'title','Stale edit','publicSynopsis','A valid public synopsis long enough for a stale write attempt to be meaningful.',
    'privateBrief','A valid private brief long enough for stale optimistic concurrency protection to reject it.',
    'category','concept','format','video','boundaries',jsonb_build_array('closed-set'),
    'compensationModel','fixed','distributionScope','Platform release only','rightsDeclarations',jsonb_build_array('original-concept')
  )) $q$, (select payload ->> 'publicId' from slice7_project_result limit 1)),
  '40001', 'project_revision_conflict',
  'stale expected revisions fail instead of overwriting current state'
);

select lives_ok(
  format($q$ select public.update_project_draft(%L, 1, jsonb_build_object(
    'title','Creator owned project v2','publicSynopsis','A revised public-safe creator synopsis with no private negotiation material exposed.',
    'privateBrief','A revised private production brief that remains visible only through authorized project surfaces.',
    'category','concept','format','video','boundaries',jsonb_build_array('closed-set','no-surprises'),
    'compensationModel','fixed','distributionScope','Platform release only','rightsDeclarations',jsonb_build_array('original-concept')
  )) $q$, (select payload ->> 'publicId' from slice7_project_result limit 1)),
  'the creator can update the exact current revision'
);
select is((select current_revision from public.projects limit 1), 2, 'successful optimistic update increments project revision exactly once');
select is((select count(*)::integer from public.project_versions), 2, 'project history preserves both immutable versions');
select ok(
  position('private production brief' in coalesce((select public.get_project_public_synopsis(payload ->> 'publicId')::text from slice7_project_result limit 1), '')) = 0,
  'public synopsis projection never exposes the private production brief'
);

select * from finish();
rollback;
