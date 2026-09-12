// Renders the weekly review. Builds SVG from the geometry in charts.ts and the
// numbers in review.ts, and holds no logic of its own beyond formatting.
//
// Charts follow plans/02-design-system.md section 6: thin strokes, low-contrast
// gridlines, real labels, no gradient fills, readable in greyscale.

import type { Review } from './review.ts';
import { bars, linePoints, rankedBars, type Box } from './charts.ts';
import { formatTotal } from '../station/view.ts';

const SVG = 'http://www.w3.org/2000/svg';
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const svgEl = (tag: string, attrs: Record<string, string | number>): SVGElement => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

function chartFrame(box: Box, label: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  const plotHeight = box.height - box.padBottom;
  // Axis, then two gridlines. Gridlines sit under everything else.
  svg.appendChild(svgEl('line', { class: 'grid', x1: box.padLeft, y1: plotHeight / 3, x2: box.width, y2: plotHeight / 3 }));
  svg.appendChild(svgEl('line', { class: 'grid', x1: box.padLeft, y1: (plotHeight * 2) / 3, x2: box.width, y2: (plotHeight * 2) / 3 }));
  svg.appendChild(svgEl('line', { class: 'axis', x1: box.padLeft, y1: plotHeight, x2: box.width, y2: plotHeight }));
  return svg;
}

function panel(title: string, question: string): HTMLElement {
  const wrap = el('div', 'rv-panel');
  wrap.appendChild(el('h3', 'rv-label', title));
  wrap.appendChild(el('p', 'rv-question', question));
  return wrap;
}

function figure(value: string, unit: string): HTMLElement {
  const f = el('div', 'rv-figure');
  f.appendChild(el('b', 'mono', value));
  f.appendChild(el('span', undefined, unit));
  return f;
}

function declaredChart(review: Review): SVGSVGElement {
  const box: Box = { width: 420, height: 150, padBottom: 26, padLeft: 24 };
  const svg = chartFrame(box, 'Sessions declared and completed on each of the last seven days.');
  const declaredBars = bars(review.byDay.map((d) => d.declared), box, 20);
  const completedBars = bars(
    review.byDay.map((d) => d.completed),
    { ...box },
    20,
  );
  // Both series share one scale so the completed bar is always readable as a
  // portion of the declared one. bars() scales each call independently, so the
  // completed series is rescaled against the declared maximum here.
  const max = Math.max(1, ...review.byDay.map((d) => d.declared));
  const plotHeight = box.height - box.padBottom;

  review.byDay.forEach((day, i) => {
    const d = declaredBars[i];
    svg.appendChild(svgEl('rect', { class: 'bar-declared', x: d.x, y: d.y, width: d.width, height: d.height }));
    const h = (day.completed / max) * plotHeight;
    svg.appendChild(
      svgEl('rect', { class: 'bar-completed', x: d.x, y: plotHeight - h, width: d.width, height: h }),
    );
    const when = new Date(review.to - day.daysAgo * 86_400_000);
    svg.appendChild(
      Object.assign(svgEl('text', { class: 'tick', x: d.x + d.width / 2, y: box.height - 8, 'text-anchor': 'middle' }), {
        textContent: DAY_NAMES[when.getDay()],
      }),
    );
  });
  void completedBars;
  return svg;
}

function hourChart(review: Review): SVGSVGElement {
  const box: Box = { width: 420, height: 150, padBottom: 26, padLeft: 24 };
  const svg = chartFrame(box, 'Recorded minutes by hour of the day.');
  const points = linePoints(review.byHour, box);
  if (points) {
    svg.appendChild(svgEl('polyline', { class: 'line-steel', points }));
  }
  for (const hour of [0, 6, 12, 18, 23]) {
    const x = box.padLeft + (hour / 23) * (box.width - box.padLeft);
    svg.appendChild(
      Object.assign(svgEl('text', { class: 'tick', x, y: box.height - 8, 'text-anchor': 'middle' }), {
        textContent: String(hour).padStart(2, '0'),
      }),
    );
  }
  return svg;
}

function trailingChart(review: Review): SVGSVGElement {
  const box: Box = { width: 420, height: 150, padBottom: 26, padLeft: 24 };
  const svg = chartFrame(box, 'Recorded minutes per week over the last twelve weeks.');
  const points = linePoints(review.trailing, box);
  if (points) svg.appendChild(svgEl('polyline', { class: 'line-ember', points }));
  svg.appendChild(
    Object.assign(svgEl('text', { class: 'tick', x: box.padLeft, y: box.height - 8 }), {
      textContent: '12 WEEKS AGO',
    }),
  );
  svg.appendChild(
    Object.assign(svgEl('text', { class: 'tick', x: box.width, y: box.height - 8, 'text-anchor': 'end' }), {
      textContent: 'THIS WEEK',
    }),
  );
  return svg;
}

function threadsChart(review: Review): SVGSVGElement {
  const rows = review.threads;
  const box: Box = { width: 420, height: Math.max(40, rows.length * 36), padBottom: 0, padLeft: 150 };
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Recorded minutes by what was declared.');

  const geom = rankedBars(rows.map((t) => t.minutes), box, 16, 20);
  rows.forEach((thread, i) => {
    const g = geom[i];
    svg.appendChild(svgEl('rect', { class: i === 0 ? 'bar-completed' : 'bar-declared', x: g.x, y: g.y, width: g.width, height: g.height }));
    svg.appendChild(
      Object.assign(svgEl('text', { class: 'tick', x: box.padLeft - 10, y: g.y + 12, 'text-anchor': 'end' }), {
        textContent: thread.intention.slice(0, 22),
      }),
    );
    svg.appendChild(
      Object.assign(svgEl('text', { class: 'tick', x: box.padLeft + g.width + 8, y: g.y + 12 }), {
        textContent: formatTotal(thread.minutes),
      }),
    );
  });
  return svg;
}

export function renderReview(root: HTMLElement, review: Review): void {
  root.textContent = '';

  const head = el('div', 'rv-head');
  head.appendChild(el('h1', undefined, 'The last seven days'));
  const range = el('span', 'rv-range mono');
  const fmt = (t: number) =>
    new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  range.textContent = `${fmt(review.from)} to ${fmt(review.to)}`;
  head.appendChild(range);
  root.appendChild(head);

  if (!review.hasData) {
    const empty = el('p', 'rv-sub');
    empty.textContent =
      'You declared nothing in the last seven days, so there is nothing to compare. ' +
      'One session produces more than any amount of reading about sessions.';
    root.appendChild(empty);
    return;
  }

  const sub = el('p', 'rv-sub');
  const unanswered =
    review.unanswered > 0
      ? ` You did not answer the question on ${review.unanswered} of them.`
      : '';
  sub.textContent =
    `You declared ${review.declared} and finished ${review.completed}, ` +
    `recording ${formatTotal(review.totalMinutes)}.${unanswered}`;
  root.appendChild(sub);

  const grid = el('div', 'rv-grid');

  const a = panel('Declared against completed', 'How much of what you planned actually happened.');
  a.appendChild(
    figure(
      review.completionRate === null ? '0' : String(Math.round(review.completionRate * 100)),
      'percent completed',
    ),
  );
  a.appendChild(declaredChart(review));
  grid.appendChild(a);

  const b = panel('Where the time went', 'What you actually spent the week on.');
  b.appendChild(figure(String(review.threads.length), review.threads.length === 1 ? 'thread' : 'threads'));
  b.appendChild(threadsChart(review));
  grid.appendChild(b);

  const c = panel('Shape of the day', 'When your recorded work actually happened.');
  c.appendChild(
    figure(
      review.strongestHour === null ? '--' : `${String(review.strongestHour).padStart(2, '0')}:00`,
      'strongest hour',
    ),
  );
  c.appendChild(hourChart(review));
  grid.appendChild(c);

  const d = panel('Trailing twelve weeks', 'Whether this is holding up across months.');
  d.appendChild(figure(formatTotal(review.trailing.at(-1) ?? 0), 'this week'));
  d.appendChild(trailingChart(review));
  grid.appendChild(d);

  root.appendChild(grid);

  const rec = el('div', 'rv-rec');
  if (review.recommendation) {
    rec.appendChild(el('h3', 'rv-rec-label', 'One thing'));
    rec.appendChild(el('p', 'rv-rec-text', review.recommendation.text));
    rec.appendChild(el('p', 'rv-rec-why', review.recommendation.because));
  } else {
    rec.appendChild(el('h3', 'rv-rec-label', 'Nothing to change'));
    rec.appendChild(
      el('p', 'rv-rec-text', 'Nothing in this week contradicts anything else.'),
    );
    rec.appendChild(
      el(
        'p',
        'rv-rec-why',
        'That is a result, not a failure to find one. Advice invented to fill this space would be worth less than the silence.',
      ),
    );
  }
  root.appendChild(rec);
}
