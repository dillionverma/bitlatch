import { useEffect, useState } from 'react';
import { Check, ChevronRight, Copy, Eye, EyeOff, Fingerprint, FolderKey, Star } from 'lucide-react';
import type { ItemDetail } from '../shared/types';
import { ItemIcon, displayWebsite, typeName } from './items';

export function Detail({ item, onEdit }: { item: ItemDetail; onEdit: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(''), 1_600);
    return () => clearTimeout(timer);
  }, [copied]);
  async function copy(field: 'username' | 'password') {
    const result = await window.latch.copy(item.id, field);
    if (result.ok) setCopied(field);
    else setError(result.error);
  }
  return (
    <article className="detail">
      <div className="detail-toolbar">
        <span>{typeName(item.type)}</span>
        <div>
          {item.favorite && <Star size={13} className="row-star" fill="currentColor" />}
          {item.editable && (
            <button className="secondary small" onClick={onEdit}>
              Edit
            </button>
          )}
        </div>
      </div>
      <div className="detail-title">
        <ItemIcon item={item} large />
        <h2>{item.name}</h2>
        <span>{displayWebsite(item.website) || 'Personal vault'}</span>
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
        {item.revisionDate && (
          <small>
            Updated{' '}
            {new Date(item.revisionDate).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </small>
        )}
      </footer>
    </article>
  );
}
