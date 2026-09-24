import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';

type ToastKind = 'pending' | 'done' | 'error';
export interface Notifier {
  show(kind: ToastKind, message: string): number;
  settle(id: number, kind: ToastKind, message: string): void;
}

// Sonner retains history. Never pass arbitrary IPC errors or item names to it.
const messages = new Set([
  'Saving…',
  'Saved to Bitwarden',
  'Could not save.',
  'Restoring…',
  'Restored to your vault',
  'Moving to Trash…',
  'Moved to Trash',
  'Could not update the item.',
  'Setting up Touch ID…',
  'Turning off Touch ID…',
  'Touch ID is on',
  'Touch ID is off',
  'Could not change Touch ID. Try again.',
  'Syncing with Bitwarden…',
  'Vault up to date',
  'Could not sync. Check your connection and try again.',
]);
const fallback = {
  pending: 'Working…',
  done: 'Done',
  error: 'Could not complete the action. Try again.',
};
let nextId = 0;
const toasterId = 'latch-vault';

function publish(id: number, kind: ToastKind, message: string, forget: () => void) {
  const title = messages.has(message) ? message : fallback[kind];
  const options = {
    id,
    toasterId,
    duration: kind === 'done' ? 3200 : Infinity,
    dismissible: true,
    onDismiss: forget,
    onAutoClose: forget,
  };
  if (kind === 'pending') toast.loading(title, options);
  else if (kind === 'done') toast.success(title, options);
  else toast.error(title, options);
}

/** Sonner owns the queue and timers. This adapter owns only the vault lifetime. */
export function useToasts() {
  const epoch = useRef(0);
  const alive = useRef(false);
  const owned = useRef(new Map<number, { epoch: number; pending: boolean }>());
  useLayoutEffect(() => {
    alive.current = true;
    const invalidate = () => {
      alive.current = false;
      epoch.current++;
      for (const id of owned.current.keys()) toast.dismiss(id);
      owned.current.clear();
    };
    const unsubscribe = window.latch.onState((state) => {
      if (state.status !== 'unlocked') invalidate();
    });
    return () => {
      invalidate();
      unsubscribe();
    };
  }, []);

  const show = useCallback((kind: ToastKind, message: string) => {
    if (!alive.current) return -1;
    const id = ++nextId;
    owned.current.set(id, { epoch: epoch.current, pending: kind === 'pending' });
    publish(id, kind, message, () => owned.current.delete(id));
    return id;
  }, []);
  const settle = useCallback((id: number, kind: ToastKind, message: string) => {
    const record = owned.current.get(id);
    if (!alive.current || !record?.pending || record.epoch !== epoch.current) return;
    // A dismissed pending notification must never reappear.
    if (!toast.getToasts().some((entry) => entry.id === id)) {
      owned.current.delete(id);
      return;
    }
    record.pending = kind === 'pending';
    publish(id, kind, message, () => owned.current.delete(id));
  }, []);
  return { show, settle };
}

// Toaster subscribes directly to Sonner, including when the queue is empty.
export function Toasts() {
  const [active, setActive] = useState(true);
  useLayoutEffect(
    () =>
      window.latch.onState((state) => {
        if (state.status !== 'unlocked') setActive(false);
      }),
    [],
  );
  return active ? (
    <Toaster
      id={toasterId}
      visibleToasts={3}
      position="bottom-right"
      toastOptions={{ closeButtonAriaLabel: 'Dismiss message' }}
    />
  ) : null;
}
