-- PostgreSQL grants EXECUTE to PUBLIC by default; remove that default grant.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.is_workspace_member(uuid) from public;
