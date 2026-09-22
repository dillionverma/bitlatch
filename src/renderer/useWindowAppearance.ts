import { useEffect } from 'react';
import { windowColorTokens, type WindowAppearance } from '../shared/types';

/** Subscribe first; a delayed initial read must not replace a newer event. */
export function useWindowAppearance() {
  useEffect(() => {
    let active = true;
    let revision = -1;
    const root = document.documentElement;
    const apply = (value: WindowAppearance) => {
      if (!active || value.revision < revision) return;
      revision = value.revision;
      root.dataset.material =
        value.reducedTransparency || value.highContrast ? 'solid' : value.material;
      root.dataset.windowActive = String(value.active);
      root.dataset.reducedTransparency = String(value.reducedTransparency);
      root.dataset.highContrast = String(value.highContrast);
      root.dataset.reducedMotion = String(value.reducedMotion);
      for (const token of windowColorTokens) {
        const color = value.colors?.[token];
        if (color && /^#[\da-f]{6}([\da-f]{2})?$/i.test(color))
          root.style.setProperty(`--${token}`, color);
        else root.style.removeProperty(`--${token}`);
      }
    };
    const unsubscribe = window.latch.onAppearance(apply);
    void window.latch
      .appearance()
      .then((result) => {
        if (result.ok) apply(result.value);
      })
      .catch(() => {
        /* Opaque CSS defaults remain safe if the bridge fails. */
      });
    return () => {
      active = false;
      unsubscribe();
      for (const token of windowColorTokens) root.style.removeProperty(`--${token}`);
      for (const name of [
        'material',
        'windowActive',
        'reducedTransparency',
        'highContrast',
        'reducedMotion',
      ])
        delete root.dataset[name];
    };
  }, []);
}
