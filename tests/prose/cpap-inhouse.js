// A3 本院出生離開產房／刀房：所有路徑都看得到第三顆鈕；本院鈕叫「Neopuff PEEP」、note 寫 supported with PEEP (5 cmH2O) via Neopuff，
// 不寫 CPAP（Ryan 2026-10-24：會讓人以為是 NCPAP 機器），也不是 weaned to O₂；入 NICU NCPAP 寫 transitioned；外接鈕與文案維持 CPAP。虛構資料。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');
const VERBOSE=process.argv.includes('--print');

function page(){
  const errors=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-cpap.test/',beforeParse(W){
    const RealDate=W.Date,fixed=new RealDate(2026,7,30,12).getTime();
    W.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[fixed]));}static now(){return fixed;}};
    W.scrollTo=()=>{};W.HTMLElement.prototype.scrollIntoView=()=>{};
    W.addEventListener('error',e=>errors.push(String(e.error?.stack||e.message)));
  }});
  const W=dom.window,d=W.document;
  const get=s=>{const e=d.querySelector(s);assert.ok(e,'Missing '+s);return e;};
  const click=s=>get(s).click();
  const input=(id,v)=>{const e=get('#'+id);e.value=v;e.dispatchEvent(new W.Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));};
  const note=tab=>{click(`[data-tab="${tab}"]`);return get('#note').textContent;};
  return {W,d,get,click,input,note,errors};
}
function base(p,story){
  if(story==='A'||story==='B'){p.click('#entryDirect');p.click(`[data-story="${story}"]`);}
  else p.click(`[data-story="${story}"]`);
  p.click('[data-seg="dest"] [data-v="NICU"]');p.input('birthDate','2026-08-30');
  p.click('[data-seg="gender"] [data-v="male"]');p.input('gaW','32');p.input('gaD','1');p.input('bw','1650');
  p.click('[data-seg="delivery"] [data-v="cs"]');p.input('ap1','6');p.input('ap5','8');
}
const finalCpap=(p,label)=>{
  const b=p.get('#leaveChoices [data-v="cpap"]');assert.equal(b.hidden,false,'第三顆鈕要看得到');
  if(label)assert.equal(b.textContent,label,'鈕的字依路徑');
  b.click();assert.equal(p.get('#birthFinalSupport').value,'cpap','離開時支持真的變成 cpap');
};
let fail=0;const test=(n,f)=>{try{f();console.log('✓',n);}catch(e){fail++;console.log('✗',n,'\n ',e.message);}};

test('直接入院＋PPV＋離開刀房 Neopuff PEEP 5＋入 NICU NCPAP',()=>{
  const p=page();base(p,'A');
  p.click('[data-ladder-v="ppv"]');
  assert.equal(p.get('#leavePeepWrap').hidden,true,'沒選 Neopuff PEEP 前不出 PEEP 欄');
  finalCpap(p,'Neopuff PEEP');
  assert.equal(p.get('#leavePeepWrap').hidden,false,'選了才出 PEEP 欄');
  assert.equal(p.get('#leaveHint').hidden,false,'本院出生有面罩貼緊／只吹氧的提示');
  p.input('leavePeep','5');
  p.click('#admissionStatusBody [data-seg="resp"] [data-v="NCPAP"]');
  const adm=p.note('adm'),plan=p.note('plan'),acc=p.note('acc');
  if(VERBOSE)console.log(adm,'\n---\n',plan,'\n---\n',acc);
  assert.match(adm,/the infant was then supported with PEEP 5 cmH2O via Neopuff/i);
  assert.doesNotMatch(adm,/placed on CPAP|CPAP via Neopuff|weaned to supplemental oxygen/);
  assert.match(adm,/On admission to our NICU, the infant was transitioned to NCPAP\./,'面罩 PEEP → 鼻塞 NCPAP 寫 transitioned');
  assert.doesNotMatch(adm,/continued on NCPAP/);
  assert.match(adm,/respiratory distress/i,'DX 含 respiratory distress');
  assert.match(plan,/NCPAP|CPAP/,'plan 有 CPAP 支持句');
  assert.match(acc,/Neopuff PEEP 5 cmH2O/,'Acceptance Respiratory 行寫 Neopuff PEEP 5 cmH2O');
  assert.equal(p.get('[data-band-node="birth:drEnd"] .tm').textContent,'Neopuff PEEP','時序帶節點也叫 Neopuff PEEP');
  assert.deepEqual(p.errors,[]);p.W.close();
});
test('直接入院、無急救事件、離開時 Neopuff PEEP 沒填值 → PEEP via Neopuff，核對提醒填值',()=>{
  const p=page();base(p,'B');p.click('[data-ladder-v="none"]');
  finalCpap(p,'Neopuff PEEP');
  const adm=p.note('adm');if(VERBOSE)console.log(adm);
  assert.match(adm,/The infant was supported with PEEP via Neopuff\./);
  assert.doesNotMatch(adm,/PEEP 5|CPAP was provided|placed on CPAP/);
  assert.match(p.get('#reviewOverview').textContent,/Neopuff 的 PEEP 值沒填/,'核對列提醒');
  p.input('leavePeep','6');
  assert.match(p.note('adm'),/supported with PEEP 6 cmH2O via Neopuff/);
  assert.doesNotMatch(p.get('#reviewOverview').textContent,/Neopuff 的 PEEP 值沒填/,'填了值提醒消失');
  assert.deepEqual(p.errors,[]);p.W.close();
});
test('外接路徑：鈕仍叫 CPAP、寫 CPAP was provided（不加 Neopuff）、沒有 PEEP 欄',()=>{
  const p=page();base(p,'D');
  p.input('obFacility','Example Clinic');
  finalCpap(p,'CPAP');
  assert.equal(p.get('#leavePeepWrap').hidden,true);assert.equal(p.get('#leaveHint').hidden,true);
  const adm=p.note('adm');if(VERBOSE)console.log(adm);
  assert.match(adm,/respectively\. CPAP was provided\. Our neonatal transport team was consulted for transfer\./,'與改前輸出逐字相同');
  assert.doesNotMatch(adm,/CPAP via Neopuff|placed on CPAP|PEEP via Neopuff/);
  assert.deepEqual(p.errors,[]);p.W.close();
});
test('出生處置的加入鈕（入院前急救階梯）沒有因此多出 CPAP（Ryan 2026-10-06 決定不動）',()=>{
  const p=page();base(p,'A');p.click('[data-ladder-v="ppv"]');
  assert.ok(p.d.querySelector('#birthAdderButtons [data-add-birth="ppv"]'),'前提：加入鈕已長出');
  assert.equal(p.d.querySelector('#birthAdderButtons [data-add-birth="cpap"]'),null);
  p.W.close();
});
test('入院 NCPAP 但前一站不是 CPAP（PPV 持續）→ 維持原句，不推定延續',()=>{
  const p=page();base(p,'A');p.click('[data-ladder-v="ppv"]');
  p.click('#leaveChoices [data-v="ppv"]');p.click('#admissionStatusBody [data-seg="resp"] [data-v="NCPAP"]');
  const adm=p.note('adm');
  assert.match(adm,/On admission to our NICU, the infant was receiving respiratory support with NCPAP\./);
  assert.doesNotMatch(adm,/continued on NCPAP|transitioned to NCPAP/);
  p.W.close();
});
console.log(fail?`✗ ${fail} 項失敗`:'✓ cpap-inhouse 全過');process.exit(fail?1:0);
