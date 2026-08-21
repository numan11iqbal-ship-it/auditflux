-- Additive only: normalizes deterministic GEO/AEO evidence for saved AuditFlux audits.
create table public.audit_geo_aeo_records (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  signal_key text not null,
  status text not null check (status in ('pass', 'fail', 'warn', 'na', 'unavailable')),
  title text,
  detected text,
  expected text,
  evidence jsonb not null default '[]'::jsonb,
  locator jsonb,
  provenance jsonb not null default '{}'::jsonb,
  unique (audit_id, signal_key)
);

alter table public.audit_geo_aeo_records enable row level security;

create policy audit_geo_aeo_records_member_select on public.audit_geo_aeo_records
for select using (
  exists (
    select 1 from public.audits
    where audits.id = audit_geo_aeo_records.audit_id
      and public.is_workspace_member(audits.workspace_id)
  )
);
