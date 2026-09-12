// Self-check for the weekly review. Run: node src/review/review.test.ts
//
// The load-bearing assertions here are the ones about restraint: exactly one
// recommendation or none, and none at all when the data does not support one.
// Phase 4 of plans/03-build-phases.md asks for that explicitly.

import assert from 'node:assert/strict';
import { buildReview, WINDOW_DAYS, TRAILING_WEEKS } from './review.ts';
import type { SessionRow, Outcome, Fidelity } from '../db/sessions.ts';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
// A fixed local noon, so hour-of-day arithmetic does not drift with the runner.
const NOW = new Date(2026, 8, 12, 12, 0, 0).getTime();

let nextId = 1;
function session(opts: {
  daysAgo?: number;
  hour?: number;
  minutes?: number;
  outcome?: Outcome;
  fidelity?: Fidelity | null;
  planned?: number | null;
  intention?: string;
}): SessionRow {
  const { daysAgo = 0, hour = 10, minutes = 50, outcome = 'finished' } = opts;
  const day = new Date(NOW - daysAgo * DAY);
  day.setHours(hour, 0, 0, 0);
  const started = day.getTime();
  return {
    id: nextId++,
    intention: opts.intention ?? 'work',
    planned_minutes: opts.planned === undefined ? 50 : opts.planned,
    started_at: started,
    last_seen_at: started + minutes * MIN,
    ended_at: started + minutes * MIN,
    outcome,
    did_declared: opts.fidelity ?? null,
  };
}

// --- an empty week says so and recommends nothing ------------------------
{
  const r = buildReview([], NOW);
  assert.equal(r.hasData, false);
  assert.equal(r.declared, 0);
  assert.equal(r.completionRate, null, 'no ratio when nothing was declared');
  assert.equal(r.fidelityRate, null);
  assert.equal(r.strongestHour, null);
  assert.equal(r.recommendation, null, 'nothing is invented from nothing');
  assert.equal(r.byDay.length, WINDOW_DAYS);
  assert.equal(r.trailing.length, TRAILING_WEEKS);
}

// --- malformed input cannot break the screen -----------------------------
{
  for (const junk of [null, undefined, [null], [{}], [{ started_at: 'x' }]]) {
    assert.doesNotThrow(() => buildReview(junk as never, NOW));
    assert.equal(buildReview(junk as never, NOW).recommendation, null);
  }
}

// --- counting ------------------------------------------------------------
{
  const rows = [
    session({ daysAgo: 1, outcome: 'finished', fidelity: 'yes' }),
    session({ daysAgo: 2, outcome: 'finished', fidelity: 'no' }),
    session({ daysAgo: 3, outcome: 'abandoned' }),
    session({ daysAgo: 30, outcome: 'finished' }), // outside the window
  ];
  const r = buildReview(rows, NOW);
  assert.equal(r.declared, 3, 'only the last seven days');
  assert.equal(r.completed, 2);
  assert.equal(r.completionRate, 2 / 3);
  assert.equal(r.answered, 2, 'fidelity counts only answered sessions');
  assert.equal(r.onDeclared, 1);
  assert.equal(r.fidelityRate, 0.5);
  assert.equal(r.unanswered, 1, 'unanswered is reported, not folded into "no"');
}

// --- an unanswered week produces no fidelity rate ------------------------
{
  const rows = Array.from({ length: 5 }, (_, i) => session({ daysAgo: i }));
  const r = buildReview(rows, NOW);
  assert.equal(r.answered, 0);
  assert.equal(r.fidelityRate, null, 'null, not zero: nobody said the time went astray');
  assert.equal(r.unanswered, 5);
}

// --- shape of the day ----------------------------------------------------
{
  const rows = [
    session({ daysAgo: 1, hour: 9, minutes: 90 }),
    session({ daysAgo: 2, hour: 9, minutes: 60 }),
    session({ daysAgo: 3, hour: 15, minutes: 30 }),
  ];
  const r = buildReview(rows, NOW);
  assert.equal(r.strongestHour, 9);
  assert.equal(r.byHour[9], 150);
  assert.equal(r.byHour[15], 30);
  assert.equal(r.byHour.length, 24);
  assert.equal(r.totalMinutes, 180);
}

// --- threads, largest first ----------------------------------------------
{
  const rows = [
    session({ daysAgo: 1, minutes: 100, intention: 'thesis' }),
    session({ daysAgo: 2, minutes: 50, intention: 'thesis' }),
    session({ daysAgo: 3, minutes: 80, intention: 'inbox' }),
  ];
  const r = buildReview(rows, NOW);
  assert.equal(r.threads[0].intention, 'thesis');
  assert.equal(r.threads[0].minutes, 150, 'the same intention accumulates');
  assert.equal(r.threads[1].intention, 'inbox');
}

// --- exactly one recommendation, and its numbers are stated --------------
{
  // Two late sessions, both unfinished, is the top rule.
  const rows = [
    session({ daysAgo: 1, hour: 22, outcome: 'abandoned' }),
    session({ daysAgo: 2, hour: 23, outcome: 'cut_short' }),
    session({ daysAgo: 3, hour: 10, outcome: 'finished' }),
  ];
  const r = buildReview(rows, NOW);
  assert.ok(r.recommendation, 'a rule fired');
  assert.equal(r.recommendation!.id, 'late-starts-fail');
  assert.match(r.recommendation!.text, /^Stop starting sessions after 21:00\.$/);
  assert.match(r.recommendation!.because, /2 sessions began after 21:00/, 'it states its numbers');
  assert.match(r.recommendation!.because, /none of them finished/);
}

// --- one late session that failed is not a pattern -----------------------
{
  const rows = [
    session({ daysAgo: 1, hour: 22, outcome: 'abandoned' }),
    session({ daysAgo: 2, hour: 10, outcome: 'finished' }),
    session({ daysAgo: 3, hour: 10, outcome: 'finished' }),
  ];
  const r = buildReview(rows, NOW);
  assert.notEqual(r.recommendation?.id, 'late-starts-fail', 'one instance is not evidence');
}

// --- a late session that DID finish breaks the rule ----------------------
{
  const rows = [
    session({ daysAgo: 1, hour: 22, outcome: 'abandoned' }),
    session({ daysAgo: 2, hour: 22, outcome: 'finished' }),
    session({ daysAgo: 3, hour: 10, outcome: 'finished' }),
  ];
  const r = buildReview(rows, NOW);
  assert.notEqual(r.recommendation?.id, 'late-starts-fail', 'the claim would be false');
}

// --- drifting from what was declared -------------------------------------
{
  const rows = [
    session({ daysAgo: 1, hour: 10, fidelity: 'no' }),
    session({ daysAgo: 2, hour: 10, fidelity: 'no' }),
    session({ daysAgo: 3, hour: 10, fidelity: 'partly' }),
    session({ daysAgo: 4, hour: 10, fidelity: 'yes' }),
  ];
  const r = buildReview(rows, NOW);
  assert.equal(r.recommendation?.id, 'drifting-from-declared');
  assert.match(r.recommendation!.because, /answered the question on 4 sessions/);
  assert.match(r.recommendation!.because, /only 1/);
}

// --- a good week gets no advice. The restraint test. ---------------------
{
  const rows = Array.from({ length: 6 }, (_, i) =>
    session({ daysAgo: i, hour: 9 + (i % 3), minutes: 50, planned: 50, fidelity: 'yes' }),
  );
  const r = buildReview(rows, NOW);
  assert.equal(r.completionRate, 1);
  assert.equal(r.fidelityRate, 1);
  assert.equal(
    r.recommendation,
    null,
    'nothing is wrong, so nothing is said. A recommendation here would be invented.',
  );
}

// --- planning longer than you run ----------------------------------------
{
  const rows = Array.from({ length: 4 }, (_, i) =>
    session({ daysAgo: i, hour: 9 + i, minutes: 12, planned: 90, fidelity: 'yes' }),
  );
  const r = buildReview(rows, NOW);
  assert.equal(r.recommendation?.id, 'plans-longer-than-you-run');
  assert.match(r.recommendation!.because, /planned 90 minutes on average and recorded 12/);
}

// --- the trailing series -------------------------------------------------
{
  const rows = [
    session({ daysAgo: 1, minutes: 60 }),
    session({ daysAgo: 8, minutes: 30 }),
    session({ daysAgo: 15, minutes: 90 }),
  ];
  const r = buildReview(rows, NOW);
  assert.equal(r.trailing.length, TRAILING_WEEKS);
  assert.equal(r.trailing.at(-1), 60, 'this week is last');
  assert.equal(r.trailing.at(-2), 30);
  assert.equal(r.trailing.at(-3), 90);
  assert.equal(r.trailing[0], 0, 'twelve weeks ago is empty');
}

// --- tone, over every rule -----------------------------------------------
{
  const cases = [
    [session({ daysAgo: 1, hour: 22, outcome: 'abandoned' }), session({ daysAgo: 2, hour: 23, outcome: 'abandoned' })],
    [
      session({ daysAgo: 1, fidelity: 'no' }),
      session({ daysAgo: 2, fidelity: 'no' }),
      session({ daysAgo: 3, fidelity: 'no' }),
    ],
    Array.from({ length: 4 }, (_, i) => session({ daysAgo: i, minutes: 10, planned: 90 })),
    Array.from({ length: 6 }, (_, i) => session({ daysAgo: i, outcome: 'abandoned' })),
  ];
  for (const rows of cases) {
    const rec = buildReview(rows, NOW).recommendation;
    if (!rec) continue;
    const text = `${rec.text} ${rec.because}`;
    assert.ok(!text.includes('!'), `no exclamation marks: ${text}`);
    assert.ok(!/[–—]/.test(text), `no dashes: ${text}`);
    assert.ok(!/great|well done|keep it up|congratul/i.test(text), `no congratulation: ${text}`);
    assert.ok(!/lazy|undisciplined|you failed|pathetic/i.test(text), `no scolding: ${text}`);
    assert.ok(/\d/.test(rec.because), 'every recommendation cites a number');
    assert.match(rec.text, /\.$/, 'the advice is one finished sentence');
  }
}

// --- determinism ---------------------------------------------------------
{
  const rows = [session({ daysAgo: 1, hour: 22, outcome: 'abandoned' }), session({ daysAgo: 2, hour: 23, outcome: 'abandoned' })];
  assert.deepEqual(buildReview(rows, NOW), buildReview(rows, NOW));
}

console.log('review.test.ts: all checks passed');
