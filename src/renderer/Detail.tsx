import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Fingerprint,
  RotateCcw,
  Star,
  Trash2,
  CircleAlert,
} from 'lucide-react';
import type { ItemDetail } from '../shared/types';
import { ItemIcon, displayWebsite, typeName } from './items';
import type { Notifier } from './Toasts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
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
  const [confirming, setConfirming] = useState(false);
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
    setConfirming(false);
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
    const pending = notify.show('pending', restore ? 'Restoring…' : 'Moving to Trash…');
    try {
      const result = await (restore ? window.latch.restore(item.id) : window.latch.remove(item.id));
      if (!alive.current || version !== epoch.current) return;
      if (result.ok) {
        notify.settle(pending, 'done', restore ? 'Restored to your vault' : 'Moved to Trash');
        setConfirming(false);
        onGone();
      } else {
        notify.settle(pending, 'error', 'Could not update the item.');
        setError(result.error);
      }
    } catch {
      if (alive.current && version === epoch.current) {
        notify.settle(pending, 'error', 'Could not update the item.');
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
      <div className="task-detail-toolbar">
        <span className="text-xs text-muted-foreground">{typeName(item.type)}</span>
        <div className="task-actions">
          {item.favorite && <Star size={14} aria-label="Favorite" fill="currentColor" />}
          {item.editable && (
            <Button type="button" variant="outline" size="sm" onClick={onEdit} disabled={deleting}>
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
            <AlertDialog
              open={confirming}
              onOpenChange={(open) => {
                if (!working.current) setConfirming(open);
              }}
            >
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete item"
                  disabled={deleting}
                >
                  <Trash2 />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent
                aria-busy={deleting}
                onEscapeKeyDown={(event) => {
                  if (deleting) event.preventDefault();
                }}
                onCloseAutoFocus={(event) => {
                  if (!alive.current) {
                    event.preventDefault();
                    document
                      .querySelector<HTMLElement>('#auth-password, [aria-label="Search vault"]')
                      ?.focus();
                  }
                }}
              >
                <AlertDialogHeader>
                  <AlertDialogTitle className="break-words">
                    Move “{item.name}” to Trash?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    You can restore it from Trash. This does not delete it permanently.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {error && (
                  <Alert variant="destructive">
                    <CircleAlert />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={deleting}
                    onClick={(event) => {
                      event.preventDefault();
                      void changeTrash(false);
                    }}
                  >
                    {deleting && <Spinner />}
                    {deleting ? 'Moving…' : 'Move to Trash'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
      <div className="task-detail-body">
        <header className="task-item-identity">
          <ItemIcon item={item} large />
          <div>
            <h2 className="text-[20px] leading-[26px] font-semibold">{item.name}</h2>
            <p className="text-xs text-muted-foreground">
              {displayWebsite(item.website) || 'Personal vault'}
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
          <div className="task-credentials rounded-lg border border-border">
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
          </div>
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
          <section className="notes task-notes-display">
            <h3 className="text-sm font-semibold text-foreground">Notes</h3>
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
        {error && !confirming && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <footer className="detail-footer task-detail-footer">
          <span className="text-xs text-muted-foreground">
            Personal vault · {typeName(item.type)}
          </span>
          <small className="text-[11px] leading-[15px] text-muted-foreground">
            {item.createdDate && <>Created {stamp(item.createdDate)}</>}
            {item.createdDate && item.revisionDate && ' · '}
            {item.revisionDate && <>Updated {stamp(item.revisionDate, true)}</>}
          </small>
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
