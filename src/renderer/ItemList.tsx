import { useLayoutEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Fingerprint, LockKeyhole, Plus, Search, Star } from 'lucide-react';
import type { ItemSummary } from '../shared/types';
import { ItemIcon, displayWebsite, typeName } from './items';

/**
 * The scrolling vault list.
 *
 * This owns its virtualizer on purpose. The virtualizer remembers how far the
 * list is scrolled, so it has to be created and discarded with the element it
 * measures. Kept alive across a lock, it would hold the old scroll position
 * while the new element sat at the top, and draw every row out of sight.
 */
export function ItemList({
  items,
  selectedId,
  onSelect,
  query,
  onNew,
  emptyLabel,
  loading = false,
  error,
  onRetry,
}: {
  items: ItemSummary[];
  selectedId: string;
  onSelect: (item: ItemSummary) => void;
  query: string;
  onNew: () => void;
  emptyLabel?: string;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 66,
    overscan: 8,
    getItemKey: (index) => items[index]!.id,
  });

  useLayoutEffect(() => {
    virtualizer.scrollToOffset(0);
  }, [query, virtualizer]);

  return (
    <div
      className="list-scroll"
      ref={listRef}
      role="listbox"
      aria-label="Vault items"
      aria-busy={loading}
      tabIndex={0}
      onKeyDown={(event) => {
        if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
        event.preventDefault();
        const current = items.findIndex((item) => item.id === selectedId);
        const next = Math.max(
          0,
          Math.min(items.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)),
        );
        if (items[next]) {
          onSelect(items[next]!);
          virtualizer.scrollToIndex(next);
        }
      }}
    >
      {error ? (
        <div className="list-empty" role="alert">
          <strong>Could not load items</strong>
          <p>{error}</p>
          <button className="text-action" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : loading && !items.length ? (
        <div className="list-empty" role="status">
          Loading items…
        </div>
      ) : items.length ? (
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((row) => {
            const item = items[row.index]!;
            return (
              <button
                key={item.id}
                role="option"
                aria-selected={item.id === selectedId}
                className={`item-row ${item.id === selectedId ? 'selected' : ''}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: row.size,
                  transform: `translateY(${row.start}px)`,
                }}
                onClick={() => onSelect(item)}
              >
                <ItemIcon item={item} />
                <span className="item-text">
                  <strong>{item.name}</strong>
                  <small>
                    {item.username || displayWebsite(item.website) || typeName(item.type)}
                  </small>
                </span>
                {item.favorite && <Star size={10} className="row-star" fill="currentColor" />}
                {item.hasPasskey && <Fingerprint size={13} className="muted" />}
                {item.restricted && <LockKeyhole size={12} className="muted" />}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="list-empty">
          <Search size={22} strokeWidth={1.3} />
          <strong>{query ? 'Nothing found' : (emptyLabel ?? 'A clean slate')}</strong>
          <p>
            {query
              ? 'Try a name, email, or website.'
              : emptyLabel
                ? 'Items you delete are kept here by Bitwarden.'
                : 'Your items will appear here.'}
          </p>
          {!query && !emptyLabel && (
            <button className="text-action" onClick={onNew}>
              Add your first login <Plus size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
