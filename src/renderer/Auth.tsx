import { useState, type FormEvent } from 'react';
import { ArrowRight, ChevronDown, LockKeyhole, LogOut } from 'lucide-react';
import type { Result, VaultState } from '../shared/types';
import { Mark } from './Mark';

export function Auth({
  state,
  onState,
}: {
  state: VaultState;
  onState: (state: VaultState) => void;
}) {
  const [email, setEmail] = useState(state.email);
  const [password, setPassword] = useState('');
  const hostedServer = ['https://vault.bitwarden.com', 'https://vault.bitwarden.eu'].includes(
    state.server,
  );
  const [server, setServer] = useState(hostedServer ? state.server : 'custom');
  const [customServer, setCustomServer] = useState(hostedServer ? '' : state.server);
  const [apiKey, setApiKey] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = state.status === 'locked';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const result: Result<VaultState> = locked
      ? await window.latch.unlock(password)
      : await window.latch.login({
          email,
          password,
          server: server === 'custom' ? customServer : server,
          ...(apiKey ? { clientId, clientSecret } : {}),
        });
    setPassword('');
    setClientSecret('');
    setBusy(false);
    if (result.ok) onState(result.value);
    else setError(result.error);
  }

  async function signOut() {
    setBusy(true);
    const response = await window.latch.logout();
    setBusy(false);
    if (response.ok) onState(response.value);
    else setError(response.error);
  }

  return (
    <div className="auth-screen">
      <div className="auth-brand">
        <Mark />
        <span>Latch</span>
        <span className="preview-tag">PREVIEW</span>
      </div>
      <div className="auth-card">
        <div className="auth-icon">
          <LockKeyhole size={27} strokeWidth={1.3} />
        </div>
        <h1>{locked ? 'Welcome back.' : 'Your vault, within reach.'}</h1>
        <p className="auth-description">
          {locked
            ? `Unlock ${state.email || 'your vault'} to continue.`
            : 'A quieter home for your Bitwarden passwords.'}
        </p>
        {state.setupError && (
          <p role="alert" className="error-message">
            {state.setupError}
          </p>
        )}
        <form onSubmit={(event) => void submit(event)}>
          {!locked && (
            <label>
              Email address
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </label>
          )}
          <label>
            Master password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your master password"
              required
              autoFocus={locked}
            />
          </label>
          {!locked && (
            <>
              <label>
                Server
                <span className="select-wrap">
                  <select
                    aria-label="Server"
                    value={server}
                    onChange={(event) => setServer(event.target.value)}
                  >
                    <option value="https://vault.bitwarden.com">Bitwarden · United States</option>
                    <option value="https://vault.bitwarden.eu">Bitwarden · Europe</option>
                    <option value="custom">Self-hosted server</option>
                  </select>
                  <ChevronDown size={13} />
                </span>
              </label>
              {server === 'custom' && (
                <label>
                  Server address
                  <input
                    type="url"
                    placeholder="https://vault.example.com"
                    value={customServer}
                    onChange={(event) => setCustomServer(event.target.value)}
                    required
                  />
                </label>
              )}
              <button
                className="disclosure"
                type="button"
                aria-expanded={apiKey}
                onClick={() => setApiKey(!apiKey)}
              >
                <ChevronDown size={13} className={apiKey ? '' : 'rotate-left'} /> Personal API key
                sign-in
              </button>
              {apiKey && (
                <div className="api-fields">
                  <p className="hint">
                    For accounts with two-step verification or a sign-in challenge. Find your
                    personal API key in the Bitwarden web vault → Settings → Security → Keys.
                  </p>
                  <label>
                    Client ID
                    <input
                      autoComplete="off"
                      value={clientId}
                      onChange={(event) => setClientId(event.target.value)}
                      placeholder="user.…"
                      required
                    />
                  </label>
                  <label>
                    Client secret
                    <input
                      type="password"
                      autoComplete="off"
                      value={clientSecret}
                      onChange={(event) => setClientSecret(event.target.value)}
                      required
                    />
                  </label>
                </div>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <button className="primary auth-submit" disabled={busy || Boolean(state.setupError)}>
            {busy ? 'Opening your vault…' : locked ? 'Unlock vault' : 'Connect your vault'}
            {!busy && <ArrowRight size={15} />}
          </button>
        </form>
        {locked && (
          <button
            type="button"
            className="quiet signout"
            onClick={() => void signOut()}
            disabled={busy}
          >
            <LogOut size={12} /> Use another account
          </button>
        )}
        <p className="auth-footnote">
          <span className="status-dot" />
          Your master password stays on this Mac.
        </p>
      </div>
      <div className="auth-bottom">
        <span>Built for a little less friction.</span>
        <span>0.1 · EARLY PREVIEW</span>
      </div>
    </div>
  );
}
