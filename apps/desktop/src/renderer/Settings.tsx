import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  PaintBrush,
} from '@phosphor-icons/react';
import {
  lockTimeoutMinutes,
  type BrowserConnection,
  type LockTimeoutMinutes,
  type MacAutoFillState,
  type VaultState,
} from '@latch/shared/types';
import { useWebsiteIcons } from './WebsiteIcons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
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
    id: 'autofill',
    label: 'AutoFill',
    icon: LockKey,
    description: 'Fill logins in Safari and supported Mac apps.',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: PaintBrush,
    description: 'Make items easier to recognize in your vault.',
  },
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
  biometrics,
  biometricsOn,
  onBiometrics,
  biometricsBusy = false,
}: {
  onClose: () => void;
  biometrics: VaultState['biometrics'];
  biometricsOn: boolean;
  onBiometrics: (enabled: boolean) => void | Promise<void>;
  biometricsBusy?: boolean;
}) {
  const icons = useWebsiteIcons();
  const [connection, setConnection] = useState<BrowserConnection | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<
    'folder' | 'biometrics' | 'icons' | 'autofill' | 'autofillSettings' | 'timeout' | null
  >(null);
  const [autoFill, setAutoFill] = useState<MacAutoFillState | null>(null);
  const [timeout, setTimeoutMinutes] = useState<LockTimeoutMinutes | null>(null);
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
  useEffect(() => {
    let current = true;
    void window.latch
      .lockTimeout()
      .then((result) => {
        if (!current || !alive.current) return;
        if (result.ok) setTimeoutMinutes(result.value);
        else setError(result.error);
      })
      .catch(() => {
        if (current && alive.current)
          setError('Could not load the lock timer. Reopen Settings to try again.');
      });
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    let current = true;
    let revision = 0;
    const refresh = async () => {
      if (working.current) return;
      const request = ++revision;
      const result = await window.latch.macAutoFill().catch(() => null);
      if (!current || !alive.current || request !== revision || working.current) return;
      if (result?.ok) setAutoFill(result.value);
      else
        setError(
          result && !result.ok
            ? result.error
            : 'Could not check macOS AutoFill. Reopen Settings to try again.',
        );
    };
    void refresh();
    window.addEventListener('focus', refresh);
    return () => {
      current = false;
      window.removeEventListener('focus', refresh);
    };
  }, []);
  useEffect(() => {
    if (section !== 'browser') return;
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      const result = await window.latch.browserConnection().catch(() => null);
      if (!current || !alive.current) return;
      setConnection(result?.ok ? result.value : 'setup-error');
      timer = setTimeout(refresh, 2000);
    };
    void refresh();
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [section]);
  async function run(
    kind: 'folder' | 'biometrics' | 'icons' | 'autofill' | 'autofillSettings' | 'timeout',
    minutes?: LockTimeoutMinutes,
  ) {
    if (working.current || biometricsBusy || !alive.current) return;
    working.current = true;
    setBusy(kind);
    setError('');
    const request = ++epoch.current;
    try {
      if (kind === 'timeout' && minutes !== undefined) {
        const result = await window.latch.setLockTimeout(minutes);
        if (!alive.current || request !== epoch.current) return;
        if (result.ok) setTimeoutMinutes(result.value);
        else setError(result.error);
      } else if (kind === 'biometrics') await onBiometrics(!biometricsOn);
      else if (kind === 'icons') await icons.setEnabled(!icons.enabled);
      else if (kind === 'autofill' || kind === 'autofillSettings') {
        if (kind === 'autofillSettings') {
          const result = await window.latch.macAutoFillSettings();
          if (!result.ok && alive.current && request === epoch.current) setError(result.error);
        } else {
          const result = await window.latch.enableMacAutoFill();
          if (!alive.current || request !== epoch.current) return;
          if (result.ok) setAutoFill(result.value);
          else setError(result.error);
        }
      } else {
        const result = await window.latch.openExtensionFolder();
        if (!alive.current || request !== epoch.current) return;
        if (!result.ok) setError(result.error);
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
        <div className="task-detail-body settings-body" aria-busy={pending}>
          <header className="settings-overview">
            <span className="settings-section-icon">
              <Icon size={28} />
            </span>
            <h2>{current.label}</h2>
            <p>{current.description}</p>
          </header>
          {section === 'autofill' && (
            <section className="task-settings-section">
              <h3>macOS AutoFill</h3>
              <div className="settings-group">
                <div className="settings-row">
                  <div>
                    <strong>Use Latch for AutoFill</strong>
                    <p>
                      {autoFill?.enabled
                        ? 'Latch is enabled in macOS.'
                        : 'Let macOS suggest logins from your vault.'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending || !autoFill?.available}
                    onClick={() => void run(autoFill?.enabled ? 'autofillSettings' : 'autofill')}
                    aria-busy={busy === 'autofill'}
                  >
                    {busy === 'autofill' || !autoFill ? (
                      <Spinner />
                    ) : autoFill.enabled ? (
                      <Check data-icon="inline-start" />
                    ) : null}
                    {busy === 'autofill'
                      ? 'Waiting for macOS…'
                      : autoFill?.enabled
                        ? 'Manage in Settings'
                        : 'Turn on…'}
                  </Button>
                </div>
              </div>
              <p className="settings-caption">
                {autoFill && !autoFill.available
                  ? autoFill.reason
                  : 'macOS will ask you to confirm. Keep Latch running and unlocked to fill a login.'}
              </p>
              <p className="settings-caption">
                Login websites and usernames are shared with macOS for suggestions. Passwords are
                requested only when you choose a login.
              </p>
            </section>
          )}
          {section === 'appearance' && (
            <section className="task-settings-section">
              <h3>Vault items</h3>
              <FieldGroup className="settings-group">
                <Field orientation="horizontal" className="setting-row settings-row">
                  <FieldContent>
                    <FieldLabel htmlFor="settings-website-icons">Website icons</FieldLabel>
                    <FieldDescription id="website-icons-description">
                      Show website logos beside your logins.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="settings-website-icons"
                    checked={icons.enabled}
                    onCheckedChange={() => void run('icons')}
                    disabled={pending || !icons.ready}
                    aria-describedby="website-icons-description website-icons-privacy"
                    aria-busy={busy === 'icons'}
                  />
                </Field>
              </FieldGroup>
              <p id="website-icons-privacy" className="settings-caption">
                Requests send website hostnames to Bitwarden’s icon service, never passwords,
                usernames, or URL paths. Local addresses stay private. Icons are cached until you
                lock the vault.
              </p>
            </section>
          )}
          {section === 'browser' && (
            <section className="task-settings-section">
              <h3>Browser extension</h3>
              <div className="settings-group">
                <div className="settings-row">
                  <div>
                    <strong>Connection</strong>
                    <p>
                      {connection === 'connected'
                        ? 'Your browser extension is communicating with Latch.'
                        : connection === 'setup-error'
                          ? 'Browser setup could not finish. Restart Latch to try again.'
                          : 'Open the Latch extension in your browser to connect.'}
                    </p>
                  </div>
                  <Badge
                    variant={connection === 'setup-error' ? 'destructive' : 'secondary'}
                    role="status"
                  >
                    {connection === 'connected' && <Check />}
                    {connection === null
                      ? 'Checking…'
                      : connection === 'connected'
                        ? 'Connected'
                        : connection === 'setup-error'
                          ? 'Setup unavailable'
                          : 'Not detected'}
                  </Badge>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>Add Latch to your browser</strong>
                    <p>Chrome, Aside, Brave, Edge, Arc and other Chromium browsers.</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void run('folder')}
                    disabled={pending}
                  >
                    {busy === 'folder' ? <Spinner /> : <ArrowUpRight data-icon="inline-end" />}
                    Get extension
                  </Button>
                </div>
              </div>
              <ol className="settings-caption list-decimal space-y-2 pl-5">
                <li>
                  Choose <strong>Get extension</strong> to open its folder.
                </li>
                <li>
                  In your browser’s extensions page, turn on <strong>Developer mode</strong>, then
                  choose <strong>Load unpacked</strong> and select that folder.
                </li>
                <li>Open the Latch extension. The status above updates automatically.</li>
              </ol>
              <p className="settings-caption">
                Already installed? Reload the extension after updating Latch. Keep Latch running for
                autofill.
              </p>
            </section>
          )}
          {section === 'security' && (
            <section className="task-settings-section">
              <h3>Auto-lock</h3>
              <FieldGroup className="settings-group">
                <Field orientation="horizontal" className="setting-row settings-row">
                  <FieldContent>
                    <FieldLabel htmlFor="settings-lock-timeout">Lock when idle</FieldLabel>
                    <FieldDescription id="lock-timeout-description">
                      How long your Mac can be inactive before Latch locks.
                    </FieldDescription>
                  </FieldContent>
                  <NativeSelect
                    id="settings-lock-timeout"
                    value={timeout ?? ''}
                    disabled={pending || timeout === null}
                    aria-describedby="lock-timeout-description lock-timeout-limits"
                    aria-busy={busy === 'timeout'}
                    onChange={(event) =>
                      void run('timeout', Number(event.target.value) as LockTimeoutMinutes)
                    }
                  >
                    {timeout === null && <NativeSelectOption value="">Loading…</NativeSelectOption>}
                    {lockTimeoutMinutes.map((minutes) => (
                      <NativeSelectOption key={minutes} value={minutes}>
                        {minutes === 0 ? 'On sleep or screen lock' : `${minutes} minutes`}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              </FieldGroup>
              <p id="lock-timeout-limits" className="settings-caption">
                Your vault always locks when your Mac sleeps or the screen locks. Lock anytime with
                ⌘L.
              </p>
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
                      Personal logins, passkeys and secure notes. Use Bitwarden for shared or
                      protected items.
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
