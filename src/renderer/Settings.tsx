import { useState } from 'react';
import { ArrowUpRight, Check, Globe2, X } from 'lucide-react';
import { useDialogFocus } from './useDialogFocus';

export function Settings({ onClose }: { onClose: () => void }) {
  const dialogRef = useDialogFocus();
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
        <div className="preview-note">
          <strong>A small first release.</strong>
          <p>
            Password filling, search, and personal logins are ready to try. Passkeys, Touch ID, and
            automatic save prompts are still to come. Use the official client for shared and
            protected items.
          </p>
        </div>
      </section>
    </div>
  );
}
