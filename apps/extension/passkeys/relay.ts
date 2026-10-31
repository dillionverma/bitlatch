import { browser } from 'wxt/browser';
import { PAGE_SOURCE, type PageMessage, type PasskeyPageReply } from './messages';

/** Carries WebAuthn requests from the page script to the background and back. */
export function relayPasskeys() {
  window.addEventListener('message', (event: MessageEvent<PageMessage>) => {
    const message = event.data;
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      message?.source !== PAGE_SOURCE ||
      typeof message.id !== 'string' ||
      message.id.length > 64
    )
      return;
    if (message.direction === 'cancel') {
      void browser.runtime.sendMessage({ type: 'passkeyCancel', id: message.id }).catch(() => {});
      return;
    }
    if (message.direction !== 'request') return;
    const { id, request } = message;
    void browser.runtime
      .sendMessage({ type: 'passkeyRequest', id, request })
      .then((reply: PasskeyPageReply | undefined) => reply ?? notAllowed())
      .catch(notAllowed)
      .then((reply) => {
        const answer: PageMessage = { source: PAGE_SOURCE, direction: 'reply', id, reply };
        window.postMessage(answer, location.origin);
      });
  });
}

function notAllowed(): PasskeyPageReply {
  return { error: { name: 'NotAllowedError', message: 'The passkey request was not completed.' } };
}
