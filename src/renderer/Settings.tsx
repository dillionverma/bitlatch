import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, WarningCircle as CircleAlert, X } from '@phosphor-icons/react';
import type { VaultState } from '../shared/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'install' | 'folder' | 'biometrics' | null>(null);
  const [active, setActive] = useState(true);
  const alive = useRef(false);
  const epoch = useRef(0);
  const working = useRef(false);
  const returnFocus = useRef(document.activeElement);
  const title = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    alive.current = true;
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
  if (!active) return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        className="task-dialog task-settings"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          title.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocus.current;
          if (
            target instanceof HTMLElement &&
            target !== document.body &&
            target.isConnected &&
            target.getClientRects().length
          )
            target.focus();
          else
            document
              .querySelector<HTMLElement>('#auth-password, [aria-label="Search vault"]')
              ?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <DialogHeader className="task-header">
          <DialogTitle ref={title} tabIndex={-1}>
            Settings
          </DialogTitle>
          <DialogDescription className="sr-only">
            Browser connection and vault security.
          </DialogDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="task-close"
            aria-label="Close settings"
            onClick={onClose}
            disabled={pending}
          >
            <X />
          </Button>
        </DialogHeader>
        <div className="task-body" aria-busy={pending}>
          <section className="task-settings-section">
            <h3>Browser</h3>
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
                  {busy === 'install' ? 'Installing…' : connected ? 'Installed' : 'Connect browser'}
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
          <section className="task-settings-section">
            <h3>Security</h3>
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
          <details className="settings-help">
            <summary>About this preview</summary>
            <p>Use Bitwarden for passkeys, shared or protected items, and system-wide autofill.</p>
          </details>
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter className="task-footer">
          <Button type="button" onClick={onClose} disabled={pending}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
