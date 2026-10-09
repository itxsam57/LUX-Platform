begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(
  (
    select prosecdef
    from pg_proc
    where oid='private.check_ledger_posting_balance()'::regprocedure
  ),
  'ledger balance trigger runs as security definer'
);
select ok(
  not has_schema_privilege('service_role','private','USAGE'),
  'service role does not retain direct private-schema usage'
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
