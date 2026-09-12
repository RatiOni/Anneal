# 02 — Design System

Read this file at the start of every session that touches the interface.

The entire differentiation of this product is visual. Competent is not good
enough, because the incumbents are already competent and have years of content
besides. This document exists so that quality does not drift between sessions.

## 1. The register

The target feeling is a well-made instrument in a dim workshop. Weight, patina,
precision, restraint. Things that were built to be used for decades.

The register is **not** grim, edgy, or brutalist-for-its-own-sake. Gritty here
means grounded and worn, not aggressive. The user should feel calm and slightly
serious, never scolded and never hyped.

Useful reference points for mood, not for copying: analog measuring instruments,
field notebooks, machinist tools, ship logs, the interface language of Death
Stranding and Frostpunk, Teenage Engineering hardware.

## 2. Hard bans

Each of these is a specific thing the competition does. Any one of them present
in a build means the differentiation has been lost.

- Rounded pastel cards on a light grey background
- Purple or blue-to-pink gradients
- Emoji anywhere in the product interface
- Confetti, sparkles, celebratory bursts
- Cartoon characters or mascots
- Bouncy spring easing, overshoot, squash and stretch
- Default system-sans everywhere with no typographic hierarchy
- Exclamation points in product copy
- Reflexive congratulation ("Great job!", "You're crushing it!")

## 3. Colour

Warm dark, not blue-black. Blue-black reads as generic tech; warm dark reads as a
physical space.

| Role | Token | Value | Contrast on ground |
|---|---|---|---|
| Ground | `--ground` | `#131110` | n/a |
| Surface | `--surface` | `#1a1715` | n/a |
| Surface raised | `--surface-2` | `#211d1a` | n/a |
| Hairline | `--line` | `#2c2724` | n/a |
| Hairline bright | `--line-bright` | `#3c3531` | n/a |
| Primary text | `--text` | `#e9e2d9` | 14.65 |
| Secondary text | `--text-2` | `#9a9188` | 6.08 |
| Muted text | `--text-3` | `#8b827a` | 5.00 |
| Accent, ember | `--ember` | `#d2702f` | n/a |
| Data counterpoint | `--steel` | `#7d97a6` | 6.14 |
| Negative | `--negative` | `#b47a67` | 5.31 |

Values are measured, not estimated. The muted grey started three shades darker
at `#6b635c`, which looks perfectly fine to the eye on warm dark and measures
3.22, failing AA. That is precisely the trap section 8 warns about. Text on the
ember accent is `#140d07`, measuring 5.59 against it.

The negative colour started at `#96604f` and measured 3.47 on surface, also
failing. It is used for error messages, which is the worst place to put
unreadable text, since it is what a user reads when something has already
gone wrong. Raised to `#b47a67`, still a desaturated brick rather than an
alarm red.

Rules: one accent colour in the entire product. Station light is the only
saturated element on screen and it earns that by being the thing the user
changes. Colour is never the only carrier of meaning.

## 4. Typography

Two families, chosen deliberately, neither of them a default.

- **Display and headings.** Archivo. A grotesque with real character. This is what
  makes the product not look like every other app. Serif was considered and rejected: the reference points are machinist tools and ship logs, which use engraved sans and monospace, not book faces. Serif here would also be the most recognisable AI-design tell.
- **Data and interface.** IBM Plex Mono, drawn for an engineering identity, for numbers,
  timers, and tabular values. Numerals must be tabular so figures do not shift
  as they count.

Set generous line height in prose and tight tracking in numerals. Small caps or
letterspaced uppercase for labels, used sparingly.

## 5. Motion

Motion carries weight and inertia. Nothing bounces.

- Easing: standard ease-out for entrances, ease-in-out for transitions. No
  spring, no elastic, no overshoot.
- Duration: roughly 200 to 400 milliseconds for interface transitions. The
  station's own responses may be slower and are allowed to be, because slowness
  reads as mass.
- The station never animates idly in a way that demands attention. Ambient drift
  only.
- Reduced-motion preference must be honoured, with a static equivalent for every
  animated state.

## 6. Data visualisation

Charts are instruments, not decoration. This is where the moving graphs live and
they must look engineered.

- Thin strokes, precise gridlines at low contrast, real axis labels.
- No 3D, no drop shadows on data, no gradient fills under lines.
- Every chart answers one question named in a caption above it.
- Wide charts scroll inside their own container. The page never scrolls sideways.
- Any chart must remain readable in greyscale.
- Show the actual numbers next to the shape. This audience wants the figure.

## 7. Copy

- Plain declarative sentences. No em-dashes, no exclamation points.
- State the fact, then the consequence. Let the user draw the conclusion.
- Never use the accusatory second person about failure.
- Never congratulate without a specific measured reason.
- Prefer concrete nouns over abstractions. "Four sessions" over "great progress".

## 8. Accessibility, non-negotiable

Low contrast is an aesthetic risk in a warm-dark palette, so this is enforced
rather than assumed.

- Body text meets WCAG AA against its actual background. Verify with a tool, not
  by eye, because a warm palette flatters itself.
- Full keyboard operation of the daily loop, including starting and ending a
  session.
- Focus states are visible and designed, not browser defaults.
- Reduced motion honoured as above.

## 9. Verification checklist

Run this before considering any interface phase complete.

- [ ] Screenshot placed beside a screenshot of Habitica and of Finch. Is it
      obviously a different kind of object? If not, the phase failed.
- [ ] Every item in section 2 absent from the build.
- [ ] Contrast measured, not estimated.
- [ ] Keyboard-only pass of the full daily loop.
- [ ] Reduced-motion pass.
- [ ] Greyscale pass of every chart.
