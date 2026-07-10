/**
 * The pause screen as the lanyard, per the inherited identity: Escape (or
 * Start on the pad) hangs the badge up mid-engagement. Resume, settings,
 * or abandon — abandoning files the Engagement Report for the run so far,
 * stamped ABANDONED.
 */
export class PauseLanyard {
  private readonly root: HTMLElement;

  constructor(onResume: () => void, onSettings: () => void, onAbandon: () => void) {
    const root = document.getElementById('pause');
    const resume = document.getElementById('pause-resume');
    const settings = document.getElementById('pause-settings');
    const abandon = document.getElementById('pause-abandon');
    if (!root || !resume || !settings || !abandon) {
      throw new Error('Expected #pause elements in index.html');
    }
    this.root = root;
    resume.addEventListener('click', onResume);
    settings.addEventListener('click', onSettings);
    abandon.addEventListener('click', onAbandon);
  }

  show(): void {
    this.root.classList.add('visible');
  }

  hide(): void {
    this.root.classList.remove('visible');
  }
}
