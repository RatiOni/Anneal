// Self-check for the station view. Run: node src/station/view.test.ts
//
// Runs the real engine into the real view, so the thresholds and the copy are
// checked against genuine session histories rather than hand-built state.

import assert from 'node:assert/strict';
import { stationState, type SessionInput } from '../engine/station.ts';
import { stationView } from './view.ts';

const DAY = 24 * 60 * 60_000;
const MIN = 60_000;
const NOW = Date.UTC(2026, 8, 12, 12, 0, 0);

const ses = (daysAgo: number, minutes: number): SessionInput => {
  const end = NOW - daysAgo * DAY;
  return { start: end - minutes * MIN, end, outcome: 'finished' };
};

const viewOf = (sessions: SessionInput[], now = NOW) =>
  stationView(stationState(sessions, now));

// --- never lit ----------------------------------------------------------
{
  const v = viewOf([]);
  assert.equal(v.headline, 'The forge has not been lit.');
  assert.equal(v.detail, 'Say what you are working on and start.');
  assert.equal(v.glowOpacity, 0, 'no glow before any work');
  assert.ok(v.emberOpacity > 0, 'the forge is still drawn when cold');
  assert.equal(v.marksVisible, 0);
  assert.equal(v.legend.lastWorked, 'never');
  assert.equal(v.legend.structures, '1 of 6', 'only the forge');
  assert.equal(
    v.structures.find((s) => s.id === 'bellows')?.requirement,
    '40h',
    'a dormant structure states its own threshold',
  );
  assert.equal(v.structures.find((s) => s.id === 'loft')?.requirement, '12w', 'weeks, not hours');
  assert.equal(v.structures.find((s) => s.id === 'forge')?.requirement, '', 'unlocked states nothing');
}

// --- hot ----------------------------------------------------------------
{
  const v = viewOf(Array.from({ length: 28 }, (_, i) => ses(i % 14, 90)));
  assert.equal(v.headline, 'The forge is hot.');
  assert.ok(v.emberOpacity > 0.8, `ember ${v.emberOpacity}`);
  assert.ok(v.glowOpacity > 0.4, `glow ${v.glowOpacity}`);
  assert.match(v.detail, /^28 sessions in the last fourteen days\./);
  assert.equal(v.legend.lastWorked, 'today');
}

// --- the four headline bands, in order ----------------------------------
{
  const bands = [
    { minutesPerDay: 90, expect: 'The forge is hot.' },
    { minutesPerDay: 30, expect: 'The forge is warm.' },
    { minutesPerDay: 8, expect: 'The forge is banked.' },
    { minutesPerDay: 2, expect: 'The forge is cold.' },
  ];
  for (const { minutesPerDay, expect } of bands) {
    const v = viewOf(Array.from({ length: 14 }, (_, i) => ses(i, minutesPerDay)));
    assert.equal(v.headline, expect, `${minutesPerDay} min/day`);
  }
}

// --- the returning user. The sentence that matters most. ------------------
{
  const earned = Array.from({ length: 60 }, (_, i) => ses(200 + i, 120));
  const v = viewOf(earned);
  assert.equal(v.headline, 'The forge is cold.');
  assert.match(v.detail, /^Cold for 200 days\./);
  assert.match(
    v.detail,
    /Every mark you earned is still on the rack\.$/,
    'a returning user is told nothing was taken',
  );
  assert.ok(v.marksVisible > 0, 'the marks are still drawn');
  assert.equal(v.legend.lastWorked, '200 days ago');
  assert.ok(!/failed|should|behind|missed/i.test(v.detail), 'no scolding');
}

// --- a gap with nothing yet earned does not promise marks ---------------
{
  const v = viewOf([ses(30, 20)]);
  assert.equal(v.detail, 'Cold for 30 days.', 'no claim about marks when there are none');
}

// --- marks cap, so the rack stays countable ------------------------------
{
  const many = Array.from({ length: 40 }, (_, i) => ses(i, 600));
  const v = viewOf(many);
  assert.equal(v.marksVisible, 16, 'visible marks are capped');
  assert.ok(v.marksOverflow > 0, 'the remainder is reported, not dropped');
  const state = stationState(many, NOW);
  assert.equal(v.marksVisible + v.marksOverflow, state.marks, 'nothing is lost in the cap');
  assert.equal(v.legend.marks, String(state.marks), 'the legend shows the true total');
}

// --- singulars read correctly -------------------------------------------
{
  const v = viewOf([ses(1, 45)]);
  assert.match(v.detail, /^1 session in the last fourteen days\./, 'not "1 sessions"');
  assert.match(v.detail, /1 structure standing\.$/, 'not "1 structures"');
  assert.equal(v.legend.lastWorked, 'yesterday', 'a session ending one day ago');
  assert.equal(viewOf([ses(1, 45)], NOW + DAY).legend.lastWorked, '2 days ago', 'and two days later');
}

// --- opacity is bounded and monotonic in light --------------------------
{
  let previous = -1;
  for (let perDay = 0; perDay <= 120; perDay += 10) {
    const v = viewOf(Array.from({ length: 14 }, (_, i) => ses(i, perDay)));
    assert.ok(v.emberOpacity >= previous, 'ember never drops as work rises');
    assert.ok(v.emberOpacity <= 0.92 && v.emberOpacity > 0, `bounded: ${v.emberOpacity}`);
    assert.ok(v.glowOpacity <= 0.45 && v.glowOpacity >= 0, `bounded: ${v.glowOpacity}`);
    previous = v.emberOpacity;
  }
}

// --- the copy carries no banned tone ------------------------------------
{
  const samples = [
    viewOf([]),
    viewOf([ses(0, 50)]),
    viewOf(Array.from({ length: 28 }, (_, i) => ses(i % 14, 90))),
    viewOf(Array.from({ length: 60 }, (_, i) => ses(200 + i, 120))),
  ];
  for (const v of samples) {
    const text = `${v.headline} ${v.detail}`;
    assert.ok(!text.includes('!'), `no exclamation marks: ${text}`);
    assert.ok(!/[–—]/.test(text), `no dashes: ${text}`);
    assert.ok(
      !/great|well done|amazing|crushing|keep it up|nice work/i.test(text),
      `no reflexive congratulation: ${text}`,
    );
  }
}

console.log('view.test.ts: all checks passed');
