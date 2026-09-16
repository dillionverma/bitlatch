import { describe, expect, it } from 'vitest';
import { browserRequestSchema, desktopRequestSchema, safely } from '../src/shared/protocol';

describe('IPC request validation', () => {
  it('browser cannot request the vault, pass arbitrary commands, or select the server', () => {
    for (const type of ['items', 'login', 'unlock', 'save', 'exec', 'detail'])
      expect(browserRequestSchema.safeParse({ type }).success).toBe(false);
    expect(
      browserRequestSchema.safeParse({
        type: 'matches',
        url: 'https://example.com',
        command: 'list items',
      }).success,
    ).toBe(false);
  });
  it('rejects malformed IDs and oversized payloads', () => {
    expect(desktopRequestSchema.safeParse({ type: 'detail', id: '../../private' }).success).toBe(
      false,
    );
    expect(
      browserRequestSchema.safeParse({ type: 'matches', url: 'x'.repeat(4_097) }).success,
    ).toBe(false);
    expect(desktopRequestSchema.safeParse({ type: 'unlock', password: '' }).success).toBe(false);
  });
  it('never forwards unexpected raw errors to a renderer or page', async () => {
    const response = await safely(() => {
      throw new Error('raw-secret-from-engine');
    });
    expect(JSON.stringify(response)).not.toContain('raw-secret');
    expect(response.ok).toBe(false);
  });
});
