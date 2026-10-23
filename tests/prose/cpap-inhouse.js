// A3 本院出生離開產房／刀房 CPAP：所有路徑都看得到 CPAP 鈕；本院出生寫 via Neopuff、
// 有急救事件寫 placed on CPAP（不是 weaned to O₂）；入 NICU NCPAP 寫 continued；外接文案不變。虛構資料。
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
const finalCpap=p=>{
  const b=p.get('#leaveChoices [data-v="cpap"]');assert.equal(b.hidden,false,'CPAP 鈕要看得到');
  b.click();assert.equal(p.get('#birthFinalSupport').value,'cpap','離開時支持真的變成 cpap');
};
let fail=0;const test=(n,f)=>{try{f();console.log('✓',n);}catch(e){fail++;console.log('✗',n,'\n ',e.message);}};

test('直接入院＋PPV＋離開刀房 CPAP＋入 NICU NCPAP',()=>{
  const p=page();base(p,'A');
  p.click('[data-ladder-v="ppv"]');
  finalCpap(p);
  p.click('#admissionStatusBody [data-seg="resp"] [data-v="NCPAP"]');
  const adm=p.note('adm'),plan=p.note('plan'),acc=p.note('acc');
  if(VERBOSE)console.log(adm,'\n---\n',plan,'\n---\n',acc);
  assert.match(adm,/the infant was then placed on CPAP via Neopuff/i);
  assert.doesNotMatch(adm,/weaned to supplemental oxygen/);
  assert.match(adm,/On admission to our NICU, the infant was continued on NCPAP\./,'入院句寫 continued');
  assert.match(adm,/respiratory distress/i,'DX 含 respiratory distress');
  assert.match(plan,/NCPAP|CPAP/,'plan 有 CPAP 支持句');
  assert.match(acc,/CPAP/,'Acceptance Respiratory 行');
  assert.deepEqual(p.errors,[]);p.W.close();
});
test('直接入院、無急救事件、離開時 CPAP → CPAP was provided via Neopuff',()=>{
  const p=page();base(p,'B');p.click('[data-ladder-v="none"]');
  finalCpap(p);
  const adm=p.note('adm');if(VERBOSE)console.log(adm);
  assert.match(adm,/CPAP was provided via Neopuff/);
  assert.doesNotMatch(adm,/placed on CPAP/);
  assert.deepEqual(p.errors,[]);p.W.close();
});
test('外接路徑：CPAP 仍寫 CPAP was provided（不加 Neopuff）',()=>{
  const p=page();base(p,'D');
  p.input('obFacility','Example Clinic');
  finalCpap(p);
  const adm=p.note('adm');if(VERBOSE)console.log(adm);
  assert.match(adm,/respectively\. CPAP was provided\. Our neonatal transport team was consulted for transfer\./,'與改前輸出逐字相同');
  assert.doesNotMatch(adm,/CPAP via Neopuff|placed on CPAP/);
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
  assert.doesNotMatch(adm,/continued on NCPAP/);
  p.W.close();
});
console.log(fail?`✗ ${fail} 項失敗`:'✓ cpap-inhouse 全過');process.exit(fail?1:0);
