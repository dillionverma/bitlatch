import { Action, ActionPanel, Icon, List, open, showToast, Toast } from '@raycast/api';
import { useEffect, useState } from 'react';
import { request, SearchResult, Login } from './bridge';

export default function SearchVault() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult>({ status: 'loading', items: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setLoading(true);
    setResult({ status: 'loading', items: [] });
    async function refresh() {
      try {
        const next = await request<SearchResult>({ type: 'search', query }, controller.signal);
        if (controller.signal.aborted) return;
        setResult(next);
        setError('');
      } catch (e) {
        if (controller.signal.aborted) return;
        setResult({ status: 'unavailable', items: [] });
        setError(e instanceof Error ? e.message : 'Latch is unavailable.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(refresh, 2000);
        }
      }
    }
    timer = setTimeout(refresh, 100);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);
  async function copy(item: Login, field: 'password' | 'username') {
    try {
      await request({ type: 'copy', id: item.id, field });
      await showToast({
        style: Toast.Style.Success,
        title: field === 'password' ? 'Password copied' : 'Username copied',
        message: 'Latch clears it after 30 seconds.',
      });
    } catch (e) {
      setResult({ status: 'unavailable', items: [] });
      await showToast({
        style: Toast.Style.Failure,
        title: 'Could not copy',
        message: e instanceof Error ? e.message : 'Open Latch and try again.',
      });
    }
  }
  const openLatch = (
    <Action
      title="Open Latch"
      icon={Icon.AppWindow}
      onAction={() => open('/Applications/Latch.app')}
    />
  );
  return (
    <List
      isLoading={loading}
      filtering={false}
      searchText={query}
      onSearchTextChange={setQuery}
      searchBarPlaceholder="Search Latch logins…"
    >
      <List.EmptyView
        icon="icon.png"
        title={
          error ||
          (result.status === 'unlocked'
            ? 'No matching logins'
            : result.status === 'loading'
              ? 'Connecting to Latch…'
              : 'Unlock Latch to search')
        }
        description="Authentication stays in Latch."
        actions={<ActionPanel>{openLatch}</ActionPanel>}
      />
      {result.items.map((item) => (
        <List.Item
          key={item.id}
          id={item.id}
          icon={Icon.Key}
          title={item.name || 'Untitled login'}
          subtitle={item.username}
          actions={
            <ActionPanel>
              <Action
                title="Copy Password"
                icon={Icon.Clipboard}
                onAction={() => copy(item, 'password')}
              />
              <Action
                title="Copy Username"
                icon={Icon.Person}
                shortcut={{ modifiers: ['cmd'], key: 'u' }}
                onAction={() => copy(item, 'username')}
              />
              {/^https?:\/\//i.test(item.website) && <Action.OpenInBrowser url={item.website} />}
              {openLatch}
              <Action
                title="Lock Vault"
                icon={Icon.Lock}
                shortcut={{ modifiers: ['cmd', 'shift'], key: 'l' }}
                onAction={async () => {
                  try {
                    await request({ type: 'lock' });
                    setResult({ status: 'locked', items: [] });
                  } catch {
                    await showToast({ style: Toast.Style.Failure, title: 'Could not lock Latch' });
                  }
                }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
