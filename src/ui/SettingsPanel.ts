import type { GameSettings } from '../systems/Settings';

/**
 * The settings overlay, reachable from the kiosk and the pause lanyard.
 * Every change fires onChange immediately (persist + live-apply are the
 * caller's job); the one deferred item — assist mode — says so on its own
 * label, in plain words with no shame copy.
 */
export class SettingsPanel {
  private readonly root: HTMLElement;
  private readonly card: HTMLElement;

  constructor(
    private readonly onChange: (settings: GameSettings) => void,
    private readonly onClose: () => void,
  ) {
    const root = document.getElementById('settings');
    const card = document.getElementById('settings-card');
    if (!root || !card) {
      throw new Error('Expected #settings and #settings-card elements in index.html');
    }
    this.root = root;
    this.card = card;
  }

  show(settings: GameSettings): void {
    const current = { ...settings };
    this.card.replaceChildren();
    this.card.append(el('h1', undefined, 'SETTINGS'));

    const push = (): void => this.onChange({ ...current });

    this.card.append(
      slider('Master volume', current.masterVolume, 0, 1, 0.05, (v) => {
        current.masterVolume = v;
        push();
      }),
      slider('HUD text scale', current.hudScale, 0.8, 1.6, 0.05, (v) => {
        current.hudScale = v;
        push();
      }),
      slider('Screen shake', current.shakeIntensity, 0, 1, 0.05, (v) => {
        current.shakeIntensity = v;
        push();
      }),
      slider('Visibility floor (how readable the dark is)', current.visibilityFloor, 0.1, 0.7, 0.02, (v) => {
        current.visibilityFloor = v;
        push();
      }),
      toggle('High contrast', current.highContrast, (v) => {
        current.highContrast = v;
        push();
      }),
      toggle('Full motion (off = calm/reduced, the default)', current.motionLevel === 'full', (v) => {
        current.motionLevel = v ? 'full' : 'reduced';
        push();
      }),
      toggle('Assist: guards move at 90% speed. Applies from the next engagement.', current.assistMode, (v) => {
        current.assistMode = v;
        push();
      }),
    );

    const close = el('button', 'kiosk-button', '[ DONE ]');
    close.id = 'settings-close';
    close.addEventListener('click', this.onClose);
    this.card.append(close);

    this.root.classList.add('visible');
  }

  hide(): void {
    this.root.classList.remove('visible');
  }
}

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function slider(label: string, value: number, min: number, max: number, step: number, set: (v: number) => void): HTMLElement {
  const row = el('label', 'settings-row');
  const text = el('span', 'settings-label', label);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const readout = el('span', 'settings-value', formatValue(value));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    readout.textContent = formatValue(v);
    set(v);
  });
  row.append(text, input, readout);
  return row;
}

function formatValue(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function toggle(label: string, value: boolean, set: (v: boolean) => void): HTMLElement {
  const row = el('label', 'settings-row');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = value;
  input.addEventListener('change', () => set(input.checked));
  row.append(input, el('span', 'settings-label settings-label-wide', label));
  return row;
}
