import { useEffect, useRef } from 'react';

export function useDialogFocus() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    if (!dialog) return;
    const selector =
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]';
    if (!dialog.contains(document.activeElement))
      dialog.querySelector<HTMLElement>(selector)?.focus();
    function trapFocus(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;
      const controls = [...dialog!.querySelectorAll<HTMLElement>(selector)].filter(
        (element) => element.getClientRects().length > 0,
      );
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    dialog.addEventListener('keydown', trapFocus);
    return () => {
      dialog.removeEventListener('keydown', trapFocus);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return ref;
}
