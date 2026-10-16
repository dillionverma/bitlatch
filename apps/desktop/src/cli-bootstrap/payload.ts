/** What Bitlatch writes to the bootstrap's secret descriptor. */
export interface BootstrapPayload {
  env: Record<string, string>;
  /** Print the marker and exit instead of running the CLI. */
  probe?: true;
}
export const BOOTSTRAP_MARKER = 'bitlatch-cli-bootstrap-ready';
