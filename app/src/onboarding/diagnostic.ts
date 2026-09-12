// The first-run diagnostic. Pure: answers in, a reading out. No I/O, no clock,
// no model calls. See plans/01-product-ux.md section 4.
//
// The design decision that matters: the reading is NOT a classification. It
// finds a contradiction between two of the person's own answers and quotes both
// back. A classification would be a horoscope with better manners, and
// plans/01-product-ux.md rule 6 exists precisely to forbid that.
//
// If no contradiction is present, this says so. It never reaches for a generic
// observation to fill the space.

export type QuestionId =
  | 'sharpest'
  | 'first30'
  | 'tolerance'
  | 'ender'
  | 'daysWorked'
  | 'planFidelity'
  | 'phone'
  | 'startTime'
  | 'hardOrEasy';

export interface Choice {
  value: string;
  label: string;
}

export interface Question {
  id: QuestionId;
  /** Asked in the second person, about behaviour, never about preference. */
  prompt: string;
  choices: Choice[];
}

/**
 * Nine questions. Every one asks what the person actually does, never what
 * they would like to do or what kind of person they are. Preference questions
 * are what produce horoscopes.
 */
export const QUESTIONS: readonly Question[] = [
  {
    id: 'sharpest',
    prompt: 'When is your thinking sharpest?',
    choices: [
      { value: 'early', label: 'Early morning' },
      { value: 'late-morning', label: 'Late morning' },
      { value: 'afternoon', label: 'Afternoon' },
      { value: 'evening', label: 'Evening' },
      { value: 'night', label: 'Late night' },
    ],
  },
  {
    id: 'startTime',
    prompt: 'What time do you usually start working?',
    choices: [
      { value: 'before-7', label: 'Before 07:00' },
      { value: '7-9', label: 'Between 07:00 and 09:00' },
      { value: '9-11', label: 'Between 09:00 and 11:00' },
      { value: 'after-11', label: 'After 11:00' },
    ],
  },
  {
    id: 'first30',
    prompt: 'What do you actually do in your first thirty minutes of work?',
    choices: [
      { value: 'messages', label: 'Messages and email' },
      { value: 'hardest', label: 'The hardest thing on the list' },
      { value: 'whatever', label: 'Whatever is in front of me' },
      { value: 'planning', label: 'Plan the day' },
    ],
  },
  {
    id: 'hardOrEasy',
    prompt: 'Given one hard task and one easy task, which do you actually start?',
    choices: [
      { value: 'hard', label: 'The hard one' },
      { value: 'easy', label: 'The easy one' },
      { value: 'urgent', label: 'Whichever is most urgent' },
    ],
  },
  {
    id: 'tolerance',
    prompt: 'Once you sit down to focus, how long before you check something else?',
    choices: [
      { value: 'under-5', label: 'Under five minutes' },
      { value: '5-15', label: 'Five to fifteen minutes' },
      { value: '15-45', label: 'Fifteen to forty-five minutes' },
      { value: 'over-45', label: 'Longer than forty-five minutes' },
    ],
  },
  {
    id: 'ender',
    prompt: 'What usually ends a stretch of focused work?',
    choices: [
      { value: 'finished', label: 'I finish what I started' },
      { value: 'interrupted', label: 'Someone interrupts me' },
      { value: 'drifted', label: 'I drift off and notice later' },
      { value: 'time', label: 'I run out of time' },
      { value: 'will', label: 'I run out of will' },
    ],
  },
  {
    id: 'phone',
    prompt: 'Where is your phone while you work?',
    choices: [
      { value: 'another-room', label: 'Another room' },
      { value: 'out-of-reach', label: 'Out of reach' },
      { value: 'on-desk', label: 'On the desk' },
      { value: 'in-hand', label: 'In my hand' },
    ],
  },
  {
    id: 'planFidelity',
    prompt: 'When you plan a stretch of work, how often does it happen as planned?',
    choices: [
      { value: 'usually', label: 'Usually' },
      { value: 'half', label: 'About half the time' },
      { value: 'rarely', label: 'Rarely' },
      { value: 'never-plan', label: 'I do not plan them' },
    ],
  },
  {
    id: 'daysWorked',
    prompt: 'How many days in the last week did you do focused work?',
    choices: [
      { value: '0', label: 'None' },
      { value: '1-2', label: 'One or two' },
      { value: '3-4', label: 'Three or four' },
      { value: '5-7', label: 'Five or more' },
    ],
  },
];

export type Answers = Partial<Record<QuestionId, string>>;

export interface Finding {
  id: string;
  /** The contradiction, stated as fact. Never a diagnosis of the person. */
  observation: string;
  /** Which two answers produced it, so the person can check the reasoning. */
  evidence: [QuestionId, QuestionId];
  /** Exactly one change. Never a list. */
  change: string;
}

export interface Reading {
  finding: Finding | null;
  /** Shown when nothing contradicts. Honest, not a consolation prize. */
  fallback: string | null;
  /** The first session this run should propose, in minutes. */
  suggestedMinutes: number;
}

/** Hours a person is plausibly awake and working, for comparing sharpest to start. */
const SHARPEST_ORDER: Record<string, number> = {
  early: 0,
  'late-morning': 1,
  afternoon: 2,
  evening: 3,
  night: 4,
};
const START_ORDER: Record<string, number> = {
  'before-7': 0,
  '7-9': 0,
  '9-11': 1,
  'after-11': 2,
};

/**
 * Ordered by how uncomfortable and how actionable the finding is. The first
 * match wins, because the product shows exactly one.
 */
const RULES: {
  id: string;
  when: (a: Answers) => boolean;
  build: (a: Answers) => Omit<Finding, 'id'>;
}[] = [
  {
    id: 'best-hours-to-other-people',
    when: (a) => a.sharpest === 'early' && a.first30 === 'messages',
    build: () => ({
      observation:
        'Your sharpest hours go to other people. You said your thinking is best early, ' +
        'and that your first thirty minutes go to messages and email.',
      evidence: ['sharpest', 'first30'],
      change: 'Tomorrow, do not open messages until you have finished one session.',
    }),
  },
  {
    id: 'best-hours-on-the-easy-thing',
    when: (a) =>
      (a.sharpest === 'early' || a.sharpest === 'late-morning') && a.hardOrEasy === 'easy',
    build: () => ({
      observation:
        'Your best hours go to the easy work. You said your thinking is sharpest in the ' +
        'morning, and that given a choice you start with the easy task.',
      evidence: ['sharpest', 'hardOrEasy'],
      change: 'Put the hard task first tomorrow, and let the easy one wait for the afternoon.',
    }),
  },
  {
    id: 'awake-but-not-working',
    when: (a) =>
      a.sharpest !== undefined &&
      a.startTime !== undefined &&
      SHARPEST_ORDER[a.sharpest] !== undefined &&
      START_ORDER[a.startTime] !== undefined &&
      SHARPEST_ORDER[a.sharpest] < START_ORDER[a.startTime],
    build: () => ({
      observation:
        'You start work after your sharpest hours have already passed.',
      evidence: ['sharpest', 'startTime'],
      change: 'Move one session earlier. Not your whole day, one session.',
    }),
  },
  {
    id: 'drift-within-reach',
    when: (a) =>
      a.ender === 'drifted' && (a.phone === 'on-desk' || a.phone === 'in-hand'),
    build: (a) => ({
      observation:
        'Your sessions end by drifting, and the most likely cause is within arm’s reach. ' +
        `You said your phone is ${a.phone === 'in-hand' ? 'in your hand' : 'on the desk'}.`,
      evidence: ['ender', 'phone'],
      change: 'Put the phone in another room for one session and see what the timer says.',
    }),
  },
  {
    id: 'plans-that-do-not-run',
    when: (a) => a.planFidelity === 'rarely',
    build: () => ({
      observation:
        'You plan stretches of work and then rarely run them. The planning is not the ' +
        'problem, and more planning will not fix it.',
      evidence: ['planFidelity', 'ender'],
      change: 'Stop planning tomorrow. Start one session, now, and see what happens.',
    }),
  },
  {
    id: 'frequent-but-shallow',
    when: (a) =>
      a.daysWorked === '5-7' && (a.tolerance === 'under-5' || a.tolerance === '5-15'),
    build: () => ({
      observation:
        'You show up most days, and you do not stay. You said five or more days last week, ' +
        'and that you check something else within fifteen minutes.',
      evidence: ['daysWorked', 'tolerance'],
      change: 'Consistency is not your problem. Run one session without leaving it.',
    }),
  },
  {
    id: 'will-not-time',
    when: (a) => a.ender === 'will' && a.tolerance === 'over-45',
    build: () => ({
      observation:
        'You can hold attention for a long time, and you stop because you run out of will ' +
        'rather than because you are interrupted.',
      evidence: ['ender', 'tolerance'],
      change: 'Try a shorter session than feels worth starting. Stop while you still want to continue.',
    }),
  },
];

/** Tolerance decides the first session length: it must be obviously achievable. */
function suggestMinutes(answers: Answers): number {
  switch (answers.tolerance) {
    case 'under-5':
      return 15;
    case '5-15':
      return 25;
    case '15-45':
      return 50;
    case 'over-45':
      return 50;
    default:
      return 25;
  }
}

function fallbackFor(answers: Answers): string {
  // Nothing contradicts. Say something true and small rather than inventing a
  // finding. This is the honest branch and it must stay unglamorous.
  if (answers.ender === 'finished' && answers.planFidelity === 'usually') {
    return 'Nothing in your answers contradicts anything else. You appear to already do what you say you will, which means the timer is here to show you how much, not to correct you.';
  }
  if (answers.daysWorked === '0') {
    return 'Nothing in your answers contradicts anything else, and you did no focused work last week. There is nothing to diagnose yet. One session will produce more information than any questionnaire.';
  }
  return 'Nothing in your answers contradicts anything else. That is a real result, not a failure to find one. Run a few sessions and the timer will have something to say that a questionnaire cannot.';
}

export function readAnswers(answers: Answers): Reading {
  const a = answers ?? {};
  const suggestedMinutes = suggestMinutes(a);

  for (const rule of RULES) {
    let matched = false;
    try {
      matched = rule.when(a);
    } catch {
      matched = false; // a malformed answer must never break the first run
    }
    if (matched) {
      return { finding: { id: rule.id, ...rule.build(a) }, fallback: null, suggestedMinutes };
    }
  }

  return { finding: null, fallback: fallbackFor(a), suggestedMinutes };
}

/** True once every question has an answer that is one of its own choices. */
export function isComplete(answers: Answers): boolean {
  return QUESTIONS.every((q) => {
    const given = answers?.[q.id];
    return given !== undefined && q.choices.some((c) => c.value === given);
  });
}
