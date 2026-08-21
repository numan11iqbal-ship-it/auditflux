-- Hardening only: helper functions remain available to triggers and RLS policies,
-- but are not callable as public RPC endpoints.
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.is_workspace_member(uuid) from anon, authenticated;
