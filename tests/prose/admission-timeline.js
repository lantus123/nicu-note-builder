// Synthetic birth-to-admission histories. Every interaction must reach a real control.
// These checks verify documentation semantics, not clinical treatment recommendations.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');

function withPage(check){
  const errors=[];
  const dom=new JSDOM(html,{
    runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-timeline.test/',
    beforeParse(W){
      const RealDate=W.Date,fixed=new RealDate(2026,7,30,12).getTime();
      W.Date=class extends RealDate{
        constructor(...args){super(...(args.length?args:[fixed]));}
        static now(){return fixed;}
      };
      W.scrollTo=()=>{};
      W.HTMLElement.prototype.scrollIntoView=()=>{};
      W.addEventListener('error',e=>errors.push(String(e.error?.message||e.message)));
    }
  });
  const W=dom.window,d=W.document;
  function get(selector){
    const el=d.querySelector(selector);assert.ok(el,`Missing control: ${selector}`);return el;
  }
  function change(el,value){
    assert.ok(!el.readOnly&&!el.disabled,`Control must be editable: ${el.id||el.outerHTML}`);
    if(el.tagName==='SELECT')assert.ok([...el.options].some(o=>o.value===value),
      `Missing option ${JSON.stringify(value)} in ${el.id||el.dataset.eventField}`);
    el.value=value;
    el.dispatchEvent(new W.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));
  }
  const click=selector=>get(selector).click();
  const input=(id,value)=>change(get(`#${id}`),value);
  const seg=(key,value)=>click(`[data-seg="${key}"] [data-v="${value}"]`);
  const toggle=key=>click(`[data-tog="${key}"] button`);
  const symptom=value=>click(`[data-msel="obSx"] [data-v="${value}"]`);
  const note=()=>get('#note').textContent.trim();
  const rows=scope=>[...d.querySelectorAll(`#${scope}Events .clinical-event[data-event-id]`)];
  function add(kind,scope='birth'){
    if(scope==='birth'&&kind!=='assessment'&&get('#birthResusStatus').value!=='performed')input('birthResusStatus','performed');
    const before=rows(scope).map(el=>el.dataset.eventId);
    click(`[data-add-${scope}="${kind}"]`);
    const added=rows(scope).filter(el=>!before.includes(el.dataset.eventId));
    assert.equal(added.length,1,`Adding ${scope} ${kind} must add exactly one identifiable event`);
    return {scope,id:added[0].dataset.eventId};
  }
  const row=event=>get(`#${event.scope}Events .clinical-event[data-event-id="${event.id}"]`);
  function eventInput(event,field,value){
    const el=row(event).querySelector(`[data-event-field="${field}"]`);
    assert.ok(el,`Missing ${event.scope} event field: ${field}`);change(el,value);
  }
  function eventAction(event,action){
    const el=row(event).querySelector(`[data-event-action="${action}"]`);
    assert.ok(el,`Missing ${event.scope} event action: ${action}`);el.click();
  }
  const warnings=()=>['birthReview','pathwayReview'].map(id=>{
    const el=get(`#${id}`);return el.hidden?'':el.textContent;
  }).join(' ');
  const api={W,d,get,click,input,seg,toggle,symptom,note,rows,add,row,eventInput,eventAction,warnings};
  try{
    seg('gender','female');input('gaW','39');input('gaD','0');input('bw','3200');
    seg('delivery','nsd');input('gravida','2');input('para','1');input('matAge','31');
    input('ap1','8');input('ap5','9');seg('dol','0');
    // 2026-09-20 故事優先：第 5＋6 區合併成時間線，pathway 不再預設。這裡用「調整細節」裡的路徑開關
    // 直接選 direct（等同舊預設：直接入院、standby／會診皆關），讓各站出現又不動到兩個開關；
    // 各測試仍可用 seg('pathway',…)／toggle(…) 自行改，控制項 id／data-* 與以前相同。
    seg('pathway','direct');
    check(api);
    assert.deepEqual(errors,[],'Birth/admission interactions must not raise page errors');
  }finally{W.close();}
}

const tests=[];
const test=(name,check)=>tests.push([name,()=>withPage(check)]);
function before(text,first,second){
  const a=text.search(first),b=text.search(second);
  assert.ok(a>=0,`Missing first event ${first}\n${text}`);
  assert.ok(b>=0,`Missing second event ${second}\n${text}`);
  assert.ok(a<b,`Wrong event order: ${first} must precede ${second}\n${text}`);
}
const ppv=/positive[- ]pressure ventilation|\bPPV\b/i;
const intub=/intubat|endotracheal tube|mechanical ventilation/i;
const compress=/chest compressions/i;
const epi=/epinephrine/i;

test('unrecorded initial and final observations remain unknown',({get,note})=>{
  for(const id of ['birthBreathing','birthTone','birthHR','birthInitialNote','birthResusStatus',
    'birthFinalBreathing','birthFinalTone','birthFinalHR','birthFinalMin','birthFinalSupport','birthFinalNote'])
    assert.equal(get(`#${id}`).value,'',`${id} must not assert an unconfirmed default`);
  assert.doesNotMatch(note(),/good (?:muscle )?tone|normal (?:muscle )?tone|breathing spontaneously|spontaneous breathing|no resuscitation|resuscitation was not required|heart rate (?:was |of )?\d|remained stable/i);
});

test('initial observations precede actual treatments and final observations follow them',page=>{
  const {input,add,eventInput,note}=page;
  input('birthBreathing','apnea');input('birthTone','poor');input('birthHR','78');
  input('birthInitialNote','Synthetic initial observation');
  const event=add('ppv');eventInput(event,'fiO2','24');
  input('birthFinalBreathing','spontaneous');input('birthFinalTone','good');input('birthFinalHR','146');
  input('birthFinalMin','4');input('birthFinalNote','Synthetic final observation');
  const text=note();
  before(text,/apne(?:a|ic)/i,ppv);before(text,/Synthetic initial observation/,ppv);
  before(text,ppv,/Synthetic final observation/);
  assert.match(text,/78/);assert.match(text,/146/);assert.match(text,/poor (?:muscle )?tone/i);
  assert.match(text,/spontaneous|spontaneously/i);
  assert.doesNotMatch(text,/after (?:the )?Apgar|following (?:the )?Apgar|Apgar[^.]*therefore/i);
});

for(const [kind,required,forbidden] of [
  ['ppv',ppv,[intub,compress,epi]],
  ['intubation',intub,[ppv,compress,epi]],
  ['compressions',compress,[ppv,intub,epi]],
  ['epinephrine',epi,[ppv,intub,compress]]
])test(`${kind} records only the selected intervention, without a cumulative ladder`,({add,note})=>{
  add(kind);assert.match(note(),required);
  for(const expression of forbidden)assert.doesNotMatch(note(),expression);
});

// 2026-09-20 Ryan：產房急救 PPV 依 NRP 第 9 版預設帶入（≥32 週 PIP 25／PEEP 5；≥35 週 FiO₂ 21%），
// 帶入即標示、改任一值即視為實際紀錄；時間仍空白；其他事件（插管等）與 course 範圍的 PPV 不帶預設。
test('a new birth PPV carries NRP 9th-edition initial settings, flagged until edited; timing stays blank',({add,row,eventInput,note,get})=>{
  const event=add('ppv'), card=row(event);
  const v=f=>card.querySelector(`[data-event-field="${f}"]`).value;
  assert.equal(v('minutes'),'');assert.equal(v('fiO2'),'21');assert.equal(v('pip'),'25');assert.equal(v('peep'),'5');
  assert.ok(card.querySelector('.nrp-hint'),'the card must say the values are NRP defaults');
  assert.ok(card.querySelector('[data-event-field="pip"]').classList.contains('nrp-default'));
  assert.match(note(),/positive-pressure ventilation \(PPV\) was initiated[^.]*FiO2 21%[^.]*PIP 25 cmH2O[^.]*PEEP 5 cmH2O/i);
  assert.match(get('#birthReview').textContent,/NRP[^。]*尚未核對/);
  eventInput(event,'pip','22');
  assert.ok(!row(event).querySelector('.nrp-hint'),'editing any value removes the default flag');
  assert.match(note(),/PIP 22 cmH2O/);assert.doesNotMatch(get('#birthReview').textContent,/尚未核對/);
});
test('accepting the NRP defaults as-is clears the reminder without changing the values',({add,row,note,get})=>{
  const event=add('ppv'), card=row(event);
  assert.match(get('#birthReview').textContent,/尚未核對/);
  card.querySelector('[data-nrp-accept]').click();
  assert.ok(!row(event).querySelector('.nrp-hint'),'the hint is gone after accepting');
  assert.doesNotMatch(get('#birthReview').textContent,/尚未核對/);
  assert.match(note(),/FiO2 21%[^.]*PIP 25 cmH2O[^.]*PEEP 5 cmH2O/,'values are kept exactly');
  assert.equal(row(event).querySelector('[data-event-field="pip"]').value,'25');
});
test('NRP initial oxygen and pressure follow gestational age; course-scope PPV and intubation stay blank',({add,row,input,seg,note})=>{
  input('gaW','30');
  const preterm=add('ppv'), c=row(preterm);
  assert.equal(c.querySelector('[data-event-field="fiO2"]').value,'30');assert.equal(c.querySelector('[data-event-field="pip"]').value,'20');
  input('gaW','33');
  const mid=add('ppv'), m=row(mid);
  assert.equal(m.querySelector('[data-event-field="fiO2"]').value,'30','32–34 週指引 21–30%，Ryan 定統一 30%');assert.equal(m.querySelector('[data-event-field="pip"]').value,'25');
  const tube=add('intubation');
  for(const f of ['fiO2','pip','peep','rr'])assert.equal(row(tube).querySelector(`[data-event-field="${f}"]`).value,'',`intubation ${f} must stay blank`);
  seg('pathway','direct');
  const later=add('ppv','course');
  for(const f of ['fiO2','pip','peep'])assert.equal(row(later).querySelector(`[data-event-field="${f}"]`).value,'',`course PPV ${f} must stay blank`);
});

test('entered PPV timing and individual parameters are retained',({add,eventInput,note})=>{
  const event=add('ppv');
  eventInput(event,'minutes','1');eventInput(event,'fiO2','37');
  eventInput(event,'pip','23');eventInput(event,'peep','6');
  const text=note();assert.match(text,/37/);assert.match(text,/23/);assert.match(text,/6/);
  assert.match(text,/1 minute|1 min\b/i);
});

test('partially entered ventilation settings do not fill in the missing parameters',({add,eventInput,note,row})=>{
  const event=add('intubation');eventInput(event,'fiO2','42');
  for(const field of ['pip','peep','rr']){
    const el=row(event).querySelector(`[data-event-field="${field}"]`);
    assert.ok(el,`Missing intubation ${field}`);assert.equal(el.value,'');
  }
  assert.match(note(),/42/);
  assert.doesNotMatch(note(),/PIP[^.;]*18|PEEP[^.;]*5|(?:RR|rate)[^.;]*40|1:10000/i);
});

test('epinephrine dose and route require entry rather than an assumed route',({add,eventInput,note,row})=>{
  const event=add('epinephrine');
  for(const field of ['drugDose','drugRoute']){
    const el=row(event).querySelector(`[data-event-field="${field}"]`);
    assert.ok(el,`Missing epinephrine ${field}`);assert.equal(el.value,'');
  }
  assert.doesNotMatch(note(),/1:10000|via (?:the )?ETT|endotracheal(?:ly)?|intravenous(?:ly)?/i);
  eventInput(event,'drugDose','synthetic-dose');eventInput(event,'drugRoute','synthetic-route');
  assert.match(note(),/synthetic-dose/);assert.match(note(),/synthetic-route/);
});

test('an intermediate reassessment is narrated between the two recorded treatments',({add,eventInput,note})=>{
  add('ppv');const assessment=add('assessment');
  eventInput(assessment,'breathing','apnea');eventInput(assessment,'tone','poor');
  eventInput(assessment,'hr','91');
  add('intubation');
  before(note(),ppv,/91/);before(note(),/91/,intub);
});

test('event order follows explicit reorder actions and removal removes only that event',({add,eventAction,note,rows})=>{
  const first=add('ppv'),second=add('intubation');
  before(note(),ppv,intub);
  eventAction(second,'up');before(note(),intub,ppv);
  eventAction(second,'down');before(note(),ppv,intub);
  eventAction(first,'remove');assert.equal(rows('birth').length,1);
  assert.doesNotMatch(note(),ppv);assert.match(note(),intub);
});

test('two separately recorded PPV episodes retain their distinct times',({add,eventInput,note,rows})=>{
  const first=add('ppv');eventInput(first,'minutes','1');
  const assessment=add('assessment');eventInput(assessment,'breathing','spontaneous');
  const second=add('ppv');eventInput(second,'minutes','5');
  assert.equal(rows('birth').length,3);
  before(note(),/1 minute|1 min\b/i,/spontaneous|spontaneously/i);
  before(note(),/spontaneous|spontaneously/i,/5 minutes|5 min\b/i);
});

test('explicitly no resuscitation does not erase unconfirmed observations or imply normality',({input,note})=>{
  input('birthResusStatus','none');
  assert.match(note(),/no resuscitation|resuscitation was not|did not (?:receive|require).*resuscitation/i);
  assert.doesNotMatch(note(),/good (?:muscle )?tone|normal (?:muscle )?tone|breathing spontaneously|remained stable/i);
});

test('a reassessment can follow confirmed no resuscitation without becoming an intervention',({input,add,eventInput,get,note})=>{
  input('birthResusStatus','none');
  assert.ok(!get('[data-add-birth="assessment"]').closest('[hidden]'),
    'An assessment must remain reachable without confirming treatment');
  const assessment=add('assessment');eventInput(assessment,'hr','147');
  assert.equal(get('#birthResusStatus').value,'none');
  assert.match(note(),/no resuscitation|resuscitation was not|did not (?:receive|require).*resuscitation/i);
  assert.match(note(),/147/);
  assert.doesNotMatch(note(),/resuscitation was performed|interventions were not specified|positive[- ]pressure ventilation|epinephrine/i);
});

test('a standalone reassessment does not decide whether resuscitation was needed',({add,eventInput,get,note})=>{
  const assessment=add('assessment');eventInput(assessment,'hr','143');
  assert.equal(get('#birthResusStatus').value,'');
  assert.match(note(),/143/);
  assert.doesNotMatch(note(),/no resuscitation|resuscitation was (?:not required|performed)|interventions were not specified/i);
});

test('DOIC of zero minutes is a recorded value, not an empty field',({toggle,input,note})=>{
  toggle('doic');input('doicMin','0');
  assert.match(note(),/(?:DOIC|duration of intact cord|intact cord)[^.]*0\s*(?:minutes?|min\b)/i);
});

test('filled journey stops collapse into a read-only summary that reuses birth data and reopen on demand',({input,get,click})=>{
  input('birthBreathing','apnea');input('birthFinalNote','Synthetic bridge observation');
  const stop=get('li[data-stop="drEnd"]');
  // 2026-09-20：正在填的站會被釘住展開（不再一輸入就收合）；收合是使用者點站名的動作
  assert.ok(!stop.classList.contains('closed'),'a stop that was just edited stays open');
  click('[data-stop-toggle="drEnd"]');
  const sum=stop.querySelector('.sum');
  assert.ok(stop.classList.contains('closed'),'the header click collapses it into a summary');
  assert.ok(!sum.isContentEditable,'The carried summary must not create another editable record');
  assert.match(sum.textContent,/Synthetic bridge observation/);
  click('[data-stop-toggle="drEnd"]');
  assert.ok(!stop.classList.contains('closed'),'Reopening a stop must reveal its fields');
  assert.equal(stop.querySelector('.sum').textContent,'','An open stop shows its fields, not the summary');
  const birth=get('li[data-stop="birth"]');
  if(!birth.classList.contains('closed'))click('[data-stop-toggle="birth"]');   // 剛編輯過的站是釘住展開的，收起才看得到摘要
  assert.match(birth.querySelector('.sum').textContent||'',/Apnea/,'The birth stop summary reuses the recorded observation');
});

test('working inside a journey stop keeps it open instead of collapsing to the next stop',({get,input,click})=>{
  // 2026-09-20 Ryan：「點任一內容即跳下一步驟」。原本一輸入就不再是「現在這站」而被收合。
  const birth=get('li[data-stop="birth"]');
  assert.ok(!birth.classList.contains('closed'),'the first empty stop starts open');
  const dr=get('li[data-stop="dr"]');
  input('birthBreathing','crying');
  assert.ok(!birth.classList.contains('closed'),'entering data must not collapse the stop being edited');
  assert.ok(dr.classList.contains('closed'),'while a stop is being edited, the next stop must not auto-open');
  input('birthTone','good');
  assert.ok(!birth.classList.contains('closed'),'further edits keep it open');
  click('[data-stop-toggle="birth"]');
  assert.ok(birth.classList.contains('closed'),'only the header click collapses it');
  assert.match(birth.querySelector('.sum').textContent,/有哭聲/);
  assert.ok(!dr.classList.contains('closed'),'collapsing the finished stop opens the next empty one');
});

test('confirmed continuing PPV is a continuation, not another administration',({add,input,seg,note})=>{
  add('ppv');input('birthFinalSupport','ppv');
  seg('obRespType','ppv');input('obRespRelation','continued');
  const text=note();
  assert.match(text,/continu(?:ed|ing)/i);
  assert.equal((text.match(/the infant received positive[- ]pressure ventilation(?: \(PPV\))?|(?:positive[- ]pressure ventilation|PPV)[^.]*was (?:provided|initiated|administered)/gi)||[]).length,1,
    'Continuing the same PPV must not generate a second initiation');
  assert.doesNotMatch(text,/again|reinitiated|restarted/i);
});

test('a newly recorded later PPV episode is not removed as duplicate birth care',({add,input,seg,symptom,note})=>{
  add('ppv');input('birthFinalSupport','room');
  seg('pathway','nursery');symptom('apnea');seg('pwOnset','recurrent');
  input('pwOnsetH','2');input('pwOnsetUnit','hours');
  seg('obRespType','ppv');input('obRespRelation','repeat');
  const text=note();assert.match(text,/recurr|again|repeat|reinitiated|restarted/i);
  assert.match(text,/2 hours/i);
  assert.ok((text.match(/positive[- ]pressure ventilation|\bPPV\b/gi)||[]).length>=2,
    'A genuinely later episode must remain in the note');
});

test('new symptoms are not described as persistence',({seg,symptom,input,note})=>{
  seg('pathway','nursery');symptom('tachypnea');seg('pwOnset','developed');
  input('pwOnsetH','2');input('pwOnsetUnit','hours');
  assert.match(note(),/tachypnea[^.]*developed|developed[^.]*tachypnea/i);
  assert.match(note(),/2 hours/i);assert.doesNotMatch(note(),/persisted/i);
});

test('confirmed persistent symptoms are not rewritten as a newly developed episode',({seg,symptom,input,note})=>{
  seg('pathway','nursery');symptom('tachypnea');seg('pwOnset','persisted');
  input('pwOnsetH','3');input('pwOnsetUnit','hours');
  assert.match(note(),/persisted/i);
  assert.doesNotMatch(note(),/tachypnea[^.]*developed|developed[^.]*tachypnea/i);
});

test('an observed symptom without known onset does not gain an invented onset',({seg,symptom,note})=>{
  seg('pathway','nursery');symptom('grunting');seg('pwOnset','observed');
  assert.match(note(),/grunting/i);
  assert.doesNotMatch(note(),/developed[^.]*grunting|grunting[^.]*developed|persisted|24 hours/i);
});

test('an onset number without units does not silently become hours',({seg,symptom,input,note})=>{
  seg('pathway','nursery');symptom('grunting');seg('pwOnset','developed');
  input('pwOnsetH','17');input('pwOnsetUnit','');
  assert.doesNotMatch(note(),/17\s*(?:hours?|minutes?)/i);
});

test('standby and a subsequent consultation coexist with the nursery admission route',({toggle,input,seg,symptom,note})=>{
  toggle('pwStandby');input('pwSbRIn','synthetic antenatal indication');
  seg('pathway','nursery');symptom('tachypnea');seg('pwOnset','developed');
  input('pwOnsetH','2');input('pwOnsetUnit','hours');
  toggle('pwConsult');input('pwConsultReason','synthetic later concern');input('pwConsultH','2');
  const text=note();
  assert.match(text,/stand by|standby/i);assert.match(text,/baby room/i);assert.match(text,/consult/i);
  assert.match(text,/synthetic antenatal indication/);assert.match(text,/synthetic later concern/);
  before(text,/stand by|standby/i,/baby room/i);
  before(text,/baby room/i,/synthetic later concern/);
});

test('hidden standby and consultation reasons are retained without leaking into the narrative',({toggle,input,note})=>{
  toggle('pwStandby');input('pwSbRIn','synthetic standby marker');
  toggle('pwConsult');input('pwConsultReason','synthetic consultation marker');
  toggle('pwStandby');toggle('pwConsult');
  assert.doesNotMatch(note(),/synthetic standby marker|synthetic consultation marker/);
  toggle('pwStandby');toggle('pwConsult');
  assert.match(note(),/synthetic standby marker/);assert.match(note(),/synthetic consultation marker/);
});

test('outside care, transport-team arrival and hospital admission retain separate stages',({seg,input,note})=>{
  seg('pathway','outborn');input('obCourse','Synthetic referring-hospital course');
  seg('obM1Type','cpap');input('obM1Relation','new');
  input('obArrival','Synthetic assessment at referring hospital');
  seg('obRespType','ett');input('obRespRelation','changed');
  input('obAdmissionStatus','Synthetic assessment on hospital admission');
  const text=note();
  before(text,/Synthetic referring-hospital course/,/Synthetic assessment at referring hospital/);
  before(text,/Synthetic assessment at referring hospital/,/Synthetic assessment on hospital admission/);
  assert.match(text,/CPAP|continuous positive airway pressure/i);
  assert.match(text,/transport|transfer/i);
  assert.doesNotMatch(text,/On (?:NICU|hospital) arrival,? Synthetic assessment at referring hospital/i);
});

test('switching routes retains distinct drafts and excludes hidden route-only information',({seg,input,symptom,note,get})=>{
  seg('pathway','nursery');input('obCourse','Synthetic nursery draft');symptom('grunting');
  seg('pathway','outborn');input('obCourse','Synthetic outside draft');
  input('obArrival','Synthetic transport arrival draft');symptom('cyanosis');
  assert.doesNotMatch(note(),/Synthetic nursery draft|grunting/i);
  seg('pathway','direct');input('obCourse','Synthetic direct draft');
  assert.doesNotMatch(note(),/Synthetic nursery draft|Synthetic outside draft|Synthetic transport arrival draft|grunting|cyanosis/i);
  seg('pathway','nursery');
  assert.equal(get('#obCourse').value,'Synthetic nursery draft');
  assert.match(note(),/Synthetic nursery draft/);assert.match(note(),/grunting/i);
  assert.doesNotMatch(note(),/Synthetic outside draft|Synthetic transport arrival draft|Synthetic direct draft|cyanosis/i);
  seg('pathway','outborn');
  assert.equal(get('#obCourse').value,'Synthetic outside draft');
  assert.equal(get('#obArrival').value,'Synthetic transport arrival draft');
  assert.match(note(),/cyanosis/i);
});

test('continued support without a recorded predecessor prompts review rather than creating past care',({seg,input,note,warnings})=>{
  seg('obRespType','ppv');input('obRespRelation','continued');
  assert.ok(warnings().trim(),'Unmatched continuation needs a visible review prompt');
  assert.doesNotMatch(note(),/continued|remained on|previously (?:received|required)|at birth[^.]*positive[- ]pressure ventilation/i);
});

test('a conflicting final birth state prevents a false continuation of an older treatment',({add,input,seg,note,warnings})=>{
  add('ppv');input('birthFinalSupport','room');
  seg('obRespType','ppv');input('obRespRelation','continued');
  assert.ok(warnings().trim(),'A recorded change to room air cannot silently become uninterrupted PPV');
  assert.doesNotMatch(note(),/PPV[^.]*continued|positive[- ]pressure ventilation[^.]*continued|continued[^.]*(?:PPV|positive[- ]pressure ventilation)/i);
  assert.match(note(),/room air/i);
});

test('editing the previously confirmed source invalidates a continuation until it is checked again',({input,seg,note,warnings})=>{
  input('birthFinalSupport','ppv');seg('obRespType','ppv');input('obRespRelation','continued');
  assert.match(note(),/positive[- ]pressure ventilation[^.]*continued/i);
  input('birthFinalSupport','cpap');
  assert.ok(warnings().trim(),'A changed source requires a visible continuity review');
  assert.doesNotMatch(note(),/(?:positive[- ]pressure ventilation|PPV|CPAP)[^.]*continued/i);
  assert.match(note(),/CPAP/i,'The amended birth observation must remain recorded');
  seg('obRespType','cpap');input('obRespRelation','continued');
  assert.match(note(),/CPAP[^.]*continued/i,'A new explicit confirmation may establish the revised continuity');
});

test('a stale stop confirmation cannot silently switch the intervention that was stopped',({input,seg,note,warnings})=>{
  input('birthFinalSupport','ppv');seg('obRespType','ppv');input('obRespRelation','stopped');
  assert.match(note(),/positive[- ]pressure ventilation[^.]*discontinued/i);
  input('birthFinalSupport','cpap');
  assert.ok(warnings().trim(),'Changing the stop target must request renewed confirmation');
  assert.doesNotMatch(note(),/stopped|discontinued/i,
    'The stale relation cannot either retain the old stop or assert a newly stopped CPAP');
  input('obRespRelation','stopped');
  assert.match(note(),/CPAP[^.]*discontinued/i,'Reconfirming uses the now-recorded support');
});

for(const pathway of ['direct','outborn'])test(`${pathway} oxygen without a selected device never assumes an oxygen hood`,({seg,input,note})=>{
  seg('pathway',pathway);
  if(pathway==='outborn'){seg('obM1Type','o2');input('obM1Flow','3.5');}
  seg('obRespType','o2');input('obO2Flow','4.5');
  assert.match(note(),/supplemental oxygen/i);assert.match(note(),/4\.5 L\/min/i);
  if(pathway==='outborn')assert.match(note(),/3\.5 L\/min/i);
  assert.doesNotMatch(note(),/oxygen hood|nasal cannula|face mask/i,
    'A support type and flow do not establish the delivery device');
});

test('resetting later support to unrecorded suppresses its settings without substituting room air',({seg,input,note,get})=>{
  seg('obRespType','ppv');input('obFiO2','43');
  assert.match(note(),/43/);assert.match(note(),ppv);
  seg('obRespType','');
  assert.equal(get('[data-seg="obRespType"] [data-v=""]').getAttribute('aria-pressed'),'true');
  assert.doesNotMatch(note(),/43|positive[- ]pressure ventilation|\bPPV\b|room air/i);
  seg('obRespType','ppv');assert.equal(get('#obFiO2').value,'43');assert.match(note(),/43/);
});

test('resetting referring-hospital support does not leak its retained device or flow',({seg,input,note,get})=>{
  seg('pathway','outborn');seg('obM1Type','o2');seg('obM1Dev','hood');input('obM1Flow','7.5');
  assert.match(note(),/oxygen hood/i);assert.match(note(),/7\.5/);
  seg('obM1Type','');
  assert.equal(get('[data-seg="obM1Type"] [data-v=""]').getAttribute('aria-pressed'),'true');
  assert.doesNotMatch(note(),/oxygen hood|supplemental oxygen|7\.5|room air/i);
  seg('obM1Type','o2');assert.equal(get('#obM1Flow').value,'7.5');assert.match(note(),/7\.5/);
});

test('changed support does not invent improvement, deterioration or a clinical reason',({input,seg,note})=>{
  input('birthFinalSupport','ppv');seg('obRespType','cpap');input('obRespRelation','changed');
  assert.match(note(),/CPAP|continuous positive airway pressure/i);
  assert.doesNotMatch(note(),/improv|deteriorat|stabili[sz]|because[^.]*CPAP|therefore[^.]*CPAP/i);
});

test('stopping a recorded support does not imply room air or recovery',({input,seg,note})=>{
  input('birthFinalSupport','ppv');seg('obRespType','ppv');input('obRespRelation','stopped');
  assert.match(note(),/stopped|discontinued|cessation/i);
  assert.doesNotMatch(note(),/room air|improv|recover|stable/i);
});

test('later course events retain their entered sequence without overwriting the birth history',({input,seg,add,eventInput,eventAction,note,rows})=>{
  input('birthInitialNote','Synthetic birth marker');seg('pathway','nursery');
  const first=add('assessment','course');eventInput(first,'note','Synthetic course assessment');
  const second=add('ppv','course');eventInput(second,'minutes','7');
  assert.equal(rows('course').length,2);
  before(note(),/Synthetic birth marker/,/Synthetic course assessment/);
  before(note(),/Synthetic course assessment/,ppv);
  eventAction(second,'up');before(note(),ppv,/Synthetic course assessment/);
  eventAction(second,'remove');assert.doesNotMatch(note(),ppv);
  assert.match(note(),/Synthetic birth marker/);assert.match(note(),/Synthetic course assessment/);
});

test('later course event lists have separate drafts for each route',({seg,add,eventInput,note,rows})=>{
  seg('pathway','nursery');const event=add('assessment','course');
  eventInput(event,'note','Synthetic nursery event marker');
  seg('pathway','outborn');assert.equal(rows('course').length,0);
  assert.doesNotMatch(note(),/Synthetic nursery event marker/);
  seg('pathway','nursery');assert.equal(rows('course').length,1);
  assert.match(note(),/Synthetic nursery event marker/);
});

test('an assessment with only time, location and a supplemental note retains all three entries',({seg,add,eventInput,note})=>{
  seg('pathway','nursery');const assessment=add('assessment','course');
  eventInput(assessment,'minutes','17');eventInput(assessment,'location','Synthetic observation site');
  eventInput(assessment,'note','Synthetic assessment detail');
  const text=note();assert.match(text,/17 minutes/i);
  assert.match(text,/Synthetic observation site/);assert.match(text,/Synthetic assessment detail/);
  assert.doesNotMatch(text,/good (?:muscle )?tone|breathing spontaneously|remained stable|heart rate (?:was|of)/i);
});

test('undoing a removed course event is available only on the route that owned it',({d,seg,add,eventInput,eventAction,click,note,rows})=>{
  seg('pathway','nursery');const assessment=add('assessment','course');
  eventInput(assessment,'note','Synthetic nursery undo marker');eventAction(assessment,'remove');
  assert.equal(rows('course').length,0);
  assert.ok(d.querySelector('[data-undo-event="course"]'),'A removed event should be recoverable on its own route');
  seg('pathway','outborn');
  assert.equal(d.querySelector('[data-undo-event="course"]'),null,'An undo from another route must not be offered');
  assert.equal(rows('course').length,0);assert.doesNotMatch(note(),/Synthetic nursery undo marker/);
  seg('pathway','nursery');click('[data-undo-event="course"]');
  assert.equal(rows('course').length,1);assert.match(note(),/Synthetic nursery undo marker/);
  seg('pathway','outborn');assert.equal(rows('course').length,0);
  assert.doesNotMatch(note(),/Synthetic nursery undo marker/);
});

test('birth and pathway editing preserve a manually edited preview until explicit regeneration',({W,get,input,add,seg,note,click})=>{
  const manual='Synthetic manually edited admission narrative.\nPreserve this exact second line.';
  get('#note').textContent=manual;get('#note').dispatchEvent(new W.Event('input',{bubbles:true}));
  input('birthBreathing','apnea');add('ppv');seg('pathway','nursery');
  input('obCourse','Synthetic new course detail');
  assert.equal(note(),manual);assert.equal(get('#regen').hidden,false);
  click('#regen');assert.match(note(),/Synthetic new course detail/);assert.match(note(),ppv);
});

test('generated admission remains English narrative without clinical section headings or list scaffolding',({input,add,seg,symptom,note})=>{
  input('birthBreathing','apnea');add('ppv');input('birthFinalBreathing','spontaneous');
  seg('pathway','nursery');symptom('tachypnea');seg('pwOnset','developed');
  input('pwOnsetH','2');input('pwOnsetUnit','hours');
  const text=note();
  assert.doesNotMatch(text,/(?:^|\n)\s*(?:HPI|Assessment|Plan|Birth history|Resuscitation|Admission pathway)\s*:/im);
  assert.doesNotMatch(text,/(?:^|\n)\s*(?:[-*•]|\d+\.)\s/m);
  assert.doesNotMatch(text,/\bhaemorrhage\b|\bfoetal\b|\bpaediatric\b/i);
});

let failures=0;
for(const [name,check] of tests){
  try{check();console.log(`PASS ${name}`);}
  catch(error){failures++;console.error(`FAIL ${name}\n${error.stack}`);}
}
console.log(`${tests.length-failures}/${tests.length} admission timeline checks passed`);
if(failures)process.exitCode=1;
