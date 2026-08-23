begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000051','authenticated','authenticated','export-owner@lux.test',crypt('LuxTestPassword1', gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000052','authenticated','authenticated','export-following@lux.test',crypt('LuxTestPassword1', gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000053','authenticated','authenticated','export-follower@lux.test',crypt('LuxTestPassword1', gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000054','authenticated','authenticated','export-blocked@lux.test',crypt('LuxTestPassword1', gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000055','authenticated','authenticated','export-muted@lux.test',crypt('LuxTestPassword1', gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

update public.profiles
set handle = case user_id
  when '10000000-0000-0000-0000-000000000051' then 'export_owner'
  when '10000000-0000-0000-0000-000000000052' then 'export_following'
  when '10000000-0000-0000-0000-000000000053' then 'export_follower'
  when '10000000-0000-0000-0000-000000000054' then 'export_blocked'
  when '10000000-0000-0000-0000-000000000055' then 'export_muted'
end,
display_name = case user_id
  when '10000000-0000-0000-0000-000000000051' then 'Export Owner'
  when '10000000-0000-0000-0000-000000000052' then 'Export Following'
  when '10000000-0000-0000-0000-000000000053' then 'Export Follower'
  when '10000000-0000-0000-0000-000000000054' then 'Export Blocked'
  when '10000000-0000-0000-0000-000000000055' then 'Export Muted'
end
where user_id in (
  '10000000-0000-0000-0000-000000000051',
  '10000000-0000-0000-0000-000000000052',
  '10000000-0000-0000-0000-000000000053',
  '10000000-0000-0000-0000-000000000054',
  '10000000-0000-0000-0000-000000000055'
);

insert into public.profile_follows(follower_user_id, followed_user_id) values
('10000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000052'),
('10000000-0000-0000-0000-000000000053','10000000-0000-0000-0000-000000000051');
insert into public.profile_blocks(blocker_user_id, blocked_user_id)
values ('10000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000054');
insert into public.profile_mutes(muter_user_id, muted_user_id)
values ('10000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000055');

select has_function('public', 'get_profile_export_relationships', 'owner export relationship RPC exists');
select has_function('public', 'record_account_export_generated', 'export audit receipt RPC exists');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '10000000-0000-0000-0000-000000000051',
    'role', 'authenticated',
    'session_id', '20000000-0000-0000-0000-000000000051',
    'iat', extract(epoch from now())::bigint - 10
  )::text,
  true
);

select lives_ok($$ select public.get_profile_export_relationships() $$, 'owner can export relationship handles without adult assurance');
select is(jsonb_array_length(public.get_profile_export_relationships() -> 'following'), 1, 'export contains one following profile');
select is(public.get_profile_export_relationships() #>> '{following,0,handle}', 'export_following', 'following entry exposes only public handle identity');
select is(public.get_profile_export_relationships() #>> '{followers,0,handle}', 'export_follower', 'follower entry exposes public handle identity');
select is(public.get_profile_export_relationships() #>> '{blocks,0,handle}', 'export_blocked', 'block entry exposes public handle identity');
select is(public.get_profile_export_relationships() #>> '{mutes,0,handle}', 'export_muted', 'mute entry exposes public handle identity');
select ok(
  not exists (
    select 1
    from jsonb_each(public.get_profile_export_relationships()) as collection(collection_name, items)
    cross join lateral jsonb_array_elements(collection.items) as exported_item(item)
    cross join lateral jsonb_object_keys(exported_item.item) as exported_key(field_name)
    where exported_key.field_name not in ('handle', 'display_name')
  ),
  'relationship export exposes only allowlisted public relationship fields'
);
select lives_ok($$ select public.record_account_export_generated() $$, 'owner can create an auditable export receipt without adult assurance');
reset role;

select is(
  (select count(*) from public.audit_events where actor_user_id = '10000000-0000-0000-0000-000000000051' and event_type = 'account_export_generated'),
  1::bigint,
  'successful export receipt is written exactly once'
);

select * from finish();
rollback;