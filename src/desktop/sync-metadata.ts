import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type Metadata = {
  id: string;
  revisionDate?: string | null;
  deletedDate?: string | null;
  archivedDate?: string | null;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Compare only identity/revision metadata. Authentication and decryption stay in bw. */
export function listingVersion(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries: string[] = [];
  for (const item of value) {
    if (!record(item) || typeof item.id !== 'string' || typeof item.revisionDate !== 'string')
      return undefined;
    // The encrypted cache can retain microseconds; bw's public JSON uses Date
    // and therefore milliseconds. Compare at the precision the CLI exposes.
    const revision = Date.parse(item.revisionDate);
    const deleted = item.deletedDate == null ? null : Date.parse(String(item.deletedDate));
    if (!Number.isFinite(revision) || (deleted !== null && !Number.isFinite(deleted)))
      return undefined;
    entries.push(JSON.stringify([item.id, revision, deleted]));
  }
  return entries.sort().join('\n');
}

/**
 * bw serve can finish /sync before its decrypted view has caught up. The
 * encrypted cache written by that same CLI supplies the expected IDs and
 * revisions, including real deletions. This never decrypts or changes it.
 * An unfamiliar cache format selects a fresh worker instead of guessing.
 */
export async function syncedVersions(dataDir: string) {
  try {
    const bytes = await readFile(join(dataDir, 'data.json'));
    if (bytes.length > 64 * 1024 * 1024) return undefined;
    const cache: unknown = JSON.parse(bytes.toString('utf8'));
    if (!record(cache)) return undefined;
    const userId = cache.global_account_activeAccountId;
    if (typeof userId !== 'string') return undefined;
    const ciphers = cache[`user_${userId}_ciphers_ciphers`];
    if (!record(ciphers)) return undefined;
    const active: Metadata[] = [];
    const trash: Metadata[] = [];
    for (const [id, value] of Object.entries(ciphers)) {
      if (!record(value) || value.id !== id || typeof value.revisionDate !== 'string')
        return undefined;
      if (value.archivedDate) continue;
      (value.deletedDate ? trash : active).push({
        id,
        revisionDate: value.revisionDate,
        deletedDate: typeof value.deletedDate === 'string' ? value.deletedDate : null,
      });
    }
    const activeVersion = listingVersion(active);
    const trashVersion = listingVersion(trash);
    if (activeVersion === undefined || trashVersion === undefined) return undefined;
    return { active: activeVersion, trash: trashVersion };
  } catch {
    return undefined;
  }
}
