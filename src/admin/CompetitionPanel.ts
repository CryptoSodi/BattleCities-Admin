import { AdminClient } from './AdminClient';
import { CompetitionSettings, DraftTier, settingsFingerprint, settingsWithEdits, validateTiers, prizeBudget } from './competitionModel';
import { action, element, errorText, status } from './panelElements';

export class CompetitionPanel {
  private base: CompetitionSettings | null = null;
  private busy = false;
  private dirty = false;
  private decimals = 9;
  private message: HTMLElement;
  private fields: HTMLFieldSetElement;
  constructor(private client: AdminClient, private root: HTMLElement) {
    this.message = element(root, '[data-competition-status]');
    this.fields = element(root, '[data-competition-fields]');
    element<HTMLFormElement>(root, '[data-competition-form]').addEventListener('submit', event => { event.preventDefault(); void this.save(); });
    element(root, '[data-competition-reload]').addEventListener('click', () => {
      if (!this.dirty || window.confirm('Discard unsaved edits and reload server settings?')) void this.load(true);
    });
    for (const name of ['cycle', 'season'] as const) {
      const panel = element(root, `[data-prize-policy="${name}"]`);
      element(panel, '[data-add-tier]').addEventListener('click', () => {
        if (element(panel, '[data-prize-tiers]').children.length >= (name === 'cycle' ? 10 : 100)) return;
        this.addTier(panel); this.changed();
      });
    }
    root.addEventListener('input', () => this.changed());
    root.addEventListener('change', () => this.changed());
  }
  private changed(): void {
    if (!this.base || this.busy) return;
    this.dirty = true; status(this.message, 'Unsaved changes. Nothing has been enabled or updated on the server.');
    this.budgets();
  }
  async load(force = false): Promise<void> {
    if (this.busy || (this.base && !force)) return;
    this.busy = true; this.fields.disabled = true;
    status(this.message, 'Loading server settings…');
    try {
      const response = await this.client.getCompetitions();
      const settings = this.settings(response.settings);
      this.runtime(response.runtime);
      let items: any[] = [];
      try {
        const catalog = await this.client.getEconomyCatalog();
        const precision = catalog.currency?.skr?.decimals ?? response.runtime?.skr?.decimals;
        if (Number.isInteger(precision) && precision >= 0 && precision <= 9) this.decimals = precision;
        items = Array.isArray(catalog.items) ? catalog.items : [];
        status(element(this.root, '[data-shop-status]'), catalog.currency?.skr ? `SKR precision: ${this.decimals} decimals. Prices are exact decimal strings.` : 'SKR configuration is not reported by the catalog. The API validates setup before enabling sales.');
      } catch (error) {
        status(element(this.root, '[data-shop-status]'), `Catalog unavailable: ${errorText(error)}. Stored prices remain editable; unlisted prices are preserved.`, true);
      }
      this.base = settings; this.render(settings, items); this.dirty = false;
      status(this.message, 'Settings loaded. Saving policies does not start workers or send tokens.');
    } catch (error) { status(this.message, `Could not load settings: ${errorText(error)}`, true); }
    finally { this.busy = false; this.fields.disabled = !this.base; }
  }
  private settings(value: any): CompetitionSettings {
    if (!value || typeof value.seasonPass?.enabled !== 'boolean' || !value.shopSkrPrices ||
      !['cycle', 'season', 'tradingSeason'].every(name => typeof value[name]?.enabled === 'boolean' && Array.isArray(value[name]?.prizes))) {
      throw new Error('Unsupported settings response. Reload after the API is updated.');
    }
    return value;
  }
  private render(value: CompetitionSettings, items?: any[]): void {
    element<HTMLInputElement>(this.root, '[data-pass-enabled]').checked = value.seasonPass.enabled;
    element<HTMLInputElement>(this.root, '[data-pass-skr]').value = value.seasonPass.skrPrice ?? '';
    element<HTMLInputElement>(this.root, '[data-pass-sol]').value = value.seasonPass.solPrice ?? '';
    for (const name of ['cycle', 'season'] as const) {
      const panel = element(this.root, `[data-prize-policy="${name}"]`);
      element<HTMLInputElement>(panel, '[data-policy-enabled]').checked = value[name].enabled;
      element(panel, '[data-prize-tiers]').replaceChildren();
      for (const tier of value[name].prizes) this.addTier(panel, { fromRank: String(tier.fromRank), toRank: String(tier.toRank), amount: tier.amount }, false);
    }
    if (items) {
      const grid = element(this.root, '[data-shop-prices]'); grid.replaceChildren();
      const ids = new Set([...items.map(item => String(item.id)), ...Object.keys(value.shopSkrPrices)]);
      for (const id of ids) {
        const label = document.createElement('label'); label.textContent = id.replace(/-/g, ' ');
        const input = document.createElement('input'); input.type = 'text'; input.inputMode = 'decimal'; input.maxLength = 22;
        input.dataset.shopPrice = id; input.value = value.shopSkrPrices[id] ?? ''; input.placeholder = 'Disabled';
        label.append(input); grid.append(label);
      }
    } else {
      for (const input of this.root.querySelectorAll<HTMLInputElement>('[data-shop-price]')) input.value = value.shopSkrPrices[input.dataset.shopPrice!] ?? '';
    }
    element(this.root, '[data-trading-policy]').textContent = `Trading season: ${value.tradingSeason.enabled ? 'enabled' : 'disabled'}, ${value.tradingSeason.prizes.length} tiers. Preserved unchanged by this editor.`;
    this.budgets();
  }
  private addTier(panel: HTMLElement, tier: DraftTier = { fromRank: '', toRank: '', amount: '' }, focus = true): void {
    const row = document.createElement('div'); row.className = 'admin-prize-tier';
    for (const [key, title] of [['fromRank', 'From rank'], ['toRank', 'Through rank'], ['amount', 'SKR per rank']] as const) {
      const label = document.createElement('label'); label.textContent = title;
      const input = document.createElement('input'); input.type = 'text'; input.inputMode = key === 'amount' ? 'decimal' : 'numeric';
      input.maxLength = key === 'amount' ? 22 : 3; input.dataset.tierField = key; input.value = tier[key];
      if (key === 'amount') label.className = 'admin-tier-amount';
      label.append(input); row.append(label);
    }
    row.append(action('Remove tier', () => { row.remove(); this.changed(); element<HTMLButtonElement>(panel, '[data-add-tier]').focus(); }, true));
    element(panel, '[data-prize-tiers]').append(row);
    if (focus) row.querySelector('input')?.focus();
  }
  private tiers(name: 'cycle' | 'season'): DraftTier[] {
    const panel = element(this.root, `[data-prize-policy="${name}"]`);
    return [...panel.querySelectorAll<HTMLElement>('.admin-prize-tier')].map(row => ({
      fromRank: element<HTMLInputElement>(row, '[data-tier-field="fromRank"]').value.trim(),
      toRank: element<HTMLInputElement>(row, '[data-tier-field="toRank"]').value.trim(),
      amount: element<HTMLInputElement>(row, '[data-tier-field="amount"]').value.trim(),
    }));
  }
  private budgets(): void {
    for (const name of ['cycle', 'season'] as const) {
      const panel = element(this.root, `[data-prize-policy="${name}"]`);
      try { element(panel, '[data-prize-budget]').textContent = `Total allocation: ${prizeBudget(validateTiers(this.tiers(name), name === 'cycle' ? 10 : 100, this.decimals), this.decimals)} SKR`; }
      catch (error) { element(panel, '[data-prize-budget]').textContent = errorText(error); }
    }
  }
  private runtime(value: any): void {
    const box = element(this.root, '[data-competition-runtime]'); box.replaceChildren();
    const heading = document.createElement('h3'); heading.textContent = 'Runtime readiness'; box.append(heading);
    const line = (text: string) => { const p = document.createElement('p'); p.textContent = text; box.append(p); };
    if (!value) { line('The API has not reported runtime status. Worker and delivery readiness are unknown.'); return; }
    line(`Worker: ${value.workerEnabled === true ? 'enabled' : 'paused'} · Token delivery: ${value.deliveryEnabled === true ? 'enabled' : 'paused'}`);
    line(`SKR: ${value.skr?.configured ? 'configured' : 'not configured'} · Shop: ${value.shop?.configured ? 'configured' : 'not configured'}`);
    if (value.skr?.mint) line(`SKR mint: ${value.skr.mint}`);
    if (value.shop?.treasury) line(`Shop treasury: ${value.shop.treasury}`);
    const wallet = value.rewardWallet;
    if (wallet) {
      line(`Reward wallet: ${wallet.configured ? 'configured' : 'missing'} · Signing setup: ${wallet.keypairValid ? 'valid' : 'not ready'}`);
      if (wallet.address) line(`Reward address: ${wallet.address}`);
      line(`Funding: ${wallet.solBalance ?? 'unknown'} SOL · ${wallet.skrBalance ?? 'unknown'} SKR${wallet.checkedAt ? ` · Checked ${wallet.checkedAt}` : ''}`);
      if (wallet.error) line(`Wallet check: ${wallet.error}`);
    }
    for (const blocker of Array.isArray(value.blockers) ? value.blockers : []) line(`Blocked: ${String(blocker)}`);
  }
  private async save(): Promise<void> {
    if (!this.base || this.busy) return;
    try {
      const shop = Object.fromEntries([...this.root.querySelectorAll<HTMLInputElement>('[data-shop-price]')].map(input => [input.dataset.shopPrice!, input.value]));
      const draft = settingsWithEdits(this.base, {
        passEnabled: element<HTMLInputElement>(this.root, '[data-pass-enabled]').checked,
        skrPrice: element<HTMLInputElement>(this.root, '[data-pass-skr]').value,
        solPrice: element<HTMLInputElement>(this.root, '[data-pass-sol]').value,
        cycleEnabled: element<HTMLInputElement>(this.root, '[data-prize-policy="cycle"] [data-policy-enabled]').checked,
        seasonEnabled: element<HTMLInputElement>(this.root, '[data-prize-policy="season"] [data-policy-enabled]').checked,
        cycle: this.tiers('cycle'), season: this.tiers('season'), shop,
      }, this.decimals);
      if (!window.confirm('Save these prices and policy flags? Enabling a policy can affect purchases or future allocations. This does not start workers or send payouts.')) return;
      this.busy = true; this.fields.disabled = true; status(this.message, 'Checking for concurrent changes…');
      const latest = await this.client.getCompetitions(); this.runtime(latest.runtime);
      if (settingsFingerprint(latest.settings) !== settingsFingerprint(this.base)) throw new Error('Server settings changed. Reload and reapply your edits before saving.');
      status(this.message, 'Saving settings…');
      const response = await this.client.saveCompetitions(draft);
      this.base = this.settings(response.settings); this.render(this.base); this.dirty = false;
      if (response.runtime) this.runtime(response.runtime);
      status(this.message, 'Settings saved. Worker and delivery switches were not changed.');
    } catch (error) { status(this.message, `Save not confirmed: ${errorText(error)}. Reload to check server state before retrying.`, true); }
    finally { this.busy = false; this.fields.disabled = false; }
  }
}
