// Self-check for session storage. Run: node src/db/sessions.test.ts
//
// Uses node:sqlite, so this exercises the real SQL and the real CHECK and
// UNIQUE constraints. No mock database, no GUI, no Tauri.
// Covers the three verifications in plans/03-build-phases.md Phase 1.

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  migrate,
  startSession,
  endSession,
  touchSession,
  recoverOpenSessions,
  findOpenSession,
  listSessions,
  sessionsForEngine,
  MAX_INTENTION_LENGTH,
  setFidelity,
  sessionsForReview,
  type Db,
} from './sessions.ts';

/**
 * Adapter presenting node:sqlite through the same interface as
 * @tauri-apps/plugin-sql. The only translation is $1 style placeholders to the
 * positional ? that node:sqlite takes.
 */
function adapter(sqlite: DatabaseSync): Db {
  const toPositional = (sql: string) => sql.replace(/\$(\d+)/g, '?$1');
  const reorder = (sql: string, params: unknown[] = []) => {
    const order: number[] = [];
    const out = sql.replace(/\$(\d+)/g, (_m, d) => {
      order.push(Number(d) - 1);
      return '?';
    });
    return { sql: out, args: order.map((i) => params[i] ?? null) };
  };
  void toPositional;
  return {
    async execute(sql, params) {
      const { sql: s, args } = reorder(sql, params);
      const info = sqlite.prepare(s).run(...(args as never[]));
      return {
        rowsAffected: Number(info.changes),
        lastInsertId: Number(info.lastInsertRowid),
      };
    },
    async select<T>(sql: string, params?: unknown[]) {
      const { sql: s, args } = reorder(sql, params);
      return sqlite.prepare(s).all(...(args as never[])) as T[];
    },
  };
}

function freshDb() {
  const sqlite = new DatabaseSync(':memory:');
  return { sqlite, db: adapter(sqlite) };
}

const T0 = Date.UTC(2026, 8, 12, 9, 0, 0);
const MIN = 60_000;

async function main() {
  // --- schema and a clean round trip -------------------------------------
  {
    const { db } = freshDb();
    await migrate(db);
    await migrate(db); // idempotent, because it runs on every launch
    const id = await startSession(db, { intention: 'Chapter 4 rewrite', plannedMinutes: 50 }, T0);
    assert.ok(id > 0);

    const open = await findOpenSession(db);
    assert.equal(open?.intention, 'Chapter 4 rewrite');
    assert.equal(open?.ended_at, null);
    assert.equal(open?.outcome, null);
    assert.equal(open?.last_seen_at, T0, 'heartbeat starts at the start time');

    await endSession(db, id, 'finished', T0 + 50 * MIN);
    assert.equal(await findOpenSession(db), null);

    const rows = await listSessions(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].outcome, 'finished');
    assert.equal(rows[0].ended_at, T0 + 50 * MIN);
  }

  // --- an abandoned session is distinguishable from a completed one -------
  {
    const { db } = freshDb();
    await migrate(db);
    const a = await startSession(db, { intention: 'Deep work' }, T0);
    await endSession(db, a, 'finished', T0 + 50 * MIN);
    const b = await startSession(db, { intention: 'Inbox' }, T0 + 60 * MIN);
    await endSession(db, b, 'abandoned', T0 + 64 * MIN);
    const c = await startSession(db, { intention: 'Reading' }, T0 + 70 * MIN);
    await endSession(db, c, 'cut_short', T0 + 90 * MIN);

    const rows = await listSessions(db);
    assert.deepEqual(
      rows.map((r) => r.outcome).sort(),
      ['abandoned', 'cut_short', 'finished'],
      'all three outcomes are stored distinctly',
    );
  }

  // --- input validation at the trust boundary -----------------------------
  {
    const { db } = freshDb();
    await migrate(db);
    for (const bad of ['', '   ', '\n\t', null, undefined, 42, {}]) {
      await assert.rejects(
        () => startSession(db, { intention: bad as never }, T0),
        /text|working on/i,
        `rejected: ${JSON.stringify(bad)}`,
      );
    }
    await assert.rejects(
      () => startSession(db, { intention: 'x'.repeat(MAX_INTENTION_LENGTH + 1) }, T0),
      /longer than/,
    );
    await assert.rejects(
      () => startSession(db, { intention: 'ok', plannedMinutes: -5 }, T0),
      /positive number of minutes/,
    );
    await assert.rejects(() => startSession(db, { intention: 'ok' }, 0), /positive timestamp/);
    assert.equal(await findOpenSession(db), null, 'no failed attempt left a row behind');

    const id = await startSession(db, { intention: 'ok' }, T0);
    await assert.rejects(() => endSession(db, id, 'nonsense' as never, T0 + MIN), /Unknown outcome/);
    await endSession(db, id, 'finished', T0 + MIN);
    await assert.rejects(() => endSession(db, id, 'finished', T0 + 2 * MIN), /not open/);
  }

  // --- an intention with SQL in it is stored, not executed -----------------
  {
    const { db, sqlite } = freshDb();
    await migrate(db);
    const nasty = "'); DROP TABLE sessions; --";
    const id = await startSession(db, { intention: nasty }, T0);
    await endSession(db, id, 'finished', T0 + MIN);
    const rows = await listSessions(db);
    assert.equal(rows[0].intention, nasty, 'stored verbatim');
    assert.ok(
      sqlite.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE name='sessions'`).get(),
      'table still exists',
    );
  }

  // --- only one session may be open, enforced by the database -------------
  {
    const { db, sqlite } = freshDb();
    await migrate(db);
    await startSession(db, { intention: 'First' }, T0);
    await assert.rejects(
      () => startSession(db, { intention: 'Second' }, T0 + MIN),
      /already running/,
      'the code refuses',
    );
    // And the database refuses even if the code is bypassed.
    assert.throws(
      () =>
        sqlite
          .prepare(`INSERT INTO sessions (intention, started_at, last_seen_at) VALUES (?,?,?)`)
          .run('Sneaky', T0 + 2 * MIN, T0 + 2 * MIN),
      /UNIQUE|constraint/i,
      'the unique partial index refuses',
    );
  }

  // --- the schema refuses a half-closed row -------------------------------
  {
    const { db, sqlite } = freshDb();
    await migrate(db);
    assert.throws(
      () =>
        sqlite
          .prepare(
            `INSERT INTO sessions (intention, started_at, last_seen_at, ended_at) VALUES (?,?,?,?)`,
          )
          .run('Ended with no outcome', T0, T0, T0 + MIN),
      /constraint/i,
      'ended_at without an outcome is impossible',
    );
    assert.throws(
      () =>
        sqlite
          .prepare(
            `INSERT INTO sessions (intention, started_at, last_seen_at, ended_at, outcome) VALUES (?,?,?,?,?)`,
          )
          .run('Ends before it starts', T0, T0, T0 - MIN, 'finished'),
      /constraint/i,
      'a negative duration is impossible',
    );
  }

  // --- a clock that jumps backwards cannot create a negative duration -----
  {
    const { db } = freshDb();
    await migrate(db);
    const id = await startSession(db, { intention: 'Clock test' }, T0);
    await endSession(db, id, 'finished', T0 - 10 * MIN);
    const rows = await listSessions(db);
    assert.equal(rows[0].ended_at, T0, 'clamped to the start time, giving zero minutes');
  }

  // --- crash recovery: never silently lost --------------------------------
  {
    const { db } = freshDb();
    await migrate(db);
    const id = await startSession(db, { intention: 'Killed mid session' }, T0);
    await touchSession(db, id, T0 + 30 * MIN); // last heartbeat before the crash

    // Simulate the next launch.
    const recovered = await recoverOpenSessions(db);
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].intention, 'Killed mid session');
    assert.equal(await findOpenSession(db), null, 'nothing is left open');

    const rows = await listSessions(db);
    assert.equal(rows[0].outcome, 'abandoned');
    assert.equal(rows[0].ended_at, T0 + 30 * MIN, 'credited up to the last heartbeat only');

    assert.deepEqual(await recoverOpenSessions(db), [], 'recovery is idempotent');
  }

  // --- a session killed before any heartbeat earns zero, not the wall clock
  {
    const { db } = freshDb();
    await migrate(db);
    await startSession(db, { intention: 'Died immediately' }, T0);
    const recovered = await recoverOpenSessions(db);
    assert.equal(recovered[0].ended_at, null, 'it was open when recovery found it');
    const rows = await listSessions(db);
    assert.notEqual(rows[0].ended_at, null);
    assert.equal(rows[0].ended_at! - rows[0].started_at, 0, 'no unearned time');
  }

  // --- the file survives a reopen, which is what an app update looks like --
  {
    const dir = mkdtempSync(join(tmpdir(), 'wb-'));
    const file = join(dir, 'sessions.db');
    try {
      const first = new DatabaseSync(file);
      const dbA = adapter(first);
      await migrate(dbA);
      const id = await startSession(dbA, { intention: 'Before the update' }, T0);
      await endSession(dbA, id, 'finished', T0 + 50 * MIN);
      first.close();

      // New binary, same file on disk.
      const second = new DatabaseSync(file);
      const dbB = adapter(second);
      await migrate(dbB); // the new version runs its schema step on launch
      const rows = await listSessions(dbB);
      assert.equal(rows.length, 1, 'data survived');
      assert.equal(rows[0].intention, 'Before the update');
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // --- the shape handed to the engine -------------------------------------
  {
    const { db } = freshDb();
    await migrate(db);
    const id = await startSession(db, { intention: 'For the engine' }, T0);
    await endSession(db, id, 'finished', T0 + 50 * MIN);
    const open = await startSession(db, { intention: 'Still running' }, T0 + 60 * MIN);
    void open;

    const forEngine = await sessionsForEngine(db);
    assert.equal(forEngine.length, 1, 'an open session is not handed to the engine');
    assert.deepEqual(Object.keys(forEngine[0]).sort(), ['end', 'intention', 'outcome', 'start']);
    assert.notEqual(forEngine[0].end, null);
    assert.equal(forEngine[0].end! - forEngine[0].start, 50 * MIN);
  }


}

await main();

  // --- the fidelity column, added by migration to an existing table -------
  {
    const { db, sqlite } = freshDb();

    // Build the table WITHOUT the new column, exactly as an installed v0.1.0
    // has it on disk, then let migrate() bring it forward.
    sqlite.exec(`CREATE TABLE sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, intention TEXT NOT NULL,
      planned_minutes INTEGER, started_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL, ended_at INTEGER, outcome TEXT)`);
    sqlite.prepare(
      `INSERT INTO sessions (intention, started_at, last_seen_at, ended_at, outcome)
       VALUES (?,?,?,?,?)`,
    ).run('existing work', T0, T0, T0 + 50 * MIN, 'finished');

    await migrate(db);
    await migrate(db); // runs on every launch; must not add the column twice

    const cols = await db.select<{ name: string }>(`PRAGMA table_info(sessions)`);
    assert.equal(
      cols.filter((c) => c.name === 'did_declared').length,
      1,
      'the column is added exactly once',
    );

    const rows = await listSessions(db);
    assert.equal(rows.length, 1, 'the existing row survived the migration');
    assert.equal(rows[0].intention, 'existing work');
    assert.equal(rows[0].did_declared, null, 'and reads as unanswered, not as "no"');
  }

  // --- answering it -------------------------------------------------------
  {
    const { db } = freshDb();
    await migrate(db);
    const id = await startSession(db, { intention: 'Chapter 4' }, T0);
    await endSession(db, id, 'finished', T0 + 50 * MIN);

    assert.equal((await listSessions(db))[0].did_declared, null, 'unanswered by default');
    await setFidelity(db, id, 'partly');
    assert.equal((await listSessions(db))[0].did_declared, 'partly');
    await setFidelity(db, id, 'no');
    assert.equal((await listSessions(db))[0].did_declared, 'no', 'answers can be corrected');

    await assert.rejects(() => setFidelity(db, id, 'maybe' as never), /Unknown answer/);
    await assert.rejects(() => setFidelity(db, 999, 'yes'), /not finished/);
  }

  // --- a running session cannot be answered yet ---------------------------
  {
    const { db } = freshDb();
    await migrate(db);
    const id = await startSession(db, { intention: 'Still going' }, T0);
    await assert.rejects(() => setFidelity(db, id, 'yes'), /not finished/);
  }

  // --- the schema refuses a value the code would not produce --------------
  {
    const { db, sqlite } = freshDb();
    await migrate(db);
    const id = await startSession(db, { intention: 'x' }, T0);
    await endSession(db, id, 'finished', T0 + MIN);
    assert.throws(
      () => sqlite.prepare(`UPDATE sessions SET did_declared = ? WHERE id = ?`).run('sortof', id),
      /constraint/i,
      'the CHECK survives ALTER TABLE ADD COLUMN',
    );
  }

  // --- what the review reads ----------------------------------------------
  {
    const { db } = freshDb();
    await migrate(db);
    const a = await startSession(db, { intention: 'first' }, T0);
    await endSession(db, a, 'finished', T0 + 50 * MIN);
    await setFidelity(db, a, 'yes');
    const b = await startSession(db, { intention: 'second' }, T0 + 60 * MIN);
    await endSession(db, b, 'cut_short', T0 + 70 * MIN);
    await startSession(db, { intention: 'open' }, T0 + 80 * MIN);

    const rows = await sessionsForReview(db);
    assert.equal(rows.length, 2, 'open sessions are excluded');
    assert.deepEqual(rows.map((r) => r.intention), ['first', 'second'], 'oldest first');
    assert.equal(rows[0].did_declared, 'yes');
    assert.equal(rows[1].did_declared, null);
  }

  console.log('sessions.test.ts: all checks passed');
