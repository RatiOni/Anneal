# Allowed APIs

Phase 0 output. Every later phase cites this file. Do not call an API that is
not listed here, and do not pass a parameter that is not in a signature below.

Verified against official documentation on 12 September 2026. Re-verify any
entry older than about three months, since Tauri changed substantially between
v1 and v2 and most material online is still for v1.

## 1. Local toolchain, as measured on this machine

Checked directly, not assumed.

| Component | State | Version |
|---|---|---|
| Visual Studio Build Tools | installed | 2026, 18.10.12201.205 |
| Desktop development with C++ workload | installed | MSVC toolset 14.51.36231 |
| WebView2 runtime | installed | 152.0.4191.66 |
| Node | installed | v24.19.0 |
| npm | installed | 11.17.0 |
| rustc | installed | 1.98.1 (2026-09-01) |
| cargo | installed | 1.98.1 |
| rustup | installed | 1.29.1 |
| Default host triple | correct for Tauri | x86_64-pc-windows-msvc |
| Tauri | compiling | 2.11.5 |
| tauri-plugin-sql | compiling | 2.4.1, sqlite feature |
| sqlx-sqlite | compiling | 0.8.6 |

### Rust lives on the D drive

Installed outside the default location. `CARGO_HOME`, `RUSTUP_HOME` and the
`bin` directory are all on the persistent user environment, so a freshly
opened terminal finds cargo with no setup at all.

Only a shell that was already running before the install needs these, because
it never inherited them:

```powershell
$env:CARGO_HOME='D:\dev-tools\cargo'
$env:RUSTUP_HOME='D:\dev-tools\rustup'
$env:Path="D:\dev-tools\cargo\bin;$env:Path"
```

A first full `cargo check` compiles 552 crates and takes roughly 90 seconds.
Later checks are about a second. A first `tauri dev` is slower still, because
it builds and links a real binary rather than only checking types.

### Changing directory on Windows

In `cmd.exe`, `cd` does not change drive. Use `cd /d`:

```
cd /d "D:\self transformation app\app"
```

Without `/d` the directory silently does not change and npm reports a missing
script, which looks like a broken project and is not one. PowerShell and bash
do not need the flag.

Verification commands used:

```powershell
& "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -products * -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
```

How it was installed, recorded for a rebuild on another machine. Source:
https://v2.tauri.app/start/prerequisites/

```powershell
winget install --id Rustlang.Rustup
rustup default stable-msvc
```

The documentation is explicit that the terminal must be restarted afterwards,
and that the MSVC host triple must be the default rather than the GNU one. Both
are already satisfied here.

## 1b. Node can run the tests, with no test framework

Node 24.19.0 on this machine executes TypeScript directly by stripping types,
and ships `node:sqlite` with `DatabaseSync`. CHECK and UNIQUE constraints are
enforced by it, verified experimentally.

Together those two facts mean the real SQL in `src/db/sessions.ts` is tested
against real SQLite with no mock database, no GUI and no test framework. Run
everything with:

```
npm run check
```

Do not add a test framework. There is nothing for one to do here.

## 2. Project creation

Source: https://v2.tauri.app/start/create-project/

Scaffold a new project:

```
npm create tauri-app@latest
```

Add Tauri to an existing frontend instead:

```
npm install -D @tauri-apps/cli@latest
npx tauri init
```

Development and build:

```
npm run tauri dev
npm run tauri build
```

The Rust side lives in `src-tauri`.

## 3. SQLite via the official SQL plugin

Source: https://v2.tauri.app/plugin/sql/

Install:

```
npm run tauri add sql
```

Or manually:

```
cargo add tauri-plugin-sql --features sqlite
npm install @tauri-apps/plugin-sql
```

The Cargo feature flag is `sqlite`.

Registration in `src-tauri/src/lib.rs`:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
```

Permissions in `src-tauri/capabilities/default.json`:

```json
{
  "permissions": [
    "sql:default",
    "sql:allow-execute"
  ]
}
```

JavaScript API, the only three calls Phase 1 needs:

```javascript
const db = await Database.load('sqlite:test.db');
await db.execute('INSERT INTO todos (id, title, status) VALUES ($1, $2, $3)', [a, b, c]);
const rows = await db.select('SELECT * FROM todos');
```

Parameters are positional and one-indexed (`$1`, `$2`), and are passed as an
array. Always use them. Never build SQL by string concatenation, even for local
data, because an intention string is user input.

### Where the file actually lands, verified on this machine

A relative `sqlite:` path resolves to the roaming application data directory,
keyed by the `identifier` in `tauri.conf.json`:

```
C:\Users\<user>\AppData\Roaming\dev.anneal.desktop\sessions.db
```

This is the standard Windows location the plan requires, so no absolute path is
needed.

**The identifier must never change again.** It decides this path, so changing it
orphans every existing user's history. It was `dev.workbench.desktop` during
development and became `dev.anneal.desktop` when the product was named, which
stranded the test data at the old path. That was free then. It will not be free
after release. The identifier is only a unique string: it does not have to match
a domain you own, so buying a domain later is not a reason to touch it.

The schema was read back out of that live file and matched exactly: five CHECK
constraints, the `started_at` index, and the `sessions_one_open` partial unique
index all present. The constraints are therefore proven through the real plugin,
not only through the test adapter.

### WAL mode, and a promise it complicates

The connection runs in `journal_mode = wal`, which is sqlx's default. Two
consequences:

1. The database is three files, not one: `sessions.db`, `sessions.db-wal` and
   `sessions.db-shm`. Recent writes live in the WAL until a checkpoint.
2. **The landing page currently tells users to copy it to a USB stick.**
   Copying only `sessions.db` while the app runs yields a stale file. The claim
   is close to true but not exactly true as written.

Fix at the point an export or backup feature is built, not before: run
`VACUUM INTO '<path>'`, which writes a single consistent file regardless of WAL
state. Do not tell users to copy the file by hand until that exists.

## 4. Windows installer

Source: https://v2.tauri.app/distribute/windows-installer/

```
npm run tauri build
```

Two bundle targets exist. NSIS produces `-setup.exe` and can cross-compile.
MSI uses WiX Toolset v3, is Windows-only, and additionally requires the
VBSCRIPT optional Windows feature to be enabled.

Configured under `bundle.targets` in `tauri.conf.json`, for example
`"bundle": { "targets": ["nsis"] }`.

Relevant config keys confirmed to exist: `webviewInstallMode` (accepting
`downloadBootstrapper`, `embedBootstrapper`, `offlineInstaller`, `fixedVersion`,
`skip`), `minimumWebview2Version`, `wix`, and `nsis`.

Recommendation for Phase 6: NSIS only. WebView2 is already present on any
supported Windows version, so `downloadBootstrapper` keeps the download small.

### Code signing, open question

The installer page does not state what users see for an unsigned build, and the
separate signing page has not been read yet. Resolve this at Phase 6 by reading
https://v2.tauri.app/distribute/sign/windows/ before deciding whether to buy a
certificate. Do not guess; SmartScreen behaviour for unsigned installers is the
difference between a normal install and a scary warning.

## 5. Charting: no library

Decision, with reasoning, because a later session will be tempted to add one.

The charts in `mockups/gate-a.html` and `mockups/gate-b-landing.html` are
hand-written data-driven SVG with no dependency, and they already hit the
standard in `plans/02-design-system.md` section 6: thin strokes, low-contrast
gridlines, real axis labels, no gradient fills, readable in greyscale.

Every charting library ships the opposite defaults, so adopting one means
fighting it to get back to austere. The chart shapes needed are a grouped bar
chart, a line, a filled area, and a horizontal bar. All are a handful of SVG
path elements.

Add a library only if a genuinely hard chart type appears, and record the reason
here when that happens.

## 6. Payments, deferred

Not verified, deliberately. Phase 5 is far away, the price is not settled, and
provider pricing and APIs change. The offer plan in `private/` section 9 records
the requirement for a merchant of record rather than a raw processor. Verify the
provider's current subscription API and webhook contract at the start of Phase 5
and append it here then.

## Anti-pattern guards

- Do not use any v1 Tauri API. The plugin system, permissions model, and
  capability files are v2-specific, and most search results are v1.
- Do not invent a permission string. The two above are the verified ones.
- Do not interpolate values into SQL. Use positional parameters.
- Do not add a charting dependency without appending a reason to section 5.
- Do not assume anything about code signing before reading the signing page.
