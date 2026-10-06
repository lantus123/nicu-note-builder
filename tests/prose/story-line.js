// 故事線骨架、站內格線、反應子句、關係推導、看範例、核對總覽、節點三態、預覽反向跳轉（2026-10-06）。
// 虛構資料；JSDOM 沒有排版，格線的實際左緣座標由 browser-story.cjs 量。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(__dirname+'/../../index.html','utf8');
assert.equal(source.split('function render(){').length,2);
const html=source.replace('function render(){','window.storyTest={S,render}; function render(){');
const tests=[];
const test=(name,run)=>tests.push([name,run]);
async function page(run,{session={}}={}){
  const errors=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-story.test/',beforeParse(W){
    let y=0;Object.defineProperty(W,'scrollY',{get:()=>y,configurable:true});
    W.scrollTo=(a,b)=>{y=typeof a==='object'?(a.top??y):b;};
    W.HTMLElement.prototype.scrollIntoView=()=>{};
    W.resets=[];W.nicuReset=()=>W.resets.push(W.sessionStorage.getItem('nicu_after_reset')||'');
    for(const [k,v] of Object.entries(session))W.sessionStorage.setItem(k,v);
    W.addEventListener('error',e=>errors.push(String(e.error?.stack||e.message)));
  }});
  const W=dom.window,d=W.document,S=W.storyTest.S;
  const get=s=>{const e=d.querySelector(s);assert.ok(e,'Missing '+s);return e;};
  const click=s=>get(s).click();
  const input=(id,v)=>{const e=get('#'+id);e.value=v;e.dispatchEvent(new W.Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));};
  const seg=(k,v)=>click(`[data-seg="${k}"] [data-v="${v}"]`);
  const story=s=>{if(['A','B'].includes(s)&&!d.querySelector('#entryDirect[aria-checked="true"]'))click('#entryDirect');click(s==='direct'?'#entryDirect':`[data-story="${s}"]`);};
  const ladder=v=>click(`[data-ladder-v="${v}"]`);
  const chip=(id,v)=>click(`[data-select-chips="${id}"] [data-v="${v}"]`);
  const ev=kind=>S.birthEvents.filter(e=>e.kind===kind);
  const choose=(id,key,v)=>click(`[data-event-id="${id}"] [data-event-choice="${key}"] [data-v="${v}"]`);
  const note=()=>get('#note').textContent;
  const nodes=i=>[...d.querySelectorAll(`[data-band-seg="${i}"] .band-node`)].map(n=>n.dataset.bandNode);
  const chapter=()=>get('#stageBand .band-head[aria-current="step"] .t').textContent;
  const current=()=>d.querySelector('#stageBand .band-node[aria-current="step"]')?.dataset.bandNode||'';
  const status=i=>get(`[data-band-seg="${i}"] .band-head .s`).textContent;
  try{await run({W,d,S,get,click,input,seg,story,ladder,chip,ev,choose,note,nodes,chapter,current,status});assert.deepEqual(errors,[],'Page errors');}
  finally{W.close();}
}

// ── 第 1 步：故事線骨架 ──
test('the ladder grows NRP-ordered delivery-room nodes and the story line reads the same source',({d,S,story,ladder,nodes,get,ev})=>{
  story('A');
  assert.equal(get('#ladderWrap').hidden,false);
  ladder('ett');assert.deepEqual([...S.birthEvents].map(e=>e.kind),['ppv','intubation']);
  assert.deepEqual(nodes(3),['birth:info','birth:standby','birth:birth','birth:consult',`birth:dr:${ev('ppv')[0].id}`,`birth:dr:${ev('intubation')[0].id}`,'birth:drEnd']);
  assert.equal(ev('ppv')[0].nrp,true,'PPV carries the NRP 9th edition defaults');assert.equal(get('#birthResusStatus').value,'performed');
  ladder('cpr');assert.deepEqual([...S.birthEvents].map(e=>e.kind),['ppv','intubation','compressions','epinephrine']);
  assert.match(get('#storyLine').textContent,/產前 standby → 出生 → 產房 PPV → 插管 → 壓胸 → Epi → 離開產房 → 入院/);
  assert.equal(d.querySelector('[data-ladder-v="cpr"]').getAttribute('aria-checked'),'true');
  ladder('none');assert.equal(S.birthEvents.length,0);assert.equal(get('#birthResusStatus').value,'none');
  assert.match(get('#note').textContent,/No resuscitation was required at birth\./);
  assert.match(get('#storyLine').textContent,/產房無需急救/);
});
test('stepping the ladder down removes extra events; filled ones ask first and are kept on cancel',({S,story,ladder,input,get,click,ev,note})=>{
  story('B');ladder('ett');const intub=ev('intubation')[0].id;
  ladder('ppv');assert.deepEqual([...S.birthEvents].map(e=>e.kind),['ppv'],'Empty extra events go without a prompt');
  ladder('ett');const again=ev('intubation')[0].id;input(`event-${again}-fiO2`,'40');
  ladder('ppv');assert.equal(get('#ladderConfirm').hidden,false);assert.match(get('#ladderConfirmText').textContent,/插管/);
  assert.deepEqual([...S.birthEvents].map(e=>e.kind),['ppv','intubation'],'Nothing is removed before confirmation');
  click('#ladderConfirmNo');assert.equal(get('#ladderConfirm').hidden,true);assert.equal(ev('intubation')[0].fiO2,'40');
  ladder('none');assert.equal(get('#ladderConfirm').hidden,false);click('#ladderConfirmYes');
  assert.equal(S.birthEvents.length,0);assert.doesNotMatch(note(),/intubation/i);assert.notEqual(intub,again);
});
test('the PPV NRP defaults alone do not count as filled data',({story,ladder,S,get})=>{
  story('A');ladder('ett');ladder('o2');assert.deepEqual([...S.birthEvents].map(e=>e.kind),['o2'],'Untouched NRP defaults are removed without a prompt');assert.equal(get('#ladderConfirm').hidden,true);
});
test('optional stations: hollow nodes add the station; × removes it (standby/consult keep a silent draft)',({d,S,story,click,input,get,note,nodes})=>{
  story('A');assert.ok(get('[data-band-node="birth:consult"]').classList.contains('opt'));
  click('[data-band-opt="consult"]');assert.equal(S.pwConsult,true);assert.equal(get('[data-band-node="birth:consult"]').classList.contains('opt'),false);
  assert.equal(get('#birthStage-consult').hidden,false);input('pwConsultReason','synthetic concern');assert.match(note(),/consulted .*because of synthetic concern/);
  click('[data-band-opt-remove="consult"]');assert.equal(S.pwConsult,false);assert.doesNotMatch(note(),/synthetic concern/);
  assert.equal(get('#pwConsultReason').value,'synthetic concern','The draft stays for when the station comes back');
  click('[data-band-opt="consult"]');assert.match(note(),/synthetic concern/);
  assert.equal(d.querySelectorAll('#journeyAdj,[data-seg="pathway"]').length,0,'The old adjust-details switches are retired');
});
test('baby-room evaluation (C) and transport (D) are optional; removing one with data asks and clears',({d,S,story,click,get,note,nodes})=>{
  story('C');assert.ok(nodes(4).includes('course:brEval'));assert.equal(get('[data-band-node="course:brEval"]').classList.contains('opt'),true);
  click('[data-band-opt="brEval"]');click('[data-msel="brWorkup"] [data-v="cbc"]');assert.match(note(),/complete blood count/);
  click('[data-band-opt-remove="brEval"]');assert.equal(get('#bandConfirm').hidden,false);click('#bandConfirmNo');assert.match(note(),/complete blood count/);
  click('[data-band-opt-remove="brEval"]');click('#bandConfirmYes');assert.doesNotMatch(note(),/complete blood count/);assert.equal(S.brWorkup.length,0);
  assert.equal(get('[data-band-node="course:brEval"]').classList.contains('opt'),true);
  story('D');assert.equal(get('[data-band-node="course:route"]').classList.contains('opt'),true,'Transport is zero rows by default');
  click('[data-band-opt="route"]');assert.equal(S.pwTransport,true);assert.match(get('#journeyPlace').textContent,/轉送途中/);
});

// ── 第 2 步：站內格線、反應、離開產房、關係推導、入院前零筆、外接 ──
test('every station question is one grid row: a label column and a control column',({d,story,ladder,click})=>{
  for(const s of ['A','C','D','E']){
    story(s);if(s==='A')ladder('cpr');
    const roots=[d.getElementById('birthHistoryCard'),d.getElementById('journey'),d.getElementById('journeyWorkspace')];
    for(const root of roots)for(const field of root.querySelectorAll('.field')){
      if(!field.querySelector(':scope > .lab'))continue;
      assert.ok(field.classList.contains('step'),`${s}: ${field.id||field.textContent.slice(0,20)} uses the station grid`);
      assert.equal(field.children[0].classList.contains('lab'),true);assert.equal(field.children[1]?.classList.contains('ctl'),true);
    }
    for(const row of d.querySelectorAll('#birthEvents .ev-row'))assert.ok(row.querySelector(':scope > .step > .lab')&&row.querySelector(':scope > .step > .ctl'));
    assert.equal(d.querySelectorAll('.event-fields,.optional-events').length,0,'The old per-event forms are gone');
  }
});
test('each delivery-room node asks only for its settings plus one response question',({d,story,ladder,ev,choose,note,input,get})=>{
  story('A');ladder('cpr');
  const has=(kind,field)=>!!d.querySelector(`[data-event-id="${ev(kind)[0].id}"] [data-event-field="${field}"]`);
  for(const f of ['fiO2','pip','peep'])assert.ok(has('ppv',f));assert.ok(has('intubation','fiO2'));
  assert.ok(has('compressions','ratio'));assert.equal(has('compressions','duration'),false);
  assert.ok(has('epinephrine','drugDose'));assert.ok(has('epinephrine','drugRoute'));
  for(const kind of ['ppv','intubation','compressions','epinephrine'])assert.ok(d.querySelector(`[data-event-id="${ev(kind)[0].id}"] [data-event-choice="response"]`),kind);
  assert.doesNotMatch(note(),/after which|partial improvement|without improvement/,'Empty response writes nothing');
  choose(ev('ppv')[0].id,'response','improved');choose(ev('compressions')[0].id,'response','partial');choose(ev('epinephrine')[0].id,'response','none');
  input(`event-${ev('compressions')[0].id}-ratio`,'3:1');
  const n=note();
  assert.match(n,/Positive-pressure ventilation \(PPV\) was given via Neopuff \(FiO2 \d+%, IP\/PEEP \d+\/5 cmH2O\), after which heart rate and oxygen saturation improved\./);
  assert.match(n,/chest compressions were initiated at a 3:1 compression-to-ventilation ratio, with partial improvement\./i);
  assert.match(n,/epinephrine was administered, without improvement\./i);
  click(`[data-event-id="${ev('ppv')[0].id}"] [data-event-choice="response"] .choice-clear`);assert.doesNotMatch(note(),/after which heart rate/);
  function click(s){get(s).click();}
});
test('"＋" only repeats a skeleton step or adds a reassessment; later rows show "第 N 次" and remove',({d,S,story,ladder,click,get,note})=>{
  story('A');ladder('ppv');
  assert.deepEqual([...d.querySelectorAll('#birthAdderButtons [data-add-birth]')].map(b=>b.dataset.addBirth),['ppv','assessment']);
  assert.match(get('#birthAdderHint').textContent,/PPV/);
  assert.equal(d.querySelector('#birthEvents .ev-row .ev-head'),null,'The first row has no number or remove');
  click('[data-add-birth="ppv"]');const second=S.birthEvents[1];
  assert.match(get(`[data-event-id="${second.id}"] .ev-head`).textContent,/第 2 次/);
  assert.equal(second.nrp,true);assert.match(note(),/PPV was given again via Neopuff/);
  click(`[data-event-id="${second.id}"] [data-event-action="remove"]`);assert.equal(S.birthEvents.length,1);
  click('[data-add-birth="assessment"]');assert.match(get(`[data-event-id="${S.birthEvents[1].id}"] .ev-head`).textContent,/中途再評估/);
  assert.equal(d.querySelector('[data-add-birth="cpap"],[data-add-birth="intubation"]'),null,'No ventilator choices in the delivery room');
});
test('leaving the delivery room is one question plus an optional SpO2',({d,story,ladder,chip,input,get,note,S})=>{
  story('A');ladder('ppv');
  assert.equal(get('#leaveChoices [data-v="cpap"]').hidden,true,'Delivery rooms have only Neopuff: no CPAP');
  assert.equal(get('#leaveMore').open,false,'Breathing, tone and heart rate fold into 補充評估');
  chip('birthFinalSupport','ppv');input('leaveSpo2','95');assert.equal(S.leaveSpo2,'95');
  assert.match(note(),/PPV was continued via Neopuff, with SpO2 maintained at 95%\./);
  chip('birthFinalSupport','room');assert.match(note(),/The infant was then weaned to room air, with SpO2 maintained at 95%\./);
  chip('birthFinalSupport','o2');assert.match(note(),/The infant was then weaned to supplemental oxygen/);
  ladder('ett');chip('birthFinalSupport','ett');input('leaveSpo2','');assert.match(note(),/The infant remained intubated\./);
  ladder('none');chip('birthFinalSupport','room');assert.match(note(),/The infant remained in room air\./);
  story('D');assert.equal(get('#leaveChoices [data-v="cpap"]').hidden,false,'Outside hospitals may have CPAP');
});
test('support relation is derived from the stations before and after; no relation questions remain',({d,story,chip,seg,note,input})=>{
  assert.equal(d.querySelector('#obRespRelation,#obM1Relation,[data-support-choice]'),null);
  story('A');chip('birthFinalSupport','o2');seg('obRespType','o2');assert.match(note(),/Supplemental oxygen was continued before admission/);
  chip('birthFinalSupport','room');assert.match(note(),/Supplemental oxygen was initiated before admission/);
  chip('birthFinalSupport','ppv');assert.match(note(),/respiratory support was changed to supplemental oxygen before admission/i);
  d.querySelector('[data-select-chips="birthFinalSupport"] .choice-clear').click();assert.match(note(),/The infant was receiving supplemental oxygen before admission/,'Unknown previous support is described, not linked');
  story('D');seg('obM1Type','cpap');input('obM1FiO2','40');input('obArriveSpo2','92');
  assert.match(note(),/On our team's arrival at the referring hospital, the infant was receiving CPAP \(FiO2 40%\), with SpO2 92%\./);
  seg('obRespType','cpap');assert.match(note(),/CPAP was continued during transport/);
});
test('pre-admission treatment starts with zero rows; rows appear only after "＋"',({d,story,click,get})=>{
  story('A');click('[data-band-node="course:route"] , [data-phase-target="course:route"]');
  assert.equal(get('#courseEvents').children.length,0);assert.match(get('#courseAdderHint').textContent,/沒有新的處置就不用填/);
  assert.equal(get('#courseAdderButtons [data-add-course="cpap"]').hidden,true,'No CPAP before admission from our delivery room');
  click('[data-add-course="o2"]');assert.equal(get('#courseEvents').querySelectorAll('.ev-row').length,1);
  story('D');assert.equal(d.querySelector('#obCareEvents').children.length,0);assert.ok(d.querySelector('[data-add-stage-event="cpap"][data-event-phase="outside"]'),'Outside care may include CPAP');
});

// ── 第 3 步：三態、同步、預覽反向、收合 ──
test('node states: hollow until filled, half while required items are missing, solid when complete',({d,S,story,ladder,get,input,click,ev})=>{
  story('A');ladder('cpr');
  const node=kind=>get(`[data-band-node="birth:dr:${ev(kind)[0].id}"]`);
  assert.equal(node('ppv').classList.contains('has'),false,'Untouched NRP defaults are not a completed node');
  click(`[data-nrp-accept="${ev('ppv')[0].id}"]`);assert.equal(node('ppv').classList.contains('has'),true);
  input(`event-${ev('epinephrine')[0].id}-minutes`,'4');assert.equal(node('epinephrine').classList.contains('part'),true,'Dose/route still missing');
  input(`event-${ev('epinephrine')[0].id}-drugDose`,'0.1 mL/kg');input(`event-${ev('epinephrine')[0].id}-drugRoute`,'UVC');
  assert.equal(node('epinephrine').classList.contains('has'),true);assert.equal(node('epinephrine').classList.contains('part'),false);
  input('gaW','34');assert.equal(get('[data-band-node="birth:info"]').classList.contains('part'),true,'Info has data but BW/sex/delivery are missing');
});
test('focusing a row or a station lights the matching band node',({d,story,ladder,get,ev,current,click})=>{
  story('A');ladder('ett');click('#stageBand [data-flow-target="birthHistoryCard"]');
  get(`#event-${ev('intubation')[0].id}-fiO2`).focus();assert.equal(current(),`birth:dr:${ev('intubation')[0].id}`);
  get('#birthHR').focus();assert.equal(current(),'birth:birth');
  click(`[data-band-node="birth:dr:${ev('ppv')[0].id}"]`);assert.ok(get(`[data-event-id="${ev('ppv')[0].id}"]`).contains(d.activeElement));
});
test('clicking a preview sentence in review mode jumps to its stage; reading mode keeps text selection',({d,story,ladder,get,chapter,current,click})=>{
  story('A');ladder('ppv');click('#stageBand [data-flow-target="prenatalCard"]');
  const scope=()=>get('#note .note-scope[data-note-phase="birth:dr"]');
  scope().click();assert.equal(chapter(),'產前資料','Reading mode does not intercept clicks');
  click('#previewReading');assert.equal(get('.dock').dataset.reading,'false');
  scope().click();assert.equal(chapter(),'出生資料');assert.match(current(),/^birth:dr/);
  get('#note .note-scope[data-note-phase="prenatal"]').click();assert.equal(chapter(),'產前資料');
});
test('non-current band segments collapse to dots; names stay available as titles',({d,story,ladder,click})=>{
  story('D');ladder('ett');click('#stageBand [data-flow-target="pathwayCard"]');
  const grow=i=>d.querySelector(`[data-band-seg="${i}"]`).style.flexGrow;
  assert.equal(grow(3),'0');assert.notEqual(grow(4),'0');
  for(const n of d.querySelectorAll('[data-band-seg="3"] .band-node'))assert.ok(n.title,'Collapsed nodes keep a title');
  click('#stageBand [data-flow-target="birthHistoryCard"]');assert.notEqual(grow(3),'0');assert.equal(grow(4),'0');
});

// ── 附加：看範例、清空、核對總覽 ──
test('the example case fills all five stages with a fictional story; reloading asks first',({W,d,get,click,note,status,S})=>{
  click('#loadExample');assert.equal(get('#exampleConfirm').hidden,true,'An empty page loads directly');
  const n=note();
  for(const re of [/34\+2 weeks/,/cesarean section/,/pregnancy-induced hypertension/,/positive-pressure ventilation \(PPV\) was given via Neopuff/i,/PPV was continued via Neopuff, with SpO2 maintained at 95%\./,/admitted to our NICU/,/Maternal chart number: 00000000/])assert.match(n,re);
  assert.doesNotMatch(n,/____/,'Every required blank is filled');
  for(const i of [1,2,3,4])assert.equal(status(i),'完成',`stage ${i}`);
  assert.match(get('#storyLine').textContent,/產前 standby → 出生 → 刀房 PPV → 離開刀房 → 入 NICU/);
  click('#loadExample');assert.equal(get('#exampleConfirm').hidden,false,'Existing data asks inside the page');assert.deepEqual(W.resets,[]);
  click('#exampleConfirmNo');assert.equal(get('#exampleConfirm').hidden,true);
  click('#loadExample');click('#exampleConfirmYes');assert.deepEqual(W.resets,['example'],'Clear by reopening the page, then load');
  click('#resetAll');click('#exampleConfirmYes');assert.deepEqual(W.resets,['example',''],'Clear without loading');
});
test('after a confirmed reload the example loads by itself',({note})=>{assert.match(note(),/34\+2 weeks/);},);

(async()=>{
let failed=0;
for(const [name,run] of tests){
  const opts=name.startsWith('after a confirmed reload')?{session:{nicu_after_reset:'example'}}:{};
  try{await page(run,opts);console.log('✓ '+name);}catch(e){failed++;console.error('✗ '+name+'\n'+e.stack);}
}
console.log(`${tests.length-failed}/${tests.length} story line checks passed`);
if(failed)process.exitCode=1;
})();
