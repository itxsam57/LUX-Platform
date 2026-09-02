begin;

create extension if not exists pgtap with schema extensions;
select plan(1);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000099',
  'authenticated', 'authenticated', 'slice7-conflict@lux.test', crypt('LuxTestPassword1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

update public.profiles
set handle = 'slice7_conflict',
    display_name = 'Slice 7 Conflict Creator',
    visibility = 'public'
where user_id = '10000000-0000-0000-0000-000000000099';

insert into public.age_assurance_records(user_id, method, status, jurisdiction_code, policy_version, expires_at)
values (
  '10000000-0000-0000-0000-000000000099',
  'self_attestation',
  'accepted',
  'PK',
  'slice-7-conflict-http-test',
  now() + interval '1 year'
);

insert into public.workspace_memberships(user_id, role, status, reviewed_at, reviewed_by)
values (
  '10000000-0000-0000-0000-000000000099',
  'creator',
  'approved',
  now(),
  '10000000-0000-0000-0000-000000000099'
);

update public.active_workspaces active
set membership_id = membership.id,
    updated_at = now()
from public.workspace_memberships membership
where active.user_id = '10000000-0000-0000-0000-000000000099'
  and membership.user_id = active.user_id
  and membership.role = 'creator'
  and membership.status = 'approved';

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000099',
    'role', 'authenticated'
  )::text,
  true
);

create temp table slice7_conflict_project(payload jsonb);
insert into slice7_conflict_project
select public.create_project_draft(jsonb_build_object(
  'title', 'Conflict semantics project',
  'publicSynopsis', 'A public-safe project synopsis used to verify stale optimistic concurrency behavior.',
  'privateBrief', 'A private production brief long enough to create a valid creator-owned project for conflict testing.',
  'category', 'concept',
  'format', 'video',
  'boundaries', jsonb_build_array('closed-set'),
  'compensationModel', 'fixed',
  'distributionScope', 'Platform release only',
  'rightsDeclarations', jsonb_build_array('original-concept')
));

select throws_ok(
  format($q$
    select public.update_project_draft(%L, 0, jsonb_build_object(
      'title', 'Stale edit must conflict',
      'publicSynopsis', 'A valid public synopsis long enough for a stale write attempt to remain meaningful.',
      'privateBrief', 'A valid private brief long enough for stale optimistic concurrency protection to reject it safely.',
      'category', 'concept',
      'format', 'video',
      'boundaries', jsonb_build_array('closed-set'),
      'compensationModel', 'fixed',
      'distributionScope', 'Platform release only',
      'rightsDeclarations', jsonb_build_array('original-concept')
    ))
  $q$, (select payload ->> 'publicId' from slice7_conflict_project limit 1)),
  'PT409',
  'project_revision_conflict',
  'stale project revisions are logical HTTP 409 conflicts, not SQL serialization failures'
);

select * from finish();
rollback;
