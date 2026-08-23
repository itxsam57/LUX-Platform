begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'profile_follows', 'profile follows table exists');
select has_table('public', 'profile_blocks', 'profile blocks table exists');
select has_table('public', 'profile_mutes', 'profile mutes table exists');
select has_table('public', 'privacy_requests', 'privacy requests table exists');
select has_table('public', 'notifications', 'notifications table exists');

select * from finish();
rollback;
