// Synthetic records only. Review links navigate; they must never attest or change facts.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(__dirname+'/../../index.html','utf8');
assert.equal(source.split('function render(){').length,2);
const html=source.replace('function render(){','window.reviewTest={S,render,goToReviewTarget}; function render(){');
const tests=[];
const test=(name,check)=>tests.push([name,()=>{
  const errors=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-review.test/',beforeParse(W){
    W.scrollTo=()=>{};
    W.addEventListener('error',e=>errors.push(String(e.error?.message||e.message)));
  }});
  const W=dom.window,d=W.document;
  const get=selector=>{const el=d.querySelector(selector);assert.ok(el,`Missing ${selector}`);return el;};
  const click=selector=>get(selector).click();
  const input=(id,value)=>{const el=get('#'+id);el.value=value;el.dispatchEvent(new W.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
  const seg=(key,value)=>click(`[data-seg="${key}"] [data-v="${value}"]`);
  const story=key=>click(`[data-story="${key}"]`);
  const stage=key=>click(`[data-stop-toggle="${key}"]`);
  const note=()=>get('#note').textContent;
  const state=()=>JSON.stringify(W.reviewTest.S,(key,value)=>['journeyStep','journeyOpen'].includes(key)?undefined:value);
  const link=(selector,host='#workflowReview')=>{
    const button=[...get(host).querySelectorAll('[data-review-target]')].find(b=>b.dataset.reviewTarget===selector);
    assert.ok(button,`No review link to ${selector} in ${host}`);return button;
  };
  const jump=(selector,{host='#workflowReview',expected=selector}={})=>{
    click('[data-flow-target="finalReviewCard"]');
    const before=note(),facts=state();link(selector,host).click();
    assert.equal(d.activeElement,get(expected),'Focus the exact field, not a section heading');
    assert.equal(get(expected).closest('[hidden]'),null,'No hidden ancestor');
    for(let p=get(expected).parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')assert.equal(p.open,true,'Open enclosing details');
    assert.equal(get(expected).classList.contains('review-target-flash'),true);
    assert.equal(get('#reviewJumpBar').hidden,false);
    assert.equal(note(),before,'Jump preserves the generated note');
    assert.equal(state(),facts,'Jump preserves clinical state');
  };
  const readmit=(problems=['respiratory'])=>{
    story('E');seg('dest','NBC');seg('readmitSource','clinic');
    input('birthDate','2026-09-15');input('admissionDate','2026-10-02');
    for(const value of problems)click(`[data-msel="readmitProblems"] [data-v="${value}"]`);
  };
  try{check({W,d,get,click,input,seg,story,stage,note,state,link,jump,readmit});assert.deepEqual(errors,[],'No page errors');}
  finally{W.close();}
}]);

test('every fresh review item has an accessible, valid target without forcing choices',({d,get,jump})=>{
  const items=[...d.querySelectorAll('#workflowReview .review-item')];assert.equal(items.length,15);
  for(const item of items){const link=item.querySelector('button');assert.ok(link);assert.equal(link.type,'button');assert.match(link.getAttribute('aria-label'),/前往修改：第 [1-5] 區/);assert.ok(get(link.dataset.reviewTarget));}
  const targets=[...new Set([...d.querySelectorAll('#workflowReview [data-review-target]')].map(b=>b.dataset.reviewTarget))];
  for(const target of targets)jump(target);
  assert.equal(d.querySelector('#entryRoutes [aria-checked="true"]'),null);
});

test('GA range warning names GA and navigates to the actual week input',({get,input,jump})=>{
  input('gaW','99');assert.match(get('#reviewConflictList').textContent,/妊娠週數 GA（週）：數值/);
  jump('#gaW');assert.equal(get('#flowChapter').textContent,'出生資料');
  input('gaW','39');assert.doesNotMatch(get('#reviewConflictList').textContent,/GA（週）：數值/);
});

test('admission date and time expand closed date details, including inline hints',({get,input,jump,click})=>{
  input('birthDate','2026-10-02');input('admissionDate','2026-10-01');
  assert.equal(get('#admissionDateDetails').open,false);jump('#admissionDate');
  input('admissionDate','2026-10-02');input('birthTime','13:00');input('admissionTime','12:00');
  get('#admissionDateDetails').open=false;jump('#admissionTime',{host:'#contextReview'});
  input('admissionTime','14:00');click('#returnToReview');assert.equal(get('#flowChapter').textContent,'核對病歷');
  assert.equal(get('#reviewJumpBar').hidden,true);assert.doesNotMatch(get('#reviewConflictList').textContent,/早於/);
});

test('manual DOL conflict focuses the manual value without enabling automatic mode',({get,input,click,jump})=>{
  input('birthDate','2026-09-15');input('admissionDate','2026-10-02');
  click('#dolManual');click('[data-seg="dol"] [data-v="x"]');input('dolOther','8');
  jump('#dolOther');assert.match(get('#reviewConflictList').textContent,/手動 DOL 8.*DOL 18/);
});

test('E symptom onset mounts the parked illness stage and clears old markers when navigating away',({get,readmit,input,stage,jump,click})=>{
  readmit();input('rm_respiratory_onset','25');stage('evaluation');
  assert.equal(get('#rm_respiratory_onset').closest('details').open,false);
  jump('#rm_respiratory_onset');assert.match(get('#flowDetail').textContent,/症狀與變化.*2\/3/);
  assert.ok(get('#journeyWorkspace').contains(get('#rm_respiratory_onset')));
  stage('evaluation');assert.equal(get('#reviewJumpBar').hidden,true);assert.equal(get('#rm_respiratory_onset').classList.contains('review-target-flash'),false);
  jump('#rm_respiratory_onset');click('[data-tab="acc"]');click('[data-tab="adm"]');assert.equal(get('#reviewJumpBar').hidden,true);
});

test('E prior discharge, common onset, evaluation weight and support land in the right stages',({get,readmit,input,stage,jump})=>{
  readmit();input('readmitDischargeDate','2026-09-14');input('readmitOnsetDOL','25');stage('evaluation');
  jump('#readmitDischargeDate');assert.match(get('#flowDetail').textContent,/出院與返家基準/);
  jump('#readmitOnsetDOL');assert.match(get('#flowDetail').textContent,/症狀與變化/);
  jump('#readmitCurrentWeight');assert.match(get('#flowDetail').textContent,/評估與收治/);
  jump('[data-seg="resp"]');assert.match(get('#flowDetail').textContent,/評估與收治/);
});

test('E fever and screening warnings navigate to their own modules, not bilirubin',({get,readmit,input,stage,jump})=>{
  readmit(['fever','abnormal-screen']);input('rm_fever_time','2026-10-03T10:00');input('rm_screen_date','2026-09-14');stage('prior');
  jump('#rm_fever_time');jump('#rm_screen_date');
  assert.equal(get('#readmitBiliWrap').hidden,true);
});

test('E jaundice optional results and legacy conflicting signs have concrete targets',({W,get,readmit,jump})=>{
  readmit(['jaundice']);W.reviewTest.S.readmitJaundiceSigns=['no dark urine','dark urine'];W.reviewTest.render();
  jump('[data-msel="readmitJaundiceSigns"]');jump('#readmitTSB');
  assert.match(get('#flowDetail').textContent,/評估與收治/);
});

test('missing performed actions focuses the add-action group without adding a procedure',({get,story,input,jump})=>{
  story('A');input('birthResusStatus','performed');jump('#birthActionsWrap .event-add');
  assert.equal(get('#birthEvents').children.length,0);
  assert.match(get('#reviewPendingList').textContent,/補上實際處置/);
});

test('several epinephrine events expose separate dose and route links with stable event IDs',({d,get,story,click,jump,input,link})=>{
  story('A');click('[data-add-birth="epinephrine"]');click('[data-add-birth="epinephrine"]');
  const ids=[...d.querySelectorAll('#birthEvents .clinical-event')].map(e=>e.dataset.eventId);
  for(const id of ids)for(const field of ['drugDose','drugRoute'])jump(`#event-${id}-${field}`);
  const stableId=link(`#event-${ids[1]}-drugRoute`).id;
  click(`[data-event-id="${ids[1]}"] [data-event-action="up"]`);
  assert.equal(link(`#event-${ids[1]}-drugRoute`).id,stableId);assert.match(link(`#event-${ids[1]}-drugRoute`).textContent,/第 1 筆/);
  jump(`#event-${ids[1]}-drugRoute`);input(`event-${ids[1]}-drugRoute`,'synthetic route');
  assert.equal(d.querySelector(`#${stableId}`),null,'Resolved field loses its link without rebinding its id');
  assert.ok(link(`#event-${ids[0]}-drugRoute`));
});

test('PPV pending link does not accept suggested settings or reorder resuscitation events',({d,get,story,click,jump,input})=>{
  story('A');click('[data-add-birth="ppv"]');click('[data-add-birth="assessment"]');
  const ids=[...d.querySelectorAll('#birthEvents .clinical-event')].map(e=>e.dataset.eventId);
  jump(`#event-${ids[0]}-pip`);assert.ok(get(`[data-nrp-accept="${ids[0]}"]`));
  input(`event-${ids[0]}-minutes`,'5');input(`event-${ids[1]}-minutes`,'2');jump(`#event-${ids[1]}-minutes`);
  input('birthFinalMin','1');jump('#birthFinalMin');
  input('birthInitialNote','No resuscitation was required.');jump('#birthInitialNote');
});

test('C missing findings mounts the nursery evaluation without claiming normal results',({get,story,click,stage,jump})=>{
  story('C');click('[data-msel="brWorkup"] button');stage('adm');
  jump('[data-msel="brFindings"]');assert.match(get('#flowDetail').textContent,/兒科評估/);
  assert.equal(get('[data-msel="brFindings"]').querySelector('[aria-pressed="true"]'),null);
});

test('D origin and unconfirmed continued support mount the correct stage',({get,story,input,stage,jump})=>{
  story('D');input('obTransferFrom',get('#homeHosp').value);input('obM1Relation','continued');stage('adm');
  jump('#obTransferFrom');assert.match(get('#flowDetail').textContent,/外院處置/);
  jump('#obM1Relation');assert.match(get('#flowDetail').textContent,/外院處置/);
});

test('legacy missing screening opens the collapsed screening card without marking a result',({W,get,click,jump})=>{
  W.reviewTest.S.scr.hiv='na';W.reviewTest.render();
  const section=get('#screen').closest('.section-content'),toggle=get('#'+section.getAttribute('aria-labelledby'));
  if(!section.hidden)toggle.click();
  jump('.scr-row[data-scr="hiv"]');assert.equal(section.hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');
  assert.equal(W.reviewTest.S.scr.hiv,'na');assert.equal(get('#flowChapter').textContent,'產前資料');
});

test('review buttons remain unique and preserve focus while another item is resolved',({d,get,input,link,click})=>{
  const id=link('#bw').id;link('#bw').focus();input('gaW','39');
  assert.equal(link('#bw').id,id);assert.equal(d.activeElement.id,id);
  const ids=[...d.querySelectorAll('[id]')].map(e=>e.id);assert.equal(ids.length,new Set(ids).size);
  click('#'+id);input('bw','3100');click('#returnToReview');
  assert.equal(get('#flowChapter').textContent,'核對病歷');assert.equal(d.activeElement,get('#finalReviewCard .sec-h'));
});

test('stale hidden or removed targets do not enable modules, restore deleted events or switch routes',({W,get,story,readmit,input,click,note,state})=>{
  readmit();input('rm_respiratory_onset','25');click('[data-msel="readmitProblems"] [data-v="respiratory"]');
  let before=note(),facts=state();W.reviewTest.goToReviewTarget('#rm_respiratory_onset','舊提示');
  assert.match(get('#reviewJumpStatus').textContent,/隱藏或移除/);assert.equal(state(),facts);assert.equal(note(),before);
  W.reviewTest.goToReviewTarget('#event-999-drugDose','舊事件');assert.equal(state(),facts);
  story('C');before=note();facts=state();W.reviewTest.goToReviewTarget('#readmitDischargeDate','舊情境');
  assert.equal(get('#entryRoutes'),W.document.activeElement);assert.equal(state(),facts);assert.equal(note(),before);
});

let failures=0;
for(const [name,run] of tests){try{run();console.log('✓ '+name);}catch(error){failures++;console.error('✗ '+name+'\n'+error.stack);}}
console.log(`${tests.length-failures}/${tests.length} review navigation checks passed`);
process.exitCode=failures?1:0;
