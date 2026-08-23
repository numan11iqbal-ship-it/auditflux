-- Extension sessions are server-managed, hashed credentials. Client roles must never read or write them.
create policy extension_sessions_server_only on public.extension_sessions
  for all
  using (false)
  with check (false);
