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
  // 2026-10-06：路徑由第 1 區情境卡決定（「調整細節」退役）；standby／會診是時序帶上的可選站。
  const seg=(key,value)=>key==='pathway'?click({direct:'#entryDirect',nursery:'[data-story="C"]',outborn:'[data-story="D"]'}[value]):click(`[data-seg="${key}"] [data-v="${value}"]`);
  const toggle=key=>{const station={pwStandby:'standby',pwConsult:'consult'}[key];
    if(!station)return click(`[data-tog="${key}"] button`);
    click(d.querySelector(`[data-band-opt="${station}"]`)?`[data-band-opt="${station}"]`:`[data-band-opt-remove="${station}"]`);};
  const symptom=value=>click(`[data-msel="obSx"] [data-v="${value}"]`);
  const note=()=>get('#note').textContent.trim();
  const rows=scope=>[...d.querySelectorAll(`#${scope}Events .clinical-event[data-event-id]`)];
  // 出生處置由第 1 區急救階梯長出骨架（NRP 順序）；同一階再做一次才用站內「＋」。
  const LEVEL={o2:'o2',ppv:'ppv',intubation:'ett',compressions:'cpr',epinephrine:'cpr'};
  function add(kind,scope='birth'){
    const before=rows(scope).map(el=>el.dataset.eventId);
    if(scope==='birth'&&kind!=='assessment'&&!rows('birth').some(el=>el.dataset.eventKind===kind))click(`[data-ladder-v="${LEVEL[kind]}"]`);
    else click(`[data-add-${scope}="${kind}"]`);
    const added=rows(scope).filter(el=>!before.includes(el.dataset.eventId)&&el.dataset.eventKind===kind);
    assert.equal(added.length,1,`Adding ${scope} ${kind} must add exactly one identifiable event`);
    return {scope,id:added[0].dataset.eventId};
  }
  const row=event=>get(`#${event.scope}Events .clinical-event[data-event-id="${event.id}"]`);
  function eventInput(event,field,value){
    const el=row(event).querySelector(`[data-event-field="${field}"]`);
    // 2026-10-06：再評估的呼吸與處置反應改成 chips（data-event-choice）；仍是同一個事件欄位。
    if(!el){const chip=row(event).querySelector(`[data-event-choice="${field}"] [data-v="${value}"]`);assert.ok(chip,`Missing ${event.scope} event field: ${field}`);chip.click();return;}
    change(el,value);
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
    input('ap1','8');input('ap5','9');seg('dol','1');
    // 直接入院（standby／會診皆不在故事裡）；各測試仍可用 seg('pathway',…)／toggle(…) 改（見上方對應）。
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

// 2026-10-06 急救階梯：選到哪一階＝依 NRP 順序長出那一階為止的骨架，不多也不少。
for(const [level,required,forbidden] of [
  ['o2',[/supplemental oxygen/i],[ppv,intub,compress,epi]],
  ['ppv',[ppv],[intub,compress,epi]],
  ['ett',[ppv,intub],[compress,epi]],
  ['cpr',[ppv,intub,compress,epi],[]]
])test(`ladder ${level} records exactly its NRP skeleton and nothing beyond`,({click,note})=>{
  click(`[data-ladder-v="${level}"]`);for(const expression of required)assert.match(note(),expression);
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
  assert.match(note(),/positive-pressure ventilation \(PPV\) was given via Neopuff \(FiO2 21%, IP\/PEEP 25\/5 cmH2O\)/i);
  assert.match(get('#birthReview').textContent,/NRP[^。]*尚未核對/);
  eventInput(event,'pip','22');
  assert.ok(!row(event).querySelector('.nrp-hint'),'editing any value removes the default flag');
  assert.match(note(),/IP\/PEEP 22\/5 cmH2O/);assert.doesNotMatch(get('#birthReview').textContent,/尚未核對/);
});
test('accepting the NRP defaults as-is clears the reminder without changing the values',({add,row,note,get})=>{
  const event=add('ppv'), card=row(event);
  assert.match(get('#birthReview').textContent,/尚未核對/);
  card.querySelector('[data-nrp-accept]').click();
  assert.ok(!row(event).querySelector('.nrp-hint'),'the hint is gone after accepting');
  assert.doesNotMatch(get('#birthReview').textContent,/尚未核對/);
  assert.match(note(),/FiO2 21%, IP\/PEEP 25\/5 cmH2O/,'values are kept exactly');
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
  const sentence=note().split(/(?<=\.)\s+/).find(x=>/endotracheal intubation/i.test(x));
  assert.match(sentence,/42/);
  assert.doesNotMatch(sentence,/IP[^.;]*\d|PEEP[^.;]*\d|(?:RR|rate)[^.;]*\d|1:10000/i,'Only the entered FiO2 is written for the intubation');
});

test('epinephrine dose and route require entry rather than an assumed route',({add,eventInput,note,row})=>{
  const event=add('epinephrine');
  for(const field of ['drugDose','drugRoute']){
    const el=row(event).querySelector(`[data-event-field="${field}"]`);
    assert.ok(el,`Missing epinephrine ${field}`);assert.equal(el.value,'');
  }
  const epiSentence=()=>note().split(/(?<=\.)\s+/).find(x=>/epinephrine/i.test(x));
  assert.doesNotMatch(epiSentence(),/1:10000|via (?:the )?ETT|endotracheal(?:ly)?|intravenous(?:ly)?/i,'The epinephrine sentence assumes no dose or route');
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

test('event order follows explicit reorder actions and removal removes only that event',({add,eventAction,eventInput,note,rows,row})=>{
  // 骨架節點（PPV → 插管）依 NRP 固定順序；可移動、可移除的是站內「＋」加的再評估與重複處置。
  const first=add('ppv'),assessment=add('assessment');eventInput(assessment,'hr','91');const again=add('ppv');eventInput(again,'minutes','6');
  assert.equal(row(first).querySelector('[data-event-action]'),null,'The skeleton node itself has no reorder/remove');
  before(note(),/91/,/PPV was given again/);
  eventAction(again,'up');before(note(),/PPV was given again/,/91/);
  eventAction(again,'down');before(note(),/91/,/PPV was given again/);
  eventAction(again,'remove');assert.equal(rows('birth').length,2);
  assert.doesNotMatch(note(),/given again/);assert.match(note(),/91/);assert.match(note(),ppv);
});
test('two separately recorded PPV episodes retain their distinct times',({add,eventInput,note,rows})=>{
  const first=add('ppv');eventInput(first,'minutes','1');
  const assessment=add('assessment');eventInput(assessment,'breathing','spontaneous');
  const second=add('ppv');eventInput(second,'minutes','5');
  assert.equal(rows('birth').length,3);
  before(note(),/At 1 minute of age/i,/spontaneous|spontaneously/i);
  before(note(),/spontaneous|spontaneously/i,/At 5 minutes of age/i);
});

test('explicitly no resuscitation does not erase unconfirmed observations or imply normality',({click,note})=>{
  click('[data-ladder-v="none"]');
  assert.match(note(),/no resuscitation|resuscitation was not|did not (?:receive|require).*resuscitation/i);
  assert.doesNotMatch(note(),/good (?:muscle )?tone|normal (?:muscle )?tone|breathing spontaneously|remained stable/i);
});

test('a reassessment can follow confirmed no resuscitation without becoming an intervention',({click,add,eventInput,get,note})=>{
  click('[data-ladder-v="none"]');
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

test('completed journey stages keep a read-only summary and reopen on demand',({input,get,click})=>{
  input('birthBreathing','apnea');click('[data-stop-toggle="adm"]');input('obAdmissionStatus','Synthetic admission observation');
  const stop=get('li[data-stop="adm"]');
  assert.ok(!stop.classList.contains('closed'),'the explicitly selected stage stays active');
  click('[data-stop-toggle="route"]');
  const sum=stop.querySelector('.sum');
  assert.ok(stop.classList.contains('closed'),'selecting another stage closes it into a summary');
  assert.ok(!sum.isContentEditable,'The carried summary must not create another editable record');
  assert.match(sum.textContent,/Synthetic admission observation/);
  click('[data-stop-toggle="adm"]');
  assert.ok(!stop.classList.contains('closed'),'Reopening a stage must reveal its fields in the fixed workspace');
  assert.equal(stop.querySelector('.sum').textContent,'正在填寫');
  assert.ok(get('#birthHistoryCard').contains(get('#birthBreathing')),'Birth history is independently accessible');
  assert.equal(get('#birthBreathing').value,'apnea');
});

test('editing never changes stage; only explicit navigation moves forward or backward',({get,input,click})=>{
  const birth=get('li[data-stop="route"]');
  assert.ok(!birth.classList.contains('closed'),'the first empty stop starts open');
  const dr=get('li[data-stop="adm"]');
  input('obCourse','The infant continued to breathe spontaneously.');
  assert.ok(!birth.classList.contains('closed'),'entering data must not collapse the stop being edited');
  assert.ok(dr.classList.contains('closed'),'while a stop is being edited, the next stop must not auto-open');
  input('birthTone','good');
  assert.ok(!birth.classList.contains('closed'),'further edits keep it open');
  click('#journeyNext');
  assert.ok(birth.classList.contains('closed'),'the next button moves away from the current stage');
  assert.match(birth.querySelector('.sum').textContent,/continued to breathe/);
  assert.ok(!dr.classList.contains('closed'),'the next stage opens explicitly');
  click('#journeyPrev');
  assert.ok(!birth.classList.contains('closed'),'the previous button returns to the exact prior stage');
});

test('story B: the delivery-room consultation is narrated after the birth observation and before treatment',({toggle,input,add,note,get,eventInput})=>{
  toggle('pwConsult');input('pwConsultReason','grunting');input('pwConsultH','0.2');
  input('birthBreathing','labored');const ppv=add('ppv');
  const text=note();
  before(text,/At birth, the infant had labored breathing/,/Apgar scores were/);
  before(text,/Apgar scores were/,/consulted in the delivery room .*?because of grunting/);
  before(text,/consulted in the delivery room/,/positive-pressure ventilation \(PPV\) was given/i);
  assert.equal((text.match(/was consulted/g)||[]).length,1,'the consultation is stated once');
  input('pwConsultH','2');eventInput(ppv,'minutes','1');
  assert.match(get('#pathwayReview').textContent,/會診時間晚於第一個產房處置/);
});
test('Admission and Acceptance narrate the delivery room in the same order: observation, Apgar, treatment, reassessment',({input,add,note,get,click})=>{
  input('birthBreathing','apnea');input('ap1','4');input('ap5','7');add('ppv');input('birthFinalMin','10');input('birthFinalBreathing','spontaneous');
  const adm=note();
  before(adm,/At birth, the infant was apneic/,/Apgar scores were 4 and 7/);
  before(adm,/Apgar scores were 4 and 7/,/positive-pressure ventilation \(PPV\) was given/i);
  before(adm,/positive-pressure ventilation \(PPV\) was given/i,/On reassessment at 10 minutes of age/);
  click('[data-tab="acc"]');const acc=note();
  before(acc,/At birth, the infant was apneic/,/Apgar scores were 4 and 7/);
  before(acc,/Apgar scores were 4 and 7/,/positive-pressure ventilation \(PPV\) was given/i);
  before(acc,/positive-pressure ventilation \(PPV\) was given/i,/On reassessment at 10 minutes of age/);
});
test('the journey stepper keeps exactly one explicit stage active',({get,input,click})=>{
  const birth=get('li[data-stop="route"]'),dr=get('li[data-stop="adm"]');
  input('obCourse','The infant was observed before admission.');
  assert.ok(!birth.classList.contains('closed'));assert.ok(dr.classList.contains('closed'));
  click('[data-stop-toggle="adm"]');
  assert.ok(!dr.classList.contains('closed'),'opening the selected stage');
  assert.ok(birth.classList.contains('closed'),'the previous stop collapses');
  assert.match(birth.querySelector('.sum').textContent,/observed before admission/);
  input('birthResusStatus','none');
  assert.ok(!dr.classList.contains('closed'));assert.ok(birth.classList.contains('closed'));
  const openCount=[...get('#journey').querySelectorAll('li')].filter(li=>!li.hidden&&!li.classList.contains('closed')).length;
  assert.equal(openCount,1,'only the explicitly selected stage is active');
  assert.equal(get('#journeyStage').textContent.includes('入院'),true,'the sticky progress label names the active stage');
});
test('the admission stop is labelled 入院 until a destination is chosen',({get,click})=>{
  click('[data-seg="dest"] [data-v="NICU"]');assert.equal(get('li[data-stop="adm"] .t').textContent,'入 NICU');
  click('[data-clear-seg="dest"]');assert.equal(get('li[data-stop="adm"] .t').textContent,'入院');
});

test('confirmed continuing PPV is a continuation, not another administration',({add,input,seg,note})=>{
  add('ppv');input('birthFinalSupport','ppv');
  seg('obRespType','ppv');   // 2026-10-06：離開產房與入院前同為 PPV ⇒ 推導為持續，不再另問關係
  const text=note();
  assert.match(text,/continu(?:ed|ing)/i);
  assert.equal((text.match(/the infant received positive[- ]pressure ventilation(?: \(PPV\))?|(?:positive[- ]pressure ventilation|PPV)[^.]*was (?:provided|initiated|administered|given)/gi)||[]).length,1,
    'Continuing the same PPV must not generate a second initiation');
  assert.doesNotMatch(text,/again|reinitiated|restarted/i);
});

test('a newly recorded later PPV episode is not removed as duplicate birth care',({add,input,seg,symptom,note})=>{
  add('ppv');input('birthFinalSupport','room');
  seg('pathway','nursery');symptom('apnea');seg('pwOnset','recurrent');
  input('pwOnsetH','2');input('pwOnsetUnit','hours');
  seg('obRespType','ppv');   // 離開產房 room air、BR 又上 PPV ⇒ 推導為新開始
  const text=note();assert.match(text,/recurr|again|repeat|reinitiated|restarted/i);assert.match(text,/During observation in the baby room, apnea recurred[^.]*\. Positive-pressure ventilation \(PPV\) was initiated\./);
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
  // 2026-10-06：先選 C（情境卡會重設 A/B 旗標），再在帶子上把 standby／會診加進故事。
  seg('pathway','nursery');toggle('pwStandby');input('pwSbRIn','synthetic antenatal indication');
  symptom('tachypnea');seg('pwOnset','developed');
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

test('outside care, transport-team arrival, transport and hospital admission retain separate stages',({seg,input,note})=>{
  seg('pathway','outborn');input('obCourse','Synthetic transport observation');
  seg('obM1Type','cpap');   // 2026-10-06：外院到場時掛什麼＝我方到場一題
  input('obArrival','Synthetic assessment at referring hospital');
  seg('obRespType','ett');
  input('obAdmissionStatus','Synthetic assessment on hospital admission');
  const text=note();
  before(text,/On our team's arrival at the referring hospital, the infant was receiving CPAP/,/Synthetic assessment at referring hospital/);
  assert.match(text,/respiratory support was changed to mechanical ventilation via an endotracheal tube during transport/i,'Different arrival and transport support is derived as a change');
  before(text,/Synthetic assessment at referring hospital/,/Synthetic transport observation/);
  before(text,/Synthetic transport observation/,/Synthetic assessment on hospital admission/);
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

test('support without a recorded predecessor is described, never linked to past care',({seg,note})=>{
  seg('obRespType','ppv');
  assert.match(note(),/the infant was receiving positive-pressure ventilation \(PPV\) before admission/i);
  assert.doesNotMatch(note(),/continued|remained on|previously (?:received|required)|at birth[^.]*positive[- ]pressure ventilation/i);
});
test('a conflicting final birth state prevents a false continuation of an older treatment',({add,input,seg,note})=>{
  add('ppv');input('birthFinalSupport','room');
  seg('obRespType','ppv');
  assert.doesNotMatch(note(),/PPV[^.]*continued|positive[- ]pressure ventilation[^.]*continued|continued[^.]*(?:PPV|positive[- ]pressure ventilation)/i);
  assert.match(note(),/weaned to room air/i);assert.match(note(),/PPV was initiated before admission|positive-pressure ventilation \(PPV\) was initiated before admission/i,'Room air then PPV is derived as a new start');
});
test('editing the previous station re-derives continuity at once',({input,seg,note})=>{
  input('birthFinalSupport','ppv');seg('obRespType','ppv');
  assert.match(note(),/positive[- ]pressure ventilation[^.]*continued/i);
  input('birthFinalSupport','cpap');
  assert.doesNotMatch(note(),/(?:positive[- ]pressure ventilation|PPV)[^.]*continued before admission/i);
  assert.match(note(),/respiratory support was changed to positive-pressure ventilation/i);
  assert.match(note(),/CPAP/i,'The amended birth observation must remain recorded');
  seg('obRespType','cpap');
  assert.match(note(),/CPAP[^.]*continued/i,'Matching values establish the revised continuity');
});
test('stopping is written from the next station value and follows the current previous support',({input,seg,note})=>{
  input('birthFinalSupport','ppv');seg('obRespType','room');
  assert.match(note(),/switched from positive-pressure ventilation \(PPV\) to room air before admission/i);
  input('birthFinalSupport','cpap');
  assert.doesNotMatch(note(),/switched from positive-pressure ventilation/i,'No stale stop target survives');
  assert.match(note(),/switched from CPAP to room air before admission/i);assert.doesNotMatch(note(),/discontinued/i);
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
  assert.equal(get('[data-seg="obRespType"] [data-v=""]').getAttribute('aria-pressed'),'false','Clearing a mode is an action, not a selected clinical finding');
  assert.equal(get('[data-seg="obRespType"] [data-v=""]').hidden,true);
  assert.doesNotMatch(note(),/43|positive[- ]pressure ventilation|\bPPV\b|room air/i);
  seg('obRespType','ppv');assert.equal(get('#obFiO2').value,'43');assert.match(note(),/43/);
});

test('resetting referring-hospital support does not leak its retained device or flow',({seg,input,note,get})=>{
  seg('pathway','outborn');seg('obM1Type','o2');seg('obM1Dev','hood');input('obM1Flow','7.5');
  assert.match(note(),/oxygen hood/i);assert.match(note(),/7\.5/);
  seg('obM1Type','');
  assert.equal(get('[data-seg="obM1Type"] [data-v=""]').getAttribute('aria-pressed'),'false','No selected finding after clearing');
  assert.equal(get('[data-seg="obM1Type"] [data-v=""]').hidden,true);
  assert.doesNotMatch(note(),/oxygen hood|supplemental oxygen|7\.5|room air/i);
  seg('obM1Type','o2');assert.equal(get('#obM1Flow').value,'7.5');assert.match(note(),/7\.5/);
});

test('changed support does not invent improvement, deterioration or a clinical reason',({input,seg,note})=>{
  input('birthFinalSupport','ppv');seg('obRespType','cpap');
  assert.match(note(),/CPAP|continuous positive airway pressure/i);
  assert.doesNotMatch(note(),/improv|deteriorat|stabili[sz]|because[^.]*CPAP|therefore[^.]*CPAP/i);
});

test('an unrecorded next station says nothing about stopping, room air or recovery',({input,seg,note})=>{
  input('birthFinalSupport','ppv');
  assert.doesNotMatch(note(),/stopped|discontinued|cessation|room air before admission|improv|recover|stable/i);
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

// 預覽唯讀（2026-09-24 Ryan）：對 #note 互動過後，出生與路徑的變更仍要立刻反映。
test('birth and pathway editing rewrite the read-only preview immediately',({W,d,get,input,add,seg,note})=>{
  get('#note').dispatchEvent(new W.Event('input',{bubbles:true}));
  input('birthBreathing','apnea');add('ppv');seg('pathway','nursery');
  input('obCourse','Synthetic new course detail');
  assert.match(note(),/Synthetic new course detail/);assert.match(note(),ppv);
  assert.equal(d.getElementById('regen'),null,'The apply button must be gone');
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
