import type {
  PasskeyAssertion,
  PasskeyMatch,
  PasskeyRegistration,
  UserVerification,
  VaultStatus,
} from '@latch/shared/types';
import type { PasskeyPageRequest } from '@latch/shared/protocol';

/** Marks window messages between the page script and the content script. */
export const PAGE_SOURCE = 'bitlatch-passkey';

export type PasskeyErrorName = 'NotAllowedError' | 'AbortError' | 'SecurityError';

export type PasskeyCredential =
  | ({ kind: 'get' } & PasskeyAssertion)
  | ({ kind: 'create' } & PasskeyRegistration);

/** What the page gets back: a credential, an error, or a request to use the browser's own passkeys. */
export type PasskeyPageReply =
  | { fallback: true }
  | { error: { name: PasskeyErrorName; message: string } }
  | { credential: PasskeyCredential };

export type PageMessage =
  | { source: typeof PAGE_SOURCE; direction: 'request'; id: string; request: PasskeyPageRequest }
  | { source: typeof PAGE_SOURCE; direction: 'cancel'; id: string }
  | { source: typeof PAGE_SOURCE; direction: 'reply'; id: string; reply: PasskeyPageReply };

/** What the passkey window shows. */
export interface PasskeyView {
  kind: 'get' | 'create';
  rpId: string;
  rpName: string;
  userName: string;
  state: VaultStatus | 'unavailable';
  canUseBiometrics: boolean;
  passkeys: PasskeyMatch[];
  userVerification: UserVerification;
}

export type PasskeyWindowRequest =
  | { type: 'load' }
  | { type: 'unlock' }
  | { type: 'openApp' }
  | { type: 'choose'; id: string; credentialId: string }
  | { type: 'save' }
  | { type: 'fallback' }
  | { type: 'cancel' };

export type PasskeyWindowReply =
  | { type: 'view'; view: PasskeyView }
  | { type: 'error'; message: string };
