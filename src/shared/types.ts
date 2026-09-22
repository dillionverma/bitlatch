export type WindowMaterial = 'glass' | 'vibrancy' | 'solid';
export type WindowCommand = 'search' | 'new' | 'settings';
export type WindowAppearance = Readonly<{
  revision: number;
  material: WindowMaterial;
  active: boolean;
  dark: boolean;
  reducedTransparency: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
}>;

export type VaultStatus = 'signed-out' | 'locked' | 'unlocked';

/** Two-step login methods the Bitwarden CLI can complete. Security keys over WebAuthn and Duo cannot be used here. */
export type TwoStepMethod = 'authenticator' | 'yubikey' | 'email';

/** A verification step Bitwarden requires before sign-in can finish. */
export interface LoginChallenge {
  /** `method`: choose one of `methods`. `code`: enter a two-step code. `new-device`: enter the code emailed for this new device. */
  kind: 'method' | 'code' | 'new-device';
  email: string;
  methods: TwoStepMethod[];
  /** The method the code belongs to, when known. */
  method?: TwoStepMethod;
  /** Why the previous answer was rejected, if it was. */
  error?: string;
}

export type ChallengeAnswer = { code: string } | { method: TwoStepMethod } | { cancel: true };

export interface VaultState {
  /** Monotonic state version; duplicate or late IPC replies can be ignored. */
  revision: number;
  /** Changes only when active items change. */
  itemsRevision: number;
  /** Trash is fetched only when opened. */
  trashLoaded: boolean;
  status: VaultStatus;
  email: string;
  server: string;
  lastSync: string | null;
  itemCount: number;
  /** How many items are sitting in Bitwarden's trash. */
  trashCount: number;
  /** Whether this Mac can offer Touch ID at all, and whether it can right now. */
  biometrics: 'unsupported' | 'unavailable' | 'ready';
  /** Whether a session key is being kept so Touch ID can reopen the vault. */
  biometricsOn: boolean;
  setupError?: string;
  /** Present while a sign-in is waiting for the user to complete a verification step. */
  challenge?: LoginChallenge;
}

export interface ItemSummary {
  id: string;
  name: string;
  username: string;
  website: string;
  type: number;
  favorite: boolean;
  hasPasskey: boolean;
  restricted: boolean;
}

export interface ItemDetail extends ItemSummary {
  password: string;
  notes: string;
  revisionDate: string | null;
  createdDate: string | null;
  editable: boolean;
  deletable: boolean;
  restorable: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
  server: string;
  clientId?: string;
  clientSecret?: string;
}

export interface LoginDraft {
  id?: string;
  revisionDate?: string | null;
  name: string;
  username: string;
  password: string;
  website: string;
  notes: string;
  favorite: boolean;
}

export interface FillCredential {
  username: string;
  password: string;
}

/** What Latch would do with a sign-in the browser just watched happen. */
export interface CaptureOffer {
  action: 'none' | 'save' | 'update';
  /** The item that would be written, for the prompt to name. */
  name?: string;
}

export interface BrowserMatches {
  state: VaultStatus;
  items: ItemSummary[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface LatchApi {
  state(): Promise<Result<VaultState>>;
  login(input: LoginInput): Promise<Result<VaultState>>;
  answerChallenge(answer: ChallengeAnswer): Promise<Result<void>>;
  unlock(password: string): Promise<Result<VaultState>>;
  unlockWithBiometrics(): Promise<Result<VaultState>>;
  setBiometrics(enabled: boolean): Promise<Result<VaultState>>;
  lock(): Promise<Result<VaultState>>;
  logout(): Promise<Result<VaultState>>;
  sync(): Promise<Result<VaultState>>;
  items(): Promise<Result<ItemSummary[]>>;
  trash(): Promise<Result<ItemSummary[]>>;
  detail(id: string): Promise<Result<ItemDetail>>;
  save(draft: LoginDraft): Promise<Result<ItemDetail>>;
  remove(id: string): Promise<Result<VaultState>>;
  restore(id: string): Promise<Result<VaultState>>;
  copy(id: string, field: 'username' | 'password'): Promise<Result<void>>;
  generate(): Promise<Result<string>>;
  installBrowser(): Promise<Result<string>>;
  openExtensionFolder(): Promise<Result<void>>;
  onState(listener: (state: VaultState) => void): () => void;
  appearance(): Promise<Result<WindowAppearance>>;
  onAppearance(listener: (appearance: WindowAppearance) => void): () => void;
  onCommand(listener: (command: WindowCommand) => void): () => void;
}

declare global {
  interface Window {
    latch: LatchApi;
  }
}
