import { BrandMark } from '@/components/BrandMark';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { BookOpenCheck, Braces, ChartNoAxesCombined, CircleGauge, FileWarning, FolderKanban, Image, Link2, ListTree, LogOut, Menu, PlugZap, SearchCheck, Settings, Shield, ShieldCheck, SlidersHorizontal, Wrench } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { useLocation } from 'wouter';
import { auditIdFromLocation, auditPath, routeSection } from '@/lib/audit-view';

const auditNavigation = [
  ['Overview', 'overview', CircleGauge], ['Issues', 'issues', FileWarning], ['Headings', 'headings', ListTree], ['Links', 'links', Link2], ['Images', 'images', Image], ['Schema', 'schema', Braces], ['GEO / AEO', 'geo', SearchCheck], ['Performance', 'performance', ChartNoAxesCombined], ['Accessibility', 'accessibility', ShieldCheck], ['Technical', 'technical', Wrench], ['Security', 'security', Shield], ['Resources', 'resources', SlidersHorizontal],
];
const workspaceNavigation = [['Projects', '/projects', FolderKanban], ['All Audits', '/history', ChartNoAxesCombined], ['Reports', '/reports', BookOpenCheck], ['Connect Extension', '/connect-extension', PlugZap], ['Settings', '/settings', Settings]];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useSupabaseAuth();
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const selectedAuditId = auditIdFromLocation(location);
  const activeAuditSection = routeSection(location);
  const email = user?.email || 'AuditFlux member';
  const displayName = email.split('@')[0].replace(/[._-]/g, ' ');
  const auditItem = (label: string, section: Parameters<typeof auditPath>[1], Icon: typeof CircleGauge) => {
    const path = selectedAuditId ? auditPath(selectedAuditId, section) : `/${section}`;
    return <button key={section} onClick={() => { setLocation(path); setOpen(false); }} className={`af-nav-item ${activeAuditSection === section ? 'is-active' : ''}`}><Icon size={17} strokeWidth={2} /><span>{label}</span></button>;
  };
  const workspaceItem = (label: string, path: string, Icon: typeof CircleGauge) => {
    const destination = path === '/reports' && selectedAuditId ? auditPath(selectedAuditId, 'reports') : path;
    return <button key={path} onClick={() => { setLocation(destination); setOpen(false); }} className={`af-nav-item ${routeSection(location) === 'reports' && label === 'Reports' || location === path ? 'is-active' : ''}`}><Icon size={17} strokeWidth={2} /><span>{label}</span></button>;
  };

  return <div className="af-app-shell"><button className="af-mobile-menu" aria-label="Open navigation" onClick={() => setOpen(true)}><Menu size={20} /></button>{open && <button aria-label="Close navigation" className="af-nav-backdrop" onClick={() => setOpen(false)} />}
    <aside className={`af-sidebar ${open ? 'is-open' : ''}`}>
      <div className="af-brand"><BrandMark className="af-brand-logo" /></div>
      <nav className="af-sidebar-nav"><p>Audit</p>{auditNavigation.slice(0, 4).map(([label, section, Icon]) => auditItem(label as string, section as Parameters<typeof auditPath>[1], Icon as typeof CircleGauge))}<p className="af-nav-split">Audit detail</p>{auditNavigation.slice(4).map(([label, section, Icon]) => auditItem(label as string, section as Parameters<typeof auditPath>[1], Icon as typeof CircleGauge))}</nav>
      <div className="af-sidebar-bottom"><p className="af-nav-split">Workspace</p>{workspaceNavigation.map(([label, path, Icon]) => workspaceItem(label as string, path as string, Icon as typeof CircleGauge))}<div className="af-account"><span>{displayName.slice(0, 1).toUpperCase()}</span><div><strong>{displayName}</strong><em>{email}</em></div></div><button className="af-signout" onClick={() => void signOut()}><LogOut size={16} />Sign out</button></div>
    </aside>
    <main className="af-shell-main"><header className="af-topbar"><div className="af-topbar-status"><span className="af-live-dot" />Authenticated workspace</div></header><div className="af-main-content">{children}</div></main>
  </div>;
}
