# Anneal

A focus tracker for adults. It counts the time you actually sat down, then
compares it to what you said you would do.

Your session history is a SQLite file on your own disk. There is no account, no
server, and nothing to sign up for. The app makes no network requests at all,
including for its fonts, which are bundled.

## Status: early alpha, phase 4 of 6

Honest about what exists. Do not expect a finished product.

| Works | Not built yet |
|---|---|
| A first run that tells you something true about yourself | Additional domains beyond focus |
| Declaring an intention and running a timed session | Sync, accounts, payment |
| Three outcomes, plus whether the time went where you aimed | Re-running the diagnostic against your own record |
| The station, which responds to your session history | A real export |
| A weekly review that gives you exactly one thing to change | Anything but Windows |
| Crash recovery that credits work up to the last heartbeat | |
| Permanent marks and structures that absence never removes | |

The review gives you one recommendation, or none. When the week contains
nothing worth saying it says so, rather than inventing advice to fill the
space. Every recommendation cites the numbers it came from.

The station is the centre of it. It is a technical drawing of a forge that
accumulates parts as your hours accumulate. Skip a week and it goes dark.
Nothing you earned is ever taken away.

## Install

Download the installer from the releases page and run it.

**Windows will warn you.** The build is not code signed, so SmartScreen shows
an "Unknown Publisher" warning on anything downloaded through a browser. You
can click through it. A certificate costs real money and this is an alpha, so
there is no signature yet. If that is not acceptable to you, build from source
instead, which is the more sensible choice for an alpha anyway.

## Where your data lives

```
%APPDATA%\dev.anneal.desktop\sessions.db
```

That file is yours. Copy it, back it up, delete it, inspect it with any SQLite
tool. Note that it runs in write-ahead logging mode, so while the app is open
there are also `-wal` and `-shm` files and the main file alone may be slightly
behind. A proper export is not built yet.

Uninstalling leaves the file in place.

## Build from source

Prerequisites, per the [Tauri documentation](https://v2.tauri.app/start/prerequisites/):

- Rust, with the MSVC toolchain as the default host triple
- Visual Studio Build Tools with the "Desktop development with C++" workload
- Node 24 or newer, which this project relies on for running TypeScript and for
  its built-in SQLite in the test suite
- WebView2, already present on any supported Windows version

```bash
cd app
npm install
npm run tauri dev
```

To produce an installer:

```bash
cd app
npm run tauri build
```

## Tests

```bash
cd app
npm run check
```

That runs the type checker and three suites: session storage, the station
engine, and the station view. There is no test framework and none is needed.
Node runs TypeScript directly and ships `node:sqlite`, so the real SQL is
exercised against real SQLite with no mock database and no browser.

Every suite has been mutation tested. Deliberately breaking the clock clamp,
the crash recovery timestamp, the one-open-session constraint, parameter
binding, and the guarantee that marks never disappear each produce a failure.

## Layout

```
PLAN.md              what this is, the risks, the validation gates
plans/               product and UX, design system, build phases
docs/allowed-apis.md every API in use, with its source and version
mockups/             static design mockups and the landing page
app/                 the application
  src/db/            session storage, the one record everything derives from
  src/engine/        pure station state. No I/O, no clock reads
  src/station/       the view layer and the thin DOM renderer
  src-tauri/         the Rust shell
```

The design is documented before it is built. `plans/02-design-system.md` is
worth reading before touching any interface code, and `docs/allowed-apis.md`
before calling any API.

## Design principles

Six things this app will not do, each traceable to a documented complaint about
the apps it is reacting to.

1. Punish you for a bad week. Absence dims the forge and destroys nothing.
2. Assume every day looks the same. Commitments are counted by the week.
3. Hand you eleven systems on day one.
4. Let you game your own score. Progress is minutes on a clock, not checkboxes.
5. Make you tend a rotting list.
6. Nag you. No streaks, no notifications, no re-engagement email.

## Licence

Copyright (C) 2026 RatiOni

GNU Affero General Public License v3.0 only. The full text is in
[LICENSE](LICENSE).

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, version 3.

It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY,
without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the licence for details.

In short: you may use, study, modify and redistribute this, but anything you
build from it has to carry the same licence. That is deliberate. A product whose
entire claim is that your data stays on your machine should be verifiable by
anyone who cares to check, and copyleft means a fork cannot quietly remove that
property and close the source.
