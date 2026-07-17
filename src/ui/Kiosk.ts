import type { Progress } from '../systems/Progress';

/**
 * The sign-in kiosk: the game's front door, in the access-control fiction
 * the identity is built on. Best rating, fastest time and the recent
 * engagement history come from localStorage; controls are listed for both
 * keyboard and pad. DOM-built via textContent (the ReportView pattern),
 * never innerHTML.
 */
export class Kiosk {
  private readonly root: HTMLElement;
  private readonly card: HTMLElement;

  constructor(
    private readonly onBegin: () => void,
    private readonly onSettings: () => void,
  ) {
    const root = document.getElementById('kiosk');
    const card = document.getElementById('kiosk-card');
    if (!root || !card) {
      throw new Error('Expected #kiosk and #kiosk-card elements in index.html');
    }
    this.root = root;
    this.card = card;
  }

  show(progress: Progress): void {
    this.card.replaceChildren();

    this.card.append(el('h1', undefined, 'MERIDIAN MUTUAL'));
    this.card.append(el('div', 'kiosk-sub', 'VISITOR MANAGEMENT  //  NIGHT DESK  //  01:00'));
    this.card.append(el('div', 'kiosk-sub kiosk-dim', 'Unaccompanied visitors must sign in. CCTV is in operation for your safety.'));

    const begin = el('button', 'kiosk-button', '[ BEGIN ENGAGEMENT ]');
    begin.id = 'kiosk-begin';
    begin.addEventListener('click', this.onBegin);
    this.card.append(begin);

    const settings = el('button', 'kiosk-button kiosk-button-secondary', '[ SETTINGS ]');
    settings.id = 'kiosk-settings';
    settings.addEventListener('click', this.onSettings);
    this.card.append(settings);

    this.card.append(rule());

    // Best + history from localStorage.
    this.card.append(el('p', 'kiosk-section-title', 'CONSULTANT RECORD'));
    if (progress.completions === 0) {
      this.card.append(el('div', 'kiosk-dim', 'No engagements on file.'));
    } else {
      const best = el('div', 'kiosk-best');
      best.append(
        kv('Best rating', progress.bestRating ?? 'NONE'),
        kv('Fastest clear', progress.bestTimeSec !== null ? formatSeconds(progress.bestTimeSec) : 'NONE'),
        kv('Engagements', String(progress.completions)),
      );
      this.card.append(best);
      if (progress.runs.length > 0) {
        this.card.append(el('p', 'kiosk-section-title', 'RECENT ENGAGEMENTS'));
        const list = el('div', 'kiosk-history');
        for (const run of progress.runs.slice(0, 8)) {
          const when = run.endedISO.slice(0, 10);
          const assist = run.assist ? '  ·  assist' : '';
          list.append(el('div', undefined, `${when}   ${run.rating.padEnd(12, ' ')} ${run.timeOnSite} on site${assist}`));
        }
        this.card.append(list);
      }
    }

    this.card.append(rule());

    // Controls, both devices.
    this.card.append(el('p', 'kiosk-section-title', 'CONTROLS'));
    const controls = el('div', 'kiosk-controls');
    const rows: Array<[string, string, string]> = [
      ['Move', 'WASD / arrows', 'Left stick'],
      ['Creep', 'Hold Shift', 'Stick, gentle'],
      ['Run', 'Hold C', 'Stick, full'],
      ['Interact (hold)', 'E', 'A'],
      ['Aim / throw bolt', 'Mouse / left click', 'Right stick / R2'],
      ['Pause', 'Escape', 'Start'],
    ];
    controls.append(headerRow());
    for (const [action, kb, pad] of rows) {
      const row = el('div', 'kiosk-controls-row');
      row.append(el('span', undefined, action), el('span', undefined, kb), el('span', undefined, pad));
      controls.append(row);
    }
    this.card.append(controls);

    this.root.classList.add('visible');
  }

  hide(): void {
    this.root.classList.remove('visible');
  }
}

function headerRow(): HTMLElement {
  const row = el('div', 'kiosk-controls-row kiosk-controls-header');
  row.append(el('span', undefined, ''), el('span', undefined, 'KEYBOARD'), el('span', undefined, 'PAD'));
  return row;
}

function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function rule(): HTMLElement {
  return el('hr', 'report-rule');
}

function kv(key: string, value: string): HTMLElement {
  const row = el('div', 'kiosk-kv');
  row.append(el('span', 'k', key), el('span', 'v', value));
  return row;
}
