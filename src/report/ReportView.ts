import type { ReportModel, Rating } from './generateReport';

/** DETAINED and DAWN are the outcomes that went wrong — shown in alarm red; the rest read amber. */
const BAD_RATINGS: ReadonlySet<Rating> = new Set<Rating>(['DETAINED', 'DAWN']);

/**
 * Renders the Engagement Report model into the #report overlay — the signature
 * end-screen. All text goes in via textContent (never innerHTML), so the
 * report is built structurally rather than by string concatenation. The
 * [ NEW ENGAGEMENT ] button calls back into main.ts to reset the run.
 */
export class ReportView {
  private readonly root: HTMLElement;
  private readonly sheet: HTMLElement;

  constructor() {
    const root = document.getElementById('report');
    const sheet = document.getElementById('report-sheet');
    if (!root || !sheet) {
      throw new Error('Expected #report and #report-sheet elements in index.html');
    }
    this.root = root;
    this.sheet = sheet;
  }

  show(model: ReportModel, onNewEngagement: () => void): void {
    this.sheet.replaceChildren();

    this.sheet.append(el('h1', undefined, 'ENGAGEMENT REPORT'));
    this.sheet.append(meta(`${model.header.client}  //  ${model.header.site}`));
    this.sheet.append(meta(`${model.header.consultant}  //  REF ${model.header.ref}`));
    this.sheet.append(meta(`NIGHT ENGAGEMENT ${model.header.window}  //  ${model.header.date}`));

    if (model.header.outcomeLine) {
      this.sheet.append(el('div', 'report-dawn', model.header.outcomeLine));
    }

    this.sheet.append(rule());

    // Rating.
    const rating = el('div', 'report-rating', model.rating);
    rating.dataset.tone = BAD_RATINGS.has(model.rating) ? 'bad' : 'good';
    this.sheet.append(rating);
    this.sheet.append(el('div', 'report-remark', model.ratingRemark));

    this.sheet.append(rule());

    // Findings.
    this.sheet.append(el('p', 'report-section-title', 'FINDINGS'));
    if (model.findings.length === 0) {
      this.sheet.append(el('div', 'report-remark', 'No exploitable findings recorded.'));
    }
    for (const f of model.findings) {
      const row = el('div', 'report-finding');
      row.append(el('span', 'ref', f.ref));
      const sev = el('span', 'sev', f.severity);
      sev.dataset.sev = f.severity;
      row.append(sev);
      row.append(el('span', undefined, f.text));
      this.sheet.append(row);
    }

    this.sheet.append(rule());

    // Client detections.
    this.sheet.append(el('p', 'report-section-title', 'CLIENT DETECTIONS'));
    const detections = el('div', 'report-detections');
    if (!model.clientDetections[0]?.startsWith('None')) {
      detections.classList.add('flagged');
    }
    for (const line of model.clientDetections) {
      detections.append(el('div', undefined, line));
    }
    this.sheet.append(detections);

    this.sheet.append(rule());

    // Summary.
    this.sheet.append(el('p', 'report-section-title', 'SUMMARY'));
    const summary = el('div', 'report-summary');
    summary.append(kv('Time on site', model.summary.timeOnSite));
    summary.append(kv('Alert reached', model.summary.alertReached));
    summary.append(kv('Secondaries', model.summary.secondaries));
    this.sheet.append(summary);

    // New engagement.
    const button = el('button', undefined, '[ NEW ENGAGEMENT ]');
    button.id = 'report-new-engagement';
    button.addEventListener('click', onNewEngagement);
    this.sheet.append(button);

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

function meta(text: string): HTMLElement {
  return el('div', 'report-meta', text);
}

function rule(): HTMLElement {
  return el('hr', 'report-rule');
}

function kv(key: string, value: string): HTMLElement {
  const row = el('div');
  row.append(el('span', 'k', key), el('span', 'v', value));
  return row;
}
