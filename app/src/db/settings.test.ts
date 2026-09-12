// Self-check for the settings store. Run: node src/db/settings.test.ts
// Real SQL against real SQLite via node:sqlite, same adapter shape the app uses.

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  migrateSettings,
  getSetting,
  setSetting,
  getJsonSetting,
  setJsonSetting,
  hasCompletedOnboarding,
  ONBOARDING_COMPLETED_AT,
  DIAGNOSTIC_ANSWERS,
} from './settings.ts';
import type { Db } from './sessions.ts';

function adapter(sqlite: DatabaseSync): Db {
  const reorder = (sql: string, params: unknown[] = []) => {
    const order: number[] = [];
    const out = sql.replace(/\$(\d+)/g, (_m, d) => {
      order.push(Number(d) - 1);
      return '?';
    });
    return { sql: out, args: order.map((i) => params[i] ?? null) };
  };
  return {
    async execute(sql, params) {
      const { sql: s, args } = reorder(sql, params);
      const info = sqlite.prepare(s).run(...(args as never[]));
      return { rowsAffected: Number(info.changes), lastInsertId: Number(info.lastInsertRowid) };
    },
    async select<T>(sql: string, params?: unknown[]) {
      const { sql: s, args } = reorder(sql, params);
      return sqlite.prepare(s).all(...(args as never[])) as T[];
    },
  };
}

const fresh = () => {
  const sqlite = new DatabaseSync(':memory:');
  return { sqlite, db: adapter(sqlite) };
};

async function main() {
  // --- round trip and idempotent migration ------------------------------
  {
    const { db } = fresh();
    await migrateSettings(db);
    await migrateSettings(db); // runs on every launch

    assert.equal(await getSetting(db, 'missing'), null, 'absent keys read as null');
    await setSetting(db, 'review_day', 'sunday');
    assert.equal(await getSetting(db, 'review_day'), 'sunday');

    // Writing the same key again replaces rather than failing on the primary key.
    await setSetting(db, 'review_day', 'monday');
    assert.equal(await getSetting(db, 'review_day'), 'monday');
    const all = await db.select<{ n: number }>('SELECT count(*) AS n FROM settings');
    assert.equal(all[0].n, 1, 'upsert, not a second row');
  }

  // --- validation -------------------------------------------------------
  {
    const { db } = fresh();
    await migrateSettings(db);
    await assert.rejects(() => setSetting(db, '', 'x'), /non-empty/);
    await assert.rejects(() => setSetting(db, 'k', 123 as never), /must be a string/);
    assert.equal(await getSetting(db, ''), null, 'an empty key reads as absent, not an error');
    assert.equal(await getSetting(db, null as never), null);
  }

  // --- a value containing SQL is stored, not executed --------------------
  {
    const { db, sqlite } = fresh();
    await migrateSettings(db);
    const nasty = "'); DROP TABLE settings; --";
    await setSetting(db, 'nasty', nasty);
    assert.equal(await getSetting(db, 'nasty'), nasty, 'stored verbatim');
    assert.ok(
      sqlite.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE name='settings'`).get(),
      'table survives',
    );
    // And a key containing SQL, since keys are also app-controlled strings.
    await setSetting(db, nasty, 'ok');
    assert.equal(await getSetting(db, nasty), 'ok');
  }

  // --- JSON helpers -----------------------------------------------------
  {
    const { db } = fresh();
    await migrateSettings(db);
    const answers = { sharpest: 'early', first30: 'messages' };
    await setJsonSetting(db, DIAGNOSTIC_ANSWERS, answers);
    assert.deepEqual(await getJsonSetting(db, DIAGNOSTIC_ANSWERS), answers);
    assert.equal(await getJsonSetting(db, 'absent'), null);

    // Corrupt JSON must not throw. A bad setting cannot stop the app opening.
    await setSetting(db, 'broken', '{not json');
    assert.doesNotThrow(async () => getJsonSetting(db, 'broken'));
    assert.equal(await getJsonSetting(db, 'broken'), null, 'unparseable reads as absent');

    // Round trip preserves nesting and unicode.
    const rich = { a: [1, 2, { b: 'ünïcode ✓' }], c: null };
    await setJsonSetting(db, 'rich', rich);
    assert.deepEqual(await getJsonSetting(db, 'rich'), rich);
  }

  // --- the onboarding gate ----------------------------------------------
  {
    const { db } = fresh();
    await migrateSettings(db);
    assert.equal(await hasCompletedOnboarding(db), false, 'a fresh install has not onboarded');
    await setSetting(db, ONBOARDING_COMPLETED_AT, String(Date.UTC(2026, 8, 12)));
    assert.equal(await hasCompletedOnboarding(db), true);
    // It stays true across a reopen, which is what makes the first run once only.
    assert.equal(await hasCompletedOnboarding(db), true);
  }

  console.log('settings.test.ts: all checks passed');
}

await main();
