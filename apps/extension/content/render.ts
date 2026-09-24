import { claspPaths } from '@latch/shared/brand';

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function mark() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '200 200 624 624');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of claspPaths) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

export function brand(label: string) {
  const header = element('div', 'brand');
  const name = element('span', 'brand-name');
  name.append(mark(), element('span', '', 'Latch'));
  header.append(name, element('span', 'origin', label));
  return header;
}
