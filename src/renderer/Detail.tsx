import { useEffect, useState } from 'react';
import {
  Check,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Fingerprint,
  FolderKey,
  RotateCcw,
  Star,
  Trash2,
} from 'lucide-react';
import type { ItemDetail } from '../shared/types';
import { ItemIcon, displayWebsite, typeName } from './items';
import type { Notifier } from './Toasts';

export function Detail({
  item,
  onEdit,
  onGone,
  notify,
}: {
  item: ItemDetail;
  onEdit: () => void;
  /** The item left this list, so the selection no longer points at anything. */
  onGone: () => void;
  notify: Notifier;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(''), 1_600);
    return () => clearTimeout(timer);
  }, [copied]);
  async function remove() {
    setDeleting(true);
    setError('');
    const pending = notify.show('pending', 'Moving to trash…');
    const result = await window.latch.remove(item.id);
    setDeleting(false);
    if (result.ok) {
      notify.settle(pending, 'done', 'Moved to the Bitwarden trash');
      onGone();
    } else {
      notify.settle(pending, 'error', result.error);
      setError(result.error);
      setConfirming(false);
    }
  }
  async function restore() {
    setDeleting(true);
    setError('');
    const pending = notify.show('pending', 'Restoring…');
    const result = await window.latch.restore(item.id);
    setDeleting(false);
    if (result.ok) {
      notify.settle(pending, 'done', 'Restored to your vault');
      onGone();
    } else {
      notify.settle(pending, 'error', result.error);
      setError(result.error);
    }
  }
  async function copy(field: 'username' | 'password') {
    const result = await window.latch.copy(item.id, field);
    if (result.ok) setCopied(field);
    else setError(result.error);
  }
  return (
    <article className="detail">
      <div className="detail-toolbar">
        <span>
          {item.restorable ? `${typeName(item.type)} · In the trash` : typeName(item.type)}
        </span>
        <div>
          {item.favorite && <Star size={13} className="row-star" fill="currentColor" />}
          {confirming ? (
            <>
              <span className="confirm-question">Move to trash?</span>
              <button
                className="secondary small"
                onClick={() => setConfirming(false)}
                disabled={deleting}
              >
                Keep
              </button>
              <button className="danger small" onClick={() => void remove()} disabled={deleting}>
                {deleting ? 'Moving…' : 'Move to trash'}
              </button>
            </>
          ) : (
            <>
              {item.editable && (
                <button className="secondary small" onClick={onEdit}>
                  Edit
                </button>
              )}
              {item.restorable && (
                <button
                  className="secondary small"
                  onClick={() => void restore()}
                  disabled={deleting}
                >
                  <RotateCcw size={12} /> {deleting ? 'Restoring…' : 'Restore'}
                </button>
              )}
              {item.deletable && (
                <button
                  className="icon-button"
                  aria-label="Delete item"
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="detail-title">
        <ItemIcon item={item} large />
        <h2>{item.name}</h2>
        <span className="detail-subtitle">{displayWebsite(item.website) || 'Personal vault'}</span>
      </div>
      <div className="fields">
        {item.type === 1 && (
          <>
            <div className="field">
              <div>
                <label>Username</label>
                <span className="field-value">{item.username || '—'}</span>
              </div>
              <button
                className="icon-button"
                aria-label="Copy username"
                onClick={() => void copy('username')}
              >
                {copied === 'username' ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <div className="field">
              <div>
                <label>Password</label>
                <span className={`field-value password ${revealed ? '' : 'masked'}`}>
                  {item.password ? (revealed ? item.password : '••••••••••••••') : '—'}
                </span>
              </div>
              <div className="field-actions">
                <button
                  className="icon-button"
                  aria-label={revealed ? 'Hide password' : 'Reveal password'}
                  onClick={() => setRevealed(!revealed)}
                >
                  {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button
                  className="icon-button"
                  aria-label="Copy password"
                  onClick={() => void copy('password')}
                >
                  {copied === 'password' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          </>
        )}
        {item.website && (
          <div className="field">
            <div>
              <label>Website</label>
              <span className="field-value website">{item.website}</span>
            </div>
          </div>
        )}
      </div>
      {item.hasPasskey && (
        <div className="passkey-note">
          <Fingerprint size={18} />
          <div>
            <strong>Passkey saved in Bitwarden</strong>
            <p>Use your existing passkey provider. Latch does not handle passkeys yet.</p>
          </div>
        </div>
      )}
      {item.notes && (
        <section className="notes">
          <h3>Notes</h3>
          <p>{item.notes}</p>
        </section>
      )}
      {item.type !== 1 && item.type !== 2 && (
        <p className="hint">
          This item type is read-only in this preview. Use the official Bitwarden client for its
          full details.
        </p>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <footer className="detail-footer">
        <span>
          <FolderKey size={12} /> Personal vault <ChevronRight size={10} /> {typeName(item.type)}
        </span>
        <small>
          {item.createdDate && <>Created {stamp(item.createdDate)}</>}
          {item.createdDate && item.revisionDate && <span className="dot-divider">·</span>}
          {item.revisionDate && <>Updated {stamp(item.revisionDate, true)}</>}
        </small>
      </footer>
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
