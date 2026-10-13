/** Shared UI building blocks. */
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Dim, LengthUnit } from '../domain/models';
import { dimToInput, parseLength } from '../services/units';
import { Icon } from './Icon';

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'ok' | 'error';
}
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------------------
// Modal and confirmation
// ---------------------------------------------------------------------------
export function Modal({
  title,
  onClose,
  children,
  wide,
  footer
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="btn ghost icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {children}
        {footer && <div className="row end" style={{ marginTop: 14 }}>{footer}</div>}
      </div>
    </div>
  );
}

interface ConfirmOpts {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <Modal
          title={state.title}
          onClose={() => close(false)}
          footer={
            <>
              <button className="btn" onClick={() => close(false)}>
                Cancel
              </button>
              <button className={`btn ${state.danger ? 'danger solid' : 'primary'}`} onClick={() => close(true)} data-testid="confirm-ok">
                {state.confirmLabel ?? 'Confirm'}
              </button>
            </>
          }
        >
          <div>{state.message}</div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

// ---------------------------------------------------------------------------
// Small display pieces
// ---------------------------------------------------------------------------
export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'Progress'}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: value >= 100 ? 'var(--green)' : value >= 50 ? 'var(--blue)' : 'var(--orange)' }} />
    </div>
  );
}

export function Pill({ color = 'gray', children }: { color?: string; children: ReactNode }) {
  return <span className={`pill ${color}`}>{children}</span>;
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  const icon = kind === 'ok' ? 'check' : kind === 'info' ? 'info' : 'warn';
  return (
    <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <Icon name={icon} />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ icon = 'info', children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <div>{children}</div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label
}: {
  tabs: { id: T; label: ReactNode; tour?: string }[];
  value: T;
  onChange: (t: T) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" className="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} data-tour={t.tour}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
  multi,
  label
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
  multi?: boolean;
  label: string;
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            type="button"
            key={o.value}
            className="chip"
            aria-pressed={on}
            onClick={() => onChange(multi ? (on ? value.filter((v) => v !== o.value) : [...value, o.value]) : [o.value])}
          >
            {on && <Icon name="check" size={15} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * Length input that accepts field shorthand (12'6", 150in, 3.8m). Shows an inline
 * error and never commits an invalid value. An empty field means "not recorded".
 */
export function LengthInput({
  label,
  value,
  onCommit,
  defaultUnit,
  hint,
  testId,
  required
}: {
  label: string;
  value: Dim | undefined;
  onCommit: (d: Dim | undefined) => void;
  defaultUnit: LengthUnit;
  hint?: string;
  testId?: string;
  required?: boolean;
}) {
  const [text, setText] = useState(dimToInput(value));
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  useEffect(() => {
    setText(dimToInput(value));
    setError(null);
  }, [value?.value, value?.unit]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    if (text.trim() === '') {
      setError(null);
      if (value !== undefined) onCommit(undefined);
      return;
    }
    const r = parseLength(text, defaultUnit);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    if (!value || r.dim.value !== value.value || r.dim.unit !== value.unit) onCommit(r.dim);
  };
  return (
    <label className="field" htmlFor={id}>
      <span>
        {label}
        {required && !value && <span className="hint"> · not recorded</span>}
      </span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder={defaultUnit === 'm' ? 'e.g. 3.8' : `e.g. 12'6" or 12.5`}
        value={text}
        className={error ? 'invalid' : ''}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        aria-invalid={!!error}
        data-testid={testId}
      />
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

/** Text input that saves on blur (avoids a database write per keystroke). */
export function BlurInput({
  label,
  value,
  onCommit,
  multiline,
  placeholder,
  testId,
  type = 'text'
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  testId?: string;
  type?: 'text' | 'date';
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => text !== value && onCommit(text);
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit} data-testid={testId} />
      ) : (
        <input
          type={type}
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            if (type === 'date') onCommit(e.target.value);
          }}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          data-testid={testId}
        />
      )}
    </label>
  );
}

export function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Keep unsent text (e.g. a note being typed) across a refresh or crash. */
export function useDraft(key: string, initial = ''): [string, (v: string) => void, () => void] {
  const [v, setV] = useState<string>(() => {
    try {
      return localStorage.getItem(`fs-draft:${key}`) ?? initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (nv: string) => {
      setV(nv);
      try {
        if (nv) localStorage.setItem(`fs-draft:${key}`, nv);
        else localStorage.removeItem(`fs-draft:${key}`);
      } catch {
        /* storage unavailable: draft just isn't preserved */
      }
    },
    [key]
  );
  const clear = useCallback(() => set(''), [set]);
  return [v, set, clear];
}
