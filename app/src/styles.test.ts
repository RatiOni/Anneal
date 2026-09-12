// Stylesheet invariants. Run: node src/styles.test.ts
//
// These were all originally checked by hand in a browser, which meant they held
// only as long as somebody remembered to look. One did not: `.onboarding` set
// `display: grid`, which overrides the browser's `[hidden]` rule, so setting
// `el.hidden = true` did nothing and the app shipped a blank screen after the
// first run. This file exists so that class of mistake fails the suite instead.
//
// It parses the stylesheet as text rather than rendering it. That is a real
// limit: it proves the rules are declared, not that they win the cascade
// everywhere. It is still far better than nothing and needs no browser.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(here, 'styles.css'), 'utf8');
// Comments are prose. These invariants are about declarations, so strip them:
// a comment explaining that nothing bounces must not read as a bounce.
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');

// --- the bug that shipped ------------------------------------------------
{
  const rule = /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(css);
  assert.ok(
    rule,
    'styles.css must force [hidden] to display:none !important, or any class ' +
      'setting display silently defeats el.hidden',
  );
}

// --- palette contrast, the thing a warm dark theme flatters --------------
{
  const vars = new Map<string, string>();
  for (const [, name, value] of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    vars.set(name, value);
  }
  const hex = (name: string) => {
    const v = vars.get(name);
    assert.ok(v, `--${name} is defined in styles.css`);
    return v!;
  };

  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = (h: string) =>
    0.2126 * lin(parseInt(h.slice(1, 3), 16)) +
    0.7152 * lin(parseInt(h.slice(3, 5), 16)) +
    0.0722 * lin(parseInt(h.slice(5, 7), 16));
  const ratio = (a: string, b: string) => {
    const la = L(a);
    const lb = L(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  const ground = hex('ground');
  const surface = hex('surface');

  // Body text is 4.5. Every one of these is body sized somewhere in the app.
  for (const token of ['text', 'text-2', 'text-3', 'negative']) {
    for (const [bgName, bg] of [
      ['ground', ground],
      ['surface', surface],
    ] as const) {
      const r = ratio(hex(token), bg);
      assert.ok(
        r >= 4.5,
        `--${token} on --${bgName} is ${r.toFixed(2)}, below WCAG AA 4.5. ` +
          'A warm dark palette looks fine to the eye well below this.',
      );
    }
  }

  // The text sitting on the ember accent button.
  assert.ok(
    ratio('#140d07', hex('ember-colour')) >= 4.5,
    'button text on the ember accent must pass AA',
  );
}

// --- shape lock ----------------------------------------------------------
{
  const radii = [...css.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim());
  const nonZero = radii.filter((r) => !/^0(px)?$/.test(r));
  assert.deepEqual(nonZero, [], `corner radius is 0 everywhere; found ${nonZero.join(', ')}`);
}

// --- motion discipline ---------------------------------------------------
{
  // Overshooting easing has a negative number in its cubic-bezier.
  const beziers = [...css.matchAll(/cubic-bezier\(([^)]+)\)/g)].map((m) => m[1]);
  const bouncy = beziers.filter((b) => b.split(',').some((n) => Number(n.trim()) < 0));
  assert.deepEqual(bouncy, [], `no overshooting easing; found ${bouncy.join(' | ')}`);
  assert.ok(
    !/\b(spring|elastic|bounce)\b/i.test(css),
    'no spring, elastic or bounce easing: the design system asks for weight, not bounce',
  );

  assert.ok(
    /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css),
    'a reduced-motion block must exist',
  );
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.ok(
    /animation:\s*none\s*!important/.test(reduced) && /transition:\s*none\s*!important/.test(reduced),
    'reduced motion must disable both animation and transition',
  );
}

// --- no fetched assets: the app must work offline ------------------------
{
  const remote = [...css.matchAll(/url\(\s*['"]?(https?:)?\/\//g)].map((m) => m[0]);
  assert.deepEqual(
    remote,
    [],
    'styles.css must not fetch anything over the network. Fonts are bundled ' +
      'because the product claims your record never leaves your machine.',
  );
}

console.log('styles.test.ts: all checks passed');
