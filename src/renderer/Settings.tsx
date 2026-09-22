import { useState } from 'react';
import { ArrowUpRight, Check, Fingerprint, Globe2, X } from 'lucide-react';
import { useBackdropDismiss, useDialogFocus } from './useDialogFocus';
import type { VaultState } from '../shared/types';

export function Settings({
  onClose,
  biometrics,
  biometricsOn,
  onBiometrics,
}: {
  onClose: () => void;
  biometrics: VaultState['biometrics'];
  biometricsOn: boolean;
  onBiometrics: (enabled: boolean) => void;
}) {
  const dialogRef = useDialogFocus();
  const backdrop = useBackdropDismiss(onClose);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  async function install() {
    const result = await window.latch.installBrowser();
    if (result.ok) setConnected(true);
    else setError(result.error);
  }
  return (
    <div
      className="editor-overlay"
      role="presentation"
      {...backdrop}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="settings editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header>
          <div>
            <span className="eyebrow">WITHIN REACH</span>
            <h2 id="settings-title">Connect your browser</h2>
          </div>
          <button className="icon-button" aria-label="Close settings" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <div className="browser-art">
          <Globe2 size={34} strokeWidth={1} />
          <span>Latch + Chrome / Aside</span>
        </div>
        <ol className="setup-steps">
          <li>
            <strong>Connect the Mac app.</strong>
            <p>Sets up a private native messaging bridge for Chrome and Aside.</p>
            <button className="secondary" onClick={() => void install()}>
              {connected ? (
                <>
                  <Check size={13} /> Bridge connected
                </>
              ) : (
                'Connect browser'
              )}
            </button>
          </li>
          <li>
            <strong>Load the extension.</strong>
            <p>
              Open <code>chrome://extensions</code> in your browser. Enable Developer mode, choose{' '}
              <b>Load unpacked</b>, and select the extension folder.
            </p>
            <button className="secondary" onClick={() => void window.latch.openExtensionFolder()}>
              Show extension folder <ArrowUpRight size={13} />
            </button>
          </li>
          <li>
            <strong>Focus a login field.</strong>
            <p>
              Your matching accounts appear inline. Keep Latch running; closing the window keeps it
              available.
            </p>
          </li>
        </ol>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {biometrics !== 'unsupported' && (
          <div className="setting-row">
            <span className="setting-icon">
              <Fingerprint size={17} strokeWidth={1.5} />
            </span>
            <div>
              <strong>Unlock with Touch ID</strong>
              <p>
                {biometrics === 'unavailable'
                  ? 'macOS is not offering Touch ID right now. On a MacBook this usually means the lid is closed; open it, or use a keyboard with Touch ID.'
                  : 'Keeps this vault’s key on this Mac so Touch ID can reopen it. Your master password still opens it, and signing out forgets the key.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={biometricsOn}
              aria-label="Unlock with Touch ID"
              disabled={biometrics !== 'ready'}
              className={`switch ${biometricsOn ? 'on' : ''}`}
              onClick={() => onBiometrics(!biometricsOn)}
            >
              <span />
            </button>
          </div>
        )}
        <div className="preview-note">
          <strong>A small first release.</strong>
          <p>
            Password filling, search, and personal logins are ready to try. Passkeys and automatic
            save prompts are still to come. Use the official client for shared and protected items.
          </p>
        </div>
      </section>
    </div>
  );
}
