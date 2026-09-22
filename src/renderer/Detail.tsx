import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import type { ItemDetail } from '../shared/types';
import { ItemIcon, displayWebsite, typeName } from './items';
import type { Notifier } from './Toasts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import './tasks.css';

export function Detail({
  item,
  onEdit,
  onGone,
  notify,
}: {
  item: ItemDetail;
  onEdit: () => void;
  onGone: () => void;
  notify: Notifier;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState('');
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
    setRevealed(false);
    setCopied('');
    setCopying('');
    setError('');
    setDeleting(false);
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
    };
  }, [item.id]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(''), 1600);
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
  async function copy(field: 'username' | 'password') {
    if (copyWorking.current || !alive.current) return;
    copyWorking.current = true;
    setCopying(field);
    setError('');
    const version = epoch.current;
    try {
      const result = await window.latch.copy(item.id, field);
      if (!alive.current || version !== epoch.current) return;
      if (result.ok) setCopied(field);
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
      <div
        className="task-detail-body"
        onScroll={(event) => {
          event.currentTarget.parentElement!.dataset.scrolled = String(
            event.currentTarget.scrollTop > 0,
          );
        }}
      >
        <header className="task-item-identity">
          <ItemIcon item={item} large />
          <div>
            <h2 className="font-heading text-[20px] leading-[26px] font-semibold">{item.name}</h2>
            <p className="text-xs text-muted-foreground">
              {displayWebsite(item.website) || typeName(item.type)}
            </p>
          </div>
        </header>
        {(!item.editable || item.restorable) && (
          <div className="task-actions">
            {item.restorable && <Badge variant="secondary">In Trash</Badge>}
            {!item.editable && !item.restorable && (
              <Badge variant="outline">Read-only in Latch</Badge>
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
                <div className="task-credential">
                  <div>
                    <p id="detail-username-label" className="text-xs text-muted-foreground">
                      Username
                    </p>
                    <span className="field-value text-sm" aria-labelledby="detail-username-label">
                      {item.username || '—'}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Copy username"
                    disabled={!!copying || deleting || !item.username}
                    aria-busy={copying === 'username'}
                    onClick={() => void copy('username')}
                  >
                    {copying === 'username' ? (
                      <Spinner />
                    ) : copied === 'username' ? (
                      <Check />
                    ) : (
                      <Copy />
                    )}
                  </Button>
                </div>
                <Separator />
                <div className="task-credential">
                  <div>
                    <p id="detail-password-label" className="text-xs text-muted-foreground">
                      Password
                    </p>
                    <span
                      className="field-value text-sm font-mono"
                      aria-labelledby="detail-password-label"
                    >
                      {item.password ? (revealed ? item.password : '••••••••••••••') : '—'}
                    </span>
                  </div>
                  <div className="task-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={revealed ? 'Hide password' : 'Reveal password'}
                      aria-pressed={revealed}
                      disabled={!item.password || deleting}
                      onClick={() => setRevealed(!revealed)}
                    >
                      {revealed ? <EyeOff /> : <Eye />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Copy password"
                      disabled={!!copying || deleting || !item.password}
                      aria-busy={copying === 'password'}
                      onClick={() => void copy('password')}
                    >
                      {copying === 'password' ? (
                        <Spinner />
                      ) : copied === 'password' ? (
                        <Check />
                      ) : (
                        <Copy />
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}
            {item.website && (
              <>
                {item.type === 1 && <Separator />}
                <div className="task-credential">
                  <div>
                    <p id="detail-website-label" className="text-xs text-muted-foreground">
                      Website
                    </p>
                    <span className="field-value text-sm" aria-labelledby="detail-website-label">
                      {item.website}
                    </span>
                  </div>
                </div>
              </>
            )}
          </section>
        )}
        <span role="status" className="sr-only">
          {copied ? `${copied === 'password' ? 'Password' : 'Username'} copied` : ''}
        </span>
        {item.hasPasskey && (
          <Alert>
            <Fingerprint />
            <AlertTitle>Passkey saved in Bitwarden</AlertTitle>
            <AlertDescription>
              Use your existing passkey provider. Latch does not handle passkeys yet.
            </AlertDescription>
          </Alert>
        )}
        {item.notes && (
          <section className="notes task-notes-display rounded-lg border border-border bg-card">
            <h3 className="text-xs text-muted-foreground">Notes</h3>
            <p className="text-sm text-foreground leading-relaxed">{item.notes}</p>
          </section>
        )}
        {item.type !== 1 && item.type !== 2 && (
          <Alert>
            <AlertTitle>Read-only in Latch</AlertTitle>
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
