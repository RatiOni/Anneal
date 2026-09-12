// Self-check for the station view. Run: node src/station/view.test.ts
//
// Runs the real engine into the real view, so the thresholds and the copy are
// checked against genuine session histories rather than hand-built state.

import assert from 'node:assert/strict';
import { stationState, type SessionInput } from '../engine/station.ts';
import { stationView, formatDuration, formatTotal } from './view.ts';

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
  assert.ok(v.emberOpacity >= 0.22, 'a never-lit forge is visibly dark coals, not an empty window');
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
    assert.ok(v.emberOpacity <= 0.92 && v.emberOpacity >= 0.22, `bounded: ${v.emberOpacity}`);
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



// --- declared sessions that recorded almost nothing ----------------------
{
  // Reproduces the real screen: two sessions of 17 and 2 seconds.
  const tiny: SessionInput[] = [
    { start: NOW - 17_000, end: NOW, outcome: 'finished' },
    { start: NOW - 2_000, end: NOW, outcome: 'finished' },
  ];
  const v = viewOf(tiny);
  assert.equal(v.headline, 'The forge is cold.');
  assert.match(v.detail, /^2 sessions declared in the last fourteen days\./,
    'the count is qualified as declared, not done');
  assert.match(v.detail, /19s recorded\.$/, 'and the recorded time is stated');
  assert.ok(!/structures standing/.test(v.detail), 'the structure count is not the story here');
}

// --- but real sessions keep the ordinary line ---------------------------
{
  const v = viewOf([ses(1, 45), ses(2, 50)]);
  assert.match(v.detail, /^2 sessions in the last fourteen days\./, 'not "declared"');
  assert.match(v.detail, /structures? standing\.$/);
}

// --- a returning user still hears about their marks first ---------------
{
  // A case where both rules genuinely CAN fire: the last session was 10 days
  // ago, so the gap message applies, and it lasted 20 seconds inside the
  // fourteen day window, so the declared-but-empty rule also applies.
  // Without a real conflict this assertion would prove nothing.
  const earned: SessionInput[] = [
    ...Array.from({ length: 60 }, (_, i) => ses(60 + i, 120)),
    { start: NOW - 10 * DAY - 20_000, end: NOW - 10 * DAY, outcome: 'finished' },
  ];
  const state = stationState(earned, NOW);
  assert.ok(state.daysSinceLastSession !== null && state.daysSinceLastSession >= 7,
    'precondition: the gap rule applies');
  assert.ok(state.declaredInWindow > 0 && state.windowMinutes < state.declaredInWindow,
    'precondition: the declared-but-empty rule also applies');

  const v = stationView(state);
  assert.match(v.detail, /^Cold for 10 days\./, 'the gap message outranks the newer rule');
  assert.match(v.detail, /still on the rack\.$/, 'and still says nothing was taken');
}

// --- duration formatting -------------------------------------------------
{
  assert.equal(formatDuration(0), '0s');
  assert.equal(formatDuration(17 / 60), '17s', 'a 17 second session is not "0m"');
  assert.equal(formatDuration(2 / 60), '2s', 'and is distinguishable from a 2 second one');
  assert.equal(formatDuration(0.99), '59s', 'just under the boundary');
  assert.equal(formatDuration(1), '1m', 'and at it');
  assert.equal(formatDuration(49.6), '50m');
  for (const junk of [NaN, -5, Infinity, undefined as never, null as never]) {
    assert.equal(formatDuration(junk), '0s', `survives ${String(junk)}`);
  }

  assert.equal(formatTotal(0), '0s');
  assert.equal(formatTotal(0.312), '19s', 'the running total no longer reads 0h 0m');
  assert.equal(formatTotal(1), '0h 1m');
  assert.equal(formatTotal(61), '1h 1m');
  assert.equal(formatTotal(213 * 60), '213h 0m');
  for (const junk of [NaN, -5, Infinity]) {
    assert.equal(formatTotal(junk), '0s', `survives ${String(junk)}`);
  }
}

console.log('view.test.ts: all checks passed');
