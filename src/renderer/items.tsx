import { CreditCard, FileText, UserRound } from 'lucide-react';
import type { ItemSummary } from '../shared/types';

export function ItemIcon({ item, large = false }: { item: ItemSummary; large?: boolean }) {
  const Icon =
    item.type === 2 ? FileText : item.type === 3 ? CreditCard : item.type === 4 ? UserRound : null;
  const tone = [...item.name].reduce((value, char) => value + char.charCodeAt(0), 0) % 5;
  return (
    <span aria-hidden="true" className={`item-icon tone-${tone} ${large ? 'large' : ''}`}>
      {Icon ? (
        <Icon size={large ? 20 : 16} strokeWidth={1.5} />
      ) : (
        (Array.from(item.name.trim())[0] ?? '?').toUpperCase()
      )}
    </span>
  );
}
export function displayWebsite(website: string) {
  try {
    return new URL(website).hostname.replace(/^www\./, '');
  } catch {
    return website;
  }
}
export function typeName(type: number) {
  return (
    (
      { 1: 'Login', 2: 'Secure note', 3: 'Card', 4: 'Identity', 5: 'SSH key' } as Record<
        number,
        string
      >
    )[type] ?? 'Vault item'
  );
}
