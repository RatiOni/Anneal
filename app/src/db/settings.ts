// A key-value store for the handful of things the app has to remember that are
// not sessions: whether the first run happened, and the diagnostic answers.
//
// Same database and the same Db interface as src/db/sessions.ts, so it is
// testable headlessly against real SQLite.

import type { Db } from './sessions.ts';

export const SETTINGS_SCHEMA = `CREATE TABLE IF NOT EXISTS settings (
   key   TEXT PRIMARY KEY,
   value TEXT NOT NULL,
   CHECK (length(key) > 0)
 )`;

export async function migrateSettings(db: Db): Promise<void> {
  await db.execute(SETTINGS_SCHEMA);
}

export async function getSetting(db: Db, key: string): Promise<string | null> {
  if (typeof key !== 'string' || key.length === 0) return null;
  const rows = await db.select<{ value: string }>(
    `SELECT value FROM settings WHERE key = $1`,
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('Setting key must be a non-empty string.');
  }
  if (typeof value !== 'string') {
    throw new Error('Setting value must be a string.');
  }
  await db.execute(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

/**
 * Reads JSON that this app wrote. Returns null rather than throwing if the
 * stored text is unparseable, because a corrupt setting must never stop the
 * app from opening.
 */
export async function getJsonSetting<T>(db: Db, key: string): Promise<T | null> {
  const raw = await getSetting(db, key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJsonSetting(db: Db, key: string, value: unknown): Promise<void> {
  await setSetting(db, key, JSON.stringify(value));
}

export const ONBOARDING_COMPLETED_AT = 'onboarding_completed_at';
export const DIAGNOSTIC_ANSWERS = 'diagnostic_answers';

export async function hasCompletedOnboarding(db: Db): Promise<boolean> {
  return (await getSetting(db, ONBOARDING_COMPLETED_AT)) !== null;
}
