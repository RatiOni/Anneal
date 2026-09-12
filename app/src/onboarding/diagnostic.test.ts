// Self-check for the first-run diagnostic. Run: node src/onboarding/diagnostic.test.ts
//
// The point of most of these is not that the rules fire, but that the output
// cannot degenerate into a horoscope: every finding must quote the person's own
// answers, and no finding may appear when nothing contradicts.

import assert from 'node:assert/strict';
import {
  QUESTIONS,
  readAnswers,
  isComplete,
  type Answers,
  type QuestionId,
} from './diagnostic.ts';

// --- the questions themselves -------------------------------------------
{
  assert.equal(QUESTIONS.length, 9, 'nine questions');
  const ids = new Set(QUESTIONS.map((q) => q.id));
  assert.equal(ids.size, QUESTIONS.length, 'ids are unique');

  for (const q of QUESTIONS) {
    assert.ok(q.choices.length >= 3, `${q.id} offers a real choice`);
    const values = new Set(q.choices.map((c) => c.value));
    assert.equal(values.size, q.choices.length, `${q.id} has unique values`);
    assert.match(q.prompt, /\?$/, `${q.id} is phrased as a question`);
    assert.ok(!q.prompt.includes('!'), `${q.id} has no exclamation mark`);
    assert.ok(!/[–—]/.test(q.prompt), `${q.id} has no dashes`);
    // Behaviour, not preference. "Would you rather" and "do you prefer"
    // questions are what produce personality readings.
    assert.ok(
      !/prefer|would you|do you like|how do you feel|describe yourself/i.test(q.prompt),
      `${q.id} asks about behaviour, not preference`,
    );
  }
}

// --- completeness gate --------------------------------------------------
{
  assert.equal(isComplete({}), false);
  const partial: Answers = { sharpest: 'early' };
  assert.equal(isComplete(partial), false);

  const full: Answers = {};
  for (const q of QUESTIONS) full[q.id] = q.choices[0].value;
  assert.equal(isComplete(full), true);

  // A value that is not one of the offered choices does not count.
  assert.equal(isComplete({ ...full, sharpest: 'nonsense' }), false);
}

// --- the flagship finding ------------------------------------------------
{
  const r = readAnswers({ sharpest: 'early', first30: 'messages' });
  assert.ok(r.finding, 'a contradiction was found');
  assert.equal(r.finding!.id, 'best-hours-to-other-people');
  assert.match(r.finding!.observation, /sharpest hours go to other people/);
  // It must quote both of the answers it is built from.
  assert.match(r.finding!.observation, /best early/);
  assert.match(r.finding!.observation, /messages and email/);
  assert.deepEqual(r.finding!.evidence, ['sharpest', 'first30']);
  assert.ok(r.finding!.change.length > 0, 'exactly one change is given');
}

// --- awake but not working ----------------------------------------------
{
  const r = readAnswers({ sharpest: 'early', startTime: 'after-11', first30: 'hardest' });
  assert.equal(r.finding?.id, 'awake-but-not-working');

  // The same start time is not a contradiction for a night person.
  const night = readAnswers({ sharpest: 'night', startTime: 'after-11', first30: 'hardest' });
  assert.notEqual(night.finding?.id, 'awake-but-not-working', 'no false positive for night people');
}

// --- drift within reach --------------------------------------------------
{
  const desk = readAnswers({ ender: 'drifted', phone: 'on-desk' });
  assert.equal(desk.finding?.id, 'drift-within-reach');
  assert.match(desk.finding!.observation, /on the desk/, 'quotes the answer given');

  const hand = readAnswers({ ender: 'drifted', phone: 'in-hand' });
  assert.match(hand.finding!.observation, /in your hand/, 'and the other answer');

  // Drift with the phone in another room is not this finding.
  const away = readAnswers({ ender: 'drifted', phone: 'another-room' });
  assert.notEqual(away.finding?.id, 'drift-within-reach');
}

// --- no contradiction means no finding. The important test. --------------
{
  const tidy: Answers = {
    sharpest: 'early',
    startTime: 'before-7',
    first30: 'hardest',
    hardOrEasy: 'hard',
    tolerance: 'over-45',
    ender: 'finished',
    phone: 'another-room',
    planFidelity: 'usually',
    daysWorked: '3-4',
  };
  const r = readAnswers(tidy);
  assert.equal(r.finding, null, 'nothing is invented when nothing contradicts');
  assert.ok(r.fallback, 'it says so instead');
  assert.match(r.fallback!, /contradicts/);
  assert.ok(
    !/you are a|you tend to be|your type|personality/i.test(r.fallback!),
    'the fallback is not a classification',
  );
}

// --- exactly one finding, ever ------------------------------------------
{
  // These answers satisfy several rules at once.
  const many: Answers = {
    sharpest: 'early',
    first30: 'messages',
    hardOrEasy: 'easy',
    startTime: 'after-11',
    ender: 'drifted',
    phone: 'in-hand',
    planFidelity: 'rarely',
    daysWorked: '5-7',
    tolerance: 'under-5',
  };
  const r = readAnswers(many);
  assert.ok(r.finding, 'one of them fires');
  assert.equal(r.fallback, null, 'a finding and a fallback are mutually exclusive');
  assert.equal(r.finding!.id, 'best-hours-to-other-people', 'the highest priority rule wins');
}

// --- malformed input cannot break the first run -------------------------
{
  for (const junk of [undefined, null, {}, { sharpest: 123 }, { ender: [] }, { phone: {} }]) {
    assert.doesNotThrow(() => readAnswers(junk as never), `survives ${JSON.stringify(junk)}`);
    const r = readAnswers(junk as never);
    assert.ok(r.suggestedMinutes > 0, 'still proposes a session length');
  }
}

// --- the suggested first session must be achievable ---------------------
{
  assert.equal(readAnswers({ tolerance: 'under-5' }).suggestedMinutes, 15, 'short for short attention');
  assert.equal(readAnswers({ tolerance: '5-15' }).suggestedMinutes, 25);
  assert.equal(readAnswers({ tolerance: '15-45' }).suggestedMinutes, 50);
  assert.equal(readAnswers({}).suggestedMinutes, 25, 'a safe default with no answer');
  for (const q of QUESTIONS.find((x) => x.id === 'tolerance')!.choices) {
    const m = readAnswers({ tolerance: q.value }).suggestedMinutes;
    assert.ok(m >= 15 && m <= 50, `${q.value} proposes something plausible: ${m}`);
  }
}

// --- every reading everywhere obeys the tone rules -----------------------
{
  // Exhaustive over the cross product would be large; sample every rule's
  // trigger plus a spread of others.
  const samples: Answers[] = [
    { sharpest: 'early', first30: 'messages' },
    { sharpest: 'late-morning', hardOrEasy: 'easy' },
    { sharpest: 'early', startTime: 'after-11' },
    { ender: 'drifted', phone: 'on-desk' },
    { planFidelity: 'rarely' },
    { daysWorked: '5-7', tolerance: 'under-5' },
    { ender: 'will', tolerance: 'over-45' },
    { daysWorked: '0' },
    {},
  ];
  for (const s of samples) {
    const r = readAnswers(s);
    const text = [r.finding?.observation, r.finding?.change, r.fallback]
      .filter(Boolean)
      .join(' ');
    assert.ok(!text.includes('!'), `no exclamation marks: ${text.slice(0, 60)}`);
    assert.ok(!/[–—]/.test(text), `no dashes: ${text.slice(0, 60)}`);
    assert.ok(
      !/great|well done|amazing|you should feel|congratul/i.test(text),
      `no congratulation: ${text.slice(0, 60)}`,
    );
    assert.ok(
      !/you are lazy|you lack|you fail|undisciplined|you have no/i.test(text),
      `no scolding: ${text.slice(0, 60)}`,
    );
    // Every finding names the two answers it came from, so the person can
    // check the reasoning rather than take it on faith.
    if (r.finding) {
      assert.equal(r.finding.evidence.length, 2);
      for (const id of r.finding.evidence) {
        assert.ok(
          QUESTIONS.some((q) => q.id === (id as QuestionId)),
          `evidence ${id} is a real question`,
        );
      }
    }
  }
}

// --- readings are deterministic -----------------------------------------
{
  const a: Answers = { sharpest: 'early', first30: 'messages', tolerance: '5-15' };
  assert.deepEqual(readAnswers(a), readAnswers(a));
}

console.log('diagnostic.test.ts: all checks passed');
