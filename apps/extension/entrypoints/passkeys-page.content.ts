import { defineContentScript } from 'wxt/utils/define-content-script';
import { wrapCredentials } from '../passkeys/page';
import { EXTENSION_MATCHES } from '@latch/shared/browser-targets';
// Safari keeps the system passkey sheet, which Bitlatch's AutoFill extension serves.
export default defineContentScript({
  matches: EXTENSION_MATCHES,
  world: 'MAIN',
  runAt: 'document_start',
  exclude: ['safari'],
  main: wrapCredentials,
});
