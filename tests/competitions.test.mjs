import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

async function module(path) {
  const output = await build({ entryPoints: [path], bundle: true, format: 'esm', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
}
const model = await module('src/admin/competitionModel.ts');
const { AdminClient } = await module('src/admin/AdminClient.ts');
const base = {seasonPass:{enabled:false,skrPrice:null,solPrice:null},cycle:{enabled:false,prizes:[]},season:{enabled:false,prizes:[]},
  tradingSeason:{enabled:false,prizes:[{fromRank:1,toRank:5,amount:'1.250000000'}]},shopSkrPrices:{future:'0.123456789'},other:{keep:true}};
const edits = {passEnabled:false,skrPrice:'',solPrice:'',cycleEnabled:false,cycle:[],seasonEnabled:false,season:[],shop:{}};

test('money stays exact and rejects invalid or out-of-range input', () => {
  assert.equal(model.money(' 1.234567890 '), '1.234567890');
  assert.equal(model.money('0.000000001'), '0.000000001');
  assert.equal(model.money('',9,true),null);
  for (const text of ['0','-1','+1','1e2','01','1,000','0.0000000001','18446744074']) assert.throws(()=>model.money(text),text);
  assert.equal(model.money('18446744073.709551615'), '18446744073.709551615');
  assert.throws(()=>model.money('18446744073.709551616'));
  assert.throws(()=>model.money('1.001',2));
  assert.equal(model.money('12',0), '12');
});
test('tiers enforce ordered bounded non-overlapping ranks and exact budgets', () => {
  const tiers = model.validateTiers([{fromRank:'1',toRank:'2',amount:'0.100000001'},{fromRank:'4',toRank:'10',amount:'1.2'}],10);
  assert.equal(model.prizeBudget(tiers), '8.600000002');
  assert.equal(model.prizeBudget([],0),'0');
  for (const rows of [
    [{fromRank:'0',toRank:'1',amount:'1'}], [{fromRank:'1',toRank:'11',amount:'1'}],
    [{fromRank:'2',toRank:'1',amount:'1'}], [{fromRank:'1.5',toRank:'2',amount:'1'}],
    [{fromRank:'1',toRank:'2',amount:'1'},{fromRank:'2',toRank:'3',amount:'1'}],
    [{fromRank:'1',toRank:'2',amount:'0'}],
  ]) assert.throws(()=>model.validateTiers(rows,10));
  assert.equal(model.validateTiers([{fromRank:'1',toRank:'100',amount:'2'}],100).length,1);
});
test('whole-document edits preserve trading, unlisted prices, and extra fields without mutating source', () => {
  const result = model.settingsWithEdits(base,{...edits,skrPrice:'2.5000',solPrice:'0.001',shop:{shield:'1.500000000',freeze:''}});
  assert.deepEqual(result.tradingSeason,base.tradingSeason);
  assert.equal(result.shopSkrPrices.future,'0.123456789');
  assert.equal(result.shopSkrPrices.shield,'1.500000000');
  assert.equal(result.shopSkrPrices.freeze,null);
  assert.deepEqual(result.other,{keep:true});
  assert.equal(result.seasonPass.enabled,false);
  assert.equal(base.seasonPass.skrPrice,null);
  assert.throws(()=>model.settingsWithEdits(base,{...edits,passEnabled:true}));
  assert.throws(()=>model.settingsWithEdits(base,{...edits,cycleEnabled:true}));
  assert.throws(()=>model.settingsWithEdits(base,{...edits,seasonEnabled:true}));
  assert.equal(model.settingsFingerprint({b:2,a:{z:1,y:3}}),model.settingsFingerprint({a:{y:3,z:1},b:2}));
  assert.notEqual(model.settingsFingerprint(base),model.settingsFingerprint(result));
});
test('admin API envelopes, encoded cursor, and session credentials', async () => {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url,init) => {calls.push({url,init});return new Response('{"ok":true,"settings":{}}',{headers:{'content-type':'application/json'}});};
  try {
    const client = new AdminClient();
    await client.getCompetitions(); await client.saveCompetitions(base);
    await client.getMatchReviews('mtc-a &b'); await client.reviewMatch('mtc-123','accepted','Checked replay');
    assert.equal(calls[0].url,'https://api.battlecities.com/api/admin/competitions');
    assert.deepEqual(JSON.parse(calls[1].init.body),{settings:base});
    assert.equal(calls[1].init.method,'PUT');
    assert.equal(new URL(calls[2].url).searchParams.get('before'),'mtc-a &b');
    assert.deepEqual(JSON.parse(calls[3].init.body),{resultId:'mtc-123',decision:'accepted',reason:'Checked replay'});
    for (const call of calls) assert.equal(call.init.credentials,'include');
  } finally {globalThis.fetch = original;}
});
test('panel controls exist and settings/review actions require explicit confirmation', async () => {
  const html = await readFile('public/index.html','utf8');
  for (const file of ['src/admin/CompetitionPanel.ts','src/admin/ReviewPanel.ts']) {
    const source = await readFile(file,'utf8');
    for (const match of source.matchAll(/\[(data-[\w-]+)(?:\]|=)/g)) {
      if (!['data-tier-field','data-shop-price'].includes(match[1])) assert.ok(html.includes(match[1]),`${file}: ${match[1]}`);
    }
    assert.ok(source.includes('window.confirm('));
  }
  assert.ok(html.includes('data-review-inspected')); assert.ok(html.includes('data-review-final'));
  assert.ok(html.includes('data-competition-fields disabled'));
});
