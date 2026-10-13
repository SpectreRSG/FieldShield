import { Link, useNavigate } from 'react-router-dom';
import type { TutorialId } from '../domain/models';
import { useStore } from '../state/store';
import { loadDemo } from '../state/demoLoader';
import { TOURS } from '../tutorial/steps';
import { useTutorial } from '../tutorial/Tutorial';
import { Icon, Logo } from '../components/Icon';
import { Notice, Pill, useToast } from '../components/ui';
import { lastInspectionId } from '../components/AppShell';

export function Help() {
  const store = useStore();
  const { tutorials, inspections, resetTutorial } = store;
  const { start } = useTutorial();
  const toast = useToast();
  const navigate = useNavigate();
  const hasInspection = inspections.some((i) => !i.archivedAt);

  const begin = async (id: TutorialId) => {
    let inspId = lastInspectionId();
    if (!inspId || !inspections.some((i) => i.id === inspId && !i.archivedAt)) {
      const first = inspections.find((i) => !i.archivedAt);
      inspId = first?.id ?? null;
    }
    if (!inspId) {
      const demo = await loadDemo(store);
      toast('Loaded the fictional demo inspection for the tutorial', 'ok');
      inspId = demo.id;
    }
    localStorage.setItem('fs-last-inspection', inspId);
    const tour = TOURS.find((t) => t.id === id)!;
    navigate(`/i/${inspId}/${tour.steps[0].path ?? id}`);
    setTimeout(() => start(id), 50);
  };

  return (
    <div className="mod-home">
      <section className="hero">
        <Logo size={56} />
        <div>
          <h1>FieldShield</h1>
          <p className="tagline">Inspect. Document. Verify.</p>
        </div>
      </section>

      <section className="panel">
        <h2>Interactive tutorials</h2>
        <p className="muted">
          Each tutorial highlights the real controls on screen. Use Next, Back, Skip or Restart at any time; some steps wait for you to tap the
          highlighted control.
          {!hasInspection && ' A fictional demo inspection will be loaded so you have something to explore.'}
        </p>
        <ul className="list">
          {TOURS.map((t) => {
            const p = tutorials.find((x) => x.id === t.id);
            return (
              <li key={t.id} className="row between">
                <div>
                  <strong>{t.title}</strong> <small>({t.steps.length} steps)</small>{' '}
                  {p && <Pill color={p.status === 'completed' ? 'green' : p.status === 'skipped' ? 'gray' : 'blue'}>{p.status.replace('_', ' ')}</Pill>}
                </div>
                <div className="row">
                  <button className="btn small primary" onClick={() => begin(t.id)} data-testid={`start-tour-${t.id}`}>
                    <Icon name="play" /> {p ? 'Restart' : 'Start'}
                  </button>
                  {p && (
                    <button className="btn small ghost" onClick={() => resetTutorial(t.id)}>
                      Reset
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel">
        <h2>How FieldShield works</h2>
        <ol>
          <li>Create an inspection (or load the fictional demo) from the dashboard.</li>
          <li>
            <strong>Mission Control</strong>: complete pre-inspection prep, work the checklist, add areas and observations.
          </li>
          <li>
            <strong>Measure</strong>: record roof planes, linear features and rooms; formulas and value sources are always shown.
          </li>
          <li>
            <strong>Photos</strong>: capture/import, classify, caption, link to observations; check coverage.
          </li>
          <li>
            <strong>Notes & Report</strong>: structured notes, consistency flags, then generate, edit and approve the report.
          </li>
          <li>
            <strong>Estimate QC</strong>: enter or import estimate lines, run checks, disposition each finding.
          </li>
          <li>
            <strong>Review & export</strong>: record the final review and download the combined package.
          </li>
        </ol>
      </section>

      <section className="panel">
        <h2>Your data</h2>
        <Notice kind="info">
          Everything you enter stays in this browser on this device (IndexedDB). FieldShield has no server, no account, no analytics and does not send
          inspection records or photos to any AI service. Exports are created on the device. Browser storage can be cleared — keep backups (
          <Link to="/settings">Settings</Link>).
        </Notice>
        <ul>
          <li>Use fictional or authorised information only. Confirm employer approvals, retention rules and security controls before real claim data is entered.</li>
          <li>FieldShield does not make coverage decisions, approve or deny claims, set settlement amounts or prescribe repairs.</li>
          <li>There is no Xactimate integration — quantities are for review and manual entry.</li>
          <li>Optional browser dictation may send audio to your browser vendor’s speech service; it is off until you enable it.</li>
        </ul>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Works offline after the first visit (installed as a Progressive Web App). Version 1.0.0.
        </p>
      </section>
    </div>
  );
}
