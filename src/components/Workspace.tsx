import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Inspection } from '../domain/models';
import { INSPECTION_STATUS_LABELS } from '../domain/models';
import { useStore } from '../state/store';
import { checklistProgress } from '../services/checklists';
import { findGaps } from '../services/validation';
import { Icon } from './Icon';
import { Empty, Pill, Progress } from './ui';
import { MODULES, type ModuleId } from './AppShell';
import { useTutorial } from '../tutorial/Tutorial';
import { nowIso } from '../domain/ids';

function TourOffer({ module }: { module: ModuleId }) {
  const { tutorials, setTutorial } = useStore();
  const { start, active } = useTutorial();
  if (active || tutorials.some((t) => t.id === module)) return null;
  return (
    <div className="notice info no-print" data-testid="tour-offer">
      <Icon name="help" />
      <div style={{ flex: 1 }}>
        New here? Take the short interactive tour of this module.
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn small primary" onClick={() => start(module)}>
            Start tour
          </button>
          <button className="btn small" onClick={() => setTutorial({ id: module, status: 'skipped', lastStep: 0, updatedAt: nowIso() })}>
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}

interface Ctx {
  insp: Inspection;
  update: (mutate: (d: Inspection) => void, action?: string) => Promise<void>;
}
const InspCtx = createContext<Ctx | null>(null);

export function useInsp(): Ctx {
  const c = useContext(InspCtx);
  if (!c) throw new Error('useInsp must be used inside an inspection workspace');
  return c;
}

export const STATUS_COLORS: Record<Inspection['status'], string> = {
  scheduled: 'gray',
  in_progress: 'blue',
  in_review: 'purple',
  completed: 'green'
};

export function InspectionWorkspace({
  module,
  description,
  children
}: {
  module: ModuleId | 'export';
  description: string;
  children: ReactNode;
}) {
  const { id } = useParams();
  const { getInspection, updateInspection, inspections, ready } = useStore();
  const insp = id ? getInspection(id) : undefined;
  // `inspections` in deps so we re-render after every update.
  const ctx = useMemo<Ctx | null>(
    () => (insp ? { insp, update: (m, a) => updateInspection(insp.id, m, a) } : null),
    [insp, updateInspection, inspections] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const gaps = useMemo(() => (insp ? findGaps(insp) : []), [insp]);
  if (!ready) return <Empty>Loading…</Empty>;
  if (!insp || !ctx) {
    return (
      <div className="panel">
        <Empty icon="warn">
          Inspection not found on this device. <Link to="/">Back to dashboard</Link>
        </Empty>
      </div>
    );
  }
  const mod = MODULES.find((m) => m.id === module);
  const progress = checklistProgress(insp.checklist);
  const gapCount = gaps.filter((g) => g.severity === 'gap').length;
  return (
    <InspCtx.Provider value={ctx}>
      <div className={mod?.cls ?? 'mod-home'}>
        <div className="inspection-bar" data-tour="inspection-bar">
          <div style={{ minWidth: 0, flex: '1 1 220px' }}>
            <div className="title wrap-anywhere">
              {insp.claimNumber} · {insp.title}
            </div>
            <div className="row" style={{ gap: 6, marginTop: 4 }}>
              <Pill color={STATUS_COLORS[insp.status]}>{INSPECTION_STATUS_LABELS[insp.status]}</Pill>
              {insp.archivedAt && <Pill color="amber">Archived</Pill>}
              {insp.isDemo && <Pill color="purple">Fictional demo</Pill>}
              <Link to={`/i/${insp.id}/mission?tab=gaps`} className="pill amber" style={{ textDecoration: 'none' }}>
                {gapCount} gap{gapCount === 1 ? '' : 's'}
              </Link>
            </div>
          </div>
          <div style={{ minWidth: 120 }}>
            <small>Checklist {progress.percent}%</small>
            <Progress value={progress.percent} label="Checklist completion" />
          </div>
          <Link to={`/i/${insp.id}/export`} className="btn small" data-tour="export-link">
            <Icon name="pkg" /> Review & export
          </Link>
        </div>
        <div className="module-head">
          <div className="module-icon">
            <Icon name={mod?.icon ?? 'pkg'} />
          </div>
          <div>
            <h1>{mod?.label ?? 'Final review & export'}</h1>
            <p>{description}</p>
          </div>
        </div>
        {module !== 'export' && <TourOffer module={module} />}
        {children}
      </div>
    </InspCtx.Provider>
  );
}
