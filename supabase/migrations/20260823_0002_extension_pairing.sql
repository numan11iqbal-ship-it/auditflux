create type public.extension_connection_status as enum ('pending', 'connected', 'expired', 'disconnected', 'error');

create table public.extension_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  installation_id text not null check (char_length(installation_id) between 16 and 160),
  extension_version text,
  protocol_version text not null default '1',
  browser text,
  capabilities jsonb not null default '[]'::jsonb,
  status public.extension_connection_status not null default 'pending',
  connected_at timestamptz,
  last_seen_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, installation_id)
);
create index extension_connections_user_workspace_idx on public.extension_connections(user_id, workspace_id, updated_at desc);

create table public.extension_pairing_challenges (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  nonce_hash text not null unique,
  status public.extension_connection_status not null default 'pending',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index extension_pairing_challenges_pending_idx on public.extension_pairing_challenges(user_id, status, expires_at desc);

create table public.extension_sessions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.extension_connections(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index extension_sessions_active_idx on public.extension_sessions(connection_id, expires_at) where revoked_at is null;

create trigger extension_connections_set_updated_at before update on public.extension_connections for each row execute procedure public.set_updated_at();

alter table public.extension_connections enable row level security;
alter table public.extension_pairing_challenges enable row level security;
alter table public.extension_sessions enable row level security;

create policy extension_connections_owner_select on public.extension_connections for select using (user_id = auth.uid() and public.is_workspace_member(workspace_id));
create policy extension_pairing_challenges_owner_select on public.extension_pairing_challenges for select using (user_id = auth.uid() and public.is_workspace_member(workspace_id));
