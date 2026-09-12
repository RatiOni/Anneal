// The weekly review. Pure: sessions in, everything the screen needs out.
// No I/O, no clock reads, `now` passed in. See plans/01-product-ux.md s.6.
//
// Two rules from plans/03-build-phases.md Phase 4 govern this file:
//   - No model calls. Every recommendation traces to a named rule and to
//     specific numbers, so when somebody says the advice was wrong the cause
//     is findable.
//   - Exactly one recommendation, or none. A list of six is a list of none,
//     and inventing one when the data says nothing is the horoscope failure.

import type { SessionRow } from '../db/sessions.ts';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export const WINDOW_DAYS = 7;
export const TRAILING_WEEKS = 12;

/** Sessions starting at or after this hour count as late. */
const LATE_HOUR = 21;

export interface DayBucket {
  /** Days before today. 6 is the oldest in the window, 0 is today. */
  daysAgo: number;
  declared: number;
  completed: number;
}

export interface Recommendation {
  id: string;
  /** One sentence, imperative. */
  text: string;
  /** The numbers it was derived from, shown under it so it can be checked. */
  because: string;
}

export interface Review {
  from: number;
  to: number;
  /** False when nothing was declared in the window. The screen says so. */
  hasData: boolean;

  declared: number;
  completed: number;
  completionRate: number | null;

  /** Fidelity is only over sessions that were actually answered. */
  answered: number;
  onDeclared: number;
  fidelityRate: number | null;
  unanswered: number;

  totalMinutes: number;
  /** 24 entries, minutes of recorded work starting in each hour. */
  byHour: number[];
  strongestHour: number | null;

  byDay: DayBucket[];
  /** Oldest first. Minutes per week over the trailing twelve. */
  trailing: number[];
  /** Largest first, capped. */
  threads: { intention: string; minutes: number }[];

  recommendation: Recommendation | null;
}

const minutesOf = (r: SessionRow): number =>
  r.ended_at === null ? 0 : Math.max(0, (r.ended_at - r.started_at) / MIN);

const round1 = (n: number) => Math.round(n * 10) / 10;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

// A rule that once lived here proposed "put a session at your strongest hour"
// whenever you had not worked at that exact hour on most days. That is true of
// every healthy varied schedule, so it manufactured a finding out of ordinary
// variance. The restraint test caught it and it was deleted rather than tuned.
// A meaningful version needs the diagnostic's stated answer to contradict,
// which is the v0.3.0 re-run idea, not this.

/**
 * Rules in priority order. The first whose `when` holds is the only one shown.
 * Each states the numbers it used, because advice you cannot check is advice
 * you cannot argue with.
 */
const RULES: {
  id: string;
  when: (r: Review, ctx: Ctx) => boolean;
  build: (r: Review, ctx: Ctx) => Omit<Recommendation, 'id'>;
}[] = [
  {
    id: 'late-starts-fail',
    when: (r, ctx) => r.declared > 0 && ctx.lateCount >= 2 && ctx.lateFailed === ctx.lateCount,
    build: (_r, ctx) => ({
      text: `Stop starting sessions after ${hourLabel(LATE_HOUR)}.`,
      because:
        `${plural(ctx.lateCount, 'session', 'sessions')} began after ${hourLabel(LATE_HOUR)} ` +
        `this week and none of them finished.`,
    }),
  },
  {
    id: 'drifting-from-declared',
    when: (r) => r.answered >= 3 && r.fidelityRate !== null && r.fidelityRate < 0.5,
    build: (r) => ({
      text: 'Declare something smaller than what you actually want to do.',
      because:
        `You answered the question on ${plural(r.answered, 'session', 'sessions')} and said ` +
        `the time went where you intended on only ${r.onDeclared}.`,
    }),
  },
  {
    id: 'plans-longer-than-you-run',
    when: (_r, ctx) => ctx.comparable >= 3 && ctx.ratio < 0.6,
    build: (_r, ctx) => ({
      text: 'Plan shorter sessions.',
      because:
        `Across ${plural(ctx.comparable, 'session', 'sessions')} you planned ` +
        `${round1(ctx.plannedAvg)} minutes on average and recorded ${round1(ctx.actualAvg)}.`,
    }),
  },
  {
    id: 'most-declared-sessions-unfinished',
    when: (r) => r.declared >= 4 && r.completionRate !== null && r.completionRate < 0.5,
    build: (r) => ({
      text: 'Declare fewer sessions.',
      because:
        `You declared ${r.declared} this week and finished ${r.completed}. ` +
        `Fewer, finished, is better data than more, abandoned.`,
    }),
  },
];

interface Ctx {
  lateCount: number;
  lateFailed: number;
  comparable: number;
  plannedAvg: number;
  actualAvg: number;
  ratio: number;
}

export function buildReview(sessions: readonly SessionRow[] | null | undefined, now: number): Review {
  // Sanitise once, at the boundary. Guarding at each use is how one path gets
  // missed, which is exactly what happened here: the trailing series threw on a
  // null row while the window filter handled it.
  const all = (Array.isArray(sessions) ? sessions : []).filter(
    (r): r is SessionRow =>
      r != null && Number.isFinite(r.started_at) && typeof r.intention === 'string',
  );
  const to = Number.isFinite(Number(now)) ? Number(now) : 0;
  const from = to - WINDOW_DAYS * DAY;

  const inWindow = all.filter((r) => r.started_at >= from && r.started_at <= to);

  const declared = inWindow.length;
  const completed = inWindow.filter((r) => r.outcome === 'finished').length;
  const answeredRows = inWindow.filter((r) => r.did_declared !== null && r.did_declared !== undefined);
  const onDeclared = answeredRows.filter((r) => r.did_declared === 'yes').length;

  const byHour = Array.from({ length: 24 }, () => 0);
  let totalMinutes = 0;
  const threadTotals = new Map<string, number>();

  for (const r of inWindow) {
    const m = minutesOf(r);
    totalMinutes += m;
    byHour[new Date(r.started_at).getHours()] += m;
    const key = r.intention.trim();
    threadTotals.set(key, (threadTotals.get(key) ?? 0) + m);
  }

  const peak = Math.max(...byHour);
  const strongestHour = peak > 0 ? byHour.indexOf(peak) : null;

  const byDay: DayBucket[] = Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const daysAgo = WINDOW_DAYS - 1 - i;
    const dayEnd = to - daysAgo * DAY;
    const dayStart = dayEnd - DAY;
    const ofDay = inWindow.filter((r) => r.started_at > dayStart && r.started_at <= dayEnd);
    return {
      daysAgo,
      declared: ofDay.length,
      completed: ofDay.filter((r) => r.outcome === 'finished').length,
    };
  });

  const trailing = Array.from({ length: TRAILING_WEEKS }, (_, i) => {
    const weeksAgo = TRAILING_WEEKS - 1 - i;
    const end = to - weeksAgo * WINDOW_DAYS * DAY;
    const start = end - WINDOW_DAYS * DAY;
    return all
      .filter((r) => r.started_at > start && r.started_at <= end)
      .reduce((sum, r) => sum + minutesOf(r), 0);
  });

  const threads = [...threadTotals.entries()]
    .map(([intention, minutes]) => ({ intention, minutes }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);

  // Context the rules read, passed in rather than held in module state so two
  // calls can never interfere and the whole thing stays a pure function.
  const late = inWindow.filter((r) => new Date(r.started_at).getHours() >= LATE_HOUR);
  const lateCount = late.length;
  const lateFailed = late.filter((r) => r.outcome !== 'finished').length;

  const comparableRows = inWindow.filter((r) => (r.planned_minutes ?? 0) > 0);
  const plannedSum = comparableRows.reduce((s, r) => s + (r.planned_minutes ?? 0), 0);
  const actualSum = comparableRows.reduce((s, r) => s + minutesOf(r), 0);
  const ctx: Ctx = {
    lateCount,
    lateFailed,
    comparable: comparableRows.length,
    plannedAvg: comparableRows.length ? plannedSum / comparableRows.length : 0,
    actualAvg: comparableRows.length ? actualSum / comparableRows.length : 0,
    ratio: plannedSum > 0 ? actualSum / plannedSum : 1,
  };

  const review: Review = {
    from,
    to,
    hasData: declared > 0,
    declared,
    completed,
    completionRate: declared === 0 ? null : completed / declared,
    answered: answeredRows.length,
    onDeclared,
    fidelityRate: answeredRows.length === 0 ? null : onDeclared / answeredRows.length,
    unanswered: declared - answeredRows.length,
    totalMinutes,
    byHour,
    strongestHour,
    byDay,
    trailing,
    threads,
    recommendation: null,
  };

  if (review.hasData) {
    for (const rule of RULES) {
      let matched = false;
      try {
        matched = rule.when(review, ctx);
      } catch {
        matched = false;
      }
      if (matched) {
        review.recommendation = { id: rule.id, ...rule.build(review, ctx) };
        break;
      }
    }
  }

  return review;
}
