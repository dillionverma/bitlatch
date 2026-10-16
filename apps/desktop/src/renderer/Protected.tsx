import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LockKey as LockKeyhole } from '@phosphor-icons/react';
import type { ItemDetail, ItemSummary } from '@latch/shared/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

/** Asks for the master password before an item marked for re-prompt opens, as Bitwarden does. */
export function Protected({
  item,
  onOpened,
}: {
  item: ItemSummary;
  onOpened: (detail: ItemDetail) => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const working = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const input = useRef<HTMLInputElement>(null);
  // The field is disabled while the password is checked; give focus back for a retry.
  useEffect(() => {
    if (!busy) input.current?.focus();
  }, [busy]);
  async function open(event: FormEvent) {
    event.preventDefault();
    if (working.current || !password) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await window.latch.openProtected(item.id, password);
      // A reply that arrives after this form closed belongs to an earlier visit.
      if (!mounted.current) return;
      setPassword('');
      if (result.ok) {
        onOpened(result.value);
        return;
      }
      setError(result.error);
    } catch {
      if (!mounted.current) return;
      setPassword('');
      setError('Could not open this item. Try again.');
    }
    working.current = false;
    setBusy(false);
  }
  return (
    <Empty className="workspace-detail-empty">
      <EmptyHeader>
        <EmptyMedia>
          <LockKeyhole size={24} />
        </EmptyMedia>
        <EmptyTitle>{item.name}</EmptyTitle>
        <EmptyDescription>Enter your master password to open this item.</EmptyDescription>
      </EmptyHeader>
      <form className="protected-form" onSubmit={(event) => void open(event)} aria-busy={busy}>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="protected-password">Master password</FieldLabel>
          <Input
            ref={input}
            id="protected-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
            disabled={busy}
            aria-invalid={!!error}
            aria-describedby={error ? 'protected-error' : undefined}
          />
          {error && <FieldError id="protected-error">{error}</FieldError>}
        </Field>
        <Button type="submit" disabled={busy || !password} aria-busy={busy}>
          {busy && <Spinner />}
          {busy ? 'Checking…' : 'Open item'}
        </Button>
      </form>
    </Empty>
  );
}
