// Session storage. The one record everything else derives from.
// See plans/01-product-ux.md section 1.
//
// Deliberately written against a minimal database interface rather than
// importing @tauri-apps/plugin-sql directly, so the real SQL can be exercised
// against real SQLite in a headless test. Positional parameters use the
// $1 style the plugin documents (docs/allowed-apis.md s.3).

export type Outcome = 'finished' | 'cut_short' | 'abandoned';

export const OUTCOMES: readonly Outcome[] = ['finished', 'cut_short', 'abandoned'];

/** Matches the shape of @tauri-apps/plugin-sql's Database. */
export interface Db {
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>;
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface SessionRow {
  id: number;
  intention: string;
  planned_minutes: number | null;
  started_at: number;
  last_seen_at: number;
  ended_at: number | null;
  outcome: Outcome | null;
}

export const MAX_INTENTION_LENGTH = 200;

/** How often a running session records that it is still alive. */
export const HEARTBEAT_MS = 30_000;

// Constraints are in the schema, not only in this file, so a bug here cannot
// write a row that breaks the engine's assumptions.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sessions (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     intention       TEXT    NOT NULL,
     planned_minutes INTEGER,
     started_at      INTEGER NOT NULL,
     last_seen_at    INTEGER NOT NULL,
     ended_at        INTEGER,
     outcome         TEXT,
     CHECK (length(trim(intention)) > 0),
     CHECK (outcome IS NULL OR outcome IN ('finished','cut_short','abandoned')),
     CHECK ((ended_at IS NULL) = (outcome IS NULL)),
     CHECK (last_seen_at >= started_at),
     CHECK (ended_at IS NULL OR ended_at >= started_at)
   )`,
  `CREATE INDEX IF NOT EXISTS sessions_started_at ON sessions (started_at)`,
  // At most one session may be open at a time. A constant-expression partial
  // index is the only way to say that in SQLite, because a unique index over a
  // nullable column treats every NULL as distinct.
  `CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_open ON sessions ((1)) WHERE ended_at IS NULL`,
];

export async function migrate(db: Db): Promise<void> {
  for (const statement of SCHEMA) {
    await db.execute(statement);
  }
}

function cleanIntention(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new Error('Intention must be text.');
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error('Say what you are working on before starting.');
  }
  if (trimmed.length > MAX_INTENTION_LENGTH) {
    throw new Error(`Intention is longer than ${MAX_INTENTION_LENGTH} characters.`);
  }
  return trimmed;
}

function requireEpochMs(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label} must be a positive timestamp.`);
  }
  return Math.floor(n);
}

export async function findOpenSession(db: Db): Promise<SessionRow | null> {
  const rows = await db.select<SessionRow>(
    `SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
  );
  return rows[0] ?? null;
}

/** Starts a session. Throws if one is already running. */
export async function startSession(
  db: Db,
  input: { intention: unknown; plannedMinutes?: number | null },
  now: number,
): Promise<number> {
  const intention = cleanIntention(input.intention);
  const startedAt = requireEpochMs(now, 'Start time');

  const planned =
    input.plannedMinutes === null || input.plannedMinutes === undefined
      ? null
      : Math.floor(Number(input.plannedMinutes));
  if (planned !== null && (!Number.isFinite(planned) || planned <= 0)) {
    throw new Error('Planned length must be a positive number of minutes.');
  }

  if (await findOpenSession(db)) {
    throw new Error('A session is already running. End it before starting another.');
  }

  const result = await db.execute(
    `INSERT INTO sessions (intention, planned_minutes, started_at, last_seen_at)
     VALUES ($1, $2, $3, $3)`,
    [intention, planned, startedAt],
  );

  if (result.lastInsertId === undefined) {
    const rows = await db.select<{ id: number }>(
      `SELECT id FROM sessions ORDER BY id DESC LIMIT 1`,
    );
    return rows[0].id;
  }
  return result.lastInsertId;
}

/**
 * Records that a running session is still alive. Called on an interval while
 * the timer runs, so a crash costs at most HEARTBEAT_MS of work rather than
 * the whole session.
 */
export async function touchSession(db: Db, id: number, now: number): Promise<void> {
  const seenAt = requireEpochMs(now, 'Heartbeat time');
  await db.execute(
    `UPDATE sessions SET last_seen_at = $1 WHERE id = $2 AND ended_at IS NULL AND $1 >= started_at`,
    [seenAt, id],
  );
}

export async function endSession(
  db: Db,
  id: number,
  outcome: Outcome,
  now: number,
): Promise<void> {
  if (!OUTCOMES.includes(outcome)) {
    throw new Error(`Unknown outcome: ${String(outcome)}`);
  }
  const endedAt = requireEpochMs(now, 'End time');

  const result = await db.execute(
    // max() guards a clock that moved backwards: a session can never end
    // before it started, which the schema also refuses to store.
    `UPDATE sessions
        SET ended_at = max($1, started_at), outcome = $2, last_seen_at = max($1, started_at)
      WHERE id = $3 AND ended_at IS NULL`,
    [endedAt, outcome, id],
  );
  if (result.rowsAffected === 0) {
    throw new Error(`Session ${id} is not open.`);
  }
}

/**
 * Closes anything left open by a crash or a kill, using the last heartbeat as
 * the end time. Called once at startup. Returns what it closed so the
 * interface can say so out loud rather than losing it silently.
 */
export async function recoverOpenSessions(db: Db): Promise<SessionRow[]> {
  const open = await db.select<SessionRow>(`SELECT * FROM sessions WHERE ended_at IS NULL`);
  for (const row of open) {
    await db.execute(
      `UPDATE sessions SET ended_at = last_seen_at, outcome = 'abandoned' WHERE id = $1`,
      [row.id],
    );
  }
  return open;
}

export async function listSessions(db: Db, limit = 50): Promise<SessionRow[]> {
  const capped = Math.max(1, Math.min(Math.floor(Number(limit) || 50), 500));
  return db.select<SessionRow>(
    `SELECT * FROM sessions WHERE ended_at IS NOT NULL ORDER BY started_at DESC LIMIT $1`,
    [capped],
  );
}

/** Shape the station engine expects. See src/engine/station.mjs. */
export async function sessionsForEngine(
  db: Db,
): Promise<{ start: number; end: number | null; outcome: Outcome | null; intention: string }[]> {
  const rows = await db.select<SessionRow>(
    `SELECT started_at, ended_at, outcome, intention FROM sessions WHERE ended_at IS NOT NULL`,
  );
  return rows.map((r) => ({
    start: r.started_at,
    end: r.ended_at,
    outcome: r.outcome,
    intention: r.intention,
  }));
}
