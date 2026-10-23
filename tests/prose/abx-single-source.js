// B1 抗生素劑量單一來源：NI plan 的抗生素等級決定 Acceptance 劑量；plan 不開但 Acceptance 有藥 → 核對列衝突。
// 單跑：node abx-single-source.js（讀 ../../index.html，先 bash build/build.sh）
const assert=require('node:assert/strict');
const {withPage,makeTest}=require('./page-helper');
const {test,done}=makeTest('abx single-source');

const BASE=({click,input})=>{
  click('[data-seg="gender"] [data-v="male"]');click('[data-seg="dest"] [data-v="NICU"]');
  input('gaW','36');input('gaD','5');input('bw','2680');click('#entryDirect');
};
const EXPECT={
  empirical:{plan:'Administer empirical antibiotics: Ampicillin (100 mg/kg/day) and Gentamicin (4 mg/kg/dose QD)',amp:'Ampicillin (100 mg/kg/day)',gent:'Gentamicin (4 mg/kg/dose QD)',cef:'Cefotaxime (Claforan) (50 mg/kg/dose)'},
  sepsis:{plan:'Administer Ampicillin (200 mg/kg/day, Q12H) and Gentamicin (4 mg/kg/dose QD) at sepsis doses',amp:'Ampicillin (200 mg/kg/day, Q12H)',gent:'Gentamicin (4 mg/kg/dose QD)',cef:'Cefotaxime (Claforan) (50 mg/kg/dose)'},
  meningitic:{plan:'Administer Ampicillin (300 mg/kg/day, Q8H) and Cefotaxime (100 mg/kg/dose Q12H) at meningitic doses',amp:'Ampicillin (300 mg/kg/day, Q8H)',gent:'Gentamicin (4 mg/kg/dose QD)',cef:'Cefotaxime (Claforan) (100 mg/kg/dose Q12H)'}
};
for(const [level,x] of Object.entries(EXPECT)){
  test(`plan=${level}: Acceptance 劑量與 plan 一致`,p=>{
    BASE(p);const {click,note,section,get}=p;
    note('plan');click(`[data-seg="planAbx"] [data-v="${level}"]`);
    const plan=note('plan');assert.ok(plan.includes(x.plan),plan);
    note('acc');click('[data-am="abx"] [data-v="ampicillin"]');click('[data-am="abx"] [data-v="gentamicin"]');click('[data-am="abx"] [data-v="cefotaxime"]');
    const acc=note('acc'),hc=section(acc,'Hospital course'),course=section(acc,'Antibiotic course');
    assert.ok(hc.includes(`ntibiotic treatment with ${x.amp}, ${x.gent}, and ${x.cef} was started`),hc);
    assert.ok(course.includes(`${x.amp} / ${x.gent} / ${x.cef}`),course);
    assert.ok(plan.includes(x.amp),'plan 與 Acceptance 用同一個 Ampicillin 字串');
    assert.match(get('#accAbxLevel').textContent,new RegExp(`目前：${level}`));
    assert.doesNotMatch(acc,/[一-鿿]/,'中文提示不進 note');
  });
}
test('自動等級（無感染風險 → none）：Acceptance 仍寫 empirical 劑量，核對出現衝突且可跳到 NI plan',p=>{
  BASE(p);const {click,note,get,d}=p;
  const plan=note('plan');assert.doesNotMatch(plan,/Administer[^\n]*Ampicillin/,'無風險時 plan 不開抗生素');
  note('acc');click('[data-am="abx"] [data-v="ampicillin"]');
  const acc=note('acc');assert.ok(acc.includes("ntibiotic treatment with Ampicillin (100 mg/kg/day) was started"),acc);
  assert.match(get('#accAbxLevel').textContent,/目前：不開/);
  note('adm');
  const list=get('#reviewConflictList');
  assert.ok(list.textContent.includes('NI plan 抗生素為「不開」，但 Acceptance 已記錄 Ampicillin'),list.textContent);
  const link=[...list.querySelectorAll('[data-review-target]')].find(b=>b.textContent.includes('NI plan 抗生素'));
  assert.equal(link.dataset.reviewTarget,'[data-seg="planAbx"]');
  assert.match(link.textContent,/NI plan 分頁/,'位置標 NI plan 分頁，不套 Admission 區號');
  link.click();
  assert.equal(get('[data-tab="plan"]').getAttribute('aria-selected'),'true','點了切到 NI plan 分頁');
  assert.ok(d.activeElement&&d.activeElement.closest('[data-seg="planAbx"]'),'焦點在抗生素控制');
});
test('手動選「無」＋Acceptance 有藥 → 衝突；改回 empirical → 衝突消失',p=>{
  BASE(p);const {click,note,get}=p;
  note('plan');click('[data-seg="planAbx"] [data-v="none"]');
  note('acc');click('[data-am="abx"] [data-v="vancomycin"]');
  assert.ok(note('acc').includes('Vancomycin (15 mg/kg/dose)'));
  note('adm');assert.ok(get('#reviewConflictList').textContent.includes('Acceptance 已記錄 Vancomycin'));
  note('plan');click('[data-seg="planAbx"] [data-v="empirical"]');
  note('adm');assert.ok(!get('#reviewConflictList').textContent.includes('NI plan 抗生素'),'等級改為 empirical 後不再列衝突');
});
test('Acceptance 沒選藥時不列衝突、不補藥名',p=>{
  BASE(p);const {note,get}=p;
  const acc=note('acc');assert.doesNotMatch(acc,/Ampicillin|Gentamicin/);
  note('adm');assert.ok(!get('#reviewConflictList').textContent.includes('NI plan 抗生素'));
});
done();
