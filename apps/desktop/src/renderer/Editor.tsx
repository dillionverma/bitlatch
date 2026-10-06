import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Eye, EyeSlash as EyeOff, X } from '@phosphor-icons/react';
import type { ItemDetail, ItemDraft, UriDraft } from '@latch/shared/types';
import { itemDraft, uriMatchOptions } from '@latch/shared/item-drafts';
import { uriMatchSchema } from '@latch/shared/protocol';
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
import { PasswordGenerator } from './PasswordGenerator';
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
  const [initial] = useState<ItemDraft>(() =>
    item
      ? itemDraft(item)
      : { type: 1, name: '', username: '', password: '', uris: [], notes: '', favorite: false },
  );
  const [draft, setDraft] = useState(initial);
  const isNote = draft.type === 2;
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState('');
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
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
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
  function update(key: 'name' | 'notes', value: string): void;
  function update(key: 'favorite', value: boolean): void;
  function update(key: 'name' | 'notes' | 'favorite', value: string | boolean) {
    setDraft((current) =>
      key === 'favorite' && typeof value === 'boolean'
        ? { ...current, favorite: value }
        : key !== 'favorite' && typeof value === 'string'
          ? { ...current, [key]: value }
          : current,
    );
  }
  function loginField(key: 'username' | 'password', value: string) {
    setDraft((current) => (current.type === 1 ? { ...current, [key]: value } : current));
  }
  function uriRows(change: (rows: UriDraft[]) => UriDraft[]) {
    setDraft((current) =>
      current.type === 1 ? { ...current, uris: change(current.uris) } : current,
    );
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
            {item
              ? isNote
                ? 'Edit secure note'
                : 'Edit login'
              : isNote
                ? 'New secure note'
                : 'New login'}
          </DialogTitle>
          <DialogDescription>Saved in your personal Bitwarden vault.</DialogDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="task-close"
            aria-label="Close editor"
            onClick={close}
            disabled={busy}
          >
            <X />
          </Button>
        </DialogHeader>
        <form
          className="task-form"
          onSubmit={(event) => void save(event)}
          aria-busy={busy}
          aria-describedby={error ? 'editor-error' : undefined}
        >
          <div className="task-body">
            <FieldGroup>
              {!item && (
                <Field>
                  <FieldLabel htmlFor="editor-type">Item type</FieldLabel>
                  <select
                    id="editor-type"
                    value={draft.type}
                    disabled={busy}
                    onChange={(event) => {
                      if (event.target.value === '2')
                        setDraft({
                          type: 2,
                          name: draft.name,
                          notes: draft.notes,
                          favorite: draft.favorite,
                        });
                      else
                        setDraft({
                          type: 1,
                          name: draft.name,
                          notes: draft.notes,
                          favorite: draft.favorite,
                          username: '',
                          password: '',
                          uris: [],
                        });
                    }}
                  >
                    <option value="1">Login</option>
                    <option value="2">Secure note</option>
                  </select>
                </Field>
              )}
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
                  {draft.type === 1 && (
                    <Field>
                      <FieldLabel>Websites</FieldLabel>
                      {draft.uris.map((row, index) => (
                        <div key={index} className="task-uri-row">
                          {row.action === 'keep' ? (
                            <p className="text-xs text-muted-foreground">
                              {item?.uris[row.sourceIndex]?.uri ?? 'Empty imported URI'}. Imported
                              matching rule is preserved. Edit it in Bitwarden or remove this row.
                            </p>
                          ) : (
                            <>
                              <Input
                                aria-label={`Website ${index + 1}`}
                                value={row.uri}
                                placeholder="https://example.com"
                                maxLength={2048}
                                disabled={busy}
                                onChange={(event) =>
                                  uriRows((rows) =>
                                    rows.map((entry, i) =>
                                      i === index ? { ...row, uri: event.target.value } : entry,
                                    ),
                                  )
                                }
                              />
                              <select
                                aria-label={`Match rule ${index + 1}`}
                                value={row.match === null ? '' : String(row.match)}
                                disabled={busy}
                                onChange={(event) => {
                                  const match = uriMatchSchema.parse(
                                    event.target.value === '' ? null : Number(event.target.value),
                                  );
                                  uriRows((rows) =>
                                    rows.map((entry, i) =>
                                      i === index ? { ...row, match } : entry,
                                    ),
                                  );
                                }}
                              >
                                {uriMatchOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => uriRows((rows) => rows.filter((_, i) => i !== index))}
                          >
                            Remove website
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          uriRows((rows) => [...rows, { action: 'write', uri: '', match: null }])
                        }
                      >
                        Add website
                      </Button>
                    </Field>
                  )}
                  <Field>
                    <FieldLabel htmlFor="editor-username">Username</FieldLabel>
                    <Input
                      id="editor-username"
                      value={draft.type === 1 ? draft.username : ''}
                      onChange={(event) => loginField('username', event.target.value)}
                      autoComplete="off"
                      disabled={busy}
                    />
                  </Field>
                  <Field>
                    <div className="task-label-actions">
                      <FieldLabel htmlFor="editor-password">Password</FieldLabel>
                      <PasswordGenerator
                        disabled={busy}
                        onUse={(password) => loginField('password', password)}
                      />
                    </div>
                    <InputGroup>
                      <InputGroupInput
                        id="editor-password"
                        type={revealed ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={draft.type === 1 ? draft.password : ''}
                        onChange={(event) => loginField('password', event.target.value)}
                        disabled={busy}
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
            <Button type="button" variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? <Spinner /> : <Check data-icon="inline-start" />}
              {busy ? 'Saving…' : isNote ? 'Save note' : 'Save login'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
