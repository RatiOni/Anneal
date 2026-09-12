// Self-check for the station engine. Run: node src/engine/station.test.ts
//
// Covers the four histories named in plans/03-build-phases.md Phase 2, plus
// monotonicity as a property. Lives in its own file so the engine module stays
// free of node builtins and can be bundled for the browser.

import assert from 'node:assert/strict';
import { stationState, type SessionInput } from './station.ts';

const DAY = 24 * 60 * 60_000;
const MIN = 60_000;
const MAX_SESSION_MINUTES = 720;


  const NOW = Date.UTC(2026, 8, 12, 12, 0, 0);
  const ses = (daysAgo: number, minutes: number, outcome: SessionInput['outcome'] = 'finished'): SessionInput => {
    const end = NOW - daysAgo * DAY;
    return { start: end - minutes * MIN, end, outcome, intention: 'x' };
  };

  // 1. Empty history must be valid, not a crash and not a fake zero ratio.
  const empty = stationState([], NOW);
  assert.equal(empty.light, 0);
  assert.equal(empty.marks, 0);
  assert.equal(empty.order, null, 'no declarations means no ratio');
  assert.equal(empty.daysSinceLastSession, null);
  assert.equal(empty.structures.filter((s) => s.unlocked).length, 1, 'only the forge');

  // Garbage in must not throw.
  for (const junk of [null, undefined, [null], [{}], [{ start: 'x', end: 'y' }]] as never[]) {
    assert.doesNotThrow(() => stationState(junk, NOW));
  }
  assert.equal(stationState([{ start: NOW, end: NOW - DAY }], NOW).cumulativeMinutes, 0,
    'reversed timestamps count as nothing');
  assert.equal(stationState([{ start: NOW - DAY, end: null }], NOW).cumulativeMinutes, 0,
    'an open session contributes nothing yet');

  // 2. Dense history lights up and does not exceed 1.
  const dense = stationState(
    Array.from({ length: 28 }, (_, i) => ses(i % 14, 90)), NOW);
  assert.ok(dense.light > 0.9, `dense light ${dense.light}`);
  assert.ok(dense.light <= 1, 'light is capped');
  assert.equal(dense.order, 1);

  // 3. A long gap dims the forge and destroys nothing. The core invariant.
  const earned = Array.from({ length: 60 }, (_, i) => ses(200 + i, 120));
  const before = stationState(earned, NOW - 200 * DAY);
  const after = stationState(earned, NOW);
  assert.ok(after.light < 0.05, `a 200 day gap goes dark, got ${after.light}`);
  assert.equal(after.marks, before.marks, 'marks survive the gap');
  assert.deepEqual(
    after.structures.filter((s) => s.unlocked).map((s) => s.id),
    before.structures.filter((s) => s.unlocked).map((s) => s.id),
    'structures survive the gap',
  );
  assert.ok(after.marks >= 12, `120 hours is at least 12 marks, got ${after.marks}`);
  assert.equal(after.daysSinceLastSession, 200);

  // 4. One absurd session cannot buy the whole building.
  const absurd = stationState([{ start: NOW - 40 * DAY, end: NOW, outcome: 'finished' }], NOW);
  assert.equal(absurd.cumulativeMinutes, MAX_SESSION_MINUTES, 'capped at 12 hours');
  assert.ok(absurd.light <= 1);
  assert.equal(absurd.structures.find((s) => s.id === 'anvil')?.unlocked, false,
    'a forgotten timer does not unlock the anvil');

  // 5. Monotonicity, stated as a property rather than a single case.
  let marks = 0, hours = 0;
  const growing: SessionInput[] = [];
  for (let i = 0; i < 40; i++) {
    growing.push(ses(40 - i, 45, i % 3 === 0 ? 'abandoned' : 'finished'));
    const s = stationState(growing, NOW);
    assert.ok(s.marks >= marks, 'marks never decrease');
    assert.ok(s.cumulativeMinutes / 60 >= hours, 'cumulative hours never decrease');
    marks = s.marks; hours = s.cumulativeMinutes / 60;
  }

  // 6. Order reflects outcomes, and an abandoned session still counts as declared.
  const mixed = stationState(
    [ses(1, 50), ses(1, 50), ses(2, 4, 'abandoned'), ses(3, 20, 'cut_short')], NOW);
  assert.equal(mixed.declaredInWindow, 4);
  assert.equal(mixed.finishedInWindow, 2);
  assert.equal(mixed.order, 0.5);

  // 7. Replay determinism. Same input and same `now` give the same answer.
  assert.deepEqual(stationState(earned, NOW), stationState(earned, NOW));


console.log('station.test.ts: all checks passed');
