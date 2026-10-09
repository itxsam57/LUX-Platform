-- Allow server-only service_role RPC orchestration to resolve private helper functions.
-- This grants schema name resolution only; it does not grant table access or broaden
-- authenticated/anon privileges.

grant usage on schema private to service_role;

notify pgrst,'reload schema';
