import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useMatch } from 'react-router-dom';
import { useStore } from '../state/store';
import { Icon, Logo } from './Icon';
import { timeAgo } from './ui';

export const MODULES = [
  { id: 'mission', label: 'Mission Control', short: 'Mission', icon: 'mission', cls: 'mod-mission' },
  { id: 'measure', label: 'Measurements', short: 'Measure', icon: 'measure', cls: 'mod-measure' },
  { id: 'photos', label: 'Photo Evidence', short: 'Photos', icon: 'photos', cls: 'mod-photos' },
  { id: 'notes', label: 'Notes & Report', short: 'Notes', icon: 'notes', cls: 'mod-notes' },
  { id: 'qc', label: 'Estimate QC', short: 'QC', icon: 'qc', cls: 'mod-qc' }
] as const;
export type ModuleId = (typeof MODULES)[number]['id'];

const LAST_KEY = 'fs-last-inspection';
export function rememberInspection(id: string) {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    /* ignore */
  }
}
export function lastInspectionId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

function SaveChip() {
  const { saveStatus } = useStore();
  const online = useOnline();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  let text = 'Saved on device';
  let cls = '';
  if (saveStatus.state === 'saving') text = 'Saving…';
  else if (saveStatus.state === 'error') {
    text = 'Save failed';
    cls = 'error';
  } else if (saveStatus.state === 'saved' && saveStatus.at) text = `Saved ${timeAgo(saveStatus.at)}`;
  return (
    <div className="row" style={{ gap: 6 }}>
      {!online && (
        <span className="save-chip offline" title="No connection — FieldShield keeps working and saving on this device">
          Offline
        </span>
      )}
      <span className={`save-chip ${cls}`} role="status" aria-live="polite" title={saveStatus.message} data-testid="save-status">
        {text}
      </span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const match = useMatch('/i/:id/*');
  const location = useLocation();
  const { inspections, saveStatus } = useStore();
  const routeId = match?.params.id;
  const fallback = lastInspectionId();
  const currentId = routeId ?? (fallback && inspections.some((i) => i.id === fallback && !i.archivedAt) ? fallback : null);
  useEffect(() => {
    if (routeId) rememberInspection(routeId);
  }, [routeId]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const moduleHref = (m: ModuleId) => (currentId ? `/i/${currentId}/${m}` : `/pick/${m}`);
  const navItems = (
    <>
      <NavLink to="/" end className={({ isActive }) => `navlink mod-home ${isActive ? 'active' : ''}`} data-tour="nav-dashboard">
        <Icon name="home" />
        <span>Dashboard</span>
      </NavLink>
      {MODULES.map((m) => (
        <NavLink
          key={m.id}
          to={moduleHref(m.id)}
          className={() => `navlink ${m.cls} ${location.pathname.endsWith(`/${m.id}`) ? 'active' : ''}`}
          data-tour={`nav-${m.id}`}
        >
          <Icon name={m.icon} />
          <span>
            <span className="nav-long">{m.short}</span>
          </span>
        </NavLink>
      ))}
    </>
  );

  return (
    <div className="shell">
      <a href="#main" className="sr-only">
        Skip to content
      </a>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="FieldShield dashboard">
          <Logo size={34} />
          <div>
            <div className="brand-name">FieldShield</div>
            <div className="brand-tag">Inspect. Document. Verify.</div>
          </div>
        </Link>
        <div className="spacer" />
        <SaveChip />
        <Link to="/help" className="topbar-btn" aria-label="Help and tutorials" data-tour="help">
          <Icon name="help" />
        </Link>
        <Link to="/settings" className="topbar-btn" aria-label="Settings">
          <Icon name="settings" />
        </Link>
      </header>
      {saveStatus.state === 'error' && (
        <div className="notice error" style={{ margin: 0, borderRadius: 0 }} role="alert">
          <Icon name="warn" />
          <div>
            {saveStatus.message} Your latest change is still on screen; export a backup from Settings if this continues.
          </div>
        </div>
      )}
      <div className="layout">
        <nav className="sidenav" aria-label="Primary">
          {navItems}
          <div className="nav-section">More</div>
          <NavLink to="/settings" className={({ isActive }) => `navlink mod-home ${isActive ? 'active' : ''}`}>
            <Icon name="settings" />
            <span>Settings & backup</span>
          </NavLink>
          <NavLink to="/help" className={({ isActive }) => `navlink mod-home ${isActive ? 'active' : ''}`}>
            <Icon name="help" />
            <span>Help & tutorials</span>
          </NavLink>
        </nav>
        <main className="main" id="main">
          {children}
        </main>
      </div>
      <nav className="bottomnav" aria-label="Primary (mobile)">
        {navItems}
      </nav>
    </div>
  );
}
