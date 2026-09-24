import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual';
import {
  Fingerprint,
  LockKey as LockKeyhole,
  MagnifyingGlass as Search,
  Star,
} from '@phosphor-icons/react';
import type { ItemSummary, MenuPosition } from '@latch/shared/types';
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
  header,
  selectedId,
  revealSelection = 0,
  onSelect,
  onItemMenu,
  onFavorite,
  favoritePending = '',
  query,
  onNew,
  emptyLabel,
  emptyDescription,
  loading = false,
  error = '',
}: {
  items: ItemSummary[];
  header: ReactNode;
  selectedId: string;
  revealSelection?: number;
  onSelect: (item: ItemSummary) => void;
  onItemMenu: (item: ItemSummary, position: MenuPosition) => void;
  onFavorite?: (item: ItemSummary) => void;
  favoritePending?: string;
  query: string;
  onNew: () => void;
  emptyLabel?: string;
  emptyDescription?: string;
  loading?: boolean;
  error?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(92);
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () => setHeaderHeight(header.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const listId = useId();
  const activeIndex = items.findIndex((item) => item.id === selectedId);
  const rowId = (id: string) => `${listId}-item-${id}`;
  // Selection changes must not invalidate all 10,000 row measurements.
  const getItemKey = useCallback((index: number) => items[index]!.id, [items]);
  // Keep at most one extra row mounted when wheel scrolling moves the
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
    paddingStart: headerHeight,
    scrollPaddingStart: headerHeight + 4,
    rangeExtractor,
    getItemKey,
  });

  const rows = virtualizer.getVirtualItems();
  const activeMounted = activeIndex >= 0 && rows.some((row) => row.index === activeIndex);
  const lastReveal = useRef(revealSelection);
  useLayoutEffect(() => {
    if (lastReveal.current === revealSelection || activeIndex < 0) return;
    lastReveal.current = revealSelection;
    // Quick open can choose an offscreen row, including the current selection.
    // Use the virtualizer so the sticky header and unmounted rows are respected.
    virtualizer.scrollToIndex(activeIndex, { align: 'auto' });
  }, [revealSelection, activeIndex, virtualizer]);

  return (
    <div
      className="list-content"
      style={{ '--scroll-header-height': `${headerHeight}px` } as CSSProperties}
    >
      <div ref={headerRef} className="list-header scroll-header">
        {header}
      </div>
      <div
        className="list-scroll"
        style={{ marginTop: -headerHeight, scrollPaddingTop: headerHeight + 4 }}
        ref={listRef}
        role="grid"
        aria-label="Vault items"
        aria-rowcount={items.length}
        aria-colcount={2}
        aria-busy={loading}
        aria-activedescendant={activeMounted ? `${rowId(selectedId)}-summary` : undefined}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.metaKey || event.ctrlKey || event.altKey || event.nativeEvent.isComposing)
            return;
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            document
              .getElementById(rowId(selectedId))
              ?.querySelector<HTMLButtonElement>('.row-star')
              ?.focus({ preventScroll: true });
            return;
          }
          if (event.key === 'ArrowLeft' || event.key === 'Escape') {
            event.preventDefault();
            listRef.current?.focus({ preventScroll: true });
            return;
          }
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            const item = items[activeIndex];
            if (!item) return;
            event.preventDefault();
            virtualizer.scrollToIndex(activeIndex, { align: 'auto' });
            const bounds = document.getElementById(rowId(item.id))?.getBoundingClientRect();
            if (bounds)
              onItemMenu(item, {
                x: Math.max(0, Math.round(bounds.left + 20)),
                y: Math.max(0, Math.min(window.innerHeight - 1, Math.round(bounds.bottom))),
              });
            return;
          }
          const page = Math.max(
            1,
            Math.floor(
              ((listRef.current?.clientHeight ?? VAULT_ROW_HEIGHT) - headerHeight) /
                VAULT_ROW_HEIGHT,
            ),
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
          listRef.current?.focus({ preventScroll: true });
          next = Math.max(0, Math.min(items.length - 1, next));
          const item = items[next];
          if (!item) return;
          if (item.id !== selectedId) onSelect(item);
          virtualizer.scrollToIndex(next, { align: 'auto' });
        }}
      >
        {items.length ? (
          <div role="rowgroup" style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {rows.map((row) => {
              const item = items[row.index]!;
              return (
                <div
                  id={rowId(item.id)}
                  key={item.id}
                  role="row"
                  aria-selected={item.id === selectedId}
                  aria-rowindex={row.index + 1}
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
                    if (item.id !== selectedId) onSelect(item);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    listRef.current?.focus({ preventScroll: true });
                    onItemMenu(item, {
                      x: Math.round(event.clientX),
                      y: Math.round(event.clientY),
                    });
                  }}
                >
                  <span role="gridcell" id={`${rowId(item.id)}-summary`} className="item-summary">
                    <ItemIcon item={item} />
                    <span className="item-text">
                      <strong>{item.name || 'Untitled item'}</strong>
                      <small>
                        {item.username || displayWebsite(item.website) || typeName(item.type)}
                      </small>
                    </span>
                    {item.hasPasskey && (
                      <Fingerprint size={14} className="muted" aria-label="Has a passkey" />
                    )}
                    {item.restricted && (
                      <LockKeyhole size={14} className="muted" aria-label="Restricted" />
                    )}
                  </span>
                  <span role="gridcell" className="item-actions">
                    {onFavorite &&
                    !item.restricted &&
                    !item.hasPasskey &&
                    (item.type === 1 || item.type === 2) ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="row-star disabled:opacity-100"
                        tabIndex={-1}
                        aria-label={`Favorite ${item.name || 'Untitled item'}`}
                        aria-pressed={item.favorite}
                        aria-busy={favoritePending === item.id}
                        title={item.favorite ? 'Remove from favorites' : 'Add to favorites'}
                        disabled={!!favoritePending}
                        onClick={(event) => {
                          event.stopPropagation();
                          listRef.current?.focus({ preventScroll: true });
                          onFavorite(item);
                        }}
                      >
                        {favoritePending === item.id ? (
                          <Spinner />
                        ) : (
                          <Star weight={item.favorite ? 'fill' : 'regular'} />
                        )}
                      </Button>
                    ) : (
                      item.favorite && <Star size={12} weight="fill" aria-label="Favorite" />
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty
            className="list-empty"
            role="status"
            style={{ marginTop: headerHeight, minHeight: `calc(100% - ${headerHeight}px)` }}
          >
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
    </div>
  );
}
