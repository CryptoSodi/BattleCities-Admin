import { AdminClient } from './AdminClient';
import { action, element, errorText, status } from './panelElements';

export class ReviewPanel {
  private loaded = false;
  private loading = false;
  private submitting = false;
  private before: string | null = null;
  private next: string | null = null;
  private batch = 1;
  private selected: any = null;
  private origin: HTMLButtonElement | null = null;
  private dialog: HTMLDialogElement;
  constructor(private client: AdminClient, private root: HTMLElement, private replay: (id: string, button: HTMLButtonElement) => Promise<void>) {
    this.dialog = element(root, '[data-review-dialog]');
    const reset = () => { if (this.submitting || this.loading) return; this.before = null; this.batch = 1; void this.load(true); };
    element(root, '[data-review-refresh]').addEventListener('click', reset);
    element(root, '[data-review-first]').addEventListener('click', reset);
    element(root, '[data-review-next]').addEventListener('click', () => {
      if (this.next && !this.loading && !this.submitting) { this.before = this.next; this.batch++; void this.load(true); }
    });
    element(root, '[data-review-close]').addEventListener('click', () => { if (!this.submitting) this.dialog.close(); });
    this.dialog.addEventListener('cancel', event => { if (this.submitting) event.preventDefault(); });
    this.dialog.addEventListener('close', () => this.origin?.focus());
    element<HTMLFormElement>(root, '[data-review-form]').addEventListener('submit', event => { event.preventDefault(); void this.submit(); });
    element<HTMLButtonElement>(root, '[data-review-replay]').addEventListener('click', () => {
      if (!this.selected?.replay_id || this.submitting) return;
      void this.replay(this.selected.replay_id, element(root, '[data-review-replay]')).catch(error => {
        status(element(root, '[data-review-dialog-status]'), errorText(error), true);
      });
    });
  }
  async load(force = false): Promise<void> {
    if (this.loading || this.submitting || (this.loaded && !force)) return;
    this.loading = true; this.controls();
    const message = element(this.root, '[data-review-status]'); status(message, 'Loading unreviewed matches…');
    element(this.root, '[data-review-rows]').replaceChildren();
    try {
      const response = await this.client.getMatchReviews(this.before);
      if (!Array.isArray(response.items)) throw new Error('Unsupported match review response.');
      this.next = typeof response.nextBefore === 'string' ? response.nextBefore : null;
      for (const row of response.items) this.row(row);
      this.loaded = true;
      status(message, response.items.length ? `${response.items.length} unreviewed matches. Inspect evidence before making a final decision.` : 'No unreviewed matches in this batch.');
    } catch (error) { this.next = null; status(message, `Could not load reviews: ${errorText(error)}`, true); }
    finally { this.loading = false; this.controls(); }
  }
  private controls(): void {
    element<HTMLButtonElement>(this.root, '[data-review-first]').disabled = this.loading || this.submitting || !this.before;
    element<HTMLButtonElement>(this.root, '[data-review-next]').disabled = this.loading || this.submitting || !this.next;
    element<HTMLButtonElement>(this.root, '[data-review-refresh]').disabled = this.loading || this.submitting;
    element(this.root, '[data-review-page]').textContent = `Batch ${this.batch}`;
  }
  private row(value: any): void {
    const tr = document.createElement('tr');
    const values = [ `${value.id ?? 'Unknown'}\n${value.created_at ?? ''}`, `${value.player_id ?? 'Unknown'}\nSeason ${value.season_id ?? 'Unknown'}`,
      `${value.score ?? 'Unknown'} score\n${value.game_points ?? 'Unknown'} points`, `Stage ${value.level_number ?? 'Unknown'}\n${value.won === true ? 'Victory' : 'Defeat'}`, String(value.validation_status ?? 'Not reported') ];
    for (const text of values) { const td = document.createElement('td'); td.textContent = text; td.style.whiteSpace = 'pre-line'; tr.append(td); }
    const td = document.createElement('td'); const button = action('Review evidence', () => this.open(value, button));
    td.append(button); tr.append(td); element(this.root, '[data-review-rows]').append(tr);
  }
  private open(value: any, button: HTMLButtonElement): void {
    if (this.loading || this.submitting) return;
    this.selected = value; this.origin = button;
    element<HTMLFormElement>(this.root, '[data-review-form]').reset();
    element<HTMLFieldSetElement>(this.root, '[data-review-fields]').disabled = false;
    const evidence = element(this.root, '[data-review-evidence]'); evidence.replaceChildren();
    for (const [title, data] of Object.entries({ Match: value.id, Player: value.player_id, Season: value.season_id, Score: value.score,
      'Game points': value.game_points, Stage: value.level_number, Result: value.won === true ? 'Victory' : 'Defeat',
      Validation: value.validation_status, Replay: value.replay_id, Recorded: value.created_at })) {
      const dt = document.createElement('dt'); dt.textContent = title;
      const dd = document.createElement('dd'); dd.textContent = data == null ? 'Not reported' : String(data); evidence.append(dt, dd);
    }
    element<HTMLButtonElement>(this.root, '[data-review-replay]').disabled = !value.replay_id;
    element(this.root, '[data-review-replay-note]').textContent = value.replay_id ? 'Replay opens separately. Scores alone are not proof of legitimate play.' : 'No replay ID was provided. Obtain independent evidence before accepting this result.';
    status(element(this.root, '[data-review-dialog-status]'), 'No decision has been made.');
    this.dialog.showModal();
  }
  private async submit(): Promise<void> {
    if (this.submitting || !this.selected) return;
    const message = element(this.root, '[data-review-dialog-status]');
    const decision = element<HTMLSelectElement>(this.root, '[data-review-decision]').value;
    const reason = element<HTMLTextAreaElement>(this.root, '[data-review-reason]').value.trim();
    if (!element<HTMLInputElement>(this.root, '[data-review-inspected]').checked || !element<HTMLInputElement>(this.root, '[data-review-final]').checked ||
      !['accepted', 'rejected'].includes(decision) || reason.length < 5 || reason.length > 1000 || !/^mtc-[a-z0-9-]{1,100}$/i.test(this.selected.id)) {
      status(message, 'Select a decision, inspect evidence, provide a reason (5–1000 characters), and confirm this final action.', true); return;
    }
    if (!window.confirm(`Record ${decision.toUpperCase()} for ${this.selected.id}? This audited decision cannot be reversed.`)) return;
    this.submitting = true; this.controls();
    element<HTMLFieldSetElement>(this.root, '[data-review-fields]').disabled = true;
    element<HTMLButtonElement>(this.root, '[data-review-replay]').disabled = true;
    element<HTMLButtonElement>(this.root, '[data-review-close]').disabled = true;
    status(message, 'Recording final decision…');
    let completed = false;
    try {
      await this.client.reviewMatch(this.selected.id, decision as 'accepted' | 'rejected', reason);
      completed = true; this.dialog.close();
    } catch (error) { status(message, `Decision not confirmed: ${errorText(error)}. Refresh the queue to check the outcome before retrying.`, true); }
    finally {
      this.submitting = false; this.controls();
      element<HTMLFieldSetElement>(this.root, '[data-review-fields]').disabled = false;
      element<HTMLButtonElement>(this.root, '[data-review-close]').disabled = false;
      element<HTMLButtonElement>(this.root, '[data-review-replay]').disabled = !this.selected?.replay_id;
    }
    if (completed) {
      const id = this.selected.id; await this.load(true);
      const queue = element(this.root, '[data-review-status]');
      queue.textContent = `${decision.toUpperCase()} recorded for ${id}. This decision is final and audited. ${queue.textContent}`;
    }
  }
}
