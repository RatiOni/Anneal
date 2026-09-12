// Self-check for chart geometry. Run: node src/review/charts.test.ts
//
// Charts that silently mislead are worse than no charts, so the assertions here
// are mostly about the cases that produce a wrong picture rather than an error:
// an all-zero series, a single value, and negative or missing numbers.

import assert from 'node:assert/strict';
import { scaleMax, bars, linePoints, rankedBars, type Box } from './charts.ts';

const box: Box = { width: 420, height: 150, padBottom: 30, padLeft: 30 };
const plotHeight = box.height - box.padBottom;

// --- the scale -----------------------------------------------------------
{
  assert.equal(scaleMax([1, 5, 3]), 5);
  assert.equal(scaleMax([]), 1, 'an empty series still has a scale');
  assert.equal(scaleMax([0, 0, 0]), 1, 'an all-zero week does not divide by zero');
  assert.equal(scaleMax([-4, 2]), 2, 'negatives cannot set the top of the scale');
  assert.equal(scaleMax([NaN, Infinity, 7] as number[]), 7, 'junk cannot either');
}

// --- bars ----------------------------------------------------------------
{
  const b = bars([0, 5, 10], box, 20);
  assert.equal(b.length, 3);
  assert.equal(b[0].height, 0, 'a zero value draws nothing');
  assert.equal(b[2].height, plotHeight, 'the largest fills the plot');
  assert.equal(b[1].height, plotHeight / 2, 'and the scale is linear');

  for (const bar of b) {
    assert.ok(bar.y >= 0, 'nothing is drawn above the box');
    assert.ok(bar.y + bar.height <= plotHeight + 0.001, 'nor below the axis');
    assert.ok(bar.x >= box.padLeft - 0.001, 'nor left of the axis');
    assert.ok(bar.width > 0);
  }

  // An all-zero week must still produce bars at the baseline, not vanish.
  const empty = bars([0, 0, 0, 0, 0, 0, 0], box);
  assert.equal(empty.length, 7);
  assert.ok(empty.every((x) => x.height === 0 && x.y === plotHeight));

  assert.deepEqual(bars([], box), [], 'no values, no bars');
}

// --- negatives and junk cannot invert a bar ------------------------------
{
  const b = bars([-10, 50] as number[], box);
  assert.equal(b[0].height, 0, 'a negative reads as zero, never as an upside-down bar');
  assert.ok(b.every((x) => x.height >= 0));

  const j = bars([NaN, 10, undefined as never], box);
  assert.ok(j.every((x) => Number.isFinite(x.height) && x.height >= 0), 'no NaN coordinates');
}

// --- the line ------------------------------------------------------------
{
  const p = linePoints([0, 10], box);
  const pairs = p.split(' ').map((s) => s.split(',').map(Number));
  assert.equal(pairs.length, 2);
  assert.equal(pairs[0][1], plotHeight, 'zero sits on the axis');
  assert.equal(pairs[1][1], 0, 'the maximum touches the top');
  assert.equal(pairs[0][0], box.padLeft, 'the series starts at the axis');
  assert.equal(pairs[1][0], box.width, 'and ends at the right edge');

  assert.equal(linePoints([], box), '', 'nothing to draw');

  const single = linePoints([5], box);
  assert.equal(single.split(' ').length, 1, 'one value is one point, not a division by zero');
  assert.ok(!single.includes('NaN'));

  const flat = linePoints([0, 0, 0], box);
  assert.ok(!flat.includes('NaN'), 'a flat zero line is drawable');
  assert.ok(
    flat.split(' ').every((pt) => Number(pt.split(',')[1]) === plotHeight),
    'and sits on the axis',
  );
}

// --- ranked bars ---------------------------------------------------------
{
  const r = rankedBars([100, 50, 25], box, 16, 20);
  assert.equal(r.length, 3);
  assert.equal(r[0].width, box.width - box.padLeft, 'the largest spans the plot');
  assert.equal(r[1].width, (box.width - box.padLeft) / 2);
  assert.ok(r[1].y > r[0].y, 'rows stack downwards');
  assert.ok(r.every((x) => x.width >= 0 && Number.isFinite(x.width)));
  assert.deepEqual(rankedBars([0, 0], box).map((x) => x.width), [0, 0]);
}

// --- nothing produces a NaN coordinate anywhere --------------------------
{
  const nasty = [NaN, Infinity, -Infinity, -5, 0, null, undefined] as never[];
  for (const geom of [bars(nasty, box), rankedBars(nasty, box)]) {
    for (const g of geom) {
      for (const v of [g.x, g.y, g.width, g.height]) {
        assert.ok(Number.isFinite(v), `finite coordinate, got ${v}`);
      }
    }
  }
  assert.ok(!linePoints(nasty, box).includes('NaN'));
}

console.log('charts.test.ts: all checks passed');
