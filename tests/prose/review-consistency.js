// B4 核對訊號同源：第 5 段摘要的空格數與複製鈕同一規則；FD／DOIC／MSAF 未確認時 Acceptance 不寫 (unknown)、核對列待確認。
// 單跑：node review-consistency.js（讀 ../../index.html，先 bash build/build.sh）
const assert=require('node:assert/strict');
const {makeTest}=require('./page-helper');
const {test,done}=makeTest('review consistency');

// 盡量填滿的 A 情境：只剩母病歷號（選填）一個空格
const FULL=p=>{
  for(const [id,v] of Object.entries({gaW:'38',gaD:'2',bw:'3120',gravida:'2',para:'1',matAge:'31',ap1:'8',ap5:'9',
    birthDate:'2026-08-30',birthTime:'14:20',tentDx:'respiratory distress',ancPlace:'Synthetic clinic',admReason:'labor pain'}))p.input(id,v);
  p.seg('gender','male');p.seg('delivery','nsd');p.seg('dest','NICU');p.story('A');p.input('birthResusStatus','none');p.seg('resp','room air');
};
const blanks=t=>(t.match(/_{2,}|……|——/g)||[]).length;   // 與複製鈕相同規則
const summary=p=>{p.note('adm');return p.get('#reviewSummary').textContent;};
const pendingText=p=>{p.note('adm');return p.get('#reviewPendingList').textContent;};
const UNCONFIRMED='出生事件 FD／DOIC／MSAF 尚未確認（沒有勾選不代表沒有發生）';

test('母病歷號空白 → 第 5 段摘要寫「1 個空格」；填了就不再出現',p=>{
  FULL(p);
  const adm=p.note('adm');
  assert.equal(blanks(adm),1,'前提：病歷只剩一個空格\n'+adm.match(/.{0,40}(?:_{2,}|……|——).{0,20}/g));
  assert.match(adm,/Maternal chart number: ____/);
  const s=summary(p);
  assert.match(s,/關鍵資料未填 0 項 · 目前病歷仍有 1 個空格（複製時會留白）/,s);
  p.input('chartNo','A123456');
  assert.equal(blanks(p.note('adm')),0);
  assert.doesNotMatch(summary(p),/個空格/,'沒有空格就不寫');
});
test('空格數跟著目前的 note 更新（同一次 render，不落後一版）',p=>{
  FULL(p);p.input('chartNo','A123456');p.input('admReason','');
  const adm=p.note('adm'),n=blanks(adm);assert.ok(n>0,'清掉母親入院原因後應有空格');
  assert.match(summary(p),new RegExp(`目前病歷仍有 ${n} 個空格`));
});
test('未確認出生事件：Admission／Acceptance 都不寫 FD／DOIC／MSAF，核對列待確認',p=>{
  FULL(p);
  const acc=p.note('acc');
  assert.doesNotMatch(acc,/\(unknown\)/);
  assert.doesNotMatch(acc,/Fetal distress \(|DOIC \(|MSAF \(/);
  assert.doesNotMatch(p.note('adm'),/fetal distress|DOIC|MSAF/i);
  const pend=pendingText(p);assert.ok(pend.includes(UNCONFIRMED),pend);
  const link=[...p.get('#reviewPendingList').querySelectorAll('[data-review-target]')].find(b=>b.textContent.includes(UNCONFIRMED));
  assert.equal(link.dataset.reviewTarget,'[data-tog="birthNegConfirmed"] button');
  assert.match(summary(p),/已記錄待確認 \d+ 項/);
  // 第 3 段（出生）「本段還缺」也要反映
  const stageMissing=[...p.d.querySelectorAll('.stage-missing-link')].map(b=>b.textContent);
  assert.ok(stageMissing.includes(UNCONFIRMED),'本段還缺：'+stageMissing.join(' | '));
});
test('按確認後：核對消失、Acceptance 寫 (-)',p=>{
  FULL(p);p.tog('birthNegConfirmed');
  assert.ok(!pendingText(p).includes(UNCONFIRMED));
  const acc=p.note('acc');
  assert.match(acc,/Fetal distress \(-\), DOIC \(-\), MSAF \(-\)\./);
});
test('只勾 DOIC 未確認其他 → 只寫 DOIC (+)，其餘省略；核對仍列',p=>{
  FULL(p);p.tog('doic');
  const acc=p.note('acc');
  assert.match(acc,/\nDOIC \(\+\)\.\n/,acc.slice(0,600));
  assert.doesNotMatch(acc,/Fetal distress \(|MSAF \(/);
  assert.ok(pendingText(p).includes(UNCONFIRMED));
});
test('三項都勾陽性 → 不列待確認；E 路徑不列',p=>{
  FULL(p);p.tog('fd');p.tog('doic');p.tog('msaf');
  assert.ok(!pendingText(p).includes(UNCONFIRMED));
  assert.match(p.note('acc'),/Fetal distress \(\+\), DOIC \(\+\), MSAF \(\+\)/);
});
test('E 再入院路徑不列出生事件待確認',p=>{
  FULL(p);p.story('E');p.seg('dest','NBC');p.msel('readmitProblems','fever');
  assert.ok(!pendingText(p).includes(UNCONFIRMED));
});
done();
