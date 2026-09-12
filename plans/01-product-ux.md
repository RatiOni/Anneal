# 01 — Product and User Experience

Read `PLAN.md` before this file.

## 1. The core object: sessions, not tasks

Everything in the product derives from one record: a **session**. A session has a
declared intention, a start time, an end time, and an outcome the user marks when
it finishes.

This choice is load-bearing and it is the single biggest structural departure
from Habitica. Habitica derives progress from checkboxes the user ticks, which is
why its users farm the system by adding trivial tasks. Progress here derives from
elapsed measured time, which cannot be farmed without actually sitting there.

Tasks and to-do lists may exist as a convenience layer later. They never feed
progression.

## 2. The companion: a place

The user maintains a **station**: a persistent environment rendered in the app's
main view. It is not a character. It has no face and makes no requests.

Its state is a direct function of the session record over a trailing window:

- **Light.** Rises with consistent sessions, falls slowly with absence.
- **Order.** Reflects whether declared intentions match completed sessions.
- **Accumulation.** Objects, marks, and structures appear permanently as totals
  cross thresholds. These are never removed.

The third property is the retention mechanism. Light and order recover; the
accumulated record does not reset. A user returning after a bad month finds a
dim station, not a destroyed one, and everything they previously built is still
standing. That asymmetry is deliberate.

## 3. The anti-Habitica rules

These are binding design constraints, each traced to a documented complaint about
the incumbent. Violating one requires an explicit decision recorded in `PLAN.md`.

1. **No damage.** Absence causes decay, never destruction. Nothing the user
   earned is ever taken away.
2. **No day-bound commitments.** Commitments are rate-based, expressed as a
   count per week, never as "every day". Shift workers, students, and people
   with irregular lives must not be structurally penalised.
3. **One system at a time.** The first week exposes sessions only. Additional
   mechanics unlock across weeks. Habitica's onboarding shows everything at once
   and that is its most cited failure.
4. **Automatic pruning.** Anything untouched beyond a threshold archives itself
   silently. The user never has to maintain a list that has rotted.
5. **Progression cannot be farmed.** See section 1.
6. **The app must tell the user something.** Habitica accumulates years of data
   and never produces an insight. The weekly review is the answer to that, and it
   is the feature the incumbents structurally cannot copy without rebuilding on
   timed sessions.

## 4. First session: ten minutes, value before extraction

The first run must give before it takes. The failure mode to avoid is the one
almost every app in this category commits, which is opening with data entry and
deferring all value to a future the user never reaches.

**Minutes 0 to 5 — the reading.**
A short structured diagnostic, roughly eight to ten questions, about how the
user's attention actually behaves. Not preferences, not goals. Concrete
behavioural questions with uncomfortable specificity.

It ends by telling them something true about their pattern that they did not
arrive knowing, and naming the single thing most worth changing. This is the
product's lead magnet in the marketing sense, and it must be good enough that a
person who never returns still got something worth their ten minutes.

**Minutes 5 to 7 — the station appears.**
The environment is revealed in its initial state, cold and unlit. No tutorial
overlay, no tooltips queue. One line of text explaining that it responds to work,
not to input.

**Minutes 7 to 10 — the first session runs.**
The user is invited to declare one intention and start immediately. The default
duration is short enough to be obviously achievable. When it ends, the station
visibly changes for the first time.

The user leaves the first run having learned something about themselves and
having already done one unit of the thing. Nothing is asked of them that does not
pay back inside the same sitting.

## 5. The daily loop

Total friction budget from launch to working: **under sixty seconds.**

1. Open. The station is the first and only thing visible.
2. Declare the intention. One line of text, with recent intentions one click away.
3. Start. The interface recedes to something ambient that can sit on a second
   monitor without demanding attention.
4. End. Mark the outcome in one click across a small fixed set of results.
5. The station responds, immediately and visibly.

Step 5 is the entire emotional payload of the daily loop and deserves
disproportionate implementation effort. It is the short-term reward that carries
the user to the long-term outcome.

## 6. The weekly review

Once a week, on a day the user chooses, a review becomes available. This is where
the moving graphs live and where the product earns its subscription.

It contains:

- **Declared against completed.** The gap between what they said they would do
  and what happened. Presented without scolding and without flattery.
- **Shape of the week.** When focus actually occurred, against when they believe
  it occurs. These usually differ and the difference is the insight.
- **Trailing trend.** The only place long-range data appears, so the daily loop
  stays uncluttered.
- **One recommendation.** Exactly one, derived from rules over the session
  record. Never a list. A list of six recommendations is a list of zero.

Tone rule: the review states facts and consequences. It never uses the second
person accusatory ("you failed to"), and it never congratulates reflexively. The
register is a well-kept instrument reading, not a coach.

## 7. Progression and expansion

Progression is slow and permanent. Thresholds are measured in cumulative hours
and consistency streaks that tolerate gaps, not in consecutive days.

Expansion content, which is what the subscription funds, takes three forms:

1. **New station states and structures.** Visual depth as totals accumulate.
2. **New domains.** Additional life areas beyond focus, each with its own session
   type and its own review rules. This is the main expansion axis.
3. **Deeper review.** More analysis rules, longer trailing windows, comparisons.

## 8. What is deliberately absent from v1

Kept out on purpose. Each is a decision, not an oversight.

- Social features of any kind. They require a server and break the trust claim.
- Mobile. Focus work happens at a desk and the observation advantage lives there.
- Task lists and project management. Adjacent category, different product.
- Notifications and re-engagement nudges. A grounded product does not nag, and
  nagging is what this audience left the other apps to escape.
- Streaks displayed as a number. Streak anxiety is a documented churn driver.

## 9. Open questions for the developer

- Which specific domain expands second, after focus. Sleep is the strongest
  candidate on causal grounds.
- Whether the diagnostic's questions are authored by hand or generated. Hand-
  authored is recommended for v1: it is cheaper, deterministic, testable, and
  carries no per-user cost.
- Whether the station is illustrated or generated from primitives. This is the
  question that decides the art budget and it should be answered at Gate A.
