// B2 Perinatal asphyxia／HIE 安全網：壓胸／epinephrine 或低 Apgar → DX 首列 asphyxia、plan cooling 評估、核對提醒。
// 單跑：node hie-safety.js（讀 ../../index.html，先 bash build/build.sh）
const assert=require('node:assert/strict');
const {makeTest}=require('./page-helper');
const {test,done}=makeTest('HIE safety');

const TERM=p=>{p.seg('gender','male');p.seg('dest','NICU');p.input('gaW','39');p.input('gaD','1');p.input('bw','3200');p.seg('delivery','nsd');};
const dxRows=adm=>adm.slice(adm.indexOf('Tentative diagnosis:')).split('\n').filter(l=>l.startsWith('# '));
const conflictText=p=>{p.note('adm');return p.get('#reviewConflictList').textContent;};
const HYPO='Evaluate eligibility for therapeutic hypothermia within 6 hours of birth';
const REVIEW='尚未評估 perinatal asphyxia／HIE';

test('足月 CPR＋Apgar 1/3 → DX 首列 asphyxia、plan 有 cooling 評估、無 trophic／一般餵食句',p=>{
  TERM(p);p.input('ap1','1');p.input('ap5','3');p.click('#entryDirect');p.click('[data-ladder-v="cpr"]');
  const adm=p.note('adm'),rows=dxRows(adm);
  assert.equal(rows[1],'# Perinatal asphyxia, suspected (chest compressions and epinephrine at birth; Apgar 1/3)',rows.join('\n'));
  assert.match(adm,/Under the tentative diagnosis of perinatal asphyxia/);
  const plan=p.note('plan');
  assert.ok(plan.split('\n')[1].includes(HYPO),'Diagnostic 第一條就是 cooling 評估\n'+plan);
  for(const s of ['Avoid hyperthermia and maintain normothermia pending the cooling decision','Monitor for seizures and treat clinically evident seizures',
    'Keep NPO initially; reassess enteral feeding after hemodynamic and neurologic stabilization','Monitor for complications of perinatal asphyxia: hypoxic-ischemic encephalopathy'])
    assert.ok(plan.includes(s),s+'\n'+plan);
  assert.doesNotMatch(plan,/trophic feeding|Bottle-feed|Initiate enteral feeding|OG tube and prioritize/);
  assert.equal(p.get('[data-planon] [data-v="hie"]').getAttribute('aria-pressed'),'true','按鈕顯示生效狀態');
  assert.match(p.note('acc'),/admitted to our NICU for perinatal asphyxia/);
  assert.ok(!conflictText(p).includes(REVIEW),'HIE 評估開著時不提醒');
});
test('10 分 Apgar ≤5 → 觸發，括號帶三個分數',p=>{
  TERM(p);p.input('ap1','1');p.input('ap5','4');p.input('ap10','5');p.click('#entryDirect');
  assert.equal(dxRows(p.note('adm'))[1],'# Perinatal asphyxia, suspected (Apgar 1/4/5)');
  assert.ok(p.note('plan').includes(HYPO));
});
test('10 分 Apgar 6（5 分 4）且無壓胸 → 不觸發',p=>{
  TERM(p);p.input('ap1','2');p.input('ap5','4');p.input('ap10','6');p.click('#entryDirect');
  const adm=p.note('adm');assert.doesNotMatch(adm,/asphyxia/i);
  const plan=p.note('plan');assert.ok(!plan.includes(HYPO));assert.match(plan,/Bottle-feed/,'一般餵食句仍在');
  assert.equal(p.get('[data-planon] [data-v="hie"]').getAttribute('aria-pressed'),'false');
  assert.ok(!conflictText(p).includes(REVIEW));
});
test('E 再入院路徑：出生 Apgar 1/3/5 不觸發',p=>{
  TERM(p);p.input('ap1','1');p.input('ap5','3');p.input('ap10','5');p.story('E');p.msel('readmitProblems','prolonged-jaundice');
  assert.doesNotMatch(p.note('adm'),/asphyxia/i);
  assert.ok(!p.note('plan').includes(HYPO));
  assert.ok(!conflictText(p).includes(REVIEW));
});
test('關掉 HIE 評估 → plan 句消失、餵食句回來、核對列出並跳 tentDx；手填 tentDx "HIE" 後不再列',p=>{
  TERM(p);p.input('ap1','2');p.input('ap5','4');p.click('#entryDirect');p.click('[data-ladder-v="cpr"]');
  p.note('plan');p.click('[data-planon] [data-v="hie"]');
  const plan=p.note('plan');
  assert.ok(!plan.includes(HYPO)&&!plan.includes('Keep NPO')&&!plan.includes('complications of perinatal asphyxia'),plan);
  assert.match(plan,/Initiate enteral feeding|Bottle-feed/,'通用餵食句回來');
  assert.equal(p.get('[data-planon] [data-v="hie"]').getAttribute('aria-pressed'),'false');
  const text=conflictText(p);
  assert.ok(text.includes('已記錄壓胸／epinephrine，'+REVIEW),text);
  const link=[...p.get('#reviewConflictList').querySelectorAll('[data-review-target]')].find(b=>b.textContent.includes(REVIEW));
  assert.equal(link.dataset.reviewTarget,'#tentDx');
  p.input('tentDx','HIE');
  assert.ok(!conflictText(p).includes(REVIEW),'手填 HIE 後不再提示');
  const rows=dxRows(p.note('adm'));assert.equal(rows[1],'# HIE');assert.ok(!rows.some(r=>/Perinatal asphyxia/.test(r)),'手填診斷取代自動 asphyxia 列');
});
test('手填 tentDx 照舊優先；回自動後 HIE 評估恢復',p=>{
  TERM(p);p.click('#entryDirect');p.click('[data-ladder-v="cpr"]');p.input('tentDx','meconium aspiration syndrome');
  const rows=dxRows(p.note('adm'));assert.equal(rows[1],'# Meconium aspiration syndrome');assert.ok(!rows.some(r=>/asphyxia/i.test(r)));
  p.note('plan');p.click('[data-planon] [data-v="hie"]');assert.ok(!p.note('plan').includes(HYPO));
  p.click('#planOnReset');assert.ok(p.note('plan').includes(HYPO),'回自動＝依觸發條件重新打開');
});
test('外接：外院現場的 epinephrine 事件也觸發，括號標 before admission',p=>{
  TERM(p);p.story('D');p.click('#courseAdderButtons [data-add-course="epinephrine"]');
  assert.equal(dxRows(p.note('adm'))[1],'# Perinatal asphyxia, suspected (epinephrine before admission)');
  assert.ok(p.note('plan').includes(HYPO));
});
done();
