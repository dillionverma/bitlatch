import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import {
  Check,
  Eye,
  EyeSlash as EyeOff,
  ArrowsClockwise as RefreshCw,
  X,
} from '@phosphor-icons/react';
import type { ItemDetail, LoginDraft } from '../shared/types';
import type { Notifier } from './Toasts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from '@/components/ui/input-group';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldGroup, FieldLabel, FieldError } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import './tasks.css';

export function Editor({
  item,
  onClose,
  onSaved,
  notify,
}: {
  item: ItemDetail | null;
  onClose: () => void;
  onSaved: (item: ItemDetail) => void;
  notify: Notifier;
}) {
  const isNote = item?.type === 2;
  const [initial] = useState<LoginDraft>(() =>
    item
      ? {
          id: item.id,
          revisionDate: item.revisionDate,
          name: item.name,
          username: item.username,
          password: item.password,
          website: item.website,
          notes: item.notes,
          favorite: item.favorite,
        }
      : { name: '', username: '', password: '', website: '', notes: '', favorite: false },
  );
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [discarding, setDiscarding] = useState(false);
  const [active, setActive] = useState(true);
  const alive = useRef(false);
  const epoch = useRef(0);
  const operation = useRef(false);
  const returnFocus = useRef(document.activeElement);
  const nameInput = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    alive.current = true;
    const unsubscribe = window.latch.onState((state) => {
      if (state.status !== 'unlocked') {
        alive.current = false;
        epoch.current++;
        setActive(false);
      }
    });
    return () => {
      alive.current = false;
      epoch.current++;
      unsubscribe();
    };
  }, []);
  const dirty = (Object.keys(draft) as (keyof LoginDraft)[]).some(
    (key) => draft[key] !== initial[key],
  );
  async function close() {
    if (operation.current || !alive.current) return;
    if (!dirty) {
      onClose();
      return;
    }
    operation.current = true;
    setDiscarding(true);
    const request = ++epoch.current;
    try {
      const result = await window.latch.confirm('discard');
      if (!alive.current || request !== epoch.current) return;
      if (!result.ok) setError(result.error);
      else if (result.value) onClose();
    } catch {
      if (alive.current && request === epoch.current)
        setError('Could not show confirmation. Try again.');
    } finally {
      if (alive.current && request === epoch.current) {
        operation.current = false;
        setDiscarding(false);
      }
    }
  }
  function update<K extends keyof LoginDraft>(key: K, value: LoginDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (operation.current || !alive.current) return;
    operation.current = true;
    const request = ++epoch.current;
    setBusy(true);
    setError('');
    const pending = notify.show('pending', 'Saving…');
    try {
      const response = await window.latch.save(draft);
      if (!alive.current || request !== epoch.current) return;
      if (response.ok) {
        notify.settle(pending, 'done', 'Saved to Bitwarden');
        onSaved(response.value);
      } else {
        notify.settle(pending, 'error', 'Could not save.');
        setError(response.error);
      }
    } catch {
      if (alive.current && request === epoch.current) {
        notify.settle(pending, 'error', 'Could not save.');
        setError('Could not save. Try again.');
      }
    } finally {
      if (alive.current && request === epoch.current) {
        operation.current = false;
        setBusy(false);
      }
    }
  }
  async function generate() {
    if (operation.current || !alive.current) return;
    operation.current = true;
    const request = ++epoch.current;
    setGenerating(true);
    setGenerationError('');
    try {
      const response = await window.latch.generate();
      if (!alive.current || request !== epoch.current) return;
      if (response.ok) update('password', response.value);
      else setGenerationError(response.error);
    } catch {
      if (alive.current && request === epoch.current)
        setGenerationError('Could not generate a password. Try again.');
    } finally {
      if (alive.current && request === epoch.current) {
        operation.current = false;
        setGenerating(false);
      }
    }
  }
  if (!active) return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void close();
      }}
    >
      <DialogContent
        className="task-dialog"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          nameInput.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocus.current;
          if (
            target instanceof HTMLElement &&
            target !== document.body &&
            target.isConnected &&
            target.getClientRects().length
          )
            target.focus();
          else
            document
              .querySelector<HTMLElement>('#auth-password, [aria-label="Search vault"]')
              ?.focus();
        }}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          if (!discarding) void close();
        }}
      >
        <DialogHeader className="task-header">
          <DialogTitle>
            {item ? (isNote ? 'Edit secure note' : 'Edit login') : 'New login'}
          </DialogTitle>
          <DialogDescription>Saved in your personal Bitwarden vault.</DialogDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="task-close"
            aria-label="Close editor"
            onClick={close}
            disabled={busy || generating}
          >
            <X />
          </Button>
        </DialogHeader>
        <form
          className="task-form"
          onSubmit={(event) => void save(event)}
          aria-busy={busy || generating}
          aria-describedby={error ? 'editor-error' : undefined}
        >
          <div className="task-body">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="editor-name">Name</FieldLabel>
                <Input
                  ref={nameInput}
                  id="editor-name"
                  value={draft.name}
                  onChange={(event) => update('name', event.target.value)}
                  required
                  maxLength={500}
                  disabled={busy}
                />
              </Field>
              {!isNote && (
                <>
                  <Field>
                    <FieldLabel htmlFor="editor-website">Website</FieldLabel>
                    <Input
                      id="editor-website"
                      type="url"
                      value={draft.website}
                      onChange={(event) => update('website', event.target.value)}
                      placeholder="https://example.com"
                      disabled={busy}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="editor-username">Username</FieldLabel>
                    <Input
                      id="editor-username"
                      value={draft.username}
                      onChange={(event) => update('username', event.target.value)}
                      autoComplete="off"
                      disabled={busy}
                    />
                  </Field>
                  <Field data-invalid={!!generationError}>
                    <div className="task-label-actions">
                      <FieldLabel htmlFor="editor-password">Password</FieldLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void generate()}
                        disabled={busy || generating}
                        aria-busy={generating}
                      >
                        {generating ? <Spinner /> : <RefreshCw data-icon="inline-start" />}
                        {generating ? 'Generating…' : 'Generate'}
                      </Button>
                    </div>
                    <InputGroup>
                      <InputGroupInput
                        id="editor-password"
                        type={revealed ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={draft.password}
                        onChange={(event) => update('password', event.target.value)}
                        disabled={busy || generating}
                        aria-invalid={!!generationError}
                        aria-describedby={generationError ? 'generation-error' : undefined}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          size="icon-sm"
                          aria-label={revealed ? 'Hide password' : 'Reveal password'}
                          aria-pressed={revealed}
                          onClick={() => setRevealed(!revealed)}
                          disabled={busy}
                        >
                          {revealed ? <EyeOff /> : <Eye />}
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                    {generationError && (
                      <FieldError id="generation-error">{generationError}</FieldError>
                    )}
                  </Field>
                </>
              )}
              <Field>
                <FieldLabel htmlFor="editor-notes">Notes</FieldLabel>
                <Textarea
                  id="editor-notes"
                  className="task-notes"
                  data-note={isNote}
                  rows={isNote ? 9 : 3}
                  value={draft.notes}
                  onChange={(event) => update('notes', event.target.value)}
                  disabled={busy}
                />
              </Field>
              <Field orientation="horizontal">
                <FieldLabel id="editor-favorite-label" htmlFor="editor-favorite">
                  Favorite
                </FieldLabel>
                <Switch
                  id="editor-favorite"
                  aria-labelledby="editor-favorite-label"
                  checked={draft.favorite}
                  onCheckedChange={(value) => update('favorite', value)}
                  disabled={busy}
                />
              </Field>
              {error && <FieldError id="editor-error">{error}</FieldError>}
            </FieldGroup>
          </div>
          <DialogFooter className="task-footer">
            <Button type="button" variant="outline" onClick={close} disabled={busy || generating}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || generating} aria-busy={busy}>
              {busy ? <Spinner /> : <Check data-icon="inline-start" />}
              {busy ? 'Saving…' : isNote ? 'Save note' : 'Save login'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
