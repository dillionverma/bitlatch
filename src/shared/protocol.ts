import { z } from 'zod';

const boundedText = z.string().max(16_384);
const twoStepMethod = z.enum(['authenticator', 'yubikey', 'email']);
const challengeAnswer = z.union([
  z
    .object({
      code: z
        .string()
        .trim()
        .min(1)
        .max(128)
        .regex(/^[^\r\n]+$/, 'A code fits on one line.'),
    })
    .strict(),
  z.object({ method: twoStepMethod }).strict(),
  z.object({ cancel: z.literal(true) }).strict(),
]);
const id = z.string().uuid();
const loginDraft = z
  .object({
    id: id.optional(),
    revisionDate: z.string().nullable().optional(),
    name: z.string().trim().min(1).max(500),
    username: boundedText,
    password: boundedText,
    website: z.string().max(2_048),
    notes: z.string().max(100_000),
    favorite: z.boolean(),
  })
  .strict();

export const desktopRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('state') }).strict(),
  z.object({ type: z.literal('appearance') }).strict(),
  z.object({ type: z.literal('confirm'), action: z.enum(['discard', 'trash']) }).strict(),
  z
    .object({
      type: z.literal('login'),
      input: z
        .object({
          email: z.email().max(320),
          password: z.string().min(1).max(1_024),
          server: z.string().max(2_048),
          clientId: z.string().max(200).optional(),
          clientSecret: z.string().max(1_024).optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ type: z.literal('challenge'), answer: challengeAnswer }).strict(),
  z.object({ type: z.literal('unlock'), password: z.string().min(1).max(1_024) }).strict(),
  z.object({ type: z.literal('biometricUnlock') }).strict(),
  z.object({ type: z.literal('setBiometrics'), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal('lock') }).strict(),
  z.object({ type: z.literal('logout') }).strict(),
  z.object({ type: z.literal('sync') }).strict(),
  z.object({ type: z.literal('items') }).strict(),
  z.object({ type: z.literal('trash') }).strict(),
  z.object({ type: z.literal('detail'), id }).strict(),
  z.object({ type: z.literal('save'), draft: loginDraft }).strict(),
  z.object({ type: z.literal('delete'), id }).strict(),
  z.object({ type: z.literal('restore'), id }).strict(),
  z.object({ type: z.literal('copy'), id, field: z.enum(['username', 'password']) }).strict(),
  z.object({ type: z.literal('generate') }).strict(),
  z.object({ type: z.literal('installBrowser') }).strict(),
  z.object({ type: z.literal('openExtensionFolder') }).strict(),
]);

export const browserRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('status') }).strict(),
  z.object({ type: z.literal('open') }).strict(),
  z.object({ type: z.literal('matches'), url: z.string().max(4_096) }).strict(),
  z.object({ type: z.literal('fill'), url: z.string().max(4_096), id }).strict(),
  z
    .object({
      type: z.literal('capture'),
      url: z.string().max(4_096),
      username: boundedText,
      password: boundedText,
    })
    .strict(),
  z.object({ type: z.literal('pendingCapture'), url: z.string().max(4_096) }).strict(),
  z.object({ type: z.literal('commitCapture'), url: z.string().max(4_096) }).strict(),
  z.object({ type: z.literal('dismissCapture') }).strict(),
]);

export type DesktopRequest = z.infer<typeof desktopRequestSchema>;
export type BrowserRequest = z.infer<typeof browserRequestSchema>;

export class UserError extends Error {}

export async function safely<T>(operation: () => T | Promise<T>) {
  try {
    return { ok: true as const, value: await operation() };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof UserError ? error.message : 'Something went wrong. Please try again.',
    };
  }
}
