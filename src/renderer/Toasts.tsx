import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, RefreshCw, X } from 'lucide-react';

export type ToastKind = 'pending' | 'done' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

/** Starts a message for an action in progress, then gives it its outcome. */
export interface Notifier {
  show(kind: ToastKind, message: string): number;
  settle(id: number, kind: ToastKind, message: string): void;
}

const LINGER_MS = 3_200;
const MAX_VISIBLE = 3;

/**
 * Transient messages for actions that finish out of sight, such as a save that
 * closes its editor. A pending message stays until its action settles, so a
 * slow save is never silent.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const fade = useCallback(
    (id: number) => {
      clearTimeout(timers.current.get(id));
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), LINGER_MS),
      );
    },
    [dismiss],
  );

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, kind, message }].slice(-MAX_VISIBLE));
      if (kind !== 'pending') fade(id);
      return id;
    },
    [fade],
  );

  const settle = useCallback(
    (id: number, kind: ToastKind, message: string) => {
      setToasts((current) =>
        current.map((toast) => (toast.id === id ? { ...toast, kind, message } : toast)),
      );
      fade(id);
    },
    [fade],
  );

  return { toasts, show, settle, dismiss };
}

export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (!toasts.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          {toast.kind === 'pending' ? (
            <span className="spinning">
              <RefreshCw size={13} />
            </span>
          ) : toast.kind === 'done' ? (
            <Check size={13} />
          ) : (
            <AlertCircle size={13} />
          )}
          <span>{toast.message}</span>
          {toast.kind !== 'pending' && (
            <button
              type="button"
              className="icon-button"
              aria-label="Dismiss message"
              onClick={() => onDismiss(toast.id)}
            >
              <X size={11} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
