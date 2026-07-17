export const BRIEFING_GUIDANCE = [
  'Darkness conceals the operator.',
  'Noise carries and can draw guards.',
  'Following authorised staff can get the operator through controlled doors.',
  'Planting and photographs require an uninterrupted hold with E or gamepad A.',
] as const;

export type BriefingDismissSource = 'button' | 'keyboard' | 'gamepad';

export function isBriefingDismissKey(input: { code: string; repeat: boolean }): boolean {
  return !input.repeat && (input.code === 'Enter' || input.code === 'Space' || input.code === 'KeyE');
}

export function isGamepadAPress(previousHeld: boolean, currentHeld: boolean): boolean {
  return !previousHeld && currentHeld;
}

export function filterBriefingInteraction(
  suppressUntilRelease: boolean,
  rawInteractHeld: boolean,
): { suppressUntilRelease: boolean; interactHeld: boolean } {
  if (!suppressUntilRelease) {
    return { suppressUntilRelease: false, interactHeld: rawInteractHeld };
  }
  return { suppressUntilRelease: rawInteractHeld, interactHeld: false };
}

/**
 * One-time, non-spoiler field guidance issued through the night-desk fiction.
 * The shell lives in index.html; all variable content is created with
 * textContent so the view has no HTML parsing path.
 */
export class BriefingView {
  private readonly root: HTMLElement;
  private readonly card: HTMLElement;
  private visible = false;
  private previousGamepadAHeld = false;

  constructor(private readonly onContinue: (source: BriefingDismissSource) => void) {
    const root = document.getElementById('briefing');
    const card = document.getElementById('briefing-card');
    if (!root || !card) {
      throw new Error('Expected #briefing and #briefing-card elements in index.html');
    }
    this.root = root;
    this.card = card;
    window.addEventListener('keydown', this.handleKeyDown);
  }

  show(gamepadAHeld = false): void {
    this.card.replaceChildren();

    const heading = el('h1', undefined, 'ENGAGEMENT BRIEFING');
    heading.id = 'briefing-title';
    this.card.append(heading);
    this.card.append(el('div', 'kiosk-sub', 'MERIDIAN MUTUAL  //  VISITOR MANAGEMENT  //  NIGHT DESK'));

    const status = el('div', 'briefing-status');
    status.append(el('span', 'briefing-status-label', 'AUTHORISATION'), el('span', undefined, 'VERIFIED  //  FLOOR 12'));
    this.card.append(status);

    const intro = el(
      'p',
      'briefing-intro',
      'Operator acknowledgement is required before lift access is released.',
    );
    intro.id = 'briefing-description';
    this.card.append(intro, rule(), el('p', 'kiosk-section-title', 'FIELD CONDITIONS'));

    const guidance = el('ul', 'briefing-guidance');
    for (const item of BRIEFING_GUIDANCE) {
      guidance.append(el('li', undefined, item));
    }
    this.card.append(guidance);
    this.card.append(el('div', 'briefing-control', 'CONTINUE  //  ENTER, SPACE OR E  //  GAMEPAD A'));

    const continueButton = document.createElement('button');
    continueButton.type = 'button';
    continueButton.id = 'briefing-continue';
    continueButton.className = 'kiosk-button';
    continueButton.textContent = '[ ACKNOWLEDGE AND BEGIN ]';
    continueButton.addEventListener('click', () => this.dismiss('button'));
    this.card.append(continueButton);

    this.previousGamepadAHeld = gamepadAHeld;
    this.visible = true;
    this.root.setAttribute('aria-hidden', 'false');
    this.root.classList.add('visible');
    continueButton.focus({ preventScroll: true });
  }

  hide(): void {
    this.visible = false;
    this.root.classList.remove('visible');
    this.root.setAttribute('aria-hidden', 'true');
  }

  pollGamepadA(currentHeld: boolean): boolean {
    const pressed = isGamepadAPress(this.previousGamepadAHeld, currentHeld);
    this.previousGamepadAHeld = currentHeld;
    if (!this.visible || !pressed) {
      return false;
    }
    this.dismiss('gamepad');
    return true;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.visible || !isBriefingDismissKey(event)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.dismiss('keyboard');
  };

  private dismiss(source: BriefingDismissSource): void {
    if (!this.visible) {
      return;
    }
    this.hide();
    this.onContinue(source);
  }
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
