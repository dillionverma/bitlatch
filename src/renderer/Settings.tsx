import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, CircleAlert, X } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
        className="task-dialog"
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
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="task-header">
          <DialogTitle ref={title} tabIndex={-1}>
            Settings
          </DialogTitle>
          <DialogDescription>Browser connection and vault security.</DialogDescription>
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
          <div className="task-settings-section">
            <h3 className="text-sm font-semibold">Browser</h3>
            <ol className="task-setup-steps">
              <li>
                <strong>Install the browser bridge.</strong>
                <p className="text-xs text-muted-foreground">
                  Connects this Mac app to Chrome and Aside.
                </p>
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
                      ? 'Bridge installed'
                      : 'Connect browser'}
                </Button>
              </li>
              <li>
                <strong>Load the extension.</strong>
                <p className="text-xs text-muted-foreground">
                  Open <code>chrome://extensions</code>, enable Developer mode, then choose{' '}
                  <b>Load unpacked</b> and select the extension folder.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void run('folder')}
                  disabled={pending}
                >
                  {busy === 'folder' ? <Spinner /> : <ArrowUpRight data-icon="inline-end" />}Show
                  extension folder
                </Button>
              </li>
              <li>
                <strong>Focus a login field.</strong>
                <p className="text-xs text-muted-foreground">
                  Unlock Latch to see matching accounts. Keep the Mac app running. Installing the
                  bridge alone does not verify the extension connection.
                </p>
              </li>
            </ol>
          </div>
          <Separator />
          <div className="task-settings-section">
            <h3 className="text-sm font-semibold">Security</h3>
            <FieldGroup>
              <Field
                orientation="horizontal"
                className="setting-row task-setting-row bg-transparent"
                data-disabled={(!biometricsOn && biometrics !== 'ready') || pending}
              >
                <FieldContent>
                  <FieldLabel id="settings-touch-id-label" htmlFor="settings-touch-id">
                    Unlock with Touch ID
                  </FieldLabel>
                  <FieldDescription id="touch-id-description">
                    {biometrics === 'unsupported'
                      ? 'Touch ID is not supported on this Mac.'
                      : biometrics === 'unavailable'
                        ? 'Touch ID is unavailable. Open your MacBook or connect a keyboard with Touch ID. You can still use your master password.'
                        : 'Keeps the vault session key encrypted on this Mac. Your master password still works. Turning this off or signing out removes the stored key.'}
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
            <p id="touch-id-limits" className="text-xs text-muted-foreground">
              The login Keychain protects the stored key. Touch ID is an app check, not a biometric
              restriction on that key. While enabled, Latch retains the CLI session key when
              locking.
            </p>
          </div>
          <Separator />
          <Alert>
            <AlertTitle>Preview limits</AlertTitle>
            <AlertDescription>
              Browser sign-ins can offer to save or update a login while Latch is unlocked. Passkey
              use, system-wide autofill, and shared or protected items still require another client.
            </AlertDescription>
          </Alert>
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter className="task-footer">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
