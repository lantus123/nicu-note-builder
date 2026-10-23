// B3 sepsis work-up 規則（Ryan 2026-10-24）：<35 週一律做；≥35 週要有症狀或風險。門檻在 PLAN_GA.sepsis。
// 單跑：node plan-sepsis-rule.js（讀 ../../index.html，先 bash build/build.sh）
const assert=require('node:assert/strict');
const {makeTest}=require('./page-helper');
const {test,done}=makeTest('plan sepsis rule');

const WORKUP=/sepsis work-up/;
const base=(p,gaW,gaD,bw='2600')=>{p.seg('gender','male');p.seg('dest','NICU');p.input('gaW',gaW);p.input('gaD',gaD);p.input('bw',bw);p.seg('delivery','nsd');};
const direct=p=>{p.click('#entryDirect');p.seg('resp','room air');};
// E 路徑只允許 NBC／PICU：選完情境再選 NBC；plan 為空字串會讓 doesNotMatch 假通過，所以一律先斷言 plan 有內容
const plan=p=>{const t=p.note('plan');assert.match(t,/Therapeutic plans:/,'plan 必須真的產生：'+p.get('#planWarn').textContent);return t;};
const pressed=p=>p.get('[data-planon] [data-v="sepsis"]').getAttribute('aria-pressed');

test('36+2 無風險無症狀 → 無 work-up',p=>{
  base(p,'36','2');direct(p);
  const t=plan(p);assert.doesNotMatch(t,WORKUP,t);assert.equal(pressed(p),'false');
  assert.match(t,/late prematurity/,'其他早產規則照舊');
});
test('36+2 只在出生評估記到 labored＋grunting（入院症狀 chip 沒點）→ 有 work-up（Codex 2026-10-24）',p=>{
  base(p,'36','2');direct(p);
  p.click('[data-select-chips="birthBreathing"] [data-v="labored"]');p.msel('birthSigns','grunting');
  const t=plan(p);assert.match(t,WORKUP,t);assert.equal(pressed(p),'true');
  assert.doesNotMatch(p.note('adm'),/# Respiratory distress/,'觀察不推診斷的規則不動');
});
test('36+2＋grunting → 有 work-up',p=>{
  base(p,'36','2');direct(p);p.msel('obSx','grunting');
  assert.match(plan(p),WORKUP);assert.equal(pressed(p),'true');
});
test('34+6 無症狀 → 有 work-up（<35 週）',p=>{
  base(p,'34','6');direct(p);
  assert.match(plan(p),WORKUP);
});
test('35+0 無症狀 → 無 work-up（門檻是 <35）',p=>{
  base(p,'35','0');direct(p);
  assert.doesNotMatch(plan(p),WORKUP);
});
test('39 週 GBS 陽性、IAP 不完整 → 有 work-up',p=>{
  base(p,'39','0','3200');direct(p);p.screening('gbs','pos');p.seg('maternalAbxPurpose','iap');p.seg('iap','incomplete');
  assert.match(p.note('adm'),/Maternal GBS colonization without complete/,'前提：GBS 陽性＋IAP 不完整真的有寫入');
  assert.match(plan(p),WORKUP);
});
test('E 黃疸再入院、無發燒 → 無 work-up',p=>{
  base(p,'39','0','3200');p.story('E');p.seg('dest','NBC');p.msel('readmitProblems','prolonged-jaundice');
  assert.match(p.note('adm'),/jaundice/i,'前提：黃疸問題有寫入');
  assert.doesNotMatch(plan(p),WORKUP);
});
test('E 發燒再入院 → 有 work-up',p=>{
  base(p,'39','0','3200');p.story('E');p.seg('dest','NBC');p.msel('readmitProblems','fever');
  assert.match(plan(p),WORKUP);
});
test('36+2 無症狀但手動打開 → 尊重 planOn',p=>{
  base(p,'36','2');direct(p);p.note('plan');p.click('[data-planon] [data-v="sepsis"]');
  assert.match(plan(p),WORKUP);assert.equal(pressed(p),'true');
});
done();
