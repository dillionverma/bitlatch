import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Eye, EyeSlash as EyeOff, X } from '@phosphor-icons/react';
import type {
  CardFields,
  CustomFieldDraft,
  Folder,
  IdentityFields,
  ItemDetail,
  ItemDraft,
  UriDraft,
} from '@latch/shared/types';
import {
  cardBrands,
  emptyCard,
  emptyIdentity,
  itemDraft,
  uriMatchOptions,
} from '@latch/shared/item-drafts';
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

type DraftBase = Pick<ItemDraft, 'name' | 'notes' | 'favorite' | 'folderId' | 'fields'>;
const draftTypes: Record<
  ItemDraft['type'],
  { label: string; save: string; empty: (base: DraftBase) => ItemDraft; creatable?: false }
> = {
  1: {
    label: 'Login',
    save: 'Save login',
    empty: (base) => ({ ...base, type: 1, username: '', password: '', uris: [] }),
  },
  2: {
    label: 'Secure note',
    save: 'Save note',
    empty: (base) => ({ ...base, type: 2 }),
  },
  3: {
    label: 'Card',
    save: 'Save card',
    empty: (base) => ({ ...base, type: 3, card: emptyCard }),
  },
  4: {
    label: 'Identity',
    save: 'Save identity',
    empty: (base) => ({ ...base, type: 4, identity: emptyIdentity }),
  },
  // SSH keys come from Bitwarden with their key pair; here only their shared fields change.
  5: {
    label: 'SSH key',
    save: 'Save SSH key',
    empty: (base) => ({ ...base, type: 5 }),
    creatable: false,
  },
};
const identityLabels: Record<keyof IdentityFields, string> = {
  title: 'Title',
  firstName: 'First name',
  middleName: 'Middle name',
  lastName: 'Last name',
  username: 'Username',
  company: 'Company',
  email: 'Email',
  phone: 'Phone',
  ssn: 'Social Security number',
  passportNumber: 'Passport number',
  licenseNumber: 'License number',
  address1: 'Address 1',
  address2: 'Address 2',
  address3: 'Address 3',
  city: 'City',
  state: 'State or province',
  postalCode: 'Postal code',
  country: 'Country',
};
const fieldKindOptions = [
  { value: 'text', label: 'Text' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'boolean', label: 'Checkbox' },
] as const;
const brandOptions = cardBrands.map((brand) => ({ value: brand, label: brand }));
const monthName = new Intl.DateTimeFormat(undefined, { month: 'long' });
const monthOptions = Array.from({ length: 12 }, (_, index) => {
  const month = String(index + 1);
  return {
    value: month,
    label: `${month.padStart(2, '0')} - ${monthName.format(new Date(2000, index))}`,
  };
});

export function Editor({
  item,
  folders,
  folderId = null,
  onClose,
  onSaved,
  notify,
}: {
  item: ItemDetail | null;
  folders: Folder[];
  /** The folder a new item starts in. */
  folderId?: string | null;
  onClose: () => void;
  onSaved: (item: ItemDetail) => void;
  notify: Notifier;
}) {
  const [initial] = useState<ItemDraft>(() =>
    item
      ? itemDraft(item)
      : {
          type: 1,
          name: '',
          username: '',
          password: '',
          uris: [],
          notes: '',
          favorite: false,
          folderId,
          fields: [],
        },
  );
  const [draft, setDraft] = useState(initial);
  const isNote = draft.type === 2;
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [codeRevealed, setCodeRevealed] = useState(false);
  const [revealedFields, setRevealedFields] = useState<ReadonlySet<number>>(new Set());
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
  function cardField(key: keyof CardFields, value: string) {
    setDraft((current) =>
      current.type === 3 ? { ...current, card: { ...current.card, [key]: value } } : current,
    );
  }
  function identityField(key: keyof IdentityFields, value: string) {
    setDraft((current) =>
      current.type === 4
        ? { ...current, identity: { ...current.identity, [key]: value } }
        : current,
    );
  }
  function fieldRows(change: (rows: CustomFieldDraft[]) => CustomFieldDraft[]) {
    setDraft((current) => ({ ...current, fields: change(current.fields ?? []) }));
  }
  function fieldRow(
    index: number,
    change: Partial<Extract<CustomFieldDraft, { action: 'write' }>>,
  ) {
    fieldRows((rows) =>
      rows.map((row, i) => (i === index && row.action === 'write' ? { ...row, ...change } : row)),
    );
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
            {item ? 'Edit' : 'New'} {draftTypes[draft.type].label.toLowerCase()}
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
                      const type = Number(event.target.value) as ItemDraft['type'];
                      setDraft(
                        draftTypes[type].empty({
                          name: draft.name,
                          notes: draft.notes,
                          favorite: draft.favorite,
                          folderId: draft.folderId,
                          fields: draft.fields,
                        }),
                      );
                    }}
                  >
                    {Object.entries(draftTypes)
                      .filter(([, { creatable }]) => creatable !== false)
                      .map(([type, { label }]) => (
                        <option key={type} value={type}>
                          {label}
                        </option>
                      ))}
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
              <Field>
                <FieldLabel htmlFor="editor-folder">Folder</FieldLabel>
                <select
                  id="editor-folder"
                  value={draft.folderId ?? ''}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, folderId: event.target.value || null }))
                  }
                >
                  <option value="">No folder</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </Field>
              {draft.type === 4 &&
                (Object.keys(identityLabels) as (keyof IdentityFields)[]).map((key) => (
                  <Field key={key}>
                    <FieldLabel htmlFor={`editor-identity-${key}`}>
                      {identityLabels[key]}
                    </FieldLabel>
                    <Input
                      id={`editor-identity-${key}`}
                      value={draft.identity[key]}
                      onChange={(event) => identityField(key, event.target.value)}
                      autoComplete="off"
                      maxLength={16_384}
                      disabled={busy}
                    />
                  </Field>
                ))}
              {draft.type === 1 && (
                <>
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
                                  rows.map((entry, i) => (i === index ? { ...row, match } : entry)),
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
                  <Field>
                    <FieldLabel htmlFor="editor-username">Username</FieldLabel>
                    <Input
                      id="editor-username"
                      value={draft.username}
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
                        value={draft.password}
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
              {draft.type === 3 && (
                <>
                  <Field>
                    <FieldLabel htmlFor="editor-cardholder">Cardholder name</FieldLabel>
                    <Input
                      id="editor-cardholder"
                      value={draft.card.cardholderName}
                      onChange={(event) => cardField('cardholderName', event.target.value)}
                      autoComplete="off"
                      disabled={busy}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="editor-brand">Brand</FieldLabel>
                    <select
                      id="editor-brand"
                      value={draft.card.brand}
                      disabled={busy}
                      onChange={(event) => cardField('brand', event.target.value)}
                    >
                      {choices(brandOptions, draft.card.brand)}
                    </select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="editor-number">Number</FieldLabel>
                    <Input
                      id="editor-number"
                      inputMode="numeric"
                      value={draft.card.number}
                      onChange={(event) => cardField('number', event.target.value)}
                      autoComplete="off"
                      disabled={busy}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="editor-exp-month">Expiration month</FieldLabel>
                    <select
                      id="editor-exp-month"
                      value={draft.card.expMonth}
                      disabled={busy}
                      onChange={(event) => cardField('expMonth', event.target.value)}
                    >
                      {choices(monthOptions, draft.card.expMonth)}
                    </select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="editor-exp-year">Expiration year</FieldLabel>
                    <Input
                      id="editor-exp-year"
                      inputMode="numeric"
                      placeholder="YYYY"
                      value={draft.card.expYear}
                      onChange={(event) => cardField('expYear', event.target.value)}
                      autoComplete="off"
                      disabled={busy}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="editor-code">Security code</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id="editor-code"
                        type={codeRevealed ? 'text' : 'password'}
                        inputMode="numeric"
                        autoComplete="off"
                        value={draft.card.code}
                        onChange={(event) => cardField('code', event.target.value)}
                        disabled={busy}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          size="icon-sm"
                          aria-label={codeRevealed ? 'Hide security code' : 'Reveal security code'}
                          aria-pressed={codeRevealed}
                          onClick={() => setCodeRevealed(!codeRevealed)}
                          disabled={busy}
                        >
                          {codeRevealed ? <EyeOff /> : <Eye />}
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                  </Field>
                </>
              )}
              <Field>
                <FieldLabel>Custom fields</FieldLabel>
                {(draft.fields ?? []).map((row, index) => (
                  <div key={index} className="task-uri-row">
                    {row.action === 'keep' ? (
                      <p className="text-xs text-muted-foreground">
                        {item?.fields[row.sourceIndex]?.name || 'Linked field'} links to another
                        field and is kept as it is. Edit it in Bitwarden or remove it.
                      </p>
                    ) : (
                      <>
                        <Input
                          aria-label={`Field ${index + 1} name`}
                          placeholder="Name"
                          value={row.name}
                          maxLength={1_000}
                          disabled={busy}
                          onChange={(event) => fieldRow(index, { name: event.target.value })}
                        />
                        <select
                          aria-label={`Field ${index + 1} type`}
                          value={row.kind}
                          disabled={busy}
                          onChange={(event) => {
                            const kind = fieldKindOptions.find(
                              (option) => option.value === event.target.value,
                            )!.value;
                            fieldRow(index, {
                              kind,
                              value: kind === 'boolean' ? String(row.value === 'true') : row.value,
                            });
                          }}
                        >
                          {fieldKindOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {row.kind === 'boolean' ? (
                          <Switch
                            aria-label={`Field ${index + 1} value`}
                            checked={row.value === 'true'}
                            disabled={busy}
                            onCheckedChange={(checked) =>
                              fieldRow(index, { value: String(checked) })
                            }
                          />
                        ) : (
                          <InputGroup>
                            <InputGroupInput
                              aria-label={`Field ${index + 1} value`}
                              type={
                                row.kind === 'hidden' && !revealedFields.has(index)
                                  ? 'password'
                                  : 'text'
                              }
                              autoComplete="off"
                              value={row.value}
                              maxLength={16_384}
                              disabled={busy}
                              onChange={(event) => fieldRow(index, { value: event.target.value })}
                            />
                            {row.kind === 'hidden' && (
                              <InputGroupAddon align="inline-end">
                                <InputGroupButton
                                  size="icon-sm"
                                  aria-label={`${revealedFields.has(index) ? 'Hide' : 'Reveal'} field ${index + 1} value`}
                                  aria-pressed={revealedFields.has(index)}
                                  disabled={busy}
                                  onClick={() =>
                                    setRevealedFields((current) => {
                                      const next = new Set(current);
                                      if (!next.delete(index)) next.add(index);
                                      return next;
                                    })
                                  }
                                >
                                  {revealedFields.has(index) ? <EyeOff /> : <Eye />}
                                </InputGroupButton>
                              </InputGroupAddon>
                            )}
                          </InputGroup>
                        )}
                      </>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setRevealedFields(new Set());
                        fieldRows((rows) => rows.filter((_, i) => i !== index));
                      }}
                    >
                      Remove field
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    fieldRows((rows) => [
                      ...rows,
                      { action: 'write', name: '', value: '', kind: 'text' },
                    ])
                  }
                >
                  Add field
                </Button>
              </Field>
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
              {busy ? 'Saving…' : draftTypes[draft.type].save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Lists an imported value Bitlatch does not offer, so saving keeps it. */
function choices(options: { value: string; label: string }[], current: string) {
  const known = !current || options.some((option) => option.value === current);
  return [
    { value: '', label: '—' },
    ...options,
    ...(known ? [] : [{ value: current, label: current }]),
  ].map((option) => (
    <option key={option.value} value={option.value}>
      {option.label}
    </option>
  ));
}
