begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select has_function(
  'public',
  'list_funding_commitments',
  array[]::text[],
  'supporter-safe funding dashboard list RPC exists'
);

select has_function(
  'public',
  'register_funding_material_change',
  array['text','text','text','text'],
  'service material-change registration RPC exists'
);

select ok(
  case
    when to_regprocedure('public.list_funding_commitments()') is null then false
    else has_function_privilege('authenticated','public.list_funding_commitments()','EXECUTE')
  end,
  'authenticated supporters can execute only the safe funding list projection'
);

select ok(
  case
    when to_regprocedure('public.register_funding_material_change(text,text,text,text)') is null then false
    else not has_function_privilege('authenticated','public.register_funding_material_change(text,text,text,text)','EXECUTE')
  end,
  'authenticated clients cannot register system material changes'
);

select * from finish();
rollback;
