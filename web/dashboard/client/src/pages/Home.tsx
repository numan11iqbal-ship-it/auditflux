import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowUpRight, Check, CircleHelp, ExternalLink, Gauge, LockKeyhole, Plus, RefreshCw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

const categories = ["Performance", "Accessibility", "Best Practices", "SEO"] as const;

type PageKey = "projects" | "history" | "performance" | "settings" | "docs";

function pageFromPath(path: string): PageKey {
  if (path === "/history") return "history";
  if (path === "/performance") return "performance";
  if (path === "/settings") return "settings";
  if (path === "/docs") return "docs";
  return "projects";
}

function Metric({ label, value, tone = "text-foreground" }: { label: string; value: number | string; tone?: string }) {
  return <div><p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p><p className={`font-mono text-2xl font-semibold ${tone}`}>{value}</p></div>;
}

function SourceBadge({ source }: { source: string }) {
  return <Badge variant="outline" className="font-mono text-[10px] tracking-wider">{source}</Badge>;
}

function ProjectsPage() {
  const utils = trpc.useUtils();
  const { data: projects = [], isLoading } = trpc.projects.list.useQuery();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const createProject = trpc.projects.create.useMutation({ onSuccess: () => { setName(""); setUrl(""); void utils.projects.list.invalidate(); } });
  const deleteProject = trpc.projects.remove.useMutation({ onSuccess: () => void utils.projects.list.invalidate() });
  const updateProject = trpc.projects.update.useMutation({ onSuccess: () => void utils.projects.list.invalidate() });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !url.trim()) return;
    createProject.mutate({ name, primaryUrl: url, urls: [url] });
  }

  return <div className="space-y-8">
    <PageHeading eyebrow="Workspace" title="Projects" description="Track the websites you audit and keep every run attached to its source URL." />
    <Card className="border-primary/20 bg-primary/[0.04]">
      <CardContent className="p-5">
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_1.6fr_auto]">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Project name" aria-label="Project name" />
          <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" aria-label="Primary website URL" type="url" />
          <Button type="submit" disabled={createProject.isPending}><Plus className="mr-2 h-4 w-4" /> Add project</Button>
        </form>
        {createProject.error && <p className="mt-3 text-sm text-destructive">{createProject.error.message}</p>}
      </CardContent>
    </Card>
    {isLoading ? <LoadingCard label="Loading projects…" /> : projects.length === 0 ? <EmptyState title="No projects yet" description="Add your first website above. Audit results will stay scoped to your account." /> : <div className="grid gap-4 xl:grid-cols-2">{projects.map(project => <Card key={project.id} className="border-white/[0.08] bg-card/70">
      <CardContent className="flex items-start justify-between gap-5 p-5">
        <div className="min-w-0"><p className="truncate text-lg font-medium">{project.name}</p><a className="mt-1 block truncate text-sm text-primary hover:underline" href={project.primaryUrl} target="_blank" rel="noreferrer">{project.primaryUrl} <ExternalLink className="ml-1 inline h-3 w-3" /></a><p className="mt-4 text-xs text-muted-foreground">{safeUrls(project.urlsJson).length} tracked URL{safeUrls(project.urlsJson).length === 1 ? "" : "s"}</p></div>
        <div className="flex shrink-0 gap-2"><Button variant="outline" size="sm" onClick={() => { const next = window.prompt("Rename project", project.name); if (next?.trim()) updateProject.mutate({ id: project.id, name: next.trim() }); }}>Rename</Button><Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => { if (window.confirm(`Delete ${project.name}?`)) deleteProject.mutate({ id: project.id }); }} aria-label={`Delete ${project.name}`}><Trash2 className="h-4 w-4" /></Button></div>
      </CardContent>
    </Card>)}</div>}
  </div>;
}

function HistoryPage() {
  const { data: projects = [] } = trpc.projects.list.useQuery();
  const { data: runs = [], isLoading } = trpc.audits.history.useQuery();
  return <div className="space-y-8"><PageHeading eyebrow="Evidence trail" title="Audit history" description="Chronological runs with their measured coverage and data provenance." />
    {isLoading ? <LoadingCard label="Loading audit history…" /> : runs.length === 0 ? <EmptyState title="No audit runs stored" description="Runs submitted by the extension or an audit client will appear here. Nothing is being estimated." /> : <div className="space-y-3">{runs.map(run => <Card key={run.id} className="border-white/[0.08] bg-card/70"><CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto_auto] md:items-center"><div><p className="font-medium">{projects.find(project => project.id === run.projectId)?.name ?? `Project #${run.projectId}`}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</p><div className="mt-3 flex flex-wrap gap-2">{parseSources(run.dataSourcesJson).map(source => <SourceBadge key={source} source={source} />)}</div></div><div className="grid grid-cols-4 gap-4"><Metric label="Pass" value={run.passCount} tone="text-primary" /><Metric label="Warn" value={run.warnCount} tone="text-amber-300" /><Metric label="Fail" value={run.failCount} tone="text-rose-300" /><Metric label="N/A" value={run.naCount} tone="text-muted-foreground" /></div><div className="text-right"><p className="font-mono text-4xl font-semibold text-primary">{run.overallScore ?? "—"}</p><p className="text-[10px] uppercase tracking-widest text-muted-foreground">overall</p></div></CardContent></Card>)}</div>}
  </div>;
}

function PerformancePage() {
  const { data: metrics = [], isLoading } = trpc.audits.performance.useQuery();
  const latestByCategory = useMemo(() => { const map = new Map<string, typeof metrics[number]["metric"]>(); for (const row of metrics) if (!map.has(row.metric.category)) map.set(row.metric.category, row.metric); return map; }, [metrics]);
  return <div className="space-y-8"><PageHeading eyebrow="Measured signals" title="Performance" description="Latest stored PageSpeed category results. N/A stays separate from passed checks." />
    {isLoading ? <LoadingCard label="Loading performance metrics…" /> : <div className="grid gap-4 md:grid-cols-2">{categories.map(category => { const metric = latestByCategory.get(category); return <Card key={category} className="border-white/[0.08] bg-card/70"><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">{category}</CardTitle>{metric?.score != null ? <span className="font-mono text-3xl font-semibold text-primary">{metric.score}</span> : <Badge variant="secondary">UNAVAILABLE</Badge>}</CardHeader><CardContent>{metric ? <div className="grid grid-cols-4 gap-3"><Metric label="Pass" value={metric.passCount} tone="text-primary" /><Metric label="Warn" value={metric.warnCount} tone="text-amber-300" /><Metric label="Fail" value={metric.failCount} tone="text-rose-300" /><Metric label="N/A" value={metric.naCount} tone="text-muted-foreground" /></div> : <p className="text-sm text-muted-foreground">No {category} result has been stored yet.</p>}</CardContent></Card>; })}</div>}
  </div>;
}

function SettingsPage() {
  const { data: settings, isLoading } = trpc.settings.get.useQuery();
  const utils = trpc.useUtils();
  const [proxy, setProxy] = useState("");
  const [apiKey, setApiKey] = useState("");
  const saveProxy = trpc.settings.saveProxy.useMutation({ onSuccess: () => void utils.settings.get.invalidate() });
  const testProxy = trpc.settings.testProxy.useMutation();
  useEffect(() => { setProxy(settings?.backendProxyUrl ?? ""); setApiKey(localStorage.getItem("auditflux-pagespeed-api-key") ?? ""); }, [settings?.backendProxyUrl]);
  return <div className="space-y-8"><PageHeading eyebrow="Account control" title="Settings" description="Configure your audit transport and review the entitlement attached to this account." />
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="border-white/[0.08] bg-card/70"><CardHeader><CardTitle className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-primary" /> Backend proxy</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Store a per-user backend URL for server-side PageSpeed requests. A connection test only reports the endpoint response.</p><div className="flex gap-2"><Input value={proxy} onChange={e => setProxy(e.target.value)} placeholder="https://auditflux.example/api" type="url" /><Button onClick={() => saveProxy.mutate({ backendProxyUrl: proxy })} disabled={saveProxy.isPending}><Save className="mr-2 h-4 w-4" /> Save</Button></div><Button variant="outline" onClick={() => testProxy.mutate({ backendProxyUrl: proxy })} disabled={!proxy || testProxy.isPending}><RefreshCw className="mr-2 h-4 w-4" /> Test connection</Button>{testProxy.data && <p className={`text-sm ${testProxy.data.ok ? "text-primary" : "text-amber-300"}`}>{testProxy.data.ok ? `Connection verified (HTTP ${testProxy.data.status}).` : "Endpoint unavailable or did not return a successful response."}</p>}</CardContent></Card>
      <Card className="border-amber-300/25 bg-amber-300/[0.04]"><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-300" /> API key management</CardTitle></CardHeader><CardContent className="space-y-4"><div className="rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-3 text-sm text-amber-100"><strong>SECURITY WARNING:</strong> client-only keys remain in this browser profile and are readable by extensions with access to it. Use a restricted, disposable key.</div><Input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="PageSpeed Insights API key" type="password" aria-label="PageSpeed Insights API key" /><Button variant="outline" onClick={() => { localStorage.setItem("auditflux-pagespeed-api-key", apiKey); }}><Save className="mr-2 h-4 w-4" /> Save locally</Button><p className="text-xs text-muted-foreground">This value is never sent to the server by the AuditFlux audit ingestion flow.</p></CardContent></Card>
      <Card className="border-white/[0.08] bg-card/70 xl:col-span-2"><CardHeader><CardTitle className="flex items-center justify-between">Subscription <Badge className="bg-primary/15 text-primary hover:bg-primary/20">{settings?.entitlementTier ?? "Free"}</Badge></CardTitle></CardHeader><CardContent className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between"><div className="grid grid-cols-3 gap-6">{Object.entries(settings?.limits ?? { projects: 3, monthlyAudits: 25, historyDays: 7 }).map(([label, value]) => <Metric key={label} label={label.replace(/([A-Z])/g, " $1")} value={value} />)}</div><Button>Explore upgrade options <ArrowUpRight className="ml-2 h-4 w-4" /></Button></CardContent></Card>
    </div>{isLoading && <p className="text-sm text-muted-foreground">Loading account settings…</p>}
  </div>;
}

function DocsPage() { return <div className="space-y-8"><PageHeading eyebrow="AuditFlux reference" title="Docs" description="The product reports measured evidence, not invented confidence." /><div className="grid gap-4 md:grid-cols-2">{[{ icon: ShieldCheck, title: "Provenance first", text: "Every stored run carries source labels such as LIVE, LAB, or FIELD. Unknown values remain unavailable." }, { icon: CircleHelp, title: "Server ingestion", text: "Audit payloads are normalized server-side. Raw API keys are excluded from the persisted payload." }, { icon: Gauge, title: "Four performance categories", text: "Performance, Accessibility, Best Practices, and SEO retain their own pass, warn, fail, and N/A counts." }, { icon: Check, title: "Honest states", text: "The interface distinguishes measured results from unavailable integrations and future capabilities." }].map(item => <Card key={item.title} className="border-white/[0.08] bg-card/70"><CardContent className="p-5"><item.icon className="mb-4 h-5 w-5 text-primary" /><h3 className="font-medium">{item.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p></CardContent></Card>)}</div></div>; }

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <div><p className="font-mono text-[11px] uppercase tracking-[0.24em] text-primary">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div>; }
function EmptyState({ title, description }: { title: string; description: string }) { return <Card className="border-dashed border-white/[0.12] bg-transparent"><CardContent className="flex flex-col items-center justify-center p-12 text-center"><Gauge className="mb-4 h-8 w-8 text-muted-foreground" /><h2 className="font-medium">{title}</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p></CardContent></Card>; }
function LoadingCard({ label }: { label: string }) { return <Card className="border-white/[0.08] bg-card/70"><CardContent className="flex items-center gap-3 p-8 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin text-primary" />{label}</CardContent></Card>; }
function safeUrls(value: string) { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function parseSources(value: string) { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter(source => ["LIVE", "LAB", "FIELD"].includes(source)) : []; } catch { return []; } }

export default function Home() {
  const [location] = useLocation();
  const page = pageFromPath(location);
  return <DashboardLayout><div className="min-h-[calc(100vh-2rem)] bg-[#07111f] text-slate-100"><div className="mx-auto w-full max-w-[1800px] px-1 py-3 sm:px-4 lg:px-8">{page === "projects" && <ProjectsPage />}{page === "history" && <HistoryPage />}{page === "performance" && <PerformancePage />}{page === "settings" && <SettingsPage />}{page === "docs" && <DocsPage />}</div></div></DashboardLayout>;
}
