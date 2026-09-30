import { Action, ActionPanel, Detail, Icon, List, open, showToast, Toast } from '@raycast/api';
import { useEffect, useState } from 'react';
import { CopyField, ItemDetail, request, VaultItem } from './bridge';

export function OpenLatch() {
  return (
    <Action
      title="Open Latch"
      icon={Icon.AppWindow}
      onAction={() => open('/Applications/Latch.app')}
    />
  );
}

export function ItemActions({
  item,
  onFailure,
  primary,
}: {
  item: VaultItem | ItemDetail;
  onFailure: () => void;
  primary?: CopyField | 'open';
}) {
  async function copy(field: CopyField) {
    try {
      await request({ type: 'copy', id: item.id, field });
      await showToast({
        style: Toast.Style.Success,
        title: `${field === 'notes' ? 'Note' : field.charAt(0).toUpperCase() + field.slice(1)} copied`,
        message: 'Latch clears it after 30 seconds.',
      });
    } catch (error) {
      onFailure();
      await showToast({
        style: Toast.Style.Failure,
        title: 'Could not copy',
        message: error instanceof Error ? error.message : 'Try again.',
      });
    }
  }
  const fields = [
    {
      field: 'password',
      title: 'Copy Password',
      icon: Icon.Key,
      key: 'p',
      enabled: item.type === 1 && (!('hasPassword' in item) || item.hasPassword),
    },
    {
      field: 'username',
      title: 'Copy Username',
      icon: Icon.Person,
      key: 'u',
      enabled: Boolean(item.username),
    },
    {
      field: 'notes',
      title: 'Copy Note',
      icon: Icon.Document,
      key: 'n',
      enabled: !('notes' in item) || Boolean(item.notes.trim()),
    },
    {
      field: 'website',
      title: 'Copy Website',
      icon: Icon.Link,
      key: 'c',
      enabled: Boolean(item.website),
    },
  ] as const;
  const canOpen = /^https?:\/\//i.test(item.website);
  return (
    <>
      {primary === 'open' && canOpen && <Action.OpenInBrowser url={item.website} />}
      {[...fields]
        .sort((a, b) => Number(b.field === primary) - Number(a.field === primary))
        .filter((action) => action.enabled)
        .map((action) => (
          <Action
            key={action.field}
            title={action.title}
            icon={action.icon}
            shortcut={{
              modifiers:
                action.field === 'website' || action.field === 'password'
                  ? ['cmd', 'shift']
                  : ['cmd'],
              key: action.key,
            }}
            onAction={() => copy(action.field)}
          />
        ))}
      {primary !== 'open' && canOpen && <Action.OpenInBrowser url={item.website} />}
      <OpenLatch />
      <Action
        title="Lock Vault"
        icon={Icon.Lock}
        shortcut={{ modifiers: ['cmd', 'shift'], key: 'l' }}
        onAction={async () => {
          try {
            await request({ type: 'lock' });
          } catch {
            await showToast({ style: Toast.Style.Failure, title: 'Could not lock vault' });
          } finally {
            onFailure();
          }
        }}
      />
    </>
  );
}

// Render vault text literally: note Markdown must never load remote images.
function literal(text: string) {
  const fence = '`'.repeat(
    Math.max(3, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length + 1)),
  );
  return `${fence}\n${text}\n${fence}`;
}

export function ItemPage({ id, showNote = false }: { id: string; showNote?: boolean }) {
  const [item, setItem] = useState<ItemDetail>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const next = await request<ItemDetail>({ type: 'detail', id }, controller.signal);
        if (!controller.signal.aborted) {
          setItem(next);
          setError('');
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setItem(undefined);
          setError(error instanceof Error ? error.message : 'Item unavailable.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(refresh, 2000);
        }
      }
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id]);
  function unavailable() {
    setItem(undefined);
    setError('Vault locked or item unavailable. Go back to search to unlock.');
  }
  const actions = (primary?: CopyField | 'open') => (
    <ActionPanel>
      {item ? <ItemActions item={item} primary={primary} onFailure={unavailable} /> : <OpenLatch />}
    </ActionPanel>
  );
  if (!item || item.type === 2 || showNote) {
    return (
      <Detail
        navigationTitle={item?.name || 'Item Details'}
        isLoading={loading}
        markdown={
          item
            ? item.notes.trim()
              ? literal(item.notes)
              : 'This note is empty.'
            : loading
              ? ''
              : literal(error)
        }
        actions={actions('notes')}
      />
    );
  }
  let website = item.website;
  try {
    website = new URL(item.website).hostname;
  } catch {
    /* Keep non-URL values readable. */
  }
  return (
    <List
      navigationTitle={item.name}
      filtering={false}
      searchBarPlaceholder="Item details"
      isLoading={loading}
    >
      <List.Section title={item.name}>
        {item.username && (
          <List.Item
            id="username"
            title="Username"
            subtitle={item.username}
            icon={Icon.Person}
            actions={actions('username')}
          />
        )}
        <List.Item
          id="password"
          title="Password"
          subtitle={item.hasPassword ? '••••••••' : 'Not set'}
          icon={Icon.Key}
          actions={actions(item.hasPassword ? 'password' : undefined)}
        />
        {item.website && (
          <List.Item
            id="website"
            title="Website"
            subtitle={website}
            icon={Icon.Globe}
            actions={actions(/^https?:\/\//i.test(item.website) ? 'open' : 'website')}
          />
        )}
        {item.notes.trim() && (
          <List.Item
            id="notes"
            title="Notes"
            icon={Icon.Document}
            accessories={[{ text: 'View note' }]}
            actions={
              <ActionPanel>
                <Action.Push
                  title="View Note"
                  icon={Icon.Document}
                  target={<ItemPage id={id} showNote />}
                />
                <ItemActions item={item} primary="notes" onFailure={unavailable} />
              </ActionPanel>
            }
          />
        )}
      </List.Section>
    </List>
  );
}
