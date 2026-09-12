# 03 — Build Phases

Read `PLAN.md` and `plans/02-design-system.md` before this file.

Each phase is self-contained and can be executed in a fresh session. Do not begin
a phase before its predecessor's verification checklist passes.

## Stack decision

**Recommended: Tauri v2.** A Rust shell with a web-technology interface.

Reasoning, in order of weight:

1. The interface requirements are smooth animation, moving graphs, and a dense
   dynamic layout. Web technology does these well and every desktop GUI toolkit
   does them badly. This is not a close call.
2. The download size is a product argument, not just an engineering preference.
   A small binary supports the local-first, does-not-eat-your-machine
   positioning, directly against Electron-based competitors.
3. SQLite and filesystem access are first-class.

**Fallback: Electron.** If Rust friction stalls progress for more than a week,
switch without guilt. Shipping in Electron beats not shipping in Tauri. The
interface code transfers unchanged, which is the point of choosing web
technology in the first place.

**Not Python.** Python stays on the political simulation project. For this one it
buys nothing and costs packaging pain, startup time, and interface quality.

## Phase 0 — Documentation discovery

No application code in this phase. The output is a written reference file that
every later phase cites.

Produce `docs/allowed-apis.md` containing, for each item below, the exact API
name, its signature, the documentation URL, and the version consulted.

Verify from official documentation, not from memory or from blog posts:

1. Tauri v2 project initialisation and the current command for creating an app.
2. The SQLite access path. Confirm whether the official plugin is the current
   recommendation and what its exact import and call signatures are.
3. The window, tray, and autostart APIs, if used.
4. The build and bundling commands for a Windows installer.
5. Code signing requirements for Windows, and what happens without a certificate.
6. The charting library chosen for section 6 of the design system, and its
   current API for the specific chart types needed.
7. The payment provider's subscription API and its webhook contract. See
   the offer plan in `private/` for which provider and why.

**Anti-pattern guards.** Do not write code that calls an API absent from
`docs/allowed-apis.md`. Do not pass parameters not present in the documented
signature. Do not assume a v1 pattern still applies in v2. Tauri changed
substantially between them and most material online is for v1.

**Verification.** Every entry in `docs/allowed-apis.md` carries a URL and a
version. Any entry without both is not done.

## Phase 1 — Core loop, no visuals

The smallest thing that records a session correctly.

Implement:
- SQLite schema: sessions table with declared intention, start, end, outcome.
- Start, end, and abandon a session.
- A plain list of past sessions. Deliberately ugly. Styling is Phase 3.
- Database file located in the platform's standard application data directory.

**Anti-pattern guards.** No game layer. No station. No charts. The temptation to
start the interesting part here is what turns three-week phases into three-month
phases.

**Verification. COMPLETE, 12 September 2026.**
- [x] A self-check script starts a session, ends it, and asserts the row is
      correct, including that an abandoned session is distinguishable from a
      completed one. `npm run check`. Mutation tested: four deliberate
      regressions were each caught.
- [x] Kill the application mid-session and restart. Verified against the real
      plugin. A hard kill left the row open with its heartbeat frozen ten
      minutes after the start; recovery closed it as abandoned at exactly that
      heartbeat, crediting 10m and not the 15m of wall clock that had passed.
- [x] The database file survives an application update. Verified at the SQLite
      level by reopening the same file with a second connection and rerunning
      the schema step.

Also verified through the real app, beyond what the plan asked for:
- The database lands in `AppData\Roaming\<identifier>`, the required location.
- The live schema matches the source exactly, including the partial unique index.
- The heartbeat fires on its 30 second interval, observed twice.
- All three outcomes round trip through the interface.
- Durations round correctly, and ending a session releases the one-open lock.

## Phase 2 — The station

The environment from `plans/01-product-ux.md` section 2.

Implement:
- A pure function from the session record to station state. No input or output,
  no clock reads inside it. This is the piece that must be testable and
  replayable.
- The rendering of that state.
- The response animation when a session ends.

**Anti-pattern guards.** The station state function must not read the database
directly. It takes sessions as an argument and returns state. This is what allows
replaying historical data against a changed rule set, which is how the design
gets tuned without waiting months for new data.

**Verification. COMPLETE, 12 September 2026.**
- [x] Assertions over the state function with synthetic session histories:
      empty, dense, a long gap followed by a return, and a single enormous
      session. A 200 day gap dims the forge to under 0.05 and removes no marks
      and no structures. See `src/engine/station.test.ts`.
- [x] A second suite, `src/station/view.test.ts`, runs the real engine into the
      real view so the thresholds and the copy are checked against genuine
      histories. It also asserts the copy carries no exclamation marks, no
      dashes, and no reflexive congratulation.
- [x] Design system checklist passed against the rendered result, measured in
      the browser rather than eyeballed:
      - Hard bans absent: no non-zero corner radius anywhere, no bouncy or
        overshooting easing, no emoji, no exclamation marks, no dashes, no
        gradient behind text, one accent.
      - Contrast measured on every visible text node. Two failures found and
        fixed, recorded in `plans/02-design-system.md` section 3.
      - Keyboard focus verified with real Tab presses. Every control shows a
        designed ember outline. The text input's indicator was strengthened
        from a one pixel border change.
      - Reduced motion verified empirically: the test surface reported
        `prefers-reduced-motion: reduce` and every animation and transition was
        suppressed.
      - Charts: none in this phase. Deferred to Phase 4.
- [x] The response animation runs on session end: 1400ms, `ease-out`, no
      bounce, ember to full brightness and back, glow blooming alongside.

Defects found and fixed during this phase:
- Structures and marks defaulted to looking unlocked in the markup, so a first
  paint showed a fully built station before the first render corrected it.
  Defaults are now dormant and hidden.
- The forge's hatched base was invisible: the rect carried a class setting
  `fill: none`, which erased the pattern.
- `--ember` was serving as both a colour and the opacity number the renderer
  writes, shadowing itself.

Open tuning question, not a defect: at rest a hot forge sits at 0.92 opacity, so
its ember barely brightens on response. The glow carries that moment instead.

## Phase 3 — Onboarding and interface polish

The first-run experience from `plans/01-product-ux.md` section 4, and the
application of `plans/02-design-system.md` to everything built so far.

Implement:
- The diagnostic, with hand-authored questions and deterministic rules producing
  the reading. No model calls.
- The reveal of the station.
- The guided first session.
- Full styling, typography, motion, and keyboard operation.

**Anti-pattern guards.** No tooltip tours. No modal stack. No account creation, no
email capture, no permission requests during first run.

**Verification. Mostly complete, 12 September 2026.**
- [x] Time a cold first run. The whole flow is eleven interactions: nine
      questions, one Continue, one Start. Walked end to end in the browser and
      it resolves with the right session length. Nowhere near ten minutes.
- [ ] **Still outstanding.** Hand the build to someone who has not seen it and
      say nothing. Watch. Any point where they ask what to do next is a defect.
      This needs a person and cannot be automated.
- [x] Design system checklist against the onboarding screens, measured in the
      browser: no contrast failures, no non-zero corner radius, no exclamation
      marks, no dashes, no emoji, one panel rather than a modal stack, no
      tooltips, no email or password input, no progress bar.
- [x] Keyboard-only operation: number keys answer every question, out-of-range
      and non-numeric keys are ignored, and the first choice is focused on each
      step so no click is needed to begin.

### The design decision worth knowing

The plan asked the diagnostic to say something true the person did not already
know, while rule 6 forbids horoscope output. Those pull against each other,
because a deterministic reading over nine self-report answers naturally
produces a personality classification, and a classification is a horoscope with
better manners.

So the reading is not a classification. It finds a **contradiction between two
of the person's own answers** and quotes both back, which is specific to them by
construction. When nothing contradicts, it says so rather than inventing
something. Four mutations confirm those guarantees bite: classifying in the
fallback, inventing a finding when nothing contradicts, letting a lower-priority
rule win, and removing the guard that keeps a malformed answer from breaking the
first run.

### Gate C sits here

Ship this to real users. Do not build Phase 4 or beyond until day-thirty
retention has been measured. See `PLAN.md` section 6.

## Phase 4 — The weekly review

The insight layer from `plans/01-product-ux.md` section 6.

Implement:
- Review rules as pure functions over the session record, same discipline as the
  station state function.
- The charts, against section 6 of the design system.
- The single recommendation, selected by rules with an explicit priority order.

**Anti-pattern guards.** No model calls. Every recommendation must be traceable to
a specific rule and specific rows, so that when a user says the advice was wrong
the cause is findable. Never emit more than one recommendation.

**Verification. COMPLETE, 12 September 2026.**
- [x] Assertions over the rule set with synthetic histories, including a week
      where everything went well. It produces no recommendation at all rather
      than reaching for a generic one. See `src/review/review.test.ts`.
- [x] Chart geometry has its own suite covering the cases that mis-draw rather
      than error: an all-zero week, a single value, negatives, and junk. No
      coordinate can be NaN and no bar can be inverted.
- [x] Measured in the browser on a rendered review: no contrast failures, no
      NaN coordinates in the emitted SVG, no gradient fills, no exclamation
      marks, no dashes, exactly one recommendation block.

### A rule was deleted rather than tuned

An early rule proposed "put one session at your strongest hour" whenever the
person had not worked at that exact hour on most days. That is true of every
healthy varied schedule, so it manufactured a finding out of ordinary variance.
The restraint test caught it, and it was removed rather than tightened, because
a meaningful version needs the diagnostic's stated answer to contradict. That
is the v0.3.0 re-run idea, not this.

Four rules remain, each citing the numbers it used: late sessions that all
failed, drifting from what was declared, planning longer than you run, and
declaring more than you finish.

## Phase 5 — Entitlement and payment

Implement:
- Account creation, required only for the paid tier. The free tier never prompts.
- Subscription checkout against the provider chosen in the offer plan in `private/`.
- A local entitlement cache with a grace period of at least one week offline.
- Restoring entitlement on a new machine.
- A visible, obvious cancellation path inside the application.

**Anti-pattern guards.** The free tier must not degrade when the network is
absent. Entitlement checks must never block application launch. Do not hide the
cancellation path. Concealing it produces one-star reviews and is the specific
behaviour this product is positioned against.

**Verification.**
- [ ] Free tier fully functional with networking disabled.
- [ ] Paid tier functional with networking disabled for the full grace period.
- [ ] Subscription lifecycle tested end to end against the provider's test mode,
      including a cancellation and a failed renewal.
- [ ] Confirm no payment credentials are ever handled by application code.

## Phase 6 — Packaging and distribution

Implement:
- Windows installer.
- Code signing, or a documented decision to ship unsigned with an explanation of
  the warning users will see.
- Update mechanism.
- Crash and error reporting that is opt-in and states plainly what it sends.

**Verification.**
- [ ] Clean-machine install, verified in a fresh virtual machine, not on the
      development machine.
- [ ] Update from the previous version with data preserved.
- [ ] Uninstall leaves the user's database in place and says so.

## Final verification

- [ ] Every API used appears in `docs/allowed-apis.md`.
- [ ] Grep the codebase for the banned patterns in design system section 2.
- [ ] Every pure function named in phases 2 and 4 has assertions covering the
      empty case, the dense case, and the long-gap case.
- [ ] Full first-run pass on a clean machine.
