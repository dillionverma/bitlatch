import { defineContentScript } from 'wxt/utils/define-content-script';
import { relayPasskeys } from '../passkeys/relay';
import { EXTENSION_MATCHES } from '@latch/shared/browser-targets';
export default defineContentScript({
  matches: EXTENSION_MATCHES,
  runAt: 'document_start',
  exclude: ['safari'],
  main: relayPasskeys,
});
