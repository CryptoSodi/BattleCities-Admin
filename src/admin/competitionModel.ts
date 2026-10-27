export type PrizeTier = { fromRank: number; toRank: number; amount: string };
export type Policy = { enabled: boolean; prizes: PrizeTier[] };
export type CompetitionSettings = {
  seasonPass: { enabled: boolean; skrPrice: string | null; solPrice: string | null };
  cycle: Policy;
  season: Policy;
  tradingSeason: Policy;
  shopSkrPrices: Record<string, string | null>;
  shopSolPrices?: Record<string, string | null>;
  shopPlayPrices?: Record<string, string | null>;
  shopSkrOverrides?: Record<string, string | null>;
  tokenPricingMode?: 'fixed' | 'sol-discounted';
  [key: string]: unknown;
};
export type DraftTier = { fromRank: string; toRank: string; amount: string };

export function money(text: string, decimals = 9, optional = false): string | null {
  const value = text.trim();
  if (optional && value === '') return null;
  if (!/^(0|[1-9]\d{0,11})(\.\d{1,9})?$/.test(value)) {
    throw new Error('Use a positive decimal amount (no exponent, commas, signs, or leading zeroes).');
  }
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error(`Amount allows at most ${decimals} decimal places.`);
  const atomic = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (atomic <= 0n || atomic > 18446744073709551615n) throw new Error('Amount is outside the supported positive token range.');
  return value; // Never round-trip money through Number / parseFloat.
}

export function validateTiers(rows: DraftTier[], maxRank: number, decimals = 9): PrizeTier[] {
  if (rows.length > maxRank) throw new Error(`At most ${maxRank} prize tiers are allowed.`);
  const used = new Set<number>();
  return rows.map((row, index) => {
    if (!/^[1-9]\d*$/.test(row.fromRank) || !/^[1-9]\d*$/.test(row.toRank)) {
      throw new Error(`Tier ${index + 1}: ranks must be whole positive numbers.`);
    }
    const fromRank = Number(row.fromRank), toRank = Number(row.toRank);
    if (fromRank < 1 || toRank < fromRank || toRank > maxRank) {
      throw new Error(`Tier ${index + 1}: use an ordered rank range from 1 to ${maxRank}.`);
    }
    for (let rank = fromRank; rank <= toRank; rank++) {
      if (used.has(rank)) throw new Error(`Rank ${rank} appears in more than one prize tier.`);
      used.add(rank);
    }
    try { return { fromRank, toRank, amount: money(row.amount, decimals)! }; }
    catch (error) { throw new Error(`Tier ${index + 1}: ${(error as Error).message}`); }
  });
}

export function settingsWithEdits(base: CompetitionSettings, edits: {
  passEnabled: boolean; skrPrice: string; solPrice: string; playPrice?: string;
  cycleEnabled: boolean; cycle: DraftTier[]; seasonEnabled: boolean; season: DraftTier[];
  shop: Record<string, string>; sol?: Record<string, string>; play?: Record<string, string>; automaticTokens?: boolean;
}, decimals = 9): CompetitionSettings {
  // PUT replaces the whole document. Keep policies not presented in this editor.
  const result: CompetitionSettings = JSON.parse(JSON.stringify(base));
  const autoTokens=edits.automaticTokens ?? base.tokenPricingMode==='sol-discounted';
  result.seasonPass = { ...base.seasonPass, enabled: edits.passEnabled,
    skrPrice: autoTokens ? base.seasonPass.skrPrice : money(edits.skrPrice, decimals, true), solPrice: money(edits.solPrice, 9, true) };
  if (edits.passEnabled && ((!autoTokens&&!result.seasonPass.skrPrice) || !result.seasonPass.solPrice)) {
    throw new Error(autoTokens ? 'A SOL base price is required before enabling pass sales.' : 'SKR and SOL pass prices are required in fixed pricing mode.');
  }
  result.cycle = { enabled: edits.cycleEnabled, prizes: validateTiers(edits.cycle, 10, decimals) };
  result.season = { enabled: edits.seasonEnabled, prizes: validateTiers(edits.season, 100, decimals) };
  for (const name of ['cycle', 'season'] as const) {
    if (result[name].enabled && !result[name].prizes.length) throw new Error(`Add ${name} prize tiers before enabling prizes.`);
  }
  result.shopSkrPrices = { ...base.shopSkrPrices };
  result.shopSolPrices = { ...base.shopSolPrices };
  result.shopPlayPrices = { ...base.shopPlayPrices };
  result.shopSkrOverrides = { ...base.shopSkrOverrides };
  result.tokenPricingMode = edits.automaticTokens === undefined ? base.tokenPricingMode ?? 'fixed' : edits.automaticTokens ? 'sol-discounted' : 'fixed';
  for (const [id, value] of Object.entries(edits.shop)) {
    if (result.tokenPricingMode === 'sol-discounted') {
      if(value.trim()==='')delete result.shopSkrOverrides[id];else result.shopSkrOverrides[id]=money(value,decimals)!;
    } else result.shopSkrPrices[id] = money(value, decimals, true);
  }
  for (const [id, value] of Object.entries(edits.sol || {})) result.shopSolPrices[id] = money(value, 9, true);
  for (const [id, value] of Object.entries(edits.play || {})) {
    if(value.trim()==='')delete result.shopPlayPrices[id];else result.shopPlayPrices[id]=money(value,6)!;
  }
  if (autoTokens) {
    if (edits.skrPrice.trim() === '') delete result.shopSkrOverrides['season-pass'];
    else result.shopSkrOverrides['season-pass'] = money(edits.skrPrice, decimals)!;
  }
  if (edits.playPrice !== undefined) {
    if (edits.playPrice.trim() === '') delete result.shopPlayPrices['season-pass'];
    else result.shopPlayPrices['season-pass'] = money(edits.playPrice, 6)!;
  }
  return result;
}

export function settingsFingerprint(value: unknown): string {
  function stable(item: any): any {
    if (Array.isArray(item)) return item.map(stable);
    if (item && typeof item === 'object') return Object.fromEntries(Object.keys(item).sort().map(key => [key, stable(item[key])]));
    return item;
  }
  return JSON.stringify(stable(value));
}

export function prizeBudget(tiers: PrizeTier[], decimals = 9): string {
  let total = 0n;
  for (const tier of tiers) {
    const [whole, part = ''] = tier.amount.split('.');
    total += (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(part.padEnd(decimals, '0') || '0')) * BigInt(tier.toRank - tier.fromRank + 1);
  }
  const unit = 10n ** BigInt(decimals);
  const part = (total % unit).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${total / unit}${part ? `.${part}` : ''}`;
}
