// Chart geometry. Pure: numbers in, coordinates out. No DOM, no SVG strings.
//
// Kept separate so the arithmetic is testable, and because the design system
// (plans/02-design-system.md s.6) wants charts that read as instruments: thin
// strokes, real axes, no gradient fills. That is easier to hold to when the
// maths is not tangled up with the markup.

export interface Box {
  /** Drawing area inside the axes. */
  width: number;
  height: number;
  /** Space reserved below for labels. */
  padBottom: number;
  padLeft: number;
}

export interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
}

const safe = (n: unknown): number => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/**
 * The top of the scale. Always at least 1 so an all-zero series draws a real
 * empty chart rather than dividing by zero or collapsing to a single line.
 */
export function scaleMax(values: readonly number[]): number {
  const top = Math.max(0, ...values.map(safe));
  return top > 0 ? top : 1;
}

/** Evenly spaced bars across the box, one per value. */
export function bars(values: readonly number[], box: Box, barWidth = 20): Bar[] {
  const max = scaleMax(values);
  const plotWidth = box.width - box.padLeft;
  const plotHeight = box.height - box.padBottom;
  const step = values.length > 0 ? plotWidth / values.length : plotWidth;

  return values.map((raw, i) => {
    const v = safe(raw);
    const height = (v / max) * plotHeight;
    return {
      x: box.padLeft + i * step + (step - barWidth) / 2,
      y: plotHeight - height,
      width: barWidth,
      height,
    };
  });
}

/** Points for a polyline, as "x,y x,y" ready for an SVG points attribute. */
export function linePoints(values: readonly number[], box: Box): string {
  if (values.length === 0) return '';
  const max = scaleMax(values);
  const plotWidth = box.width - box.padLeft;
  const plotHeight = box.height - box.padBottom;
  const step = values.length > 1 ? plotWidth / (values.length - 1) : 0;

  return values
    .map((raw, i) => {
      const v = safe(raw);
      const x = box.padLeft + i * step;
      const y = plotHeight - (v / max) * plotHeight;
      return `${round(x)},${round(y)}`;
    })
    .join(' ');
}

/** Horizontal bars for a ranked list, longest first. */
export function rankedBars(
  values: readonly number[],
  box: Box,
  rowHeight = 16,
  gap = 20,
): Bar[] {
  const max = scaleMax(values);
  const plotWidth = box.width - box.padLeft;
  return values.map((raw, i) => ({
    x: box.padLeft,
    y: i * (rowHeight + gap),
    width: (safe(raw) / max) * plotWidth,
    height: rowHeight,
  }));
}

const round = (n: number) => Math.round(n * 10) / 10;
