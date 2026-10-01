import { Action, ActionPanel, Form, Icon, open } from '@raycast/api';
import { useRef, useState } from 'react';
import { request, SearchResult } from './bridge';

export function Unlock({ state, onUnlock }: { state: SearchResult; onUnlock: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef(false);
  async function unlock(biometric = false) {
    if (pending.current) return;
    if (!biometric && !password) {
      setError('Enter your master password.');
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await request(biometric ? { type: 'biometricUnlock' } : { type: 'unlock', password });
      setPassword('');
      onUnlock();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not unlock. Try again.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Form
      navigationTitle="Unlock Bitlatch"
      isLoading={busy}
      enableDrafts={false}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Unlock Vault" onSubmit={() => unlock()} />
          {state.canUseBiometrics && (
            <Action
              title="Unlock with Touch ID"
              icon={Icon.Fingerprint}
              onAction={() => unlock(true)}
            />
          )}
          <Action
            title="Open Bitlatch"
            icon={Icon.AppWindow}
            onAction={() => open('/Applications/Bitlatch.app')}
          />
        </ActionPanel>
      }
    >
      <Form.Description title="Account" text={state.email || 'Your Bitlatch vault'} />
      <Form.PasswordField
        id="password"
        title="Master Password"
        autoFocus
        value={password}
        error={error}
        onChange={(value) => {
          setPassword(value);
          setError(undefined);
        }}
      />
    </Form>
  );
}
