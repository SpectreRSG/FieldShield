/**
 * Interactive tutorial engine. Highlights real application elements, points an
 * animated arrow at them, and re-measures on every resize/scroll/layout change.
 * The overlay ignores pointer events, so every control stays usable.
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useMatch, useNavigate } from 'react-router-dom';
import type { TutorialId } from '../domain/models';
import { nowIso } from '../domain/ids';
import { useStore } from '../state/store';
import { lastInspectionId } from '../components/AppShell';
import { TOURS, type TourStep } from './steps';

interface TutorialCtx {
  start(id: TutorialId, fromStep?: number): void;
  active: { id: TutorialId; step: number } | null;
}
const Ctx = createContext<TutorialCtx>({ start: () => undefined, active: null });
export const useTutorial = () => useContext(Ctx);

function findTarget(step: TourStep): HTMLElement | null {
  const sels = Array.isArray(step.target) ? step.target : [step.target];
  for (const sel of sels) {
    const els = [...document.querySelectorAll<HTMLElement>(sel)];
    const visible = els.find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    });
    if (visible) return visible;
  }
  return null;
}

interface Layout {
  spot: { top: number; left: number; width: number; height: number } | null;
  arrow: { top: number; left: number; rotate: number } | null;
  card: { top: number; left: number };
}

const CARD_W = 360;
const GAP = 14;

export function computeLayout(rect: DOMRect | null, vw: number, vh: number, cardH: number): Layout {
  const cardW = Math.min(vw * 0.92, CARD_W);
  if (!rect) return { spot: null, arrow: null, card: { top: Math.max(12, vh / 2 - cardH / 2), left: (vw - cardW) / 2 } };
  const pad = 6;
  const spot = { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
  const centerX = rect.left + rect.width / 2;
  const below = rect.top + rect.height / 2 < vh / 2; // target in upper half → card below it
  const arrowSize = 44;
  let arrow: Layout['arrow'];
  let cardTop: number;
  if (below) {
    arrow = { top: spot.top + spot.height + 4, left: centerX - arrowSize / 2, rotate: 0 };
    cardTop = arrow.top + arrowSize + GAP / 2;
  } else {
    arrow = { top: spot.top - arrowSize - 4, left: centerX - arrowSize / 2, rotate: 180 };
    cardTop = arrow.top - cardH - GAP / 2;
  }
  // Keep the card on screen; if it would cover the target, drop the arrow and park the card at the far edge.
  cardTop = Math.max(8, Math.min(vh - cardH - 8, cardTop));
  const overlaps = cardTop < spot.top + spot.height && cardTop + cardH > spot.top;
  if (overlaps) {
    cardTop = below ? vh - cardH - 8 : 8;
  }
  const left = Math.max(8, Math.min(vw - cardW - 8, centerX - cardW / 2));
  arrow.left = Math.max(4, Math.min(vw - arrowSize - 4, arrow.left));
  return { spot, arrow, card: { top: cardTop, left } };
}

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<{ id: TutorialId; step: number } | null>(null);
  const { setTutorial, inspections } = useStore();
  const navigate = useNavigate();
  const match = useMatch('/i/:id/*');
  const location = useLocation();
  const inspId = match?.params.id ?? lastInspectionId() ?? inspections.find((i) => !i.archivedAt)?.id ?? null;

  const save = useCallback(
    (id: TutorialId, status: 'in_progress' | 'completed' | 'skipped', step: number) => setTutorial({ id, status, lastStep: step, updatedAt: nowIso() }),
    [setTutorial]
  );

  const start = useCallback(
    (id: TutorialId, fromStep = 0) => {
      setActive({ id, step: fromStep });
      save(id, 'in_progress', fromStep);
    },
    [save]
  );

  // Navigate to the step's page when needed.
  const tour = active ? TOURS.find((t) => t.id === active.id)! : null;
  const step = tour && active ? tour.steps[active.step] : null;
  useEffect(() => {
    if (!step?.path || !inspId) return;
    const [p, q] = step.path.split('?');
    const want = `/i/${inspId}/${p}`;
    const wantTab = q ? new URLSearchParams(q).get('tab') : null;
    const haveTab = new URLSearchParams(location.search).get('tab');
    if (location.pathname !== want || (wantTab && haveTab !== wantTab && !step.advanceOn)) navigate(`${want}${q ? `?${q}` : ''}`);
  }, [step, inspId]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (n: number) => {
    if (!active || !tour) return;
    if (n >= tour.steps.length) {
      save(active.id, 'completed', tour.steps.length - 1);
      setActive(null);
      return;
    }
    const s = Math.max(0, n);
    setActive({ id: active.id, step: s });
    save(active.id, 'in_progress', s);
  };

  return (
    <Ctx.Provider value={{ start, active }}>
      {children}
      {active && tour && step && (
        <Overlay
          key={`${active.id}-${active.step}`}
          step={step}
          index={active.step}
          total={tour.steps.length}
          title={tour.title}
          accent={tour.accent}
          noInspection={!inspId}
          onNext={() => go(active.step + 1)}
          onBack={() => go(active.step - 1)}
          onRestart={() => go(0)}
          onSkip={() => {
            save(active.id, 'skipped', active.step);
            setActive(null);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

function Overlay({
  step,
  index,
  total,
  title,
  accent,
  noInspection,
  onNext,
  onBack,
  onRestart,
  onSkip
}: {
  step: TourStep;
  index: number;
  total: number;
  title: string;
  accent: string;
  noInspection: boolean;
  onNext: () => void;
  onBack: () => void;
  onRestart: () => void;
  onSkip: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [found, setFound] = useState(true);
  const scrolled = useRef(false);

  const measure = useCallback(() => {
    const el = findTarget(step);
    setFound(!!el);
    if (el && !scrolled.current) {
      scrolled.current = true;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
    const cardH = cardRef.current?.offsetHeight ?? 200;
    const next = computeLayout(el ? el.getBoundingClientRect() : null, window.innerWidth, window.innerHeight, cardH);
    setLayout((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [step]);

  // Re-measure continuously (cheap) so the overlay follows layout changes, scrolling and rotation.
  useLayoutEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (t - last > 120) {
        last = t;
        measure();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  // Action-driven progression: advance when the user uses the highlighted control.
  useEffect(() => {
    if (step.advanceOn !== 'click') return;
    let el: HTMLElement | null = null;
    const handler = () => setTimeout(onNext, 150);
    const attach = () => {
      const t = findTarget(step);
      if (t && t !== el) {
        el?.removeEventListener('click', handler);
        el = t;
        el.addEventListener('click', handler);
      }
    };
    attach();
    const iv = setInterval(attach, 300);
    return () => {
      clearInterval(iv);
      el?.removeEventListener('click', handler);
    };
  }, [step, onNext]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSkip]);

  return (
    <div aria-live="polite">
      {layout?.spot && <div className="tour-spot" style={layout.spot} data-testid="tour-spot" />}
      {layout?.arrow && (
        <div className="tour-arrow" style={{ top: layout.arrow.top, left: layout.arrow.left, transform: `rotate(${layout.arrow.rotate}deg)` }} data-testid="tour-arrow">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2 L20 12 H15 V22 H9 V12 H4 Z" />
          </svg>
        </div>
      )}
      <div
        ref={cardRef}
        className="tour-card"
        role="dialog"
        aria-label={`${title} tutorial`}
        style={{ top: layout?.card.top ?? -9999, left: layout?.card.left ?? 0, ['--accent' as string]: accent }}
        data-testid="tour-card"
      >
        <div className="step">
          {title} · Step {index + 1} of {total}
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        {noInspection && <div className="waiting">Open or create an inspection (or load the demo) to follow along.</div>}
        {!found && !noInspection && <div className="waiting">This control isn’t visible on the current screen — tap Next to continue.</div>}
        {step.advanceOn === 'click' && found && <div className="waiting">Try it: tap the highlighted control.</div>}
        <div className="row between">
          <div className="row" style={{ gap: 6 }}>
            <button className="btn small ghost" onClick={onSkip} data-testid="tour-skip">
              Skip
            </button>
            <button className="btn small ghost" onClick={onRestart}>
              Restart
            </button>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn small" onClick={onBack} disabled={index === 0} data-testid="tour-back">
              Back
            </button>
            <button className="btn small primary" onClick={onNext} data-testid="tour-next">
              {index === total - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
