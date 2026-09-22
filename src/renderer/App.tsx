import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import type { ItemDetail, ItemSummary, VaultState } from '../shared/types';
import { Auth } from './Auth';
import { Editor } from './Editor';
import { Settings } from './Settings';
import { Mark } from './Mark';
import { Detail } from './Detail';
import { ItemList } from './ItemList';
import { Toasts, useToasts } from './Toasts';

const initialState: VaultState = {
  status: 'signed-out',
  email: '',
  server: 'https://vault.bitwarden.com',
  lastSync: null,
  itemCount: 0,
  trashCount: 0,
  biometrics: 'unsupported',
  biometricsOn: false,
};
type Filter = 'all' | 'favorites' | 'logins' | 'notes' | 'passkeys' | 'trash';
const filters = [
  { id: 'all', label: 'All items', icon: FolderKey },
  { id: 'favorites', label: 'Favorites', icon: Star },
  { id: 'logins', label: 'Logins', icon: KeyRound },
  { id: 'notes', label: 'Secure notes', icon: FileText },
  { id: 'passkeys', label: 'Passkeys', icon: Fingerprint },
  { id: 'trash', label: 'Trash', icon: Trash2 },
] as const;

/**
 * Pairs each item with the text it is searched by. Built once per list rather
 * than per keystroke, which is what a long vault feels.
 */
function indexItems(items: ItemSummary[]) {
  return items.map((item) => ({
    item,
    haystack: `${item.name} ${item.username} ${item.website}`.toLowerCase(),
  }));
}

export function App() {
  const [state, setState] = useState(initialState);
  const stateRef = useRef(state);
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [trashed, setTrashed] = useState<ItemSummary[]>([]);
  const [selected, setSelected] = useState<ItemDetail | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editor, setEditor] = useState<'new' | 'edit' | null>(null);
  const [settings, setSettings] = useState(false);
  const [notice, setNotice] = useState('');
  const [syncing, setSyncing] = useState(false);
  const selectionVersion = useRef(0);
  const listVersion = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const { toasts, show, settle, dismiss } = useToasts();
  const notify = useMemo(() => ({ show, settle }), [show, settle]);

  const receiveState = useCallback((next: VaultState) => {
    stateRef.current = next;
    setState(next);
    setReady(true);
    if (next.status !== 'unlocked') {
      selectionVersion.current++;
      setItems([]);
      setTrashed([]);
      setSelected(null);
      setSelectedId('');
      setEditor(null);
      setQuery('');
      setNotice('');
      setSettings(false);
    } else {
      // Both lists come from one snapshot, and a slower earlier fetch is
      // dropped rather than allowed to overwrite a newer one.
      const version = ++listVersion.current;
      void Promise.all([window.latch.items(), window.latch.trash()]).then(([listed, binned]) => {
        if (version !== listVersion.current || stateRef.current.status !== 'unlocked') return;
        if (listed.ok) setItems(listed.value);
        if (binned.ok) setTrashed(binned.value);
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

  const indexed = useMemo(() => indexItems(items), [items]);
  const indexedTrash = useMemo(() => indexItems(trashed), [trashed]);

  const visible = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const source = filter === 'trash' ? indexedTrash : indexed;
    return source
      .filter(({ item, haystack }) => {
        if (filter === 'favorites' && !item.favorite) return false;
        if (filter === 'logins' && item.type !== 1) return false;
        if (filter === 'notes' && item.type !== 2) return false;
        if (filter === 'passkeys' && !item.hasPasskey) return false;
        return terms.every((term) => haystack.includes(term));
      })
      .map(({ item }) => item);
  }, [indexed, indexedTrash, query, filter]);

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

  async function setBiometrics(enabled: boolean) {
    const pending = show('pending', enabled ? 'Setting up Touch ID…' : 'Turning off Touch ID…');
    const result = await window.latch.setBiometrics(enabled);
    if (result.ok) {
      settle(pending, 'done', enabled ? 'Touch ID is on' : 'Touch ID is off');
      receiveState(result.value);
    } else settle(pending, 'error', result.error);
  }

  async function sync() {
    setSyncing(true);
    setNotice('');
    const pending = show('pending', 'Syncing with Bitwarden…');
    const response = await window.latch.sync();
    setSyncing(false);
    if (response.ok) {
      settle(pending, 'done', 'Vault up to date');
      receiveState(response.value);
    } else {
      settle(pending, 'error', response.error);
      setNotice(response.error);
    }
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
                {id === 'trash' && trashed.length > 0 && <small>{trashed.length}</small>}
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
          <ItemList
            items={visible}
            selectedId={selectedId}
            onSelect={(item) => void select(item)}
            query={query}
            onNew={() => setEditor('new')}
            emptyLabel={filter === 'trash' ? 'The trash is empty' : undefined}
          />
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
            <Detail
              key={selected.id}
              item={selected}
              onEdit={() => setEditor('edit')}
              onGone={() => {
                setSelected(null);
                setSelectedId('');
              }}
              notify={notify}
            />
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
          notify={notify}
        />
      )}
      {settings && (
        <Settings
          onClose={() => setSettings(false)}
          biometrics={state.biometrics}
          biometricsOn={state.biometricsOn}
          onBiometrics={(enabled) => void setBiometrics(enabled)}
        />
      )}
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
