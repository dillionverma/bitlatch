import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  WarningCircle as AlertCircle,
  FileText,
  Fingerprint,
  Vault as FolderKey,
  Key as KeyRound,
  LockKey as LockKeyhole,
  Plus,
  ArrowsClockwise as RefreshCw,
  MagnifyingGlass as Search,
  SlidersHorizontal as Settings2,
  Star,
  Trash as Trash2,
  User as UserRound,
  X,
} from '@phosphor-icons/react';
import type { ItemDetail, ItemSummary, VaultState } from '../shared/types';
import { Auth } from './Auth';
import { Editor } from './Editor';
import { Settings } from './Settings';
import { Mark } from './Mark';
import { Detail } from './Detail';
import { ItemList } from './ItemList';
import { Toasts, useToasts, type Notifier } from './Toasts';
import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Kbd } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import './workspace.css';
import { useWindowAppearance } from './useWindowAppearance';

const initialState: VaultState = {
  revision: -1,
  itemsRevision: 0,
  trashLoaded: false,
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
type DetailStatus = 'unselected' | 'loading' | 'restricted' | 'error' | 'ready';
const filters = [
  { id: 'all', label: 'All items', icon: FolderKey, empty: undefined, description: undefined },
  {
    id: 'favorites',
    label: 'Favorites',
    icon: Star,
    empty: 'No favorites',
    description: 'Mark an item as a favorite to find it here.',
  },
  {
    id: 'logins',
    label: 'Logins',
    icon: KeyRound,
    empty: 'No logins',
    description: 'Use New login to add one.',
  },
  {
    id: 'notes',
    label: 'Secure notes',
    icon: FileText,
    empty: 'No secure notes',
    description: 'Secure notes from Bitwarden appear here.',
  },
  {
    id: 'passkeys',
    label: 'Passkeys',
    icon: Fingerprint,
    empty: 'No saved passkeys',
    description: 'Passkey items appear here as read-only.',
  },
  {
    id: 'trash',
    label: 'Trash',
    icon: Trash2,
    empty: 'Trash is empty',
    description: 'Items moved to Trash can be restored.',
  },
] as const;

function indexItems(items: ItemSummary[]) {
  return items.map((item) => ({
    item,
    haystack: `${item.name} ${item.username} ${item.website}`.toLowerCase(),
  }));
}

/** Include task-owned and portalled dialogs, not only App's modal state. */
function hasModal() {
  return !!document.querySelector(
    '[role="dialog"]:not([data-state="closed"]), [role="alertdialog"]:not([data-state="closed"])',
  );
}

export function App() {
  useWindowAppearance();
  const [state, setState] = useState(initialState);
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state);
  const stateVersion = useRef(0);
  const locking = useRef(false);
  const receiveState = useCallback((next: VaultState) => {
    if (locking.current && next.status === 'unlocked') return;
    if (next.revision < stateRef.current.revision) return;
    stateVersion.current++;
    stateRef.current = next;
    // External lock events must remove the entire workspace and its portals
    // before returning to the event loop, without an exit-animation interval.
    flushSync(() => {
      setState(next);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.latch.onState(receiveState);
    const version = stateVersion.current;
    void window.latch
      .state()
      .then((response) => {
        if (!active || version !== stateVersion.current) return;
        receiveState(
          response.ok
            ? response.value
            : {
                ...initialState,
                setupError: 'Could not connect to Latch. Reopen the app to try again.',
              },
        );
      })
      .catch(() => {
        if (active && version === stateVersion.current)
          receiveState({
            ...initialState,
            setupError: 'Could not connect to Latch. Reopen the app to try again.',
          });
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [receiveState]);

  const lock = useCallback(() => {
    if (stateRef.current.status !== 'unlocked' || locking.current) return;
    locking.current = true;
    receiveState({ ...stateRef.current, status: 'locked', itemCount: 0, trashCount: 0 });
    void window.latch
      .lock()
      .then((response) => {
        if (response.ok && response.value.status !== 'unlocked') receiveState(response.value);
      })
      .catch(() => {
        // Keep the renderer locked if the bridge fails. Never restore old data.
      })
      .finally(() => {
        locking.current = false;
      });
  }, [receiveState]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        event.stopImmediatePropagation();
        lock();
      }
    };
    addEventListener('keydown', keyboard, true);
    return () => removeEventListener('keydown', keyboard, true);
  }, [lock]);

  if (!ready)
    return (
      <div className="boot" role="status">
        <Mark size={30} />
        <span>Latch</span>
      </div>
    );
  if (state.status !== 'unlocked')
    return <Auth key={state.status + state.email} state={state} onState={receiveState} />;
  // All vault state, virtualizers, task portals and notifications have exactly
  // this lifetime. A later unlock mounts a fresh workspace and fresh guards.
  return <VaultWorkspace state={state} onState={receiveState} onLock={lock} />;
}

function VaultWorkspace({
  state,
  onState,
  onLock,
}: {
  state: VaultState;
  onState: (state: VaultState) => void;
  onLock: () => void;
}) {
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [trashed, setTrashed] = useState<ItemSummary[]>([]);
  const [selected, setSelected] = useState<ItemDetail | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [detailStatus, setDetailStatus] = useState<DetailStatus>('unselected');
  const [detailError, setDetailError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editor, setEditor] = useState<'new' | 'edit' | null>(null);
  const [settings, setSettings] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [trashLoading, setTrashLoading] = useState(false);
  const [listError, setListError] = useState({ all: '', trash: '' });
  const alive = useRef(true);
  const selectionVersion = useRef(0);
  const listVersion = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const { toasts, show, settle, dismiss } = useToasts();
  const notify = useMemo<Notifier>(
    () => ({
      show: (kind, message) => (alive.current ? show(kind, message) : -1),
      settle: (id, kind, message) => {
        if (alive.current) settle(id, kind, message);
      },
    }),
    [show, settle],
  );

  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      selectionVersion.current++;
      listVersion.current++;
    };
  }, []);

  useEffect(() => {
    const version = ++listVersion.current;
    setLoading(true);
    void window.latch
      .items()
      .then((listed) => {
        if (!alive.current || version !== listVersion.current) return;
        if (listed.ok) setItems(listed.value);
        setListError((current) => ({
          ...current,
          all: listed.ok ? '' : 'Could not load vault items. Try Sync vault.',
        }));
        setLoading(false);
      })
      .catch(() => {
        if (!alive.current || version !== listVersion.current) return;
        setListError((current) => ({
          ...current,
          all: 'Could not load vault items. Try Sync vault.',
        }));
        setLoading(false);
      });
    return () => {
      ++listVersion.current;
    };
  }, [state.itemsRevision]);

  useEffect(() => {
    if (filter !== 'trash') return;
    let current = true;
    setTrashLoading(true);
    void window.latch
      .trash()
      .then((result) => {
        if (!alive.current || !current) return;
        if (result.ok) setTrashed(result.value);
        setListError((previous) => ({
          ...previous,
          trash: result.ok ? '' : 'Could not load Trash. Try Sync vault.',
        }));
        setTrashLoading(false);
      })
      .catch(() => {
        if (!alive.current || !current) return;
        setListError((previous) => ({
          ...previous,
          trash: 'Could not load Trash. Try Sync vault.',
        }));
        setTrashLoading(false);
      });
    return () => {
      current = false;
    };
  }, [filter, state.itemsRevision]);

  const commands = useRef({ editor, settings });
  commands.current = { editor, settings };
  const runCommand = useCallback((command: 'search' | 'new' | 'settings') => {
    if (!alive.current || commands.current.editor || commands.current.settings || hasModal())
      return;
    if (command === 'search') {
      searchInput.current?.focus();
      searchInput.current?.select();
    }
    if (command === 'new') {
      newButton.current?.focus();
      setEditor('new');
    }
    if (command === 'settings') {
      settingsButton.current?.focus();
      setSettings(true);
    }
  }, []);

  useEffect(() => window.latch.onCommand(runCommand), [runCommand]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.isComposing) return;
      const command = ({ k: 'search', n: 'new', ',': 'settings' } as const)[
        event.key.toLowerCase() as 'k' | 'n' | ','
      ];
      if (!command) return;
      event.preventDefault();
      if (!event.repeat) runCommand(command);
    };
    addEventListener('keydown', keyboard);
    return () => removeEventListener('keydown', keyboard);
  }, [runCommand]);

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
  const selectionVisible = !!selectedId && visible.some((item) => item.id === selectedId);

  useLayoutEffect(() => {
    if (!selectedId || selectionVisible) return;
    selectionVersion.current++;
    setSelectedId('');
    setSelected(null);
    setDetailStatus('unselected');
    setDetailError('');
  }, [selectedId, selectionVisible]);

  async function select(item: ItemSummary) {
    if (!alive.current) return;
    const version = ++selectionVersion.current;
    setSelectedId(item.id);
    setSelected(null);
    setDetailError('');
    if (item.restricted) {
      setDetailStatus('restricted');
      return;
    }
    setDetailStatus('loading');
    try {
      const response = await window.latch.detail(item.id);
      if (!alive.current || version !== selectionVersion.current) return;
      if (response.ok) {
        setSelected(response.value);
        setDetailStatus('ready');
      } else {
        setDetailStatus('error');
        setDetailError('Could not load this item. Try again.');
      }
    } catch {
      if (!alive.current || version !== selectionVersion.current) return;
      setDetailStatus('error');
      setDetailError('Could not load this item. Try again.');
    }
  }

  const refreshSelection = useRef(select);
  refreshSelection.current = select;
  useEffect(() => {
    if (!selectedId) return;
    const item =
      items.find((entry) => entry.id === selectedId) ??
      trashed.find((entry) => entry.id === selectedId);
    if (item) void refreshSelection.current(item);
  }, [state.itemsRevision]);

  async function setBiometrics(enabled: boolean) {
    if (!alive.current) return;
    const pending = notify.show(
      'pending',
      enabled ? 'Setting up Touch ID…' : 'Turning off Touch ID…',
    );
    try {
      const result = await window.latch.setBiometrics(enabled);
      if (!alive.current) return;
      if (result.ok) {
        notify.settle(pending, 'done', enabled ? 'Touch ID is on' : 'Touch ID is off');
        onState(result.value);
      } else notify.settle(pending, 'error', 'Could not change Touch ID. Try again.');
    } catch {
      notify.settle(pending, 'error', 'Could not change Touch ID. Try again.');
    }
  }

  async function sync() {
    if (syncing || !alive.current) return;
    setSyncing(true);
    const pending = notify.show('pending', 'Syncing with Bitwarden…');
    try {
      const response = await window.latch.sync();
      if (!alive.current) return;
      setSyncing(false);
      if (response.ok) {
        notify.settle(pending, 'done', 'Vault up to date');
        onState(response.value);
      } else
        notify.settle(pending, 'error', 'Could not sync. Check your connection and try again.');
    } catch {
      if (!alive.current) return;
      setSyncing(false);
      notify.settle(pending, 'error', 'Could not sync. Check your connection and try again.');
    }
  }

  const currentFilter = filters.find((entry) => entry.id === filter)!;
  const activeDetail = selectionVisible ? detailStatus : 'unselected';
  const currentListError = filter === 'trash' ? listError.trash : listError.all;
  return (
    <TooltipProvider>
      <div className="app vault-app">
        <main className="workspace" aria-label="Personal vault">
          <aside className="sidebar">
            <div className="workspace-titlebar" aria-hidden="true" />
            <div className="vault-label">
              <span className="vault-avatar">
                <UserRound size={16} />
              </span>
              <div>
                <strong>Personal vault</strong>
                <small title={state.email}>{state.email || 'Bitwarden'}</small>
              </div>
            </div>
            <nav aria-label="Vault filters">
              {filters.map(({ id, label, icon: Icon }) => (
                <Button
                  type="button"
                  variant="sidebar"
                  key={id}
                  className={`nav-item ${filter === id ? 'active' : ''}`}
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                  {id === 'all' && <small>{items.length.toLocaleString()}</small>}
                  {id === 'trash' && state.trashLoaded && state.trashCount > 0 && (
                    <small>{state.trashCount.toLocaleString()}</small>
                  )}
                </Button>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <Separator />
              <Button
                ref={settingsButton}
                type="button"
                variant="sidebar"
                className="nav-item"
                onClick={() => runCommand('settings')}
              >
                <Settings2 size={16} />
                <span>Settings</span>
              </Button>
              <Button type="button" variant="sidebar" className="nav-item" onClick={onLock}>
                <LockKeyhole size={16} />
                <span>Lock vault</span>
                <Kbd>⌘L</Kbd>
              </Button>
            </div>
          </aside>
          <section className="item-list" aria-label={currentFilter.label}>
            <ItemList
              header={
                <>
                  <header className="workspace-list-toolbar">
                    <InputGroup>
                      <InputGroupAddon>
                        <Search size={16} />
                      </InputGroupAddon>
                      <InputGroupInput
                        ref={searchInput}
                        aria-label="Search vault"
                        placeholder="Search vault"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                      <InputGroupAddon align="inline-end">
                        {!query && <Kbd>⌘K</Kbd>}
                        {query && (
                          <InputGroupButton
                            size="icon-xs"
                            aria-label="Clear search"
                            onClick={() => {
                              setQuery('');
                              searchInput.current?.focus();
                            }}
                          >
                            <X size={14} />
                          </InputGroupButton>
                        )}
                      </InputGroupAddon>
                    </InputGroup>
                  </header>
                  <header className="list-heading">
                    <h1>{query ? 'Search results' : currentFilter.label}</h1>
                    <span>{visible.length.toLocaleString()}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Sync vault"
                          aria-busy={syncing}
                          disabled={syncing}
                          onClick={() => void sync()}
                        >
                          {syncing ? <Spinner /> : <RefreshCw size={14} />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Sync vault</TooltipContent>
                    </Tooltip>
                  </header>
                  {currentListError && visible.length > 0 && (
                    <Alert variant="destructive" className="workspace-list-error">
                      <AlertCircle />
                      <AlertDescription>{currentListError}</AlertDescription>
                    </Alert>
                  )}
                </>
              }
              items={visible}
              selectedId={selectionVisible ? selectedId : ''}
              onSelect={(item) => void select(item)}
              query={query}
              onNew={() => runCommand('new')}
              emptyLabel={currentFilter.empty}
              emptyDescription={currentFilter.description}
              loading={filter === 'trash' ? trashLoading : loading}
              error={currentListError}
            />
            <footer className="list-footer">
              <Button
                ref={newButton}
                type="button"
                variant="ghost"
                className="workspace-new"
                onClick={() => runCommand('new')}
              >
                <Plus size={16} />
                New login<Kbd>⌘N</Kbd>
              </Button>
            </footer>
          </section>
          <section
            className="detail-pane"
            aria-label="Item details"
            aria-busy={activeDetail === 'loading'}
          >
            {selected && selectionVisible ? (
              <Detail
                key={selected.id}
                item={selected}
                onEdit={() => {
                  if (!hasModal()) setEditor('edit');
                }}
                onGone={() => {
                  if (!alive.current) return;
                  selectionVersion.current++;
                  setSelected(null);
                  setSelectedId('');
                  setDetailStatus('unselected');
                }}
                notify={notify}
              />
            ) : (
              <Empty className="workspace-detail-empty" role="status">
                <EmptyHeader>
                  <EmptyMedia>
                    {activeDetail === 'loading' ? (
                      <Spinner />
                    ) : activeDetail === 'restricted' ? (
                      <LockKeyhole size={24} />
                    ) : activeDetail === 'error' ? (
                      <AlertCircle size={24} />
                    ) : (
                      <Mark size={28} />
                    )}
                  </EmptyMedia>
                  <EmptyTitle>
                    {activeDetail === 'loading'
                      ? 'Loading item…'
                      : activeDetail === 'restricted'
                        ? 'Open this item in Bitwarden'
                        : activeDetail === 'error'
                          ? 'Could not load item'
                          : query && !visible.length
                            ? 'No matching items'
                            : 'Select an item'}
                  </EmptyTitle>
                  <EmptyDescription>
                    {activeDetail === 'loading'
                      ? 'Reading item details.'
                      : activeDetail === 'restricted'
                        ? 'Shared and protected items are available in the official Bitwarden client.'
                        : activeDetail === 'error'
                          ? detailError
                          : query && !visible.length
                            ? 'Change or clear your search to see more items.'
                            : 'Choose an item to view its details.'}
                  </EmptyDescription>
                </EmptyHeader>
                {activeDetail === 'error' && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const item = visible.find((entry) => entry.id === selectedId);
                      if (item) void select(item);
                    }}
                  >
                    Try again
                  </Button>
                )}
                {query && !visible.length && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setQuery('');
                      searchInput.current?.focus();
                    }}
                  >
                    Clear search
                  </Button>
                )}
              </Empty>
            )}
          </section>
        </main>
        {editor && (
          <Editor
            item={editor === 'edit' ? selected : null}
            onClose={() => {
              if (alive.current) setEditor(null);
            }}
            onSaved={(item) => {
              if (!alive.current) return;
              selectionVersion.current++;
              setEditor(null);
              // Keep summaries secret-free, including the newly created item while
              // its broadcast list refresh is still in flight.
              const { id, name, username, website, type, favorite, hasPasskey, restricted } = item;
              setItems((current) => [
                ...current.filter((entry) => entry.id !== id),
                { id, name, username, website, type, favorite, hasPasskey, restricted },
              ]);
              setQuery('');
              setFilter('all');
              setSelected(item);
              setSelectedId(item.id);
              setDetailStatus('ready');
            }}
            notify={notify}
          />
        )}
        {settings && (
          <Settings
            onClose={() => {
              if (alive.current) setSettings(false);
            }}
            biometrics={state.biometrics}
            biometricsOn={state.biometricsOn}
            onBiometrics={setBiometrics}
          />
        )}
        <Toasts toasts={toasts} onDismiss={dismiss} />
      </div>
    </TooltipProvider>
  );
}
