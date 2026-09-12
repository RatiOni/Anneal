// Station view. Pure: takes engine state, returns everything the renderer
// needs, including the copy. No DOM, no clock, no I/O.
//
// The split exists so the wording and the thresholds can be tested and argued
// about without a browser. See plans/01-product-ux.md section 2 for what the
// station means, and plans/02-design-system.md section 7 for the tone rules:
// state the fact, never scold, never congratulate reflexively.

import type { StationState } from '../engine/station.ts';

/**
 * Never zero: a cold forge still has to be visible on screen. 0.06 was not.
 * Composited over the mouth's #0e0b09 it measured 1.05:1, which is no visible
 * difference at all, so the mouth read as an empty black window. 0.22 measures
 * 1.33:1, which reads as dark coals while staying far from the lit 0.92.
 */
const EMBER_MIN = 0.22;
const EMBER_MAX = 0.92;

/** The ambient glow is the only saturated area, so it stays restrained. */
const GLOW_MAX = 0.45;

/** Beyond this the rack stops reading as countable and becomes texture. */
const MARKS_VISIBLE_CAP = 16;

/** A week away is the point at which absence is worth naming out loud. */
const COLD_AFTER_DAYS = 7;

export interface StructureView {
  id: string;
  label: string;
  unlocked: boolean;
  /** Empty when unlocked. Otherwise the threshold, e.g. "40h" or "12w". */
  requirement: string;
}

export interface StationView {
  emberOpacity: number;
  glowOpacity: number;
  marksVisible: number;
  marksOverflow: number;
  structures: StructureView[];
  headline: string;
  detail: string;
  legend: { structures: string; marks: string; lastWorked: string };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * A single session's length. Under a minute reads in seconds, because a 17
 * second session shown as "0m" is indistinguishable from one that recorded
 * nothing, and the difference between those two is the whole point.
 */
export function formatDuration(minutes: number): string {
  const m = Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
  return m < 1 ? `${Math.round(m * 60)}s` : `${Math.round(m)}m`;
}

/** A running total. Same reasoning at the bottom end, hours and minutes above. */
export function formatTotal(minutes: number): string {
  const m = Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
  if (m < 1) return `${Math.round(m * 60)}s`;
  const whole = Math.floor(m);
  return `${Math.floor(whole / 60)}h ${whole % 60}m`;
}

function requirementLabel(requires: { hours?: number; weeksActive?: number }): string {
  if (requires.weeksActive) return `${requires.weeksActive}w`;
  if (requires.hours) return `${requires.hours}h`;
  return '';
}

function lastWorkedLabel(days: number | null): string {
  if (days === null) return 'never';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function headlineFor(state: StationState): string {
  if (state.cumulativeMinutes === 0) return 'The forge has not been lit.';
  if (state.light >= 0.66) return 'The forge is hot.';
  if (state.light >= 0.3) return 'The forge is warm.';
  // A banked fire is a real thing: low, kept alive on purpose. It says
  // "still going" without claiming more than the data supports.
  if (state.light >= 0.08) return 'The forge is banked.';
  return 'The forge is cold.';
}

function detailFor(state: StationState): string {
  if (state.cumulativeMinutes === 0) {
    return 'Say what you are working on and start.';
  }

  const days = state.daysSinceLastSession;
  if (days !== null && days >= COLD_AFTER_DAYS) {
    // The single most important sentence in the product. A person returning
    // after a bad month must be told, immediately, that nothing was taken.
    return state.marks > 0
      ? `Cold for ${days} days. Every mark you earned is still on the rack.`
      : `Cold for ${days} days.`;
  }

  // Sessions declared that recorded almost nothing. This is the most useful
  // thing the station can say, and reporting the count alone hides it: a cold
  // forge next to the words "2 sessions" explains nothing.
  if (state.declaredInWindow > 0 && state.windowMinutes < state.declaredInWindow) {
    return (
      `${plural(state.declaredInWindow, 'session', 'sessions')} declared in the last ` +
      `fourteen days. ${formatDuration(state.windowMinutes)} recorded.`
    );
  }

  const standing = state.structures.filter((s) => s.unlocked).length;
  return (
    `${plural(state.declaredInWindow, 'session', 'sessions')} in the last fourteen days. ` +
    `${plural(standing, 'structure', 'structures')} standing.`
  );
}

export function stationView(state: StationState): StationView {
  const light = clamp01(state.light);
  const lit = state.cumulativeMinutes > 0;

  return {
    emberOpacity: round2(EMBER_MIN + (EMBER_MAX - EMBER_MIN) * light),
    glowOpacity: lit ? round2(GLOW_MAX * light) : 0,

    marksVisible: Math.min(state.marks, MARKS_VISIBLE_CAP),
    marksOverflow: Math.max(0, state.marks - MARKS_VISIBLE_CAP),

    structures: state.structures.map((s) => ({
      id: s.id,
      label: s.label,
      unlocked: s.unlocked,
      requirement: s.unlocked ? '' : requirementLabel(s.requires),
    })),

    headline: headlineFor(state),
    detail: detailFor(state),

    legend: {
      structures: `${state.structures.filter((s) => s.unlocked).length} of ${state.structures.length}`,
      marks: String(state.marks),
      lastWorked: lastWorkedLabel(state.daysSinceLastSession),
    },
  };
}
