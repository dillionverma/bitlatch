import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  CaretDown as ChevronDown,
  Fingerprint,
  WarningCircle as CircleAlert,
} from '@phosphor-icons/react';
import type { ChallengeAnswer, LoginChallenge, Result, VaultState } from '../shared/types';
import { motion, useReducedMotion } from 'motion/react';
import appIcon from '../../assets/icon.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import './tasks.css';

export function Auth({
  state,
  onState,
}: {
  state: VaultState;
  onState: (state: VaultState) => void;
}) {
  const reduceMotion = useReducedMotion();
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
  const [biometricPending, setBiometricPending] = useState(false);
  const [error, setError] = useState('');
  const passwordInput = useRef<HTMLInputElement>(null);
  const alive = useRef(false);
  const epoch = useRef(0);
  const working = useRef(false);
  const canceled = useRef(false);
  const locked = state.status === 'locked';
  const touchId = locked && state.biometrics === 'ready' && state.biometricsOn;
  const asked = useRef(false);
  useLayoutEffect(() => {
    if (error && !busy && !state.challenge) passwordInput.current?.focus();
  }, [error, busy, state.challenge]);
  useLayoutEffect(() => {
    alive.current = true;
    const unsubscribe = window.latch.onState((next) => {
      if (next.status === 'locked' || (locked && next.status === 'signed-out')) {
        epoch.current++;
        working.current = false;
        setBusy(false);
        setBiometricPending(false);
        setPassword('');
        setClientSecret('');
      }
    });
    return () => {
      alive.current = false;
      epoch.current++;
      unsubscribe();
    };
  }, [locked]);
  async function run(action: () => Promise<Result<VaultState>>, biometric = false) {
    if (working.current || !alive.current) return;
    working.current = true;
    setBusy(true);
    setBiometricPending(biometric);
    setError('');
    const request = ++epoch.current;
    try {
      const result = await action();
      if (!alive.current || request !== epoch.current) return;
      if (result.ok) onState(result.value);
      else if (!canceled.current) setError(result.error);
    } catch {
      if (alive.current && request === epoch.current)
        setError('Could not complete sign-in. Try again.');
    } finally {
      if (alive.current && request === epoch.current) {
        working.current = false;
        setBusy(false);
        setBiometricPending(false);
      }
    }
  }
  useEffect(() => {
    if (!touchId || asked.current) return;
    asked.current = true;
    void run(() => window.latch.unlockWithBiometrics(), true);
    // The biometric prompt opens once for this lock screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touchId]);
  function submit(event: FormEvent) {
    event.preventDefault();
    canceled.current = false;
    void run(() => {
      const response = locked
        ? window.latch.unlock(password)
        : window.latch.login({
            email,
            password,
            server: server === 'custom' ? customServer : server,
            ...(apiKey ? { clientId, clientSecret } : {}),
          });
      setPassword('');
      setClientSecret('');
      return response;
    });
  }
  return (
    <main className="task-auth bg-background text-foreground" data-locked={locked}>
      <div className="auth-titlebar" aria-hidden="true" />
      {state.challenge ? (
        <Challenge
          challenge={state.challenge}
          onCancel={() => {
            canceled.current = true;
          }}
        />
      ) : (
        <motion.section
          className="task-auth-panel"
          initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}
        >
          <header className="task-auth-header">
            <img className="auth-brand" src={appIcon} alt="" aria-hidden="true" draggable={false} />
            <h1 className="auth-heading">
              {locked ? 'Welcome back' : 'Connect your Bitwarden vault'}
            </h1>
            <p className="text-xs text-muted-foreground" role="status">
              {biometricPending
                ? 'Confirm with Touch ID…'
                : locked
                  ? state.email || 'Personal vault'
                  : 'Use your existing account and master password.'}
            </p>
          </header>
          <form className="task-auth-form" onSubmit={submit} aria-busy={busy}>
            <div className="task-auth-body">
              <FieldGroup>
                {state.setupError && (
                  <Alert variant="destructive">
                    <CircleAlert />
                    <AlertDescription>{state.setupError}</AlertDescription>
                  </Alert>
                )}
                {!locked && (
                  <Field data-invalid={!!error}>
                    <FieldLabel htmlFor="auth-email">Email address</FieldLabel>
                    <Input
                      className="h-8"
                      id="auth-email"
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      autoFocus
                      disabled={busy}
                      aria-invalid={!!error}
                      aria-describedby={error ? 'auth-error' : undefined}
                    />
                  </Field>
                )}
                <Field data-invalid={!!error}>
                  <FieldLabel htmlFor="auth-password" className={locked ? 'sr-only' : undefined}>
                    Master password
                  </FieldLabel>
                  <Input
                    className="h-8"
                    id="auth-password"
                    ref={passwordInput}
                    placeholder={locked ? 'Master password' : undefined}
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    autoFocus={locked}
                    readOnly={busy}
                    aria-invalid={!!error}
                    aria-describedby={error ? 'auth-error' : undefined}
                  />
                </Field>
                {!locked && (
                  <>
                    <Field>
                      <FieldLabel htmlFor="auth-server">Server</FieldLabel>
                      <select
                        id="auth-server"
                        className="h-9 rounded-md border border-input bg-background px-2.5 py-0 text-sm text-foreground shadow-none focus:shadow-none focus:border-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                        value={server}
                        onChange={(event) => setServer(event.target.value)}
                        disabled={busy}
                      >
                        <option value="https://vault.bitwarden.com">
                          Bitwarden · United States
                        </option>
                        <option value="https://vault.bitwarden.eu">Bitwarden · Europe</option>
                        <option value="custom">Self-hosted server</option>
                      </select>
                    </Field>
                    {server === 'custom' && (
                      <Field>
                        <FieldLabel htmlFor="auth-custom-server">Server address</FieldLabel>
                        <Input
                          className="h-8"
                          id="auth-custom-server"
                          type="url"
                          placeholder="https://vault.example.com"
                          value={customServer}
                          onChange={(event) => setCustomServer(event.target.value)}
                          required
                          disabled={busy}
                        />
                      </Field>
                    )}
                    <Button
                      variant="ghost"
                      type="button"
                      className="justify-start"
                      aria-expanded={apiKey}
                      aria-controls="auth-api-fields"
                      disabled={busy}
                      onClick={() => {
                        setApiKey(!apiKey);
                        setClientSecret('');
                      }}
                    >
                      <ChevronDown data-icon="inline-start" />
                      Personal API key sign-in
                    </Button>
                    {apiKey && (
                      <FieldGroup id="auth-api-fields">
                        <FieldDescription>
                          For WebAuthn, Duo, or SSO accounts. Find your personal API key in the
                          Bitwarden web vault → Settings → Security → Keys.
                        </FieldDescription>
                        <Field data-invalid={!!error}>
                          <FieldLabel htmlFor="auth-client-id">Client ID</FieldLabel>
                          <Input
                            className="h-8"
                            id="auth-client-id"
                            autoComplete="off"
                            value={clientId}
                            onChange={(event) => setClientId(event.target.value)}
                            required
                            disabled={busy}
                            aria-invalid={!!error}
                            aria-describedby={error ? 'auth-error' : undefined}
                          />
                        </Field>
                        <Field data-invalid={!!error}>
                          <FieldLabel htmlFor="auth-client-secret">Client secret</FieldLabel>
                          <Input
                            className="h-8"
                            id="auth-client-secret"
                            type="password"
                            autoComplete="off"
                            value={clientSecret}
                            onChange={(event) => setClientSecret(event.target.value)}
                            required
                            disabled={busy}
                            aria-invalid={!!error}
                            aria-describedby={error ? 'auth-error' : undefined}
                          />
                        </Field>
                      </FieldGroup>
                    )}
                  </>
                )}
                {error && <FieldError id="auth-error">{error}</FieldError>}
              </FieldGroup>
            </div>
            <footer className="task-auth-actions">
              <Button
                className="auth-submit"
                data-loading={busy && !biometricPending}
                size="lg"
                type="submit"
                disabled={busy || !!state.setupError}
                aria-busy={busy}
              >
                {busy && !biometricPending && <Spinner aria-hidden="true" />}
                <span role="status" aria-live="polite">
                  {busy && !biometricPending
                    ? locked
                      ? 'Unlocking…'
                      : 'Connecting…'
                    : locked
                      ? 'Unlock vault'
                      : 'Connect your vault'}
                </span>
              </Button>
              {touchId && (
                <Button
                  size="lg"
                  variant="outline"
                  type="button"
                  onClick={() => void run(() => window.latch.unlockWithBiometrics(), true)}
                  disabled={busy}
                >
                  {biometricPending ? <Spinner /> : <Fingerprint data-icon="inline-start" />}
                  {biometricPending ? 'Waiting for Touch ID…' : 'Unlock with Touch ID'}
                </Button>
              )}
              {locked && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-center"
                  type="button"
                  onClick={() => void run(() => window.latch.logout())}
                  disabled={busy}
                >
                  Use another account
                </Button>
              )}
            </footer>
          </form>
        </motion.section>
      )}
    </main>
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

function Challenge({ challenge, onCancel }: { challenge: LoginChallenge; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const epoch = useRef(0);
  const working = useRef(false);
  useLayoutEffect(() => {
    epoch.current++;
    working.current = false;
    setCode('');
    setBusy(false);
    setError('');
    return () => {
      epoch.current++;
    };
  }, [challenge]);
  async function answer(value: ChallengeAnswer) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    setCode('');
    const request = epoch.current;
    if ('cancel' in value) onCancel();
    try {
      const result = await window.latch.answerChallenge(value);
      if (request !== epoch.current) return;
      if (!result.ok) {
        working.current = false;
        setBusy(false);
        setError(result.error);
      }
    } catch {
      if (request === epoch.current) {
        working.current = false;
        setBusy(false);
        setError('Could not verify sign-in. Try again.');
      }
    }
  }
  const message = error || challenge.error;
  return (
    <section className="task-auth-panel">
      <header className="task-auth-header">
        <h1 className="text-[20px] leading-[26px] font-semibold">Verify sign-in</h1>
        <p className="text-xs text-muted-foreground">{describe(challenge)}</p>
      </header>
      <form
        className="task-auth-form"
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault();
          if (challenge.kind !== 'method') void answer({ code });
        }}
      >
        <div className="task-auth-body">
          <FieldGroup>
            {message && <FieldError id="challenge-error">{message}</FieldError>}
            {challenge.kind === 'method' ? (
              <Field>
                <FieldLabel asChild>
                  <span>Two-step method</span>
                </FieldLabel>
                <div className="task-methods" role="group" aria-label="Two-step method">
                  {challenge.methods.map((method) => (
                    <Button
                      key={method}
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void answer({ method })}
                    >
                      {METHOD_LABELS[method]}
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                  ))}
                </div>
              </Field>
            ) : (
              <Field data-invalid={!!message}>
                <FieldLabel htmlFor="auth-code">Verification code</FieldLabel>
                <Input
                  className="h-8"
                  id="auth-code"
                  autoComplete="one-time-code"
                  inputMode={challenge.method === 'yubikey' ? 'text' : 'numeric'}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                  autoFocus
                  disabled={busy}
                  aria-invalid={!!message}
                  aria-describedby={message ? 'challenge-error' : undefined}
                />
              </Field>
            )}
          </FieldGroup>
        </div>
        <footer className="task-auth-actions">
          {challenge.kind !== 'method' && (
            <Button size="lg" type="submit" disabled={busy} aria-busy={busy}>
              {busy ? <Spinner /> : <ArrowRight data-icon="inline-end" />}
              {busy ? 'Checking…' : 'Continue'}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() => void answer({ cancel: true })}
            disabled={busy}
          >
            Start over
          </Button>
          <p className="text-xs text-muted-foreground">Codes go directly to the Bitwarden CLI.</p>
        </footer>
      </form>
    </section>
  );
}
