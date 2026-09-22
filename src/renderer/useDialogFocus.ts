import { useEffect, useRef, type MouseEvent } from 'react';

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

/**
 * Closes a dialog when its backdrop is clicked. The press and the release both
 * have to land on the backdrop, so selecting text inside the dialog and
 * releasing outside it does not throw the dialog away.
 */
export function useBackdropDismiss(onClose: () => void, enabled = true) {
  const armed = useRef(false);
  return {
    onMouseDown(event: MouseEvent<HTMLElement>) {
      armed.current = event.target === event.currentTarget;
    },
    onClick(event: MouseEvent<HTMLElement>) {
      const onBackdrop = armed.current && event.target === event.currentTarget;
      armed.current = false;
      if (enabled && onBackdrop) onClose();
    },
  };
}
