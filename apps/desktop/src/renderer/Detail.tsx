import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeSlash as EyeOff,
  Fingerprint,
  ArrowCounterClockwise as RotateCcw,
  Star,
  Trash as Trash2,
  WarningCircle as CircleAlert,
} from '@phosphor-icons/react';
import { uriMatchOptions } from '@latch/shared/item-drafts';
import { detailRows, inSentence } from '@latch/shared/item-fields';
import type { CardFields, CopyTarget, ItemDetail } from '@latch/shared/types';
import { ItemIcon, displayWebsite, fieldLabels, typeName, type CopyField } from './items';
import type { Notifier } from './Toasts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import './tasks.css';

/** A copyable value. `key` names it within this item, for the busy and copied states. */
type Copyable = { key: string; label: string; target: CopyField | CopyTarget };
const fieldCopy = (field: CopyField): Copyable => ({
  key: field,
  label: fieldLabels[field],
  target: field,
});

export function Detail({
  item,
  folder,
  onEdit,
  onGone,
  notify,
}: {
  item: ItemDetail;
  folder?: string;
  onEdit: () => void;
  onGone: () => void;
  notify: Notifier;
}) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<Copyable | null>(null);
  const [copying, setCopying] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [active, setActive] = useState(true);
  const epoch = useRef(0);
  const alive = useRef(false);
  const working = useRef(false);
  const copyWorking = useRef(false);
  useLayoutEffect(() => {
    alive.current = true;
    epoch.current++;
    working.current = false;
    copyWorking.current = false;
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
      // Leaving an item opened with the master password closes it again.
      if (item.reprompt) void window.latch.closeProtected().catch(() => undefined);
    };
  }, [item.id, item.reprompt]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  async function changeTrash(restore: boolean) {
    if (working.current || !alive.current) return;
    working.current = true;
    setDeleting(true);
    setError('');
    const version = epoch.current;
    let pending: ReturnType<Notifier['show']> | undefined;
    try {
      if (!restore) {
        const confirmation = await window.latch.confirm('trash');
        if (!alive.current || version !== epoch.current) return;
        if (!confirmation.ok) {
          setError(confirmation.error);
          return;
        }
        if (!confirmation.value) return;
      }
      pending = notify.show('pending', restore ? 'Restoring…' : 'Moving to Trash…');
      const result = await (restore ? window.latch.restore(item.id) : window.latch.remove(item.id));
      if (!alive.current || version !== epoch.current) return;
      if (result.ok) {
        notify.settle(pending, 'done', restore ? 'Restored to your vault' : 'Moved to Trash');
        onGone();
      } else {
        if (pending) notify.settle(pending, 'error', 'Could not update the item.');
        setError(result.error);
      }
    } catch {
      if (alive.current && version === epoch.current) {
        if (pending) notify.settle(pending, 'error', 'Could not update the item.');
        setError('Could not update the item. Try again.');
      }
    } finally {
      if (alive.current && version === epoch.current) {
        working.current = false;
        setDeleting(false);
      }
    }
  }
  async function copy(copyable: Copyable) {
    if (copyWorking.current || !alive.current) return;
    copyWorking.current = true;
    setCopying(copyable.key);
    setError('');
    const version = epoch.current;
    try {
      const result = await window.latch.copy(item.id, copyable.target);
      if (!alive.current || version !== epoch.current) return;
      if (result.ok) setCopied(copyable);
      else setError(result.error);
    } catch {
      if (alive.current && version === epoch.current) setError('Could not copy. Try again.');
    } finally {
      if (alive.current && version === epoch.current) {
        copyWorking.current = false;
        setCopying('');
      }
    }
  }
  const revealButton = ({ key, label }: Copyable, value: string) => (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`${revealed[key] ? 'Hide' : 'Reveal'} ${inSentence(label)}`}
      aria-pressed={!!revealed[key]}
      disabled={!value || deleting}
      onClick={() => setRevealed((current) => ({ ...current, [key]: !current[key] }))}
    >
      {revealed[key] ? <EyeOff /> : <Eye />}
    </Button>
  );
  const copyButton = (copyable: Copyable, value: string) => (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`Copy ${inSentence(copyable.label)}`}
      disabled={!!copying || deleting || !value}
      aria-busy={copying === copyable.key}
      onClick={() => void copy(copyable)}
    >
      {copying === copyable.key ? <Spinner /> : copied?.key === copyable.key ? <Check /> : <Copy />}
    </Button>
  );
  const rowsSection = (label: string, rows: DetailRow[]) =>
    rows.length > 0 && (
      <section
        aria-label={label}
        className="task-credentials rounded-lg border border-border bg-card"
      >
        {rows.map((row, index) => (
          <Fragment key={row.name}>
            {index > 0 && <Separator />}
            <div className="task-credential" data-credential={row.name}>
              <div>
                <p id={`detail-${row.name}-label`} className="text-xs text-muted-foreground">
                  {row.label}
                </p>
                <span
                  className={`field-value text-sm ${row.masked !== undefined ? 'font-mono' : ''} ${row.value.includes('\n') ? 'whitespace-pre-line' : ''}`}
                  aria-labelledby={`detail-${row.name}-label`}
                >
                  {!row.value
                    ? '—'
                    : row.masked !== undefined && !revealed[row.name]
                      ? row.masked
                      : row.value}
                </span>
              </div>
              {row.copy && (
                <div className="task-actions">
                  {row.masked !== undefined && revealButton(row.copy, row.value)}
                  {copyButton(row.copy, row.value)}
                </div>
              )}
            </div>
          </Fragment>
        ))}
      </section>
    );
  if (!active) return null;
  return (
    <article className="task-detail bg-background text-foreground">
      <div className="task-detail-toolbar scroll-header">
        <span className="task-location">
          <span className="text-muted-foreground">Personal vault</span>
          <span aria-hidden="true">/</span>
          {typeName(item.type)}
        </span>
        <div className="task-actions">
          {item.favorite && <Star size={14} aria-label="Favorite" fill="currentColor" />}
          {item.editable && (
            <Button
              type="button"
              variant="secondary"
              size="default"
              onClick={onEdit}
              disabled={deleting}
            >
              Edit
            </Button>
          )}
          {item.restorable && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void changeTrash(true)}
              disabled={deleting}
              aria-busy={deleting}
            >
              {deleting ? <Spinner /> : <RotateCcw data-icon="inline-start" />}
              {deleting ? 'Restoring…' : 'Restore'}
            </Button>
          )}
          {item.deletable && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Delete item"
              disabled={deleting}
              aria-busy={deleting}
              onClick={() => void changeTrash(false)}
            >
              {deleting ? <Spinner /> : <Trash2 />}
            </Button>
          )}
        </div>
      </div>
      <div className="task-detail-body">
        <header className="task-item-identity">
          <ItemIcon item={item} large />
          <div>
            <h2 className="font-heading text-[20px] leading-[26px] font-semibold">{item.name}</h2>
            <p className="text-xs text-muted-foreground">
              {item.subtitle || displayWebsite(item.website) || typeName(item.type)}
            </p>
          </div>
        </header>
        {(!item.editable || item.restorable) && (
          <div className="task-actions">
            {item.restorable && <Badge variant="secondary">In Trash</Badge>}
            {!item.editable && !item.restorable && (
              <Badge variant="outline">Read-only in Bitlatch</Badge>
            )}
          </div>
        )}
        {(item.type === 1 || item.website) && (
          <section
            aria-label="Login details"
            className="task-credentials rounded-lg border border-border bg-card"
          >
            {item.type === 1 && (
              <>
                <div className="task-credential" data-credential="username">
                  <div>
                    <p id="detail-username-label" className="text-xs text-muted-foreground">
                      Username
                    </p>
                    <span className="field-value text-sm" aria-labelledby="detail-username-label">
                      {item.username || '—'}
                    </span>
                  </div>
                  {copyButton(fieldCopy('username'), item.username)}
                </div>
                <Separator />
                <div className="task-credential" data-credential="password">
                  <div>
                    <p id="detail-password-label" className="text-xs text-muted-foreground">
                      Password
                    </p>
                    <span
                      className="field-value text-sm font-mono"
                      aria-labelledby="detail-password-label"
                    >
                      {item.password ? (revealed.password ? item.password : '••••••••••••••') : '—'}
                    </span>
                  </div>
                  <div className="task-actions">
                    {revealButton(fieldCopy('password'), item.password)}
                    {copyButton(fieldCopy('password'), item.password)}
                  </div>
                </div>
              </>
            )}
            {item.uris.map((row) => (
              <div key={row.sourceIndex}>
                <Separator />
                <div className="task-credential">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Website ·{' '}
                      {uriMatchOptions.find(
                        (option) => option.value === (row.match === null ? '' : String(row.match)),
                      )?.label ?? 'Imported rule'}
                    </p>
                    <span className="field-value text-sm">{row.uri ?? 'Empty URI'}</span>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}
        {item.card && rowsSection('Card details', cardRows(item.card))}
        {item.details && rowsSection(`${typeName(item.type)} details`, detailSectionRows(item))}
        {rowsSection('Custom fields', customFieldRows(item))}
        {rowsSection('Passkeys', passkeyRows(item))}
        {rowsSection('Password history', passwordHistoryRows(item))}
        <span role="status" className="sr-only">
          {copied ? `${copied.label} copied` : ''}
        </span>
        {item.hasPasskey && (
          <Alert>
            <Fingerprint />
            <AlertTitle>Passkey</AlertTitle>
            <AlertDescription>
              Signs in through macOS AutoFill when Bitlatch is unlocked. Edit or remove it in
              Bitwarden.
            </AlertDescription>
          </Alert>
        )}
        {item.notes && (
          <section className="notes task-notes-display rounded-lg border border-border bg-card">
            <h3 className="text-xs text-muted-foreground">Notes</h3>
            <p className="text-sm text-foreground leading-relaxed">{item.notes}</p>
          </section>
        )}
        {![1, 2, 3].includes(item.type) && !item.details && (
          <Alert>
            <AlertTitle>Read-only in Bitlatch</AlertTitle>
            <AlertDescription>
              Use the official Bitwarden client for this item's full details.
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <footer className="detail-footer task-detail-footer">
          <dl>
            <div>
              <dt>Vault</dt>
              <dd>Personal vault</dd>
            </div>
            {folder && (
              <div>
                <dt>Folder</dt>
                <dd>{folder}</dd>
              </div>
            )}
            {item.createdDate && (
              <div>
                <dt>Created</dt>
                <dd>{stamp(item.createdDate)}</dd>
              </div>
            )}
            {item.revisionDate && (
              <div>
                <dt>Updated</dt>
                <dd>{stamp(item.revisionDate, true)}</dd>
              </div>
            )}
          </dl>
        </footer>
      </div>
    </article>
  );
}

/** A row's `masked` text stands in for its value until it is revealed. */
type DetailRow = { name: string; label: string; value: string; masked?: string; copy?: Copyable };

/** Empty rows are hidden, except the number, which every card is expected to have. */
function cardRows(card: CardFields): DetailRow[] {
  const expiration =
    card.expMonth || card.expYear
      ? `${card.expMonth ? card.expMonth.padStart(2, '0') : '—'} / ${card.expYear || '—'}`
      : '';
  const rows: DetailRow[] = [
    { name: 'cardholder', label: 'Cardholder name', value: card.cardholderName },
    { name: 'brand', label: 'Brand', value: card.brand },
    {
      name: 'cardNumber',
      label: 'Number',
      value: card.number,
      masked: `•••• ${card.number.slice(-4)}`,
      copy: fieldCopy('cardNumber'),
    },
    { name: 'expiration', label: 'Expiration', value: expiration },
    {
      name: 'cardCode',
      label: 'Security code',
      value: card.code,
      masked: '•••',
      copy: fieldCopy('cardCode'),
    },
  ];
  return rows.filter((row) => row.value || row.name === 'cardNumber');
}

function detailSectionRows({ type, details }: ItemDetail): DetailRow[] {
  return detailRows(type, details ?? {}).map((row) => ({
    name: `detail-${row.key}`,
    label: row.label,
    value: row.value,
    masked: row.secret ? '••••••••' : undefined,
    copy: { key: `detail-${row.key}`, label: row.label, target: { detail: row.key } },
  }));
}

function passkeyRows({ passkeys }: ItemDetail): DetailRow[] {
  return passkeys.map((passkey, index) => ({
    name: `passkey-${index}`,
    label: passkey.creationDate ? `Passkey · created ${stamp(passkey.creationDate)}` : 'Passkey',
    value: [passkey.rpId, passkey.userName].filter(Boolean).join(' · '),
  }));
}

function passwordHistoryRows({ passwordHistory, revisionDate }: ItemDetail): DetailRow[] {
  return passwordHistory.map((entry, index) => {
    const name = `history-${index}`;
    const used = entry.lastUsedDate ? `last used ${stamp(entry.lastUsedDate)}` : `${index + 1}`;
    const label = `Previous password · ${used}`;
    return {
      name,
      label,
      value: entry.password,
      masked: '••••••••',
      copy: { key: name, label, target: { history: index, revisionDate } },
    };
  });
}

function customFieldRows({ fields, revisionDate }: ItemDetail): DetailRow[] {
  return fields.map((field, index): DetailRow => {
    const name = `custom-${index}`;
    const label = field.name || 'Custom field';
    const copy = { key: name, label, target: { custom: index, revisionDate } };
    if (field.kind === 'boolean')
      return { name, label, value: field.value === 'true' ? 'Yes' : 'No' };
    if (field.kind === 'linked')
      return { name, label, value: field.value ? `Linked to ${field.value}` : 'Linked field' };
    if (field.kind === 'hidden' || field.kind === 'unknown')
      return { name, label, value: field.value, masked: '••••••••', copy };
    return { name, label, value: field.value, copy };
  });
}

/** A date the way a person reads it, with the time only where it matters. */
function stamp(value: string, withTime = false) {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return value;
  return at.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}
