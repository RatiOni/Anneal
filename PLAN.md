# Master Plan

Status: planning complete, implementation not started.
Working directory: `D:\self transformation app`

This is the top-level document. Each linked plan is self-contained and can be
executed in a fresh session without reading the others, except that every
session must read this file and `plans/02-design-system.md` first.

- [01 — Product and user experience](plans/01-product-ux.md)
- [02 — Design system](plans/02-design-system.md)
- [03 — Build phases](plans/03-build-phases.md)

Offer, pricing and marketing live in `private/` and are not published. They
document pricing mechanics and channel strategy, and a product positioned on
not manipulating its users has no business publishing its levers.

---

## 1. What this is

A local-first desktop companion that turns focus and discipline into a visible,
maintained place. Adults declare what they intend to work on, work, and watch a
persistent environment respond to what they actually did over weeks and months.

It is a gamified companion in the lineage of Habitica, aimed at the large group
of adults who find that category infantilizing.

## 2. What this is not

- Not a habit tracker with points. Progress derives from measured sessions, never
  from self-declared checkboxes.
- Not cute. No pets, no pastel, no confetti, no mascot.
- Not cloud-first. The database is a file on the user's disk.
- Not a life-wide system at launch. One domain first.
- Not free forever in every respect. The core is free; the subscription is real.

## 3. Decisions locked

These were settled across the design conversation. Change them deliberately, not
by drift.

| Decision | Choice | Why |
|---|---|---|
| Category | Gamified companion, self-report | User decision, reaffirmed against pushback |
| Wedge domain | Focus and deep work | Measurable, upstream, desk-native |
| Storage | Local SQLite, no account required to use | Trust claim, zero marginal cost, differentiator |
| Funding | Subscription | Funds the recurring content obligation |
| Aesthetic | Gritty, grounded, dense, adult | The only unoccupied position in the category |
| Retention mechanism | Environment attachment plus insight | Not points, not social |
| Platform | Windows first | Developer's own platform, fastest loop |
| Language | Not Python | See `plans/03-build-phases.md` |

## 4. Decisions made on the developer's behalf

Each of these was an open question. I chose, and flagged it here so it can be
overridden cheaply before code exists.

**The companion is a place, not a creature.** A workshop or station that reflects
the state of the user's practice. Reasoning is threefold. It matches the gritty
register, where a creature would fight it. It requires no character rig, no
animation states, and no facial expression work, which matters enormously for a
developer without an artist. And it avoids the hostage problem: a neglected place
is melancholy, a neglected creature is cruel, and the second is the most resented
mechanic in this category.

**The free and paid line is drawn by cost, not by value.** Free covers everything
that costs nothing per user. Paid covers what costs money per user and what costs
ongoing labour. This is the only line that survives a user challenging it.

**Scope starts narrow and expands.** Focus and deep work at launch. Additional
domains are the expansion content the subscription funds.

## 5. Risks, ranked by probability of killing the project

1. **Nobody finds it.** Saturated category, unknown developer, no budget. This is
   the most likely cause of death and is barely affected by product quality.
2. **The aesthetic lands merely competent.** The entire differentiation rests on
   the visual result. Competent is fatal here, because competent is what the
   incumbents already have alongside years of content.
3. **Retention.** Nothing in the plan has been proven to make a person open this
   on day thirty.
4. **Content obligation.** Subscription commits the developer forever, solo.
5. **Divided attention.** A political simulation game is in progress in parallel.
   Two unshipped projects compete for the same finite hours.

## 6. Validation gates

Do not proceed past a gate that fails. Each gate exists to kill the project
cheaply rather than expensively.

**Gate A — the look, before any application code.**
Produce static high-fidelity mockups of the main view and the weekly review.
Post them where the audience is. Pass condition: unprompted requests to be told
when it ships. Fail condition: polite silence. See the marketing plan in
`private/`.

**Gate B — the price, before the paid tier exists.**
Landing page stating the product and the actual price, with a notify button.
Measure the fraction of visitors who sign up knowing the price. A free-signup
waitlist does not count and teaches nothing.

**Gate C — day-thirty retention, after the free core ships.**
Give the free core to real people. Pass condition: a meaningful share still
opening it after thirty days. Fail condition: they stop in week two.

**Kill criterion.** If the free core ships and friends who want to be supportive
have stopped opening it within a month, stop. Supportive people still abandon
things they do not want.

## 7. Sequencing

Gates are interleaved with build so that each expensive phase is preceded by a
cheap test of the assumption it depends on.

| Order | Work | Gate |
|---|---|---|
| 1 | Design system and mockups | Gate A |
| 2 | Landing page with price | Gate B |
| 3 | Build phases 0 through 3 (free core) | |
| 4 | Private release to real users | Gate C |
| 5 | Build phases 4 through 6 (insight, payment, packaging) | |
| 6 | Founding cohort launch | |

Honest estimate for a solo developer working part-time alongside another
project: this reaches a sellable version in roughly nine to fifteen months.
Anyone promising less has not built a desktop application with payments before.

## 8. Naming

**Anneal**, decided 12 September 2026. Annealing is heating metal and cooling it
slowly so it becomes tough and workable rather than brittle. For a product aimed
at people who burned out on punishing habit trackers, a name meaning "relieves
internal stress to make something durable" is the argument in one word. It is
also a rare word, which helps it be findable.

The product is the process; the object you maintain is still a forge. That split
is deliberate and the station's own vocabulary was left untouched during the
rename.

Identifier: `dev.anneal.desktop`. It decides where user history lives and must
never change again now that a build exists.

Rejected: Forge, too common. Temper, good double meaning but a crowded word
dragging a negative idiom. Whetstone, points at sharpening rather than heat.
Billet, too obscure. LifeForgeOS, three concepts stacked, and "OS" overclaims.
