import { Action, ActionPanel, Icon, List } from '@raycast/api';
import { useEffect, useState } from 'react';
import { request, SearchResult } from './bridge';
import { ItemActions, ItemPage, OpenLatch } from './item';
import { Unlock } from './unlock';

export default function SearchVault() {
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<SearchResult>({ status: 'loading', items: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    // Keep the current rows while a debounced search replaces them.
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
  }, [query, revision]);
  if (result.status === 'locked')
    return <Unlock state={result} onUnlock={() => setRevision((value) => value + 1)} />;
  return (
    <List
      isLoading={loading}
      filtering={false}
      searchText={query}
      onSearchTextChange={setQuery}
      searchBarPlaceholder="Search Latch…"
    >
      <List.EmptyView
        icon="icon.png"
        title={
          error ||
          (result.status === 'unlocked'
            ? 'No matching items'
            : result.status === 'loading'
              ? 'Connecting to Latch…'
              : 'Open Latch to connect')
        }
        description={
          result.status === 'signed-out'
            ? 'Sign in to your Bitwarden account in Latch first.'
            : undefined
        }
        actions={
          <ActionPanel>
            <OpenLatch />
          </ActionPanel>
        }
      />
      {result.items.map((item) => (
        <List.Item
          key={item.id}
          id={item.id}
          icon={
            item.type === 2
              ? Icon.Document
              : item.iconUrl
                ? { source: item.iconUrl, fallback: Icon.Key }
                : Icon.Key
          }
          title={item.name || 'Untitled item'}
          subtitle={item.type === 2 ? 'Secure note' : item.username}
          actions={
            <ActionPanel>
              <Action.Push
                title="Show Details"
                icon={Icon.Sidebar}
                target={<ItemPage id={item.id} />}
              />
              <ItemActions
                item={item}
                onFailure={() => {
                  setResult({ status: 'locked', items: [] });
                  setRevision((value) => value + 1);
                }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
