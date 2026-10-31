import type { PasskeyPageRequest } from '@latch/shared/protocol';
import {
  PAGE_SOURCE,
  type PageMessage,
  type PasskeyCredential,
  type PasskeyPageReply,
} from './messages';

/**
 * Runs in the page's own JavaScript world and hands WebAuthn requests to the
 * Bitlatch window. The page only ever learns the answer it would get from any
 * authenticator; the origin used for signing comes from the browser, not here.
 */
export function wrapCredentials() {
  const credentials = navigator.credentials;
  if (!credentials || typeof PublicKeyCredential === 'undefined') return;
  const create = CredentialsContainer.prototype.create.bind(credentials);
  const get = CredentialsContainer.prototype.get.bind(credentials);

  credentials.create = async function (options?: CredentialCreationOptions) {
    const publicKey = options?.publicKey;
    const request = publicKey && createRequest(publicKey);
    if (!request) return create(options);
    const extensions = publicKey.extensions?.credProps ? { credProps: { rk: true } } : {};
    return answer(request, options.signal, extensions, () => create(options));
  };
  credentials.get = async function (options?: CredentialRequestOptions) {
    // The browser's own autofill list handles conditional requests.
    if (!options?.publicKey || options.mediation === 'conditional') return get(options);
    return answer(getRequest(options.publicKey), options.signal, {}, () => get(options));
  };
}

function createRequest(options: PublicKeyCredentialCreationOptions): PasskeyPageRequest | null {
  const algorithms = options.pubKeyCredParams.map((param) => param.alg);
  if (
    !algorithms.includes(-7) ||
    options.authenticatorSelection?.authenticatorAttachment === 'cross-platform'
  )
    return null;
  return {
    kind: 'create',
    rp: { id: options.rp.id, name: options.rp.name },
    user: {
      id: encode(options.user.id),
      name: options.user.name,
      displayName: options.user.displayName,
    },
    challenge: encode(options.challenge),
    algorithms,
    excludeCredentials: (options.excludeCredentials ?? []).map((entry) => encode(entry.id)),
    userVerification: options.authenticatorSelection?.userVerification,
    timeout: options.timeout,
  };
}

function getRequest(options: PublicKeyCredentialRequestOptions): PasskeyPageRequest {
  return {
    kind: 'get',
    rpId: options.rpId,
    challenge: encode(options.challenge),
    allowCredentials: (options.allowCredentials ?? []).map((entry) => encode(entry.id)),
    userVerification: options.userVerification,
    timeout: options.timeout,
  };
}

function answer(
  request: PasskeyPageRequest,
  signal: AbortSignal | undefined,
  extensions: AuthenticationExtensionsClientOutputs,
  fallback: () => Promise<Credential | null>,
): Promise<Credential | null> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const id = crypto.randomUUID();
  return new Promise<PasskeyPageReply>((resolve, reject) => {
    const abort = () => {
      finish();
      post({ source: PAGE_SOURCE, direction: 'cancel', id });
      reject(signal!.reason);
    };
    const listen = (event: MessageEvent<PageMessage>) => {
      const message = event.data;
      if (
        event.source !== window ||
        message?.source !== PAGE_SOURCE ||
        message.direction !== 'reply' ||
        message.id !== id
      )
        return;
      finish();
      resolve(message.reply);
    };
    const finish = () => {
      window.removeEventListener('message', listen);
      signal?.removeEventListener('abort', abort);
    };
    window.addEventListener('message', listen);
    signal?.addEventListener('abort', abort);
    post({ source: PAGE_SOURCE, direction: 'request', id, request });
  }).then((reply) => {
    if ('fallback' in reply) return fallback();
    if ('error' in reply) throw new DOMException(reply.error.message, reply.error.name);
    return publicKeyCredential(reply.credential, extensions);
  });
}

function post(message: PageMessage) {
  window.postMessage(message, location.origin);
}

/**
 * A credential the page's WebAuthn code accepts: real prototypes, so
 * `instanceof` holds, and own properties in place of the native getters.
 */
function publicKeyCredential(
  credential: PasskeyCredential,
  extensions: AuthenticationExtensionsClientOutputs,
): PublicKeyCredential {
  const clientDataJSON = decode(credential.clientDataJSON);
  const authenticatorData = decode(credential.authenticatorData);
  const response =
    credential.kind === 'create'
      ? build(AuthenticatorAttestationResponse.prototype, {
          clientDataJSON,
          attestationObject: decode(credential.attestationObject),
          getTransports: () => ['internal'],
          getAuthenticatorData: () => authenticatorData,
          getPublicKey: () => decode(credential.publicKey),
          getPublicKeyAlgorithm: () => credential.publicKeyAlgorithm,
        })
      : build(AuthenticatorAssertionResponse.prototype, {
          clientDataJSON,
          authenticatorData,
          signature: decode(credential.signature),
          userHandle: credential.userHandle ? decode(credential.userHandle) : null,
        });
  const json =
    credential.kind === 'create'
      ? {
          clientDataJSON: credential.clientDataJSON,
          attestationObject: credential.attestationObject,
          authenticatorData: credential.authenticatorData,
          transports: ['internal'],
          publicKey: credential.publicKey,
          publicKeyAlgorithm: credential.publicKeyAlgorithm,
        }
      : {
          clientDataJSON: credential.clientDataJSON,
          authenticatorData: credential.authenticatorData,
          signature: credential.signature,
          userHandle: credential.userHandle || null,
        };
  return build(PublicKeyCredential.prototype, {
    id: credential.credentialId,
    rawId: decode(credential.credentialId),
    type: 'public-key',
    authenticatorAttachment: 'platform',
    response,
    getClientExtensionResults: () => extensions,
    toJSON: () => ({
      id: credential.credentialId,
      rawId: credential.credentialId,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      response: json,
      clientExtensionResults: extensions,
    }),
  });
}

function build<T extends object>(prototype: T, values: Record<string, unknown>): T {
  const target = Object.create(prototype) as T;
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(target, key, { value, enumerable: true });
  return target;
}

function encode(source: BufferSource): string {
  const bytes = ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    : new Uint8Array(source);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decode(value: string): ArrayBuffer {
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}
