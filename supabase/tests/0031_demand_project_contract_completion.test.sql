begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_column('public','demands','script_outline','Crowd Demand stores optional structured script outline');
select has_function('public','create_demand_complete',array['jsonb'],'complete demand authoring RPC exists');
select has_function('public','get_demand_complete',array['text'],'complete demand projection exists');

select has_column('public','project_versions','script_version','project versions bind a script version');
select has_column('public','project_versions','budget_minor','project versions bind budget amount');
select has_column('public','project_versions','budget_currency','project versions bind budget currency');
select has_column('public','project_versions','production_schedule','project versions bind production schedule');
select has_column('public','project_versions','readiness_items','project versions bind readiness checklist');
select has_function('private','normalize_project_input',array['jsonb'],'project normalization validates complete readiness shape');

select ok(
  position('scripthash' in lower(pg_get_functiondef('private.validate_project_terms(jsonb)'::regprocedure)))>0
  and position('territory' in lower(pg_get_functiondef('private.validate_project_terms(jsonb)'::regprocedure)))>0
  and position('duration' in lower(pg_get_functiondef('private.validate_project_terms(jsonb)'::regprocedure)))>0
  and position('withdrawal' in lower(pg_get_functiondef('private.validate_project_terms(jsonb)'::regprocedure)))>0
  and position('disputeresolution' in lower(pg_get_functiondef('private.validate_project_terms(jsonb)'::regprocedure)))>0
  and position('revenuesplits' in lower(pg_get_functiondef('private.validate_project_terms(jsonb)'::regprocedure)))>0,
  'immutable contract hash shape includes script, territory, duration, withdrawal, dispute, and revenue splits'
);

select * from finish();
rollback;
