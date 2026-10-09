begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(
  has_schema_privilege('service_role','private','USAGE'),
  'service role may resolve private helper functions used by server-only public RPCs'
);
select ok(
  not has_schema_privilege('authenticated','private','USAGE'),
  'authenticated clients still cannot resolve private schema objects'
);
select ok(
  not has_schema_privilege('anon','private','USAGE'),
  'anonymous clients still cannot resolve private schema objects'
);

select * from finish();
rollback;
