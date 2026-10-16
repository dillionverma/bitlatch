import {
  Bank,
  CreditCard,
  FileText,
  IdentificationBadge,
  IdentificationCard,
  Terminal,
  User as UserRound,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import type { ItemSummary, LatchApi } from '@latch/shared/types';
import { useWebsiteIcons } from './WebsiteIcons';

export type CopyField = Extract<Parameters<LatchApi['copy']>[1], string>;
export const fieldLabels: Record<CopyField, string> = {
  username: 'Username',
  password: 'Password',
  cardNumber: 'Card number',
  cardCode: 'Security code',
};

const typeIcons: Record<number, typeof FileText | undefined> = {
  2: FileText,
  3: CreditCard,
  4: UserRound,
  5: Terminal,
  6: Bank,
  7: IdentificationCard,
  8: IdentificationBadge,
};

export function ItemIcon({ item, large = false }: { item: ItemSummary; large?: boolean }) {
  const { enabled } = useWebsiteIcons();
  const element = useRef<HTMLSpanElement>(null);
  const [logo, setLogo] = useState<{ id: string; website: string; src: string } | null>(null);
  useEffect(() => {
    setLogo(null);
    if (!enabled || item.type !== 1 || item.restricted || !item.website || !element.current) return;
    let active = true;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void window.latch
        .websiteIcon(item.id)
        .then((result) => {
          if (active && result.ok && result.value)
            setLogo({ id: item.id, website: item.website, src: result.value });
        })
        .catch(() => {});
    });
    observer.observe(element.current);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [enabled, item.id, item.website, item.type, item.restricted]);
  const src = enabled && logo?.id === item.id && logo.website === item.website ? logo.src : null;
  const Icon = typeIcons[item.type];
  let hash = 0;
  for (const char of item.name) hash += char.charCodeAt(0);
  const tone = hash % 5;
  return (
    <span
      ref={element}
      aria-hidden="true"
      className={`item-icon tone-${tone} ${large ? 'large' : ''}`}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="website-logo"
          draggable={false}
          onError={() => setLogo(null)}
        />
      ) : Icon ? (
        <Icon size={large ? 20 : 16} weight="regular" />
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
export { typeName } from '@latch/shared/item-fields';
