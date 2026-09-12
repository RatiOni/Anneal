// Wiring. Holds no logic of its own beyond formatting and event plumbing:
// session rules live in src/db/sessions.ts, station rules in src/engine and
// src/station, and appearance in src/styles.css.

// Fonts are bundled, never fetched. A product whose claim is that your record
// never leaves your machine cannot phone Google on every launch, and the
// typography has to survive being offline.
import '@fontsource-variable/archivo';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles.css';
import Database from '@tauri-apps/plugin-sql';

import {
  migrate,
  startSession,
  endSession,
  touchSession,
  recoverOpenSessions,
  findOpenSession,
  listSessions,
  sessionsForEngine,
  HEARTBEAT_MS,
  type Db,
  type Outcome,
  type SessionRow,
} from './db/sessions.ts';
import {
  migrateSettings,
  setSetting,
  setJsonSetting,
  hasCompletedOnboarding,
  ONBOARDING_COMPLETED_AT,
  DIAGNOSTIC_ANSWERS,
} from './db/settings.ts';
import { runOnboarding } from './onboarding/screen.ts';
import { stationState } from './engine/station.ts';
import { stationView, formatDuration, formatTotal } from './station/view.ts';
import { renderStation, playResponse } from './station/render.ts';

// Verified location: AppData\Roaming\<identifier>\. See docs/allowed-apis.md s.3.
const DB_URL = 'sqlite:sessions.db';

let db: Db;
let openId: number | null = null;
let plannedMinutes = 50;
let heartbeat: ReturnType<typeof setInterval> | null = null;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const now = () => Date.now();
const station = () => el('station');

function field(name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-field="${name}"]`);
}

function say(message: string, isError = false) {
  const box = el('message');
  box.textContent = message;
  box.dataset.error = String(isError);
}

function stopHeartbeat() {
  if (heartbeat !== null) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
}

function startHeartbeat(id: number) {
  stopHeartbeat();
  heartbeat = setInterval(() => {
    // A failed heartbeat must never end the session. The worst outcome is that
    // recovery credits slightly less time, which is the safe direction.
    touchSession(db, id, now()).catch((error) => console.error('Heartbeat failed:', error));
  }, HEARTBEAT_MS);
}

async function refreshStation() {
  const sessions = await sessionsForEngine(db);
  const state = stationState(sessions, now());
  renderStation(station(), stationView(state));

  const week = field('week');
  if (week) week.textContent = formatTotal(state.windowMinutes);
  const cumulative = field('cumulative');
  if (cumulative) cumulative.textContent = `${Math.floor(state.cumulativeMinutes / 60)}h`;
  const light = field('light');
  if (light) light.textContent = state.light.toFixed(2);
}

function renderLog(rows: SessionRow[]) {
  const list = el('log');
  list.textContent = '';
  if (rows.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Nothing recorded yet.';
    list.appendChild(li);
    return;
  }
  for (const row of rows) {
    const minutes = row.ended_at === null ? 0 : (row.ended_at - row.started_at) / 60_000;
    const li = document.createElement('li');
    li.dataset.partial = String(row.outcome !== 'finished');

    const when = document.createElement('span');
    when.className = 'when mono';
    when.textContent = new Date(row.started_at).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });

    const what = document.createElement('span');
    what.className = 'what';
    what.textContent = row.intention;
    const outcome = document.createElement('em');
    outcome.textContent =
      row.outcome === 'finished' ? 'Finished' : row.outcome === 'cut_short' ? 'Cut short' : 'Abandoned';
    what.appendChild(outcome);

    const dur = document.createElement('span');
    dur.className = 'dur mono';
    dur.textContent = formatDuration(minutes);

    li.append(when, what, dur);
    list.appendChild(li);
  }
}

async function render() {
  const open = await findOpenSession(db);
  openId = open?.id ?? null;

  el('running').textContent = open
    ? `Running since ${new Date(open.started_at).toLocaleTimeString()}`
    : '';

  el<HTMLButtonElement>('begin').disabled = open !== null;
  el<HTMLInputElement>('intention').disabled = open !== null;
  for (const id of ['finished', 'cut_short', 'abandoned']) {
    el<HTMLButtonElement>(id).disabled = open === null;
  }

  renderLog(await listSessions(db, 50));
  await refreshStation();
}

async function begin() {
  const input = el<HTMLInputElement>('intention');
  try {
    const id = await startSession(db, { intention: input.value, plannedMinutes }, now());
    startHeartbeat(id);
    input.value = '';
    say('');
  } catch (error) {
    say(error instanceof Error ? error.message : String(error), true);
  }
  await render();
}

async function finish(outcome: Outcome) {
  if (openId === null) return;
  try {
    await endSession(db, openId, outcome, now());
    stopHeartbeat();
    say('');
    await render();
    // After the state is on screen, not before, so the animation lands on the
    // new values rather than the old ones.
    playResponse(station());
    return;
  } catch (error) {
    say(error instanceof Error ? error.message : String(error), true);
  }
  await render();
}

function selectDuration(minutes: number) {
  plannedMinutes = minutes;
  const group = document.querySelector('.duration');
  if (!group) return;
  let match = group.querySelector<HTMLButtonElement>(`button[data-minutes="${minutes}"]`);
  if (!match) {
    // The diagnostic can propose a length the fixed buttons do not offer.
    // Offer it rather than silently rounding the person's first session.
    match = document.createElement('button');
    match.type = 'button';
    match.dataset.minutes = String(minutes);
    match.textContent = `${minutes}m`;
    group.prepend(match);
  }
  for (const other of group.querySelectorAll('button')) other.removeAttribute('aria-pressed');
  match.setAttribute('aria-pressed', 'true');
}

function wireDurations() {
  const group = document.querySelector('.duration');
  if (!group) return;
  group.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-minutes]');
    if (!button) return;
    for (const other of group.querySelectorAll('button')) other.removeAttribute('aria-pressed');
    button.setAttribute('aria-pressed', 'true');
    plannedMinutes = Number(button.dataset.minutes) || 50;
  });
}

async function boot() {
  try {
    db = (await Database.load(DB_URL)) as unknown as Db;
    await migrate(db);
    await migrateSettings(db);
  } catch (error) {
    say(
      `Could not open the database. Your history is untouched. ${
        error instanceof Error ? error.message : String(error)
      }`,
      true,
    );
    return;
  }

  el('begin').addEventListener('click', () => void begin());
  el('finished').addEventListener('click', () => void finish('finished'));
  el('cut_short').addEventListener('click', () => void finish('cut_short'));
  el('abandoned').addEventListener('click', () => void finish('abandoned'));
  el('intention').addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Enter') void begin();
  });
  wireDurations();

  // Anything a crash left open is closed at its last heartbeat and named out
  // loud. A session that vanishes silently is the worst failure this app has.
  const recovered = await recoverOpenSessions(db);
  if (recovered.length > 0) {
    const names = recovered.map((r) => `"${r.intention}"`).join(', ');
    say(
      `${recovered.length === 1 ? 'A session' : `${recovered.length} sessions`} ` +
        `(${names}) was left open and has been closed at its last recorded minute.`,
    );
  }

  // A last heartbeat on the way out narrows what a hard kill can lose.
  window.addEventListener('beforeunload', () => {
    if (openId !== null) void touchSession(db, openId, now());
  });

  await render();

  // First run. Everything above is already wired, so if this is interrupted the
  // app underneath is in a working state rather than half built.
  if (!(await hasCompletedOnboarding(db))) {
    const { answers, reading } = await runOnboarding(el('onboarding'));
    try {
      await setJsonSetting(db, DIAGNOSTIC_ANSWERS, answers);
      await setSetting(db, ONBOARDING_COMPLETED_AT, String(now()));
    } catch (error) {
      // Losing the answers is survivable. Blocking the first session is not.
      console.error('Could not save the diagnostic:', error);
    }
    selectDuration(reading.suggestedMinutes);
    el<HTMLInputElement>('intention').focus();
  }
}

window.addEventListener('DOMContentLoaded', () => void boot());
