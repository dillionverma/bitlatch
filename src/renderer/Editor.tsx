import { useState, type FormEvent } from 'react';
import { Check, RefreshCw, Star, X } from 'lucide-react';
import type { ItemDetail, LoginDraft } from '../shared/types';
import { useDialogFocus } from './useDialogFocus';

export function Editor({
  item,
  onClose,
  onSaved,
}: {
  item: ItemDetail | null;
  onClose: () => void;
  onSaved: (item: ItemDetail) => void;
}) {
  const dialogRef = useDialogFocus();
  const [draft, setDraft] = useState<LoginDraft>(
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function update<K extends keyof LoginDraft>(key: K, value: LoginDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const response = await window.latch.save(draft);
    setBusy(false);
    if (response.ok) onSaved(response.value);
    else setError(response.error);
  }
  async function generate() {
    const response = await window.latch.generate();
    if (response.ok) update('password', response.value);
  }
  return (
    <div
      className="editor-overlay"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
      >
        <header>
          <div>
            <span className="eyebrow">PERSONAL VAULT</span>
            <h2 id="editor-title">{item ? 'Edit login' : 'New login'}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close editor"
            onClick={onClose}
            disabled={busy}
          >
            <X size={17} />
          </button>
        </header>
        <form onSubmit={(event) => void save(event)}>
          <label>
            Name
            <input
              autoFocus
              value={draft.name}
              onChange={(event) => update('name', event.target.value)}
              placeholder="e.g. GitHub"
              required
              maxLength={500}
            />
          </label>
          <label>
            Website
            <input
              type="url"
              value={draft.website}
              onChange={(event) => update('website', event.target.value)}
              placeholder="https://github.com"
            />
          </label>
          <label>
            Username
            <input
              value={draft.username}
              onChange={(event) => update('username', event.target.value)}
              autoComplete="off"
              placeholder="Email or username"
            />
          </label>
          <div className="editor-password">
            <div className="label-row">
              <label htmlFor="editor-password">Password</label>
              <button type="button" className="text-action" onClick={() => void generate()}>
                <RefreshCw size={11} /> Generate
              </button>
            </div>
            <input
              id="editor-password"
              type="password"
              autoComplete="new-password"
              value={draft.password}
              onChange={(event) => update('password', event.target.value)}
            />
          </div>
          <label>
            Notes
            <textarea
              aria-label="Notes"
              rows={3}
              value={draft.notes}
              onChange={(event) => update('notes', event.target.value)}
              placeholder="Anything else to remember…"
            />
          </label>
          <button
            type="button"
            className={`favorite-toggle ${draft.favorite ? 'is-favorite' : ''}`}
            onClick={() => update('favorite', !draft.favorite)}
          >
            <Star size={13} fill={draft.favorite ? 'currentColor' : 'none'} />{' '}
            {draft.favorite ? 'In favorites' : 'Add to favorites'}
          </button>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <footer>
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save login'}
              {!busy && <Check size={14} />}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
