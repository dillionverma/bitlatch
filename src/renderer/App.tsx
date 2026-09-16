import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  FileText,
  Fingerprint,
  FolderKey,
  KeyRound,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  UserRound,
  X,
} from 'lucide-react';
import type { ItemDetail, ItemSummary, VaultState } from '../shared/types';
import { Auth } from './Auth';
import { Editor } from './Editor';
import { Settings } from './Settings';
import { Mark } from './Mark';
import { Detail } from './Detail';
import { ItemIcon, displayWebsite, typeName } from './items';

const initialState: VaultState = {
  status: 'signed-out',
  email: '',
  server: 'https://vault.bitwarden.com',
  lastSync: null,
  itemCount: 0,
};
type Filter = 'all' | 'favorites' | 'logins' | 'notes' | 'passkeys';
const filters = [
  { id: 'all', label: 'All items', icon: FolderKey },
  { id: 'favorites', label: 'Favorites', icon: Star },
  { id: 'logins', label: 'Logins', icon: KeyRound },
  { id: 'notes', label: 'Secure notes', icon: FileText },
  { id: 'passkeys', label: 'Passkeys', icon: Fingerprint },
] as const;

export function App() {
  const [state, setState] = useState(initialState);
  const stateRef = useRef(state);
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [selected, setSelected] = useState<ItemDetail | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editor, setEditor] = useState<'new' | 'edit' | null>(null);
  const [settings, setSettings] = useState(false);
  const [notice, setNotice] = useState('');
  const [syncing, setSyncing] = useState(false);
  const selectionVersion = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const receiveState = useCallback((next: VaultState) => {
    stateRef.current = next;
    setState(next);
    setReady(true);
    if (next.status !== 'unlocked') {
      selectionVersion.current++;
      setItems([]);
      setSelected(null);
      setSelectedId('');
      setEditor(null);
      setQuery('');
      setNotice('');
      setSettings(false);
    } else {
      void window.latch.items().then((response) => {
        if (response.ok && stateRef.current.status === 'unlocked') setItems(response.value);
      });
    }
  }, []);

  useEffect(() => {
    const unsubscribe = window.latch.onState(receiveState);
    void window.latch.state().then((response) => {
      if (response.ok) receiveState(response.value);
    });
    return unsubscribe;
  }, [receiveState]);

  useEffect(
    () =>
      window.latch.onFocusSearch(() => {
        searchInput.current?.focus();
        searchInput.current?.select();
      }),
    [],
  );

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
        searchInput.current?.select();
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'n' &&
        stateRef.current.status === 'unlocked'
      ) {
        event.preventDefault();
        setEditor('new');
      }
    }
    addEventListener('keydown', keyboard);
    return () => removeEventListener('keydown', keyboard);
  }, []);

  const visible = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return items.filter((item) => {
      if (filter === 'favorites' && !item.favorite) return false;
      if (filter === 'logins' && item.type !== 1) return false;
      if (filter === 'notes' && item.type !== 2) return false;
      if (filter === 'passkeys' && !item.hasPasskey) return false;
      const haystack = `${item.name} ${item.username} ${item.website}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [items, query, filter]);

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 66,
    overscan: 8,
    getItemKey: (index) => visible[index]!.id,
  });

  async function select(item: ItemSummary) {
    const version = ++selectionVersion.current;
    setSelectedId(item.id);
    setSelected(null);
    setNotice('');
    if (item.restricted) {
      setNotice('This shared or protected item is available in the official Bitwarden client.');
      return;
    }
    const response = await window.latch.detail(item.id);
    if (version !== selectionVersion.current || stateRef.current.status !== 'unlocked') return;
    if (response.ok) setSelected(response.value);
    else setNotice(response.error);
  }

  async function sync() {
    setSyncing(true);
    setNotice('');
    const response = await window.latch.sync();
    setSyncing(false);
    if (response.ok) receiveState(response.value);
    else setNotice(response.error);
  }

  if (!ready)
    return (
      <div className="boot">
        <Mark size={30} />
        <span>Latch</span>
      </div>
    );
  if (state.status !== 'unlocked')
    return <Auth key={state.status + state.email} state={state} onState={receiveState} />;

  const label = filters.find((entry) => entry.id === filter)!.label;
  return (
    <div className="app">
      <header className="titlebar">
        <div className="wordmark">
          <Mark size={17} />
          <strong>Latch</strong>
        </div>
        <div className="search">
          <Search size={14} />
          <input
            ref={searchInput}
            aria-label="Search vault"
            placeholder="Search your vault"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>⌘ K</kbd>
          {query && (
            <button className="icon-button" aria-label="Clear search" onClick={() => setQuery('')}>
              <X size={12} />
            </button>
          )}
        </div>
        <button className="new-button" onClick={() => setEditor('new')}>
          <Plus size={14} /> New login
        </button>
      </header>
      <main className="workspace">
        <aside className="sidebar">
          <div className="vault-label">
            <span className="vault-avatar">
              <UserRound size={15} />
            </span>
            <div>
              <strong>Personal vault</strong>
              <small>Bitwarden</small>
            </div>
          </div>
          <span className="section-label">LIBRARY</span>
          <nav aria-label="Vault filters">
            {filters.map(({ id, label: title, icon: Icon }) => (
              <button
                key={id}
                className={filter === id ? 'nav-item active' : 'nav-item'}
                onClick={() => setFilter(id)}
              >
                <Icon size={14} strokeWidth={1.6} />
                <span>{title}</span>
                {id === 'all' && <small>{items.length}</small>}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="quiet-tip">
              <ShieldCheck size={16} strokeWidth={1.4} />
              <span>
                A little less friction.
                <br />
                <small>Your vault stays yours.</small>
              </span>
            </div>
            <button className="nav-item" onClick={() => setSettings(true)}>
              <Settings2 size={14} /> <span>Browser & settings</span>
            </button>
            <button className="nav-item" onClick={() => void window.latch.lock()}>
              <LockKeyhole size={14} /> <span>Lock vault</span>
              <kbd>⌘ L</kbd>
            </button>
            <div className="account">
              <span className="status-dot" />
              <span title={state.email}>{state.email}</span>
            </div>
          </div>
        </aside>
        <section className="item-list">
          <header className="list-heading">
            <div>
              <h1>{query ? 'Search results' : label}</h1>
              <span>
                {visible.length} {visible.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            <button
              className={`icon-button ${syncing ? 'spinning' : ''}`}
              aria-label="Sync vault"
              onClick={() => void sync()}
              disabled={syncing}
            >
              <RefreshCw size={14} />
            </button>
          </header>
          <div
            className="list-scroll"
            ref={listRef}
            role="listbox"
            aria-label="Vault items"
            tabIndex={0}
            onKeyDown={(event) => {
              if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
              event.preventDefault();
              const current = visible.findIndex((item) => item.id === selectedId);
              const next = Math.max(
                0,
                Math.min(visible.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)),
              );
              if (visible[next]) {
                void select(visible[next]!);
                virtualizer.scrollToIndex(next);
              }
            }}
          >
            {visible.length ? (
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((row) => {
                  const item = visible[row.index]!;
                  return (
                    <button
                      key={item.id}
                      role="option"
                      aria-selected={item.id === selectedId}
                      className={`item-row ${item.id === selectedId ? 'selected' : ''}`}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: row.size,
                        transform: `translateY(${row.start}px)`,
                      }}
                      onClick={() => void select(item)}
                    >
                      <ItemIcon item={item} />
                      <span className="item-text">
                        <strong>{item.name}</strong>
                        <small>
                          {item.username || displayWebsite(item.website) || typeName(item.type)}
                        </small>
                      </span>
                      {item.favorite && <Star size={10} className="row-star" fill="currentColor" />}
                      {item.hasPasskey && <Fingerprint size={13} className="muted" />}
                      {item.restricted && <LockKeyhole size={12} className="muted" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="list-empty">
                <Search size={22} strokeWidth={1.3} />
                <strong>{query ? 'Nothing found' : 'A clean slate'}</strong>
                <p>{query ? 'Try a name, email, or website.' : 'Your items will appear here.'}</p>
                {!query && (
                  <button className="text-action" onClick={() => setEditor('new')}>
                    Add your first login <Plus size={12} />
                  </button>
                )}
              </div>
            )}
          </div>
          <footer className="list-footer">
            <span className="status-dot" />
            <span>
              {syncing
                ? 'Syncing with Bitwarden…'
                : state.lastSync
                  ? 'Synced with Bitwarden'
                  : 'Vault ready'}
            </span>
            <span className="version">0.1</span>
          </footer>
        </section>
        <section className="detail-pane">
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button
                className="icon-button"
                aria-label="Dismiss notice"
                onClick={() => setNotice('')}
              >
                <X size={12} />
              </button>
            </div>
          )}
          {selected ? (
            <Detail key={selected.id} item={selected} onEdit={() => setEditor('edit')} />
          ) : (
            <div className="detail-empty">
              <div className="empty-emblem">
                <Mark size={39} />
              </div>
              <h2>{selectedId ? 'Protected by your vault.' : 'Everything in its place.'}</h2>
              <p>
                {selectedId
                  ? 'Select another item to view its details.'
                  : 'Choose an item, or search for what you need.'}
              </p>
              <div className="shortcut-hints">
                <span>
                  <kbd>⌘ K</kbd> Search
                </span>
                <span>
                  <kbd>⌘ N</kbd> New login
                </span>
              </div>
            </div>
          )}
        </section>
      </main>
      {editor && (
        <Editor
          item={editor === 'edit' ? selected : null}
          onClose={() => setEditor(null)}
          onSaved={(item) => {
            setEditor(null);
            setSelected(item);
            setSelectedId(item.id);
          }}
        />
      )}
      {settings && <Settings onClose={() => setSettings(false)} />}
    </div>
  );
}
