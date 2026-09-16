export type VaultStatus = 'signed-out' | 'locked' | 'unlocked';

export interface VaultState {
  status: VaultStatus;
  email: string;
  server: string;
  lastSync: string | null;
  itemCount: number;
  setupError?: string;
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
  editable: boolean;
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

export interface BrowserMatches {
  state: VaultStatus;
  items: ItemSummary[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface LatchApi {
  state(): Promise<Result<VaultState>>;
  login(input: LoginInput): Promise<Result<VaultState>>;
  unlock(password: string): Promise<Result<VaultState>>;
  lock(): Promise<Result<VaultState>>;
  logout(): Promise<Result<VaultState>>;
  sync(): Promise<Result<VaultState>>;
  items(): Promise<Result<ItemSummary[]>>;
  detail(id: string): Promise<Result<ItemDetail>>;
  save(draft: LoginDraft): Promise<Result<ItemDetail>>;
  copy(id: string, field: 'username' | 'password'): Promise<Result<void>>;
  generate(): Promise<Result<string>>;
  installBrowser(): Promise<Result<string>>;
  openExtensionFolder(): Promise<Result<void>>;
  onState(listener: (state: VaultState) => void): () => void;
  onFocusSearch(listener: () => void): () => void;
}

declare global {
  interface Window {
    latch: LatchApi;
  }
}
