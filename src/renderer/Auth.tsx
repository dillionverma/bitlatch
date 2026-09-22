import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  ChevronDown,
  Fingerprint,
  LockKeyhole,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import type { ChallengeAnswer, LoginChallenge, Result, VaultState } from '../shared/types';
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
  const canceled = useRef(false);
  const locked = state.status === 'locked';
  const touchId = locked && state.biometrics === 'ready' && state.biometricsOn;
  const asked = useRef(false);

  async function useTouchId() {
    setError('');
    setBusy(true);
    const result = await window.latch.unlockWithBiometrics();
    setBusy(false);
    if (result.ok) onState(result.value);
    else setError(result.error);
  }

  // Ask once when the lock screen appears, the way a Mac app would.
  useEffect(() => {
    if (!touchId || asked.current) return;
    asked.current = true;
    void useTouchId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touchId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    canceled.current = false;
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
    else if (!canceled.current) setError(result.error);
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
      {state.challenge ? (
        <Challenge
          challenge={state.challenge}
          onCancel={() => {
            canceled.current = true;
          }}
        />
      ) : (
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
                      For two-step methods the Bitwarden CLI cannot complete, such as a WebAuthn
                      security key or Duo. Find your personal API key in the Bitwarden web vault →
                      Settings → Security → Keys.
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
          {touchId && (
            <button
              type="button"
              className="secondary touch-id"
              onClick={() => void useTouchId()}
              disabled={busy}
            >
              <Fingerprint size={15} /> Unlock with Touch ID
            </button>
          )}
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
      )}
      <div className="auth-bottom">
        <span>Built for a little less friction.</span>
        <span>0.1 · EARLY PREVIEW</span>
      </div>
    </div>
  );
}

const METHOD_LABELS = {
  authenticator: 'Authenticator app',
  yubikey: 'YubiKey',
  email: 'Email me a code',
} as const;

function describe(challenge: LoginChallenge) {
  if (challenge.kind === 'method') return 'Choose how to confirm it is you.';
  if (challenge.kind === 'new-device')
    return `This Mac is new to Bitwarden. Enter the verification code emailed to ${challenge.email}.`;
  switch (challenge.method) {
    case 'authenticator':
      return 'Enter the code from your authenticator app.';
    case 'yubikey':
      return 'Insert your YubiKey and tap it to enter its code.';
    case 'email':
      return `Enter the code Bitwarden emailed to ${challenge.email}.`;
    default:
      return 'Enter your two-step login code from your authenticator app, YubiKey, or email.';
  }
}

/** The verification step of a sign-in: pick a two-step method or enter a code. */
function Challenge({ challenge, onCancel }: { challenge: LoginChallenge; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const numeric = challenge.method !== 'yubikey';

  // Each new challenge from the vault starts a fresh answer.
  useEffect(() => {
    setCode('');
    setBusy(false);
    setError('');
  }, [challenge]);

  async function answer(value: ChallengeAnswer) {
    setBusy(true);
    setError('');
    if ('cancel' in value) onCancel();
    const result = await window.latch.answerChallenge(value);
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-icon">
        <ShieldCheck size={27} strokeWidth={1.3} />
      </div>
      <h1>One more step.</h1>
      <p className="auth-description">{describe(challenge)}</p>
      {(challenge.error || error) && (
        <p role="alert" className="error-message">
          {error || challenge.error}
        </p>
      )}
      {challenge.kind === 'method' ? (
        <div className="method-list" role="group" aria-label="Two-step method">
          {challenge.methods.map((method) => (
            <button
              key={method}
              type="button"
              className="method-option"
              disabled={busy}
              onClick={() => void answer({ method })}
            >
              {METHOD_LABELS[method]}
              <ArrowRight size={14} />
            </button>
          ))}
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void answer({ code });
          }}
        >
          <label>
            Verification code
            <input
              autoComplete="one-time-code"
              inputMode={numeric ? 'numeric' : 'text'}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={challenge.method === 'yubikey' ? 'Tap your YubiKey' : 'Enter the code'}
              required
              autoFocus
            />
          </label>
          <button className="primary auth-submit" disabled={busy}>
            {busy ? 'Checking…' : 'Continue'}
            {!busy && <ArrowRight size={15} />}
          </button>
        </form>
      )}
      <button
        type="button"
        className="quiet signout"
        onClick={() => void answer({ cancel: true })}
        disabled={busy}
      >
        Start over
      </button>
      <p className="auth-footnote">
        <span className="status-dot" />
        Codes are sent straight to the Bitwarden CLI.
      </p>
    </div>
  );
}
