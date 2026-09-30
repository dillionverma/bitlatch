import { z } from 'zod';
import { lockTimeoutMinutes } from './types';

export const lockTimeoutSchema = z.literal(lockTimeoutMinutes);
export const passwordOptionsSchema = z
  .object({
    length: z.number().int().min(8).max(128),
    lowercase: z.boolean(),
    uppercase: z.boolean(),
    numbers: z.boolean(),
    symbols: z.boolean(),
    excludeAmbiguous: z.boolean(),
  })
  .strict()
  .refine(
    (options) => options.lowercase || options.uppercase || options.numbers || options.symbols,
    'Choose at least one character type.',
  );

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
  z.object({ type: z.literal('lockTimeout') }).strict(),
  z.object({ type: z.literal('setLockTimeout'), minutes: lockTimeoutSchema }).strict(),
  z.object({ type: z.literal('macAutoFill') }).strict(),
  z.object({ type: z.literal('enableMacAutoFill') }).strict(),
  z.object({ type: z.literal('macAutoFillSettings') }).strict(),
  z.object({ type: z.literal('websiteIcons') }).strict(),
  z.object({ type: z.literal('setWebsiteIcons'), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal('websiteIcon'), id }).strict(),
  z.object({ type: z.literal('state') }).strict(),
  z.object({ type: z.literal('appearance') }).strict(),
  z.object({ type: z.literal('confirm'), action: z.enum(['discard', 'trash']) }).strict(),
  z
    .object({
      type: z.literal('itemMenu'),
      id,
      position: z
        .object({
          x: z.number().int().min(0).max(100_000),
          y: z.number().int().min(0).max(100_000),
        })
        .strict(),
    })
    .strict(),
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
  z.object({ type: z.literal('setFavorite'), id, favorite: z.boolean() }).strict(),
  z.object({ type: z.literal('delete'), id }).strict(),
  z.object({ type: z.literal('restore'), id }).strict(),
  z
    .object({
      type: z.literal('copy'),
      id,
      field: z.enum(['username', 'password', 'notes', 'website']),
    })
    .strict(),
  z.object({ type: z.literal('generate'), options: passwordOptionsSchema }).strict(),
  z.object({ type: z.literal('browserSetup') }).strict(),
  z
    .object({ type: z.literal('connectBrowser'), browser: z.enum(['safari', 'chrome', 'firefox']) })
    .strict(),
  z.object({ type: z.literal('browserConnection') }).strict(),
  z.object({ type: z.literal('openExtensionFolder') }).strict(),
]);

export const browserVaultQuerySchema = z
  .object({
    query: z.string().max(500),
    scope: z.enum(['all', 'favorites', 'site']),
    itemType: z.enum(['all', 'login', 'note']),
    offset: z.number().int().min(0).max(1_000_000),
  })
  .strict();
export type BrowserVaultQuery = z.infer<typeof browserVaultQuerySchema>;

export const browserRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('status') }).strict(),
  z
    .object({
      type: z.literal('browse'),
      query: browserVaultQuerySchema,
      url: z.string().max(4_096),
    })
    .strict(),
  z.object({ type: z.literal('lock') }).strict(),
  z
    .object({
      type: z.literal('copy'),
      id,
      field: z.enum(['username', 'password', 'notes', 'website']),
    })
    .strict(),
  z.object({ type: z.literal('open') }).strict(),
  z.object({ type: z.literal('matches'), url: z.string().max(4_096) }).strict(),
  z.object({ type: z.literal('fill'), url: z.string().max(4_096), id }).strict(),
  z.object({ type: z.literal('icon'), url: z.string().max(4_096), id }).strict(),
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

// A separate socket/token keeps launcher commands out of the browser protocol.
export const launcherRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('unlock'), password: z.string().min(1).max(1_024) }).strict(),
  z.object({ type: z.literal('biometricUnlock') }).strict(),
  z.object({ type: z.literal('detail'), id }).strict(),
  z.object({ type: z.literal('search'), query: z.string().max(500) }).strict(),
  z
    .object({
      type: z.literal('copy'),
      id,
      field: z.enum(['username', 'password', 'notes', 'website']),
    })
    .strict(),
  z.object({ type: z.literal('lock') }).strict(),
  z.object({ type: z.literal('open') }).strict(),
]);
export type LauncherRequest = z.infer<typeof launcherRequestSchema>;
