import { useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  WarningCircle as CircleAlert,
  CaretLeft,
  Globe,
  ShieldCheck,
  Info,
  GearSix,
  LockKey,
} from '@phosphor-icons/react';
import type { VaultState } from '../shared/types';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import './tasks.css';
import './settings.css';

const sections = [
  {
    id: 'browser',
    label: 'Browser',
    icon: Globe,
    description: 'Connect Latch to your browser for quick, secure autofill.',
  },
  {
    id: 'security',
    label: 'Security',
    icon: ShieldCheck,
    description: 'Choose how you unlock your vault on this Mac.',
  },
  {
    id: 'about',
    label: 'About Latch',
    icon: Info,
    description: 'A quiet companion for your Bitwarden vault.',
  },
] as const;
type Section = (typeof sections)[number]['id'];

export function Settings({
  onClose,
  onLock,
  biometrics,
  biometricsOn,
  onBiometrics,
  biometricsBusy = false,
}: {
  onClose: () => void;
  onLock: () => void;
  biometrics: VaultState['biometrics'];
  biometricsOn: boolean;
  onBiometrics: (enabled: boolean) => void | Promise<void>;
  biometricsBusy?: boolean;
}) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'install' | 'folder' | 'biometrics' | null>(null);
  const [active, setActive] = useState(true);
  const alive = useRef(false);
  const epoch = useRef(0);
  const working = useRef(false);
  const [section, setSection] = useState<Section>('browser');
  const back = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    alive.current = true;
    back.current?.focus({ preventScroll: true });
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
  async function run(kind: 'install' | 'folder' | 'biometrics') {
    if (working.current || biometricsBusy || !alive.current) return;
    working.current = true;
    setBusy(kind);
    setError('');
    const request = ++epoch.current;
    try {
      if (kind === 'biometrics') await onBiometrics(!biometricsOn);
      else {
        const result = await (kind === 'install'
          ? window.latch.installBrowser()
          : window.latch.openExtensionFolder());
        if (!alive.current || request !== epoch.current) return;
        if (!result.ok) setError(result.error);
        else if (kind === 'install') setConnected(true);
      }
    } catch {
      if (alive.current && request === epoch.current)
        setError('Could not change this setting. Try again.');
    } finally {
      if (alive.current && request === epoch.current) {
        working.current = false;
        setBusy(null);
      }
    }
  }
  const pending = !!busy || biometricsBusy;
  const current = sections.find((entry) => entry.id === section)!;
  const Icon = current.icon;
  if (!active) return null;
  return (
    <main
      className="settings-screen"
      aria-label="Settings"
      onKeyDown={(event) => {
        if (event.key === 'Escape' || (event.metaKey && event.key === '[')) {
          event.preventDefault();
          if (!pending) onClose();
        }
      }}
    >
      <aside className="sidebar settings-sidebar">
        <div className="workspace-titlebar" aria-hidden="true" />
        <div className="vault-label">
          <span className="vault-avatar">
            <GearSix size={20} />
          </span>
          <div>
            <strong>Settings</strong>
            <small>Latch</small>
          </div>
        </div>
        <nav aria-label="Settings categories">
          {sections.map(({ id, label, icon: SectionIcon }) => (
            <Button
              key={id}
              variant="sidebar"
              className="nav-item"
              aria-pressed={section === id}
              disabled={pending}
              onClick={() => setSection(id)}
            >
              <SectionIcon size={16} />
              <span>{label}</span>
            </Button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Button variant="sidebar" className="nav-item" onClick={onLock}>
            <LockKey size={16} />
            <span>Lock vault</span>
            <Kbd>⌘L</Kbd>
          </Button>
        </div>
      </aside>
      <section
        key={section}
        className="task-detail settings-panel"
        aria-labelledby="settings-page-title"
      >
        <header className="task-detail-toolbar scroll-header settings-toolbar">
          <Button
            ref={back}
            type="button"
            variant="outline"
            size="icon"
            aria-label="Back to vault"
            title="Back to vault"
            disabled={pending}
            onClick={onClose}
          >
            <CaretLeft />
          </Button>
          <h1 id="settings-page-title">{current.label}</h1>
        </header>
        <div
          className="task-detail-body settings-body"
          aria-busy={pending}
          onScroll={(event) => {
            event.currentTarget.parentElement!.dataset.scrolled = String(
              event.currentTarget.scrollTop > 0,
            );
          }}
        >
          <header className="settings-overview">
            <span className="settings-section-icon">
              <Icon size={28} />
            </span>
            <h2>{current.label}</h2>
            <p>{current.description}</p>
          </header>
          {section === 'browser' && (
            <section className="task-settings-section">
              <h3>Connection</h3>
              <div className="settings-group">
                <div className="settings-row">
                  <div>
                    <strong>Browser bridge</strong>
                    <p>Connect Chrome or Aside to Latch.</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void run('install')}
                    disabled={pending}
                    aria-busy={busy === 'install'}
                  >
                    {busy === 'install' ? (
                      <Spinner />
                    ) : connected ? (
                      <Check data-icon="inline-start" />
                    ) : null}
                    {busy === 'install'
                      ? 'Installing…'
                      : connected
                        ? 'Installed'
                        : 'Connect browser'}
                  </Button>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>Browser extension</strong>
                    <p>Load the extension in your browser.</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void run('folder')}
                    disabled={pending}
                    aria-label="Show extension folder"
                  >
                    {busy === 'folder' ? <Spinner /> : <ArrowUpRight data-icon="inline-end" />}Open
                    folder
                  </Button>
                </div>
              </div>
              <details className="settings-help">
                <summary>Extension setup</summary>
                <p>
                  Open <code>chrome://extensions</code>, enable Developer mode, choose{' '}
                  <b>Load unpacked</b>, and select the extension folder.
                </p>
                <p>
                  Keep Latch running and unlocked, then focus a login field. Installing the bridge
                  alone does not verify the connection.
                </p>
              </details>
            </section>
          )}
          {section === 'security' && (
            <section className="task-settings-section">
              <h3>Unlock</h3>
              <FieldGroup className="settings-group">
                <Field
                  orientation="horizontal"
                  className="setting-row settings-row"
                  data-disabled={(!biometricsOn && biometrics !== 'ready') || pending}
                >
                  <FieldContent>
                    <FieldLabel id="settings-touch-id-label" htmlFor="settings-touch-id">
                      Unlock with Touch ID
                    </FieldLabel>
                    <FieldDescription id="touch-id-description">
                      {biometrics === 'unsupported'
                        ? 'Not supported on this Mac.'
                        : biometrics === 'unavailable'
                          ? 'Connect a keyboard with Touch ID or open your MacBook.'
                          : 'Use Touch ID instead of your master password.'}
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="settings-touch-id"
                    aria-labelledby="settings-touch-id-label"
                    checked={biometricsOn}
                    onCheckedChange={() => void run('biometrics')}
                    disabled={(!biometricsOn && biometrics !== 'ready') || pending}
                    aria-describedby="touch-id-description touch-id-limits"
                    aria-busy={busy === 'biometrics' || biometricsBusy}
                  />
                </Field>
              </FieldGroup>
              {(busy === 'biometrics' || biometricsBusy) && (
                <p role="status" className="task-inline-status text-xs text-muted-foreground">
                  <Spinner />
                  Updating Touch ID…
                </p>
              )}
              <p id="touch-id-limits" className="settings-caption">
                Keeps the session key in your login Keychain while locked. Touch ID is checked by
                Latch. Turn this off to remove the stored key.
              </p>
            </section>
          )}
          {section === 'about' && (
            <section className="task-settings-section">
              <h3>Your vault</h3>
              <div className="settings-group">
                <div className="settings-row">
                  <div>
                    <strong>Bitwarden account</strong>
                    <p>Latch connects to your existing Bitwarden vault.</p>
                  </div>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>Supported items</strong>
                    <p>
                      Personal logins and secure notes. Use Bitwarden for passkeys, shared or
                      protected items, and system-wide autofill.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </section>
    </main>
  );
}
