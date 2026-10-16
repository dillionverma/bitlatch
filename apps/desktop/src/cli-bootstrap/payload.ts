/** Variables the bootstrap keeps out of the real environment, including values the CLI sets later. */
export const secretNames = [
  'BW_SESSION',
  'LATCH_MASTER_PASSWORD',
  'BW_CLIENTID',
  'BW_CLIENTSECRET',
] as const;
export type SecretName = (typeof secretNames)[number];

/** What Bitlatch writes to the bootstrap's secret descriptor. */
export interface BootstrapPayload {
  env: Partial<Record<SecretName, string>>;
  /** Print the marker and exit instead of running the CLI. */
  probe?: true;
  /** Refuse every outgoing connection, so the CLI can only work locally. */
  offline?: true;
}
export const BOOTSTRAP_MARKER = 'bitlatch-cli-bootstrap-ready';
