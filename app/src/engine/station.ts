// Station state. Pure: no database, no network, no clock reads.
// `now` is always passed in. See plans/01-product-ux.md section 2 and
// plans/03-build-phases.md Phase 2 for why this purity is load-bearing:
// it lets historical sessions be replayed against changed rules.

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

// Trailing window the visible state responds to.
const WINDOW_DAYS = 14;

// Minutes of work in the window that reads as fully lit.
// 60 a day is the reference, not a target shown to the user.
const FULL_LIGHT_MINUTES = WINDOW_DAYS * 60;

// One mark per ten cumulative hours. Permanent.
const MINUTES_PER_MARK = 600;

// ponytail: a single session is capped at 12h of counted time. Anything
// longer is a forgotten timer, not a feat. Raise this only if real users
// legitimately work longer in one sitting.
const MAX_SESSION_MINUTES = 720;

// Ordered by when they appear. Requirements read only monotonic totals,
// which is what guarantees a gap can never remove one.
export interface StructureState {
  id: string;
  label: string;
  requires: { hours?: number; weeksActive?: number };
  unlocked: boolean;
}

export interface StationState {
  /** 0 to 1. Falls as work leaves the trailing window. */
  light: number;
  /** Completed over declared in the window, or null when nothing was declared. */
  order: number | null;
  cumulativeMinutes: number;
  marks: number;
  weeksActive: number;
  structures: StructureState[];
  windowMinutes: number;
  declaredInWindow: number;
  finishedInWindow: number;
  daysSinceLastSession: number | null;
}

export interface SessionInput {
  start: number;
  end: number | null;
  outcome?: 'finished' | 'cut_short' | 'abandoned' | null;
  intention?: string;
}

export const STRUCTURES: ReadonlyArray<Omit<StructureState, 'unlocked'>> = [
  { id: 'forge',   label: 'Forge',       requires: { hours: 0 } },
  { id: 'rack',    label: 'Rack',        requires: { hours: 10 } },
  { id: 'bellows', label: 'Bellows',     requires: { hours: 40 } },
  { id: 'anvil',   label: 'Anvil',       requires: { hours: 100 } },
  { id: 'quench',  label: 'Quench tank', requires: { hours: 200 } },
  { id: 'loft',    label: 'Loft',        requires: { weeksActive: 12 } },
];

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Counted minutes for one session.
 * Open sessions, reversed timestamps and absurd durations all yield 0 or a cap
 * rather than throwing, because this reads rows written by a process that can
 * be killed at any moment.
 */
function countedMinutes(session: unknown): number {
  const s = session as { start?: unknown; end?: unknown } | null | undefined;
  const start = Number(s?.start);
  const end = Number(s?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  const raw = (end - start) / MIN;
  if (!(raw > 0)) return 0;
  return Math.min(raw, MAX_SESSION_MINUTES);
}

/** ISO-week key, so "weeks active" does not drift with month boundaries. */
function weekKey(ms: number): string {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  // Thursday of the current ISO week identifies the week uniquely.
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  return `${d.getUTCFullYear()}-${Math.floor(d.getTime() / (7 * DAY))}`;
}

export function stationState(
  sessions: readonly SessionInput[] | null | undefined,
  now: number,
): StationState {
  const list: readonly SessionInput[] = Array.isArray(sessions) ? sessions : [];
  const reference = Number.isFinite(Number(now)) ? Number(now) : 0;
  const windowStart = reference - WINDOW_DAYS * DAY;

  let totalMinutes = 0;
  let windowMinutes = 0;
  let declaredInWindow = 0;
  let finishedInWindow = 0;
  let lastEnd: number | null = null;
  const weeks = new Set<string>();

  for (const s of list) {
    const minutes = countedMinutes(s);
    const start = Number(s?.start);

    if (minutes > 0) {
      totalMinutes += minutes;
      if (Number.isFinite(start)) weeks.add(weekKey(start));
      const end = Number(s.end);
      if (lastEnd === null || end > lastEnd) lastEnd = end;
      if (end >= windowStart) windowMinutes += minutes;
    }

    // A declared session counts even when abandoned at zero minutes:
    // the gap between declaring and doing is the thing being measured.
    if (Number.isFinite(start) && start >= windowStart) {
      declaredInWindow += 1;
      if (s?.outcome === 'finished') finishedInWindow += 1;
    }
  }

  const cumulativeHours = totalMinutes / 60;
  const weeksActive = weeks.size;

  const structures = STRUCTURES.map((st) => ({
    id: st.id,
    label: st.label,
    requires: st.requires,
    unlocked:
      cumulativeHours >= (st.requires.hours ?? 0) &&
      weeksActive >= (st.requires.weeksActive ?? 0),
  }));

  return {
    // 0 to 1. Falls on its own as work leaves the trailing window,
    // which is decay without any destructive step.
    light: clamp01(windowMinutes / FULL_LIGHT_MINUTES),

    // null rather than 0 when nothing was declared. There is no ratio
    // to report, and reporting 0 would read as failure.
    order: declaredInWindow === 0 ? null : finishedInWindow / declaredInWindow,

    // Monotonic in the session list. These are what "nothing is ever lost" means.
    cumulativeMinutes: totalMinutes,
    marks: Math.floor(totalMinutes / MINUTES_PER_MARK),
    weeksActive,
    structures,

    windowMinutes,
    declaredInWindow,
    finishedInWindow,
    daysSinceLastSession:
      lastEnd === null ? null : Math.max(0, Math.floor((reference - lastEnd) / DAY)),
  };
}
