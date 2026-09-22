import { useCallback, useId, useRef } from 'react';
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual';
import { Fingerprint, LockKeyhole, Search, Star } from 'lucide-react';
import type { ItemSummary } from '../shared/types';
import { ItemIcon, displayWebsite, typeName } from './items';
import { VAULT_LIST_OVERSCAN, VAULT_ROW_HEIGHT } from './metrics';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';

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
  emptyDescription,
  loading = false,
  error = '',
}: {
  items: ItemSummary[];
  selectedId: string;
  onSelect: (item: ItemSummary) => void;
  query: string;
  onNew: () => void;
  emptyLabel?: string;
  emptyDescription?: string;
  loading?: boolean;
  error?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const activeIndex = items.findIndex((item) => item.id === selectedId);
  const optionId = (id: string) => `${listId}-item-${id}`;
  // Selection changes must not invalidate all 10,000 row measurements.
  const getItemKey = useCallback((index: number) => items[index]!.id, [items]);
  // Keep at most one extra option mounted when wheel scrolling moves the
  // selected row out of view. The active descendant must exist in the DOM.
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indices = defaultRangeExtractor(range);
      if (activeIndex >= 0 && !indices.includes(activeIndex)) {
        indices.push(activeIndex);
        indices.sort((a, b) => a - b);
      }
      return indices;
    },
    [activeIndex],
  );
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => VAULT_ROW_HEIGHT,
    overscan: VAULT_LIST_OVERSCAN,
    rangeExtractor,
    getItemKey,
  });

  const rows = virtualizer.getVirtualItems();
  const activeMounted = activeIndex >= 0 && rows.some((row) => row.index === activeIndex);

  return (
    <div
      className="list-scroll"
      ref={listRef}
      role="listbox"
      aria-label="Vault items"
      aria-busy={loading}
      aria-activedescendant={activeMounted ? optionId(selectedId) : undefined}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.metaKey || event.ctrlKey || event.altKey || event.nativeEvent.isComposing) return;
        const page = Math.max(
          1,
          Math.floor((listRef.current?.clientHeight ?? VAULT_ROW_HEIGHT) / VAULT_ROW_HEIGHT),
        );
        let next: number;
        switch (event.key) {
          case 'ArrowDown':
            next = activeIndex < 0 ? 0 : activeIndex + 1;
            break;
          case 'ArrowUp':
            next = activeIndex < 0 ? items.length - 1 : activeIndex - 1;
            break;
          case 'Home':
            next = 0;
            break;
          case 'End':
            next = items.length - 1;
            break;
          case 'PageDown':
            next = activeIndex < 0 ? 0 : activeIndex + page;
            break;
          case 'PageUp':
            next = activeIndex < 0 ? 0 : activeIndex - page;
            break;
          default:
            return;
        }
        event.preventDefault();
        next = Math.max(0, Math.min(items.length - 1, next));
        const item = items[next];
        if (!item) return;
        if (item.id !== selectedId) onSelect(item);
        virtualizer.scrollToIndex(next, { align: 'auto' });
      }}
    >
      {items.length ? (
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {rows.map((row) => {
            const item = items[row.index]!;
            return (
              <div
                id={optionId(item.id)}
                key={item.id}
                role="option"
                aria-selected={item.id === selectedId}
                aria-posinset={row.index + 1}
                aria-setsize={items.length}
                className={`item-row ${item.id === selectedId ? 'selected' : ''}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: VAULT_ROW_HEIGHT,
                  transform: `translateY(${row.start}px)`,
                }}
                onClick={() => {
                  listRef.current?.focus({ preventScroll: true });
                  onSelect(item);
                }}
              >
                <ItemIcon item={item} />
                <span className="item-text">
                  <strong>{item.name || 'Untitled item'}</strong>
                  <small>
                    {item.username || displayWebsite(item.website) || typeName(item.type)}
                  </small>
                </span>
                {item.favorite && <Star size={12} className="row-star" aria-label="Favorite" />}
                {item.hasPasskey && (
                  <Fingerprint size={14} className="muted" aria-label="Has a passkey" />
                )}
                {item.restricted && (
                  <LockKeyhole size={14} className="muted" aria-label="Restricted" />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <Empty className="list-empty" role="status">
          <EmptyHeader>
            <EmptyMedia>{loading ? <Spinner /> : <Search size={22} />}</EmptyMedia>
            <EmptyTitle>
              {loading
                ? 'Loading items…'
                : error
                  ? 'Could not load items'
                  : query
                    ? 'No results'
                    : (emptyLabel ?? 'No items yet')}
            </EmptyTitle>
            <EmptyDescription>
              {loading
                ? 'Reading your vault.'
                : error ||
                  (query
                    ? 'Try a name, email, or website.'
                    : (emptyDescription ??
                      (emptyLabel
                        ? 'Items you move to Trash are kept here by Bitwarden.'
                        : 'Add a login to get started.')))}
            </EmptyDescription>
          </EmptyHeader>
          {!loading && !error && !query && !emptyLabel && (
            <Button type="button" variant="outline" onClick={onNew}>
              Add your first login
            </Button>
          )}
        </Empty>
      )}
    </div>
  );
}
