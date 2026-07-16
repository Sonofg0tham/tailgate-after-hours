import type { PlayerHudPresentation } from './HudPresenter';

interface HudElement {
  textContent: string | null;
  hidden: boolean;
  dataset: DOMStringMap;
  style: Pick<CSSStyleDeclaration, 'setProperty'>;
  setAttribute(name: string, value: string): void;
}

export interface PlayerHudElements {
  objective: HudElement;
  clock: HudElement;
  alertRegion: HudElement;
  alertMarker: HudElement;
  alertLabel: HudElement;
  suspicionMeter: HudElement;
  suspicionFill: HudElement;
  suspicionValue: HudElement;
  device: HudElement;
  bolts: HudElement;
  interactionRegion: HudElement;
  interactionPrompt: HudElement;
  interactionProgress: HudElement;
  interactionFill: HudElement;
  interactionValue: HudElement;
}

/** Applies a complete player-facing presentation model to the HUD DOM. */
export class PlayerHud {
  constructor(private readonly elements: PlayerHudElements) {}

  render(model: PlayerHudPresentation): void {
    const { elements } = this;
    elements.objective.textContent = model.objective;
    elements.clock.textContent = model.clock;

    elements.alertRegion.dataset.alertState = model.alert.state;
    elements.alertMarker.dataset.marker = model.alert.marker;
    elements.alertLabel.textContent = model.alert.label;
    elements.suspicionMeter.setAttribute('aria-valuenow', String(model.alert.suspicionPercent));
    elements.suspicionFill.style.setProperty('--hud-fill', `${model.alert.suspicionPercent}%`);
    elements.suspicionValue.textContent = model.alert.suspicionText;

    elements.device.textContent = model.inventory.deviceStatus;
    elements.bolts.textContent = String(model.inventory.boltsRemaining);

    const interaction = model.interaction;
    elements.interactionRegion.hidden = interaction === null;
    elements.interactionPrompt.textContent = interaction?.prompt ?? '';
    elements.interactionProgress.setAttribute('aria-valuenow', String(interaction?.progressPercent ?? 0));
    elements.interactionFill.style.setProperty('--hud-fill', `${interaction?.progressPercent ?? 0}%`);
    elements.interactionValue.textContent = interaction?.progressText ?? '';
  }
}

/** Renders development diagnostics on a surface that remains empty and hidden in production. */
export class DevDebugHud {
  constructor(private readonly element: HudElement) {}

  render(lines: readonly string[]): void {
    this.element.hidden = false;
    this.element.setAttribute('aria-hidden', 'false');
    this.element.textContent = lines.join('\n');
  }
}
