// The only part of the station that touches the DOM. Deliberately thin: it
// writes state onto elements that already exist and lets CSS decide what that
// state looks like. Nothing here computes anything.
//
// Elements persist across renders rather than being rebuilt, which is what lets
// CSS transitions run at all. Replacing innerHTML would kill every animation.

import type { StationView } from './view.ts';

/** How long the station stays in its "a session just ended" state. */
export const RESPONSE_MS = 1400;

export function renderStation(root: HTMLElement, view: StationView): void {
  const set = (selector: string, apply: (el: HTMLElement) => void) => {
    const el = root.querySelector<HTMLElement>(selector);
    if (el) apply(el);
  };

  // Custom properties rather than inline opacity, so CSS keeps control of the
  // transition and can reference the same value in more than one place.
  root.style.setProperty('--ember-opacity', String(view.emberOpacity));
  root.style.setProperty('--glow', String(view.glowOpacity));

  set('[data-field="headline"]', (el) => {
    el.textContent = view.headline;
  });
  set('[data-field="detail"]', (el) => {
    el.textContent = view.detail;
  });
  set('[data-field="legend-structures"]', (el) => {
    el.textContent = view.legend.structures;
  });
  set('[data-field="legend-marks"]', (el) => {
    el.textContent = view.legend.marks;
  });
  set('[data-field="legend-last"]', (el) => {
    el.textContent = view.legend.lastWorked;
  });

  for (const structure of view.structures) {
    const group = root.querySelector<SVGGElement>(`[data-structure="${structure.id}"]`);
    if (!group) continue;
    group.dataset.state = structure.unlocked ? 'unlocked' : 'dormant';
    const label = group.querySelector('[data-role="requirement"]');
    if (label) label.textContent = structure.requirement;
  }

  const marks = root.querySelectorAll<SVGLineElement>('[data-mark]');
  marks.forEach((mark, index) => {
    // Marks are permanent, so they only ever appear. Never remove one here:
    // the engine guarantees the count cannot fall, and the visual promise in
    // plans/01-product-ux.md depends on that being true on screen too.
    mark.style.display = index < view.marksVisible ? '' : 'none';
  });

  set('[data-field="marks-overflow"]', (el) => {
    el.textContent = view.marksOverflow > 0 ? `+${view.marksOverflow}` : '';
  });
}

/**
 * Plays the one-shot response to a session ending. The class is removed again
 * so a later session can replay it.
 */
export function playResponse(root: HTMLElement): void {
  root.classList.remove('is-responding');
  // Force a reflow so removing and re-adding in the same frame still restarts
  // the animation rather than being coalesced away.
  void root.offsetWidth;
  root.classList.add('is-responding');
  window.setTimeout(() => root.classList.remove('is-responding'), RESPONSE_MS);
}
