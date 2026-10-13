import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { INSPECTION_STATUS_LABELS, LOSS_TYPE_LABELS, type Inspection, type InspectionStatus, type LossType } from '../domain/models';
import { useStore } from '../state/store';
import { loadDemo } from '../state/demoLoader';
import { checklistProgress } from '../services/checklists';
import { findGaps, latestReport } from '../services/validation';
import { summarizeFindings } from '../services/estimateQC';
import { Icon, Logo } from '../components/Icon';
import { Empty, Pill, Progress, timeAgo, useToast } from '../components/ui';
import { STATUS_COLORS } from '../components/Workspace';
import { lastInspectionId } from '../components/AppShell';

type Sort = 'updated' | 'inspectionDate' | 'claim' | 'completion';

interface Row {
  insp: Inspection;
  percent: number;
  gaps: number;
  followUps: number;
  openFindings: number;
  reportAwaiting: boolean;
}

export function Dashboard() {
  const store = useStore();
  const { inspections, ready } = store;
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<InspectionStatus | 'all'>('all');
  const [loss, setLoss] = useState<LossType | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<Sort>('updated');
  const [loadingDemo, setLoadingDemo] = useState(false);

  const rows: Row[] = useMemo(
    () =>
      inspections.map((insp) => {
        const gaps = findGaps(insp);
        const rep = latestReport(insp);
        return {
          insp,
          percent: checklistProgress(insp.checklist).percent,
          gaps: gaps.filter((g) => g.severity === 'gap').length,
          followUps: insp.followUps.filter((f) => f.status === 'open').length,
          openFindings: summarizeFindings(insp.findings).byStatus.open + summarizeFindings(insp.findings).byStatus.follow_up,
          reportAwaiting: !!rep && rep.status !== 'final_reviewed'
        };
      }),
    [inspections]
  );

  const active = rows.filter((r) => !r.insp.archivedAt);
  const filtered = rows
    .filter((r) => (showArchived ? true : !r.insp.archivedAt))
    .filter((r) => status === 'all' || r.insp.status === status)
    .filter((r) => loss === 'all' || r.insp.lossTypes.includes(loss))
    .filter((r) => {
      if (!q.trim()) return true;
      const p = r.insp.property;
      const hay = `${r.insp.claimNumber} ${r.insp.title} ${p.insuredName} ${p.addressLine} ${p.city} ${p.postalCode}`.toLowerCase();
      return hay.includes(q.trim().toLowerCase());
    })
    .sort((a, b) => {
      if (sort === 'claim') return a.insp.claimNumber.localeCompare(b.insp.claimNumber);
      if (sort === 'completion') return a.percent - b.percent;
      if (sort === 'inspectionDate') return (b.insp.inspectionDate || '').localeCompare(a.insp.inspectionDate || '');
      return b.insp.updatedAt.localeCompare(a.insp.updatedAt);
    });

  const totals = {
    active: active.filter((r) => r.insp.status !== 'completed').length,
    gaps: active.reduce((n, r) => n + r.gaps, 0),
    followUps: active.reduce((n, r) => n + r.followUps, 0),
    reports: active.filter((r) => r.reportAwaiting).length,
    findings: active.reduce((n, r) => n + r.openFindings, 0)
  };
  const recent = [...active].sort((a, b) => b.insp.updatedAt.localeCompare(a.insp.updatedAt)).slice(0, 3);
  const lastId = lastInspectionId();
  const resume = active.find((r) => r.insp.id === lastId);

  const demo = async () => {
    setLoadingDemo(true);
    try {
      const insp = await loadDemo(store);
      toast('Fictional demo inspection loaded', 'ok');
      navigate(`/i/${insp.id}/mission`);
    } catch (e) {
      toast(`Could not load demo: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setLoadingDemo(false);
    }
  };

  if (!ready) return <Empty>Loading your inspections…</Empty>;

  return (
    <div className="mod-home">
      <section className="hero" aria-label="FieldShield">
        <Logo size={64} />
        <div style={{ flex: '1 1 240px' }}>
          <h1>FieldShield</h1>
          <p className="tagline">Inspect. Document. Verify.</p>
          <p style={{ margin: '6px 0 0', opacity: 0.85, fontSize: '0.9rem' }}>
            Property inspection platform — works offline, stores data only on this device.
          </p>
        </div>
        <div className="row">
          <Link to="/new" className="btn" data-tour="new-inspection" data-testid="new-inspection">
            <Icon name="plus" /> New inspection
          </Link>
          <button className="btn outline" onClick={demo} disabled={loadingDemo} data-testid="load-demo">
            <Icon name="play" /> {loadingDemo ? 'Loading demo…' : 'Load fictional demo'}
          </button>
        </div>
      </section>

      {resume && (
        <Link to={`/i/${resume.insp.id}/mission`} className="panel card-link row between" data-testid="resume">
          <div>
            <small>Continue where you left off</small>
            <div style={{ fontWeight: 700, color: 'var(--navy)' }}>
              {resume.insp.claimNumber} · {resume.insp.title}
            </div>
          </div>
          <Icon name="chevron" />
        </Link>
      )}

      <div className="grid-4" style={{ marginBottom: 14 }}>
        <div className="stat mod-mission">
          <div className="num">{totals.active}</div>
          <div className="lbl">Active inspections</div>
        </div>
        <div className="stat" style={{ ['--accent' as string]: 'var(--amber)' }}>
          <div className="num">{totals.gaps}</div>
          <div className="lbl">Documentation gaps</div>
        </div>
        <div className="stat mod-photos">
          <div className="num">{totals.followUps}</div>
          <div className="lbl">Open follow-up tasks</div>
        </div>
        <div className="stat mod-notes">
          <div className="num">{totals.reports}</div>
          <div className="lbl">Reports awaiting review</div>
        </div>
        <div className="stat mod-qc">
          <div className="num">{totals.findings}</div>
          <div className="lbl">Open QC findings</div>
        </div>
        <div className="stat mod-measure">
          <div className="num">{active.filter((r) => r.insp.status === 'completed').length}</div>
          <div className="lbl">Completed</div>
        </div>
      </div>

      {recent.length > 0 && (
        <section className="panel">
          <h2>Recently updated</h2>
          <ul className="list">
            {recent.map((r) => (
              <li key={r.insp.id} className="row between">
                <Link to={`/i/${r.insp.id}/mission`}>
                  {r.insp.claimNumber} · {r.insp.title}
                </Link>
                <small>{timeAgo(r.insp.updatedAt)}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel" aria-label="Inspections">
        <div className="panel-head">
          <h2>Inspections</h2>
          <span className="muted">{filtered.length} shown</span>
        </div>
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <label className="field">
            <span>Search</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Claim #, name, address…" data-tour="search" />
          </label>
          <div className="grid-3" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <label className="field">
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as InspectionStatus | 'all')}>
                <option value="all">All</option>
                {Object.entries(INSPECTION_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Loss type</span>
              <select value={loss} onChange={(e) => setLoss(e.target.value as LossType | 'all')}>
                <option value="all">All</option>
                {Object.entries(LOSS_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="updated">Last updated</option>
                <option value="inspectionDate">Inspection date</option>
                <option value="claim">Claim #</option>
                <option value="completion">Least complete</option>
              </select>
            </label>
          </div>
        </div>
        <label className="checkline">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived inspections
        </label>
        {filtered.length === 0 ? (
          <Empty icon="mission">
            {inspections.length === 0 ? (
              <>
                No inspections yet. Create one, or load the fictional demo to explore every module.
              </>
            ) : (
              'No inspections match these filters.'
            )}
          </Empty>
        ) : (
          <div className="grid-3" style={{ marginTop: 10 }}>
            {filtered.map((r) => (
              <Link key={r.insp.id} to={`/i/${r.insp.id}/mission`} className="panel card-link insp-card" style={{ marginBottom: 0 }} data-testid="inspection-card">
                <div className="row between">
                  <strong style={{ color: 'var(--navy)' }}>{r.insp.claimNumber}</strong>
                  <Pill color={STATUS_COLORS[r.insp.status]}>{INSPECTION_STATUS_LABELS[r.insp.status]}</Pill>
                </div>
                <div className="wrap-anywhere">{r.insp.title}</div>
                <div className="meta">
                  {[r.insp.property.addressLine, r.insp.property.city].filter(Boolean).join(', ') || 'No address recorded'}
                </div>
                <div className="row" style={{ gap: 5 }}>
                  {r.insp.lossTypes.map((l) => (
                    <Pill key={l} color="blue">
                      {LOSS_TYPE_LABELS[l]}
                    </Pill>
                  ))}
                  {r.insp.archivedAt && <Pill color="amber">Archived</Pill>}
                  {r.insp.isDemo && <Pill color="purple">Demo</Pill>}
                </div>
                <Progress value={r.percent} label="Checklist completion" />
                <div className="meta row between">
                  <span>Checklist {r.percent}%</span>
                  <span>
                    {r.gaps} gaps · {r.followUps} follow-ups · {r.openFindings} QC
                  </span>
                </div>
                <div className="meta">Updated {timeAgo(r.insp.updatedAt)}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
