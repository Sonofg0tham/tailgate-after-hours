import { describe, expect, it } from 'vitest';

interface FakeElement {
  textContent: string;
  hidden: boolean;
  dataset: Record<string, string>;
  attributes: Record<string, string>;
  style: {
    values: Record<string, string>;
    setProperty(name: string, value: string): void;
  };
  setAttribute(name: string, value: string): void;
}

function element(): FakeElement {
  const values: Record<string, string> = {};
  const attributes: Record<string, string> = {};
  return {
    textContent: '',
    hidden: false,
    dataset: {},
    attributes,
    style: {
      values,
      setProperty(name, value) {
        values[name] = value;
      },
    },
    setAttribute(name, value) {
      attributes[name] = value;
    },
  };
}

interface PlayerHudModule {
  PlayerHud?: new (elements: Record<string, FakeElement>) => {
    render(model: Record<string, unknown>): void;
  };
  DevDebugHud?: new (element: FakeElement) => {
    render(lines: readonly string[]): void;
  };
}

async function loadPlayerHud(): Promise<PlayerHudModule | null> {
  const modulePath = './PlayerHud';
  return import(/* @vite-ignore */ modulePath).catch(() => null) as Promise<PlayerHudModule | null>;
}

describe('PlayerHud', () => {
  it('renders the player model into independently addressable HUD regions', async () => {
    const module = await loadPlayerHud();
    expect(typeof module?.PlayerHud).toBe('function');
    if (!module?.PlayerHud) return;

    const elements = {
      objective: element(),
      clock: element(),
      alertRegion: element(),
      alertMarker: element(),
      alertLabel: element(),
      suspicionMeter: element(),
      suspicionFill: element(),
      suspicionValue: element(),
      device: element(),
      bolts: element(),
      interactionRegion: element(),
      interactionPrompt: element(),
      interactionProgress: element(),
      interactionFill: element(),
      interactionValue: element(),
    };
    const hud = new module.PlayerHud(elements);

    hud.render({
      objective: 'RETURN TO SERVICE LIFT',
      clock: '03:12',
      alert: {
        state: 'cautious',
        label: 'CAUTIOUS',
        marker: 'diamond',
        suspicionPercent: 43,
        suspicionText: '43%',
      },
      inventory: { deviceStatus: 'DEPLOYED', boltsRemaining: 2 },
      interaction: {
        prompt: '[ HOLD E / A ] CAPTURE EVIDENCE',
        progressPercent: 50,
        progressText: '50%',
      },
    });

    expect(elements.objective.textContent).toBe('RETURN TO SERVICE LIFT');
    expect(elements.clock.textContent).toBe('03:12');
    expect(elements.alertRegion.dataset.alertState).toBe('cautious');
    expect(elements.alertMarker.dataset.marker).toBe('diamond');
    expect(elements.alertLabel.textContent).toBe('CAUTIOUS');
    expect(elements.suspicionMeter.attributes['aria-valuenow']).toBe('43');
    expect(elements.suspicionFill.style.values['--hud-fill']).toBe('43%');
    expect(elements.suspicionValue.textContent).toBe('43%');
    expect(elements.device.textContent).toBe('DEPLOYED');
    expect(elements.bolts.textContent).toBe('2');
    expect(elements.interactionRegion.hidden).toBe(false);
    expect(elements.interactionPrompt.textContent).toBe('[ HOLD E / A ] CAPTURE EVIDENCE');
    expect(elements.interactionProgress.attributes['aria-valuenow']).toBe('50');
    expect(elements.interactionFill.style.values['--hud-fill']).toBe('50%');
    expect(elements.interactionValue.textContent).toBe('50%');
  });

  it('hides and resets the interaction region when there is no target', async () => {
    const module = await loadPlayerHud();
    expect(typeof module?.PlayerHud).toBe('function');
    if (!module?.PlayerHud) return;

    const elements = {
      objective: element(),
      clock: element(),
      alertRegion: element(),
      alertMarker: element(),
      alertLabel: element(),
      suspicionMeter: element(),
      suspicionFill: element(),
      suspicionValue: element(),
      device: element(),
      bolts: element(),
      interactionRegion: element(),
      interactionPrompt: element(),
      interactionProgress: element(),
      interactionFill: element(),
      interactionValue: element(),
    };
    const hud = new module.PlayerHud(elements);

    hud.render({
      objective: 'PLANT DEVICE IN SERVER ROOM',
      clock: '01:00',
      alert: { state: 'calm', label: 'CALM', marker: 'circle', suspicionPercent: 0, suspicionText: '0%' },
      inventory: { deviceStatus: 'READY', boltsRemaining: 3 },
      interaction: null,
    });

    expect(elements.interactionRegion.hidden).toBe(true);
    expect(elements.interactionPrompt.textContent).toBe('');
    expect(elements.interactionProgress.attributes['aria-valuenow']).toBe('0');
    expect(elements.interactionFill.style.values['--hud-fill']).toBe('0%');
  });
});

describe('DevDebugHud', () => {
  it('writes diagnostic lines only to the separate debug surface', async () => {
    const module = await loadPlayerHud();
    expect(typeof module?.DevDebugHud).toBe('function');
    if (!module?.DevDebugHud) return;

    const debugSurface = element();
    debugSurface.hidden = true;
    const hud = new module.DevDebugHud(debugSurface);
    hud.render(['fps 60 (worst 48)', 'input keyboard']);

    expect(debugSurface.hidden).toBe(false);
    expect(debugSurface.textContent).toBe('fps 60 (worst 48)\ninput keyboard');
    expect(debugSurface.attributes['aria-hidden']).toBe('false');
  });
});
