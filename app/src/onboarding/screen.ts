// The first-run screen. Drives the diagnostic, shows the reading, reveals the
// station, then hands off. See plans/01-product-ux.md section 4.
//
// Constraints from plans/03-build-phases.md Phase 3, which this must not break:
// no tooltip tour, no modal stack, no account creation, no email capture, no
// permission requests. One thing on screen at a time, and it must reach a
// completed first session in under ten minutes.

import {
  QUESTIONS,
  readAnswers,
  isComplete,
  type Answers,
  type QuestionId,
  type Reading,
} from './diagnostic.ts';

type Step = { kind: 'question'; index: number } | { kind: 'reading' } | { kind: 'reveal' };

export interface OnboardingResult {
  answers: Answers;
  reading: Reading;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Mounts the flow into `root`. Resolves once the person reaches the end, with
 * their answers and the reading, so the caller can persist them and preselect
 * the first session length.
 */
export function runOnboarding(root: HTMLElement): Promise<OnboardingResult> {
  const answers: Answers = {};
  let step: Step = { kind: 'question', index: 0 };

  return new Promise((resolve) => {
    function finish() {
      root.hidden = true;
      root.textContent = '';
      resolve({ answers, reading: readAnswers(answers) });
    }

    function choose(id: QuestionId, value: string) {
      answers[id] = value;
      const next = (step as { index: number }).index + 1;
      step = next < QUESTIONS.length ? { kind: 'question', index: next } : { kind: 'reading' };
      render();
    }

    function back() {
      if (step.kind === 'question' && step.index > 0) {
        step = { kind: 'question', index: step.index - 1 };
      } else if (step.kind === 'reading') {
        step = { kind: 'question', index: QUESTIONS.length - 1 };
      } else if (step.kind === 'reveal') {
        step = { kind: 'reading' };
      }
      render();
    }

    function render() {
      root.textContent = '';
      root.hidden = false;
      const panel = document.createElement('div');
      panel.className = 'onb-panel';

      if (step.kind === 'question') {
        const q = QUESTIONS[step.index];

        const counter = document.createElement('p');
        counter.className = 'onb-counter mono';
        counter.textContent = `${pad(step.index + 1)} / ${pad(QUESTIONS.length)}`;

        const heading = document.createElement('h1');
        heading.className = 'onb-question';
        heading.textContent = q.prompt;

        const list = document.createElement('div');
        list.className = 'onb-choices';
        q.choices.forEach((choice, i) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'onb-choice';
          button.dataset.value = choice.value;
          const key = document.createElement('span');
          key.className = 'onb-key mono';
          key.textContent = String(i + 1);
          const label = document.createElement('span');
          label.textContent = choice.label;
          button.append(key, label);
          if (answers[q.id] === choice.value) button.setAttribute('aria-pressed', 'true');
          button.addEventListener('click', () => choose(q.id, choice.value));
          list.appendChild(button);
        });

        panel.append(counter, heading, list);
        if (step.index > 0) panel.appendChild(backLink());
        root.appendChild(panel);
        // Focus the first choice so the keyboard works without a click first.
        list.querySelector<HTMLButtonElement>('button')?.focus();
        return;
      }

      if (step.kind === 'reading') {
        const reading = readAnswers(answers);

        const label = document.createElement('p');
        label.className = 'onb-counter mono';
        label.textContent = 'WHAT YOUR ANSWERS SAY';

        if (reading.finding) {
          const observation = document.createElement('h1');
          observation.className = 'onb-observation';
          observation.textContent = reading.finding.observation;

          const changeLabel = document.createElement('p');
          changeLabel.className = 'onb-counter mono onb-spaced';
          changeLabel.textContent = 'ONE THING';

          const change = document.createElement('p');
          change.className = 'onb-change';
          change.textContent = reading.finding.change;

          panel.append(label, observation, changeLabel, change);
        } else {
          const observation = document.createElement('h1');
          observation.className = 'onb-observation';
          observation.textContent = 'Nothing you told me contradicts anything else.';

          const detail = document.createElement('p');
          detail.className = 'onb-change';
          detail.textContent = reading.fallback ?? '';

          panel.append(label, observation, detail);
        }

        panel.appendChild(
          primary('Continue', () => {
            step = { kind: 'reveal' };
            render();
          }),
        );
        panel.appendChild(backLink());
        root.appendChild(panel);
        panel.querySelector<HTMLButtonElement>('.onb-primary')?.focus();
        return;
      }

      // Reveal. One line about what the station is, and nothing else. The plan
      // is explicit that this is not a tutorial.
      const label = document.createElement('p');
      label.className = 'onb-counter mono';
      label.textContent = 'YOUR STATION';

      const heading = document.createElement('h1');
      heading.className = 'onb-observation';
      heading.textContent = 'The forge is cold.';

      const detail = document.createElement('p');
      detail.className = 'onb-change';
      detail.textContent =
        'It responds to work, not to input. Nothing you type here will light it, and nothing you skip will take it away.';

      panel.append(label, heading, detail, primary('Start the first session', finish), backLink());
      root.appendChild(panel);
      panel.querySelector<HTMLButtonElement>('.onb-primary')?.focus();
    }

    function primary(text: string, onClick: () => void): HTMLButtonElement {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'onb-primary';
      button.textContent = text;
      button.addEventListener('click', onClick);
      return button;
    }

    function backLink(): HTMLButtonElement {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'onb-back';
      button.textContent = 'Back';
      button.addEventListener('click', back);
      return button;
    }

    // Number keys pick a choice. The plan requires full keyboard operation and
    // this is also simply faster than aiming at buttons nine times.
    root.addEventListener('keydown', (event) => {
      const key = (event as KeyboardEvent).key;
      if (step.kind !== 'question') return;
      const n = Number(key);
      if (!Number.isInteger(n) || n < 1) return;
      const choices = QUESTIONS[step.index].choices;
      if (n > choices.length) return;
      event.preventDefault();
      choose(QUESTIONS[step.index].id, choices[n - 1].value);
    });

    render();
    void isComplete; // exported for the caller's own gating; unused here
  });
}
