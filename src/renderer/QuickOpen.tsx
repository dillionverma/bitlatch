import { useMemo, useRef, useState } from 'react';
import type { ItemSummary } from '../shared/types';
import { ItemIcon, displayWebsite, typeName } from './items';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';

const RESULT_LIMIT = 20;

export function QuickOpen({
  indexed,
  loading,
  error,
  onClose,
  onSelect,
}: {
  indexed: { item: ItemSummary; haystack: string }[];
  loading: boolean;
  error: string;
  onClose: () => void;
  onSelect: (item: ItemSummary) => void;
}) {
  const [query, setQuery] = useState('');
  const returnFocus = useRef(document.activeElement);
  const chosen = useRef(false);
  const matches = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const results: ItemSummary[] = [];
    for (const { item, haystack } of indexed) {
      if (!terms.every((term) => haystack.includes(term))) continue;
      results.push(item);
      if (results.length > RESULT_LIMIT) break;
    }
    return results;
  }, [indexed, query]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="top-24 translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = chosen.current
            ? document.querySelector<HTMLElement>('[aria-label="Vault items"]')
            : returnFocus.current;
          if (target instanceof HTMLElement && target.isConnected)
            target.focus({ preventScroll: true });
        }}
      >
        <DialogTitle className="sr-only">Quick open</DialogTitle>
        <DialogDescription className="sr-only">
          Find a vault item by name, username, or website. Use arrow keys and Enter to open it.
        </DialogDescription>
        <Command shouldFilter={false} loop label="Quick open">
          <CommandInput
            aria-label="Find a vault item"
            placeholder="Find a password or note…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList aria-busy={loading}>
            <CommandEmpty>
              {loading ? 'Loading vault…' : error || 'No matching items.'}
            </CommandEmpty>
            <CommandGroup heading="Vault items">
              {matches.slice(0, RESULT_LIMIT).map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => {
                    chosen.current = true;
                    onSelect(item);
                  }}
                >
                  <ItemIcon item={item} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <strong className="truncate font-medium">{item.name || 'Untitled item'}</strong>
                    <small className="truncate text-muted-foreground">
                      {item.username || displayWebsite(item.website) || typeName(item.type)}
                    </small>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="flex items-center justify-between gap-4 border-t px-3 py-2 text-xs text-muted-foreground">
          <span>
            {matches.length > RESULT_LIMIT
              ? 'Top 20 matches · Type to narrow'
              : '↑ ↓ Navigate · ↵ Open'}
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd> Close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
