import { Action, ActionPanel, Detail, Icon, open } from '@raycast/api';
import { useRef, useState } from 'react';
import { request, SearchResult } from './bridge';

export function Unlock({ state, onUnlock }: { state: SearchResult; onUnlock: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef(false);
  async function unlock() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await request({ type: 'biometricUnlock' });
      onUnlock();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not unlock. Try again.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function openDesktop() {
    try {
      await request({ type: 'open' });
    } catch {
      await open('/Applications/Bitlatch.app');
    }
  }
  return (
    <Detail
      navigationTitle="Unlock Bitlatch"
      isLoading={busy}
      markdown={error ?? `Open Bitlatch to unlock ${state.email || 'your vault'}.`}
      actions={
        <ActionPanel>
          {state.canUseBiometrics && (
            <Action title="Unlock with Touch ID" icon={Icon.Fingerprint} onAction={unlock} />
          )}
          <Action title="Open Bitlatch" icon={Icon.AppWindow} onAction={openDesktop} />
        </ActionPanel>
      }
    />
  );
}
