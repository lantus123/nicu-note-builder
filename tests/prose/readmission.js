// DOL 1 semantics + story E (post-discharge clinic/ED admission) contracts.
// Synthetic data only.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');

function withPage(check){
  const errors=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-readmission.test/',beforeParse(W){
    const RealDate=W.Date,fixed=new RealDate(2026,7,30,12).getTime();
    W.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};
    W.scrollTo=()=>{};W.HTMLElement.prototype.scrollIntoView=()=>{};
    W.addEventListener('error',e=>errors.push(String(e.error?.message||e.message)));
  }});
  const W=dom.window,d=W.document;
  const get=sel=>{const el=d.querySelector(sel);assert.ok(el,`Missing ${sel}`);return el;};
  const click=sel=>get(sel).click();
  const input=(id,value)=>{const el=get(`#${id}`);el.value=value;el.dispatchEvent(new W.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
  const seg=(key,value)=>click(`[data-seg="${key}"] [data-v="${value}"]`);
  const msel=(key,value)=>click(`[data-msel="${key}"] [data-v="${value}"]`);
  const story=key=>click(`#pathwayCard [data-story="${key}"]`);
  const tab=name=>click(`[data-tab="${name}"]`);
  const note=()=>get('#note').textContent.trim();
  try{
    seg('gender','male');input('gaW','38');input('gaD','2');input('bw','3120');seg('delivery','nsd');seg('dest','NBC');
    input('ap1','8');input('ap5','9');input('gravida','1');input('para','1');input('matAge','31');
    check({W,d,get,click,input,seg,msel,story,tab,note});
    assert.deepEqual(errors,[],'page errors');
  }finally{W.close();}
}

const tests=[];const test=(name,fn)=>tests.push([name,()=>withPage(fn)]);

test('birth day is DOL 1; date-derived DOL and PMA use elapsed days',({input,tab,note,get})=>{
  input('birthDate','2026-08-27'); // fixed admission date = 2026-08-30
  assert.match(get('#dolStatus').textContent,/DOL 4.*經過 3 天/);
  assert.match(note(),/now on day of life 4/);
  tab('acc');
  assert.match(note(),/^DOL 4, PMA 38\+5 wks/);
});

test('manual DOL mismatch is visible and can return to automatic calculation',({input,seg,click,get})=>{
  input('birthDate','2026-08-27');seg('dol','3');
  assert.match(get('#dolStatus').textContent,/日期推算為 DOL 4.*手動使用 DOL 3/);
  assert.equal(get('#dolAutoReset').hidden,false);
  click('#dolAutoReset');assert.match(get('#dolStatus').textContent,/自動計算：DOL 4/);
});

test('story E creates a chronological outpatient readmission narrative without transfer leakage',({input,seg,msel,story,note,tab,get})=>{
  input('birthDate','2026-08-13');story('E');seg('readmitPrior','uneventful');
  input('readmitDischargeDate','2026-08-15');input('readmitDischargeWeight','3000');seg('readmitFeeding','breast milk');
  msel('readmitBaseline','feeding well');msel('readmitBaseline','active');
  msel('readmitProblems','prolonged-jaundice');input('readmitJaundiceDOL','3');
  msel('readmitJaundiceSigns','no dark urine');msel('readmitJaundiceSigns','no pale stools');
  input('readmitCourse','The jaundice persisted after discharge.');seg('readmitSource','clinic');
  input('readmitCurrentWeight','3260');input('readmitTSB','15.2');input('readmitDB','0.6');
  const text=note();
  assert.match(text,/now on day of life 18/);
  assert.match(text,/initial postnatal course was uneventful/);
  assert.match(text,/discharged home on day of life 3 at a weight of 3000 g/);
  assert.match(text,/Jaundice was first noted on day of life 3/);
  assert.match(text,/brought to our outpatient clinic/);
  assert.match(text,/total bilirubin level of 15\.2 mg\/dL and a direct bilirubin level of 0\.6 mg\/dL/);
  assert.match(text,/admitted to our NBC.*prolonged neonatal jaundice/);
  assert.doesNotMatch(text,/transport team|transferred from|referring hospital/i);
  assert.equal((text.match(/discharged home/g)||[]).length,1,'discharge is narrated once');
  assert.match(get('#consistencySummary').textContent,/不會寫入外接團隊或轉送資料/);
  tab('acc');assert.match(note(),/^DOL 18, PMA 40\+5 wks, Wt: 3260 g/);
  assert.equal(get('#accWeightField').hidden,true,'Story E must not expose a second editable current-weight field');
  assert.equal(get('#accWeightFromAdmission').hidden,false,'Acceptance should show the Admission weight source');
});

test('story E uses five explicit and visibly isolated stages with problem-specific fields only',({W,story,click,msel,get})=>{
  story('E');
  const visible=[...get('#journey').querySelectorAll('li')].filter(li=>W.getComputedStyle(li).display!=='none').map(li=>li.dataset.stop);
  assert.deepEqual(visible,['prior','home','illness','evaluation','adm']);
  assert.match(get('#journeyCounter').textContent,/第 1／5/);
  click('#journeyNext');assert.match(get('#journeyCounter').textContent,/第 2／5/);
  click('[data-stop-toggle="illness"]');assert.equal(get('#readmitJaundice').hidden,true);
  msel('readmitProblems','jaundice');assert.equal(get('#readmitJaundice').hidden,false);
  assert.equal(get('#readmitGeneral').hidden,true);
  msel('readmitProblems','poor-feeding');assert.equal(get('#readmitGeneral').hidden,false);
});

test('route drafts survive A/E switching but inactive route facts never leak',({story,input,seg,note})=>{
  story('E');seg('readmitSource','emergency');input('readmitComplaint','poor feeding');
  story('D');input('obReason','the need for transport');assert.match(note(),/transport team/);assert.doesNotMatch(note(),/poor feeding/);
  story('E');assert.match(note(),/poor feeding/);assert.match(note(),/emergency department/);assert.doesNotMatch(note(),/transport team|need for transport/);
});

test('date and timeline contradictions are surfaced without inventing corrections',({story,input,get})=>{
  input('birthDate','2026-08-20');story('E');input('readmitDischargeDate','2026-08-31');input('readmitOnsetDOL','20');
  const warning=get('#pathwayReview').textContent;
  assert.match(warning,/出院日期晚於本次入院日期/);assert.match(warning,/症狀開始 DOL 晚於本次入院 DOL/);
});

let failures=0;
for(const [name,fn] of tests){try{fn();console.log(`PASS ${name}`);}catch(error){failures++;console.error(`FAIL ${name}\n${error.stack}`);}}
console.log(`${tests.length-failures}/${tests.length} readmission checks passed`);
if(failures)process.exitCode=1;
