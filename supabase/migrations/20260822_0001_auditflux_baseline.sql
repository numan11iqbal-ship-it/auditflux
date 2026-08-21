-- AuditFlux baseline: additive schema only. No DROP, TRUNCATE, DELETE, or reset statements.
create extension if not exists pgcrypto;

create type public.audit_data_source as enum ('LIVE', 'LAB', 'FIELD', 'CALCULATED', 'BACKEND');
create type public.audit_severity as enum ('critical', 'warning', 'notice', 'info');
create type public.audit_status as enum ('pass', 'fail', 'warn', 'na', 'unavailable');
create type public.entitlement_tier as enum ('Free', 'Pro', 'Agency');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  domain text not null,
  primary_url text not null,
  urls jsonb not null default '[]'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, primary_url)
);

create table public.audits (
  id uuid primary key default gen_random_uuid(),
  client_audit_id text not null unique,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  url text not null,
  canonical_url text,
  engine_version text not null,
  contract_version text not null,
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  overall_score integer check (overall_score between 0 and 100),
  coverage_total integer not null default 0 check (coverage_total >= 0),
  coverage_applicable integer not null default 0 check (coverage_applicable >= 0),
  pass_count integer not null default 0 check (pass_count >= 0),
  warn_count integer not null default 0 check (warn_count >= 0),
  fail_count integer not null default 0 check (fail_count >= 0),
  critical_count integer not null default 0 check (critical_count >= 0),
  notice_count integer not null default 0 check (notice_count >= 0),
  na_count integer not null default 0 check (na_count >= 0),
  payload jsonb not null,
  unique (project_id, client_audit_id)
);
create index audits_project_captured_at_idx on public.audits(project_id, captured_at desc);
create index audits_workspace_captured_at_idx on public.audits(workspace_id, captured_at desc);

create table public.audit_categories (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  category_id text not null,
  label text not null,
  score integer check (score between 0 and 100),
  applicable boolean not null default false,
  checks integer not null default 0 check (checks >= 0),
  passed integer not null default 0 check (passed >= 0),
  failed integer not null default 0 check (failed >= 0),
  source public.audit_data_source not null default 'CALCULATED',
  unique (audit_id, category_id)
);

create table public.audit_issues (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  issue_key text not null,
  rule_id text,
  category text not null,
  severity public.audit_severity not null,
  title text not null,
  detected text,
  expected text,
  why text,
  recommendation text,
  evidence jsonb not null default '[]'::jsonb,
  status public.audit_status not null default 'fail',
  locator jsonb,
  provenance jsonb not null default '{}'::jsonb,
  unique (audit_id, issue_key)
);
create index audit_issues_audit_severity_idx on public.audit_issues(audit_id, severity);

create table public.audit_headings (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  position integer not null check (position >= 0),
  level integer not null check (level between 1 and 6),
  text text,
  length integer not null default 0 check (length >= 0),
  empty boolean not null default false,
  is_question boolean not null default false,
  locator jsonb,
  unique (audit_id, position)
);

create table public.audit_links (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  position integer not null check (position >= 0),
  href text,
  absolute_url text,
  anchor text,
  link_type text not null,
  rel text,
  target text,
  nofollow boolean not null default false,
  sponsored boolean not null default false,
  ugc boolean not null default false,
  locator jsonb,
  unique (audit_id, position)
);

create table public.audit_images (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  position integer not null check (position >= 0),
  src text,
  alt text,
  alt_missing boolean not null default false,
  alt_empty boolean not null default false,
  alt_length integer not null default 0 check (alt_length >= 0),
  width integer,
  height integer,
  broken boolean not null default false,
  format text,
  locator jsonb,
  unique (audit_id, position)
);

create table public.audit_schema_entities (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  position integer not null check (position >= 0),
  valid boolean not null,
  error text,
  types jsonb not null default '[]'::jsonb,
  has_context boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  unique (audit_id, position)
);

create table public.audit_resources (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  position integer not null check (position >= 0),
  url text,
  kind text,
  initiator text,
  duration_ms integer,
  transfer_bytes bigint,
  decoded_bytes bigint,
  cached boolean not null default false,
  cross_origin boolean not null default false,
  render_blocking_candidate boolean not null default false,
  unique (audit_id, position)
);

create table public.performance_results (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  source public.audit_data_source not null check (source in ('LIVE', 'LAB', 'FIELD')),
  strategy text not null default 'default',
  performance_score integer check (performance_score between 0 and 100),
  accessibility_score integer check (accessibility_score between 0 and 100),
  best_practices_score integer check (best_practices_score between 0 and 100),
  seo_score integer check (seo_score between 0 and 100),
  metrics jsonb not null default '{}'::jsonb,
  raw_summary jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  unique (audit_id, source, strategy)
);

create table public.audit_provenance (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  domain text not null,
  source public.audit_data_source not null,
  label text,
  method text,
  payload jsonb not null default '{}'::jsonb
);

create table public.usage_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation text not null,
  audit_id uuid references public.audits(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.entitlements (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  tier public.entitlement_tier not null default 'Free',
  limits jsonb not null default '{"projects":3,"monthlyAudits":25,"historyDays":7}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger workspaces_set_updated_at before update on public.workspaces for each row execute procedure public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects for each row execute procedure public.set_updated_at();

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id and user_id = auth.uid()
  );
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare workspace_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  insert into public.workspaces (name, created_by)
  values (coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), 'AuditFlux') || '''s Workspace', new.id)
  returning id into workspace_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (workspace_id, new.id, 'owner');
  insert into public.entitlements (workspace_id) values (workspace_id);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.audits enable row level security;
alter table public.audit_categories enable row level security;
alter table public.audit_issues enable row level security;
alter table public.audit_headings enable row level security;
alter table public.audit_links enable row level security;
alter table public.audit_images enable row level security;
alter table public.audit_schema_entities enable row level security;
alter table public.audit_resources enable row level security;
alter table public.performance_results enable row level security;
alter table public.audit_provenance enable row level security;
alter table public.usage_records enable row level security;
alter table public.entitlements enable row level security;

create policy profiles_self on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy workspace_members_select on public.workspace_members for select using (public.is_workspace_member(workspace_id));
create policy workspaces_select on public.workspaces for select using (public.is_workspace_member(id));
create policy projects_member_access on public.projects for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy audits_member_select on public.audits for select using (public.is_workspace_member(workspace_id));
create policy audit_categories_member_select on public.audit_categories for select using (exists (select 1 from public.audits where audits.id = audit_categories.audit_id and public.is_workspace_member(audits.workspace_id)));
create policy audit_issues_member_select on public.audit_issues for select using (exists (select 1 from public.audits where audits.id = audit_issues.audit_id and public.is_workspace_member(audits.workspace_id)));
create policy audit_headings_member_select on public.audit_headings for select using (exists (select 1 from public.audits where audits.id = audit_headings.audit_id and public.is_workspace_member(audits.workspace_id)));
create policy audit_links_member_select on public.audit_links for select using (exists (select 1 from public.audits where audits.id = audit_links.audit_id and public.is_workspace_member(audits.workspace_id)));
create policy audit_images_member_select on public.audit_images for select using (exists (select 1 from public.audits where audits.id = audit_images.audit_id and public.is_workspace_member(audits.workspace_id)));
create policy audit_schema_entities_member_select on public.audit_schema_entities for select using (exists (select 1 from public.audits where audits.id = audit_schema_entities.audit_id and public.is_workspace_member(audits.workspace_id)));
create policy audit_resources_member_select on public.audit_resources for select using (exists (select 1 from public.audits where audits.id = audit_resources.audit_id and public.is_workspace_member(audits.workspace_id)));
create policy performance_results_member_select on public.performance_results for select using (exists (select 1 from public.audits where audits.id = performance_results.audit_id and public.is_workspace_member(audits.workspace_id)));
create policy audit_provenance_member_select on public.audit_provenance for select using (exists (select 1 from public.audits where audits.id = audit_provenance.audit_id and public.is_workspace_member(audits.workspace_id)));
create policy usage_records_member_select on public.usage_records for select using (public.is_workspace_member(workspace_id));
create policy entitlements_member_select on public.entitlements for select using (public.is_workspace_member(workspace_id));
