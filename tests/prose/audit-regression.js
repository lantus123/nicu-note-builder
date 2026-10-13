// Synthetic audit regressions. One DOM, reset for each case; no evidence-directory dependency.
const fs=require('node:fs'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'../..');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(root+'/index.html','utf8');
const expose=['S','render','renderAdm','renderAcc','postnatalNarrative','readmissionNarrative','readmitEpisodes','readmitModuleNarrative','admissionProblems','primaryDx','assessmentText','eventNarrative','maternalAntibioticNarrative','maternalIapStatus','timelineReview','drawEvents','applyLadder','birthCourse','activeReadmitModules','RESP_SX','BREATHING','TONE','SUPPORT','reviewTargets','latestKnownSupport','BREATHING_NOUN','parseRecordedDate'];
const errors=[];
const dom=new JSDOM(source.replace('function render(){',`window.auditAPI={${expose.join(',')}};function render(){`),{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-synthetic-audit.test/',beforeParse(W){const D=W.Date,fixed=new D(2026,9,12,12).getTime();W.Date=class extends D{constructor(...a){super(...(a.length?a:[fixed]));}static now(){return fixed;}};W.scrollTo=()=>{};W.HTMLElement.prototype.scrollIntoView=()=>{};W.addEventListener('error',e=>errors.push(String(e.error?.stack||e.message)));}});
const W=dom.window,d=W.document,A=W.auditAPI,S=A.S;
assert.ok(A,'API injected');
const initial=JSON.parse(JSON.stringify(S));
const fields=[...d.querySelectorAll('input[id],select[id],textarea[id]')].map(e=>[e.id,e.value]);
const get=s=>{const e=d.querySelector(s);if(!e)throw new Error('Missing '+s);return e;};
const raw=(id,v)=>{get('#'+id).value=String(v);};
const reset=(path='direct')=>{Object.assign(S,JSON.parse(JSON.stringify(initial)));for(const [id,v]of fields){const e=d.getElementById(id);if(e)e.value=v;}Object.assign(S,{pathway:path,outborn:path==='outborn',dest:path==='readmit'?'NBC':'NICU',gender:'male',delivery:'nsd',resus:'none',resp:'',mode:'adm'});for(const [id,v]of Object.entries({gaW:39,gaD:0,bw:3200,matAge:31,gravida:2,para:1,ap1:8,ap5:9,birthDate:'2026-10-12',birthTime:'10:00',admissionDate:'2026-10-12',ancPlace:'TPEMMH'}))raw(id,v);raw('birthResusStatus','');if(path==='outborn')raw('obFacility','Example Birth Hospital');if(path==='readmit'){raw('birthDate','2026-09-28');raw('birthHosp','Example Birth Hospital');S.readmitSource='clinic';}
  for(const group of d.querySelectorAll('[data-seg],[data-msel],[data-tog]')){
    const {seg,msel,tog}=group.dataset,k=seg??msel??tog;
    for(const b of group.querySelectorAll('button'))b.setAttribute('aria-pressed',String(seg!==undefined?b.dataset.v===S[k]:msel!==undefined?S[k].includes(b.dataset.v):!!S[k]));
  }
};
const click=s=>{const e=get(s);if(e.disabled!==false)throw new Error('Disabled '+s);e.click();};
const input=(id,v)=>{const e=get('#'+id);e.value=v;e.dispatchEvent(new W.Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));};
const seg=(k,v)=>{click(`[data-seg="${k}"] [data-v="${v}"]`);if(S[k]!==v)throw new Error(`seg did not apply ${k}=${v}`);};
const multi=(k,v)=>{click(`[data-msel="${k}"] [data-v="${v}"]`);if(!S[k].includes(v))throw new Error(`multi did not apply ${k}=${v}`);};
function setupOnly(id,run){
  try{return run();}catch(cause){throw new Error(`Setup ${id}: ${cause.message}`,{cause});}
}

// Remove an id only when its desired-behavior assertions pass. Unexpected passes fail CI.
const KNOWN_FAILING = new Set([]);
// Targets are all zero. Flags inspect generated prose and review conflicts;
// readmission also exercises an unspecified type and a cyanosis-only observation.
const KNOWN_FLAGS = {
  postnatal: {unconfirmed_causal_link_from_nonrespiratory_symptom:0, causal_link_lost_for_respiratory_symptom:0, plural_agreement:0, malformed:0},
  nursery: {opposite_wbc_results_without_timepoints:0, result_attributed_to_unmatched_test:0, unmatched_finding_not_written:0},
  assessment: {mixed_predicate_auxiliary_dropped:0, auxiliary_duplicated:0, plural_agreement:0},
  events: {invented_response:0, grammar:0},
  'admission problem inference': {historic_resuscitation_becomes_current_respiratory_dx:0},
  'course events': {procedure_omitted_from_problem_inference:0},
  readmission: {irrelevant_jaundice:0, irrelevant_transport:0, malformed:0, generic_apnea_label_in_diagnosis:0, apnea_label_mismatch:0},
  'maternal antibiotics': {wrong_iap_classification:0, reversed_course_dates:0, nested_date_range:0, nested_range_without_conflict:0},
};
const MATRIX_CASES = {postnatal:5184, nursery:2080, assessment:1344, events:288,
  'admission problem inference':1728, 'course events':72, readmission:1152, 'maternal antibiotics':108};
const matchIndex=process.argv.indexOf('--match'), match=matchIndex<0?'':process.argv[matchIndex+1];
if(matchIndex>=0&&!match){W.close();throw Error('--match requires a test-name fragment');}
const selected=id=>!match||id.includes(match);
let passed=0,expectedRed=0,failed=0,totalMatrixCases=0;
const registered=new Set();
function test(id,check,setup=()=>{}){
  assert.ok(!registered.has(id),'Duplicate test id: '+id);registered.add(id);
  if(!selected(id))return;
  const errorStart=errors.length;
  let failure;
  let checking=false;
  try{
    const result=setupOnly(id,()=>{reset();return setup();});
    if(typeof check!=='function')throw new Error('Test needs explicit assertions: '+id);
    checks[id]=check;checking=true;checks[id](result);
  }catch(e){failure=e;}
  // Script errors are infrastructure failures, never an expected clinical regression.
  if(errors.length>errorStart){failed++;console.error(`FAIL ${id}: page error: ${errors[errorStart]}`);return;}
  if(failure){
    const message=failure.message.split('\n')[0];
    if(checking&&KNOWN_FAILING.has(id)&&failure.code==='ERR_ASSERTION'){
      expectedRed++;console.log(`EXPECTED-RED ${id}: ${message}`);
    }else{failed++;console.error(`FAIL ${id}: ${failure.stack}`);}
  }else if(KNOWN_FAILING.has(id)){
    failed++;console.error(`UNEXPECTED-PASS ${id}: 請從 KNOWN_FAILING 移除`);
  }else{passed++;console.log(`PASS ${id}`);}
}
const scenarios=new Map();
function capture(id,description,setup){scenarios.set(id,{description,setup});}
function snapshot(){
  A.render();S.mode='adm';A.renderAdm();const adm=get('#note').textContent.trim();
  S.mode='acc';A.renderAcc();const acc=get('#note').textContent.trim();
  S.mode='adm';A.render();
  return JSON.parse(JSON.stringify({adm,acc,
    review:{conflicts:get('#reviewConflictList').textContent.trim(),pending:get('#reviewPendingList').textContent.trim(),missing:get('#reviewMissingList').textContent.trim()},
    reviewTargets:[...A.reviewTargets],
    state:{resus:S.resus,problems:A.admissionProblems(),dx:A.primaryDx()},birthEvents:S.birthEvents,courseEvents:S.courseEvents}));
}
function scenario(id){return setupOnly(id,()=>{reset();scenarios.get(id).setup();return snapshot();});}
function equalOutputs(a,b){
  assert.equal(a.adm,b.adm,'Admission differs between input orders');
  assert.equal(a.acc,b.acc,'Acceptance differs between input orders');
  assert.deepEqual(a.review,b.review,'Review differs between input orders');
}
const includes=(text,phrase,label=phrase)=>assert.ok(text.includes(phrase),'Missing '+label);
const excludes=(text,phrase)=>assert.ok(!text.includes(phrase),'Unexpected '+phrase);
const dxLines=r=>r.adm.split('\n').filter(line=>line.startsWith('# ')).join('\n');
const ppv=/positive-pressure ventilation \(PPV\) was (?:given|initiated|provided)|PPV was (?:given|initiated|provided)/i;
const ett=/endotracheal intubation was performed/i;
function nrp(r){
  const event=r.birthEvents.find(e=>e.kind==='ppv');assert.ok(event,'PPV event exists');
  assert.equal(event.fiO2,'30','PPV FiO2 must be 30');
  assert.equal(event.pip,'20','PPV IP must be 20');assert.equal(event.peep,'5','PPV PEEP must be 5');
  includes(r.adm,'FiO2 30%, IP/PEEP 20/5 cmH2O');
}
const checks={
  nrp_order:r=>{nrp(r);equalOutputs(r,scenario('nrp_ga_first'));},
  nrp_confirm:r=>{
    const event=r.birthEvents.find(e=>e.kind==='ppv');assert.ok(event,'PPV event exists');
    assert.equal(event.fiO2,'40','Edited FiO2 must remain 40');
    assert.equal(event.pip,'20','PPV IP must be 20');assert.equal(event.peep,'5','PPV PEEP must be 5');
    const pending=r.review.pending.split(/[。.!?\n]/).filter(sentence=>/PPV/.test(sentence)&&/核對|確認/.test(sentence)).join('\n');
    assert.match(pending,/\bIP\b/,'Unconfirmed IP must remain in PPV pending review');
    assert.match(pending,/\bPEEP\b/,'Unconfirmed PEEP must remain in PPV pending review');
    assert.doesNotMatch(pending,/FiO(?:₂|2)/,'Edited FiO2 must not remain in PPV pending review');
  },
  nrp_ga_first:nrp,
  ladder_ett:r=>assert.match(r.adm,ett,'Intubation sentence remains'),
  ladder_cpr:r=>{
    assert.match(r.adm,ppv,'PPV sentence remains');assert.match(r.adm,ett,'Intubation sentence remains');
    includes(r.adm,'Chest compressions were initiated');assert.match(r.adm,/epinephrine was administered/i,'Epinephrine sentence remains');
  },
  cause:r=>{for(const text of [r.adm,r.acc]){
    excludes(text,'Because jaundice persisted');includes(text,'jaundice persisted');includes(text,'Supplemental oxygen was initiated');
  }},
  lab_map:r=>{
    for(const text of [r.adm,r.acc]){
      excludes(text,'which showed hypoglycemia');includes(text,'Chest radiography was obtained in the baby room.');
      assert.match(text,/hypoglycemia \(blood glucose 32 mg\/dL\)/i,'Recorded glucose finding remains');
    }
    assert.equal(r.state.dx,'neonatal hypoglycemia');
    assert.match(r.review.pending+r.review.conflicts,/Blood sugar|未勾/,'Unmatched glucose test needs review');
  },
  lab_opposites:r=>{
    assert.match(r.review.conflicts,/白血球/,'Opposite WBC findings need a conflict');
    for(const text of [r.adm,r.acc]){includes(text,'leukocytosis');includes(text,'leukopenia');}
  },
  resolved_resus:r=>{
    assert.equal(r.state.problems.respiratory,false,'Resolved birth PPV is not a current respiratory problem');
    assert.equal(r.state.dx,'neonatal hyperbilirubinemia');excludes(dxLines(r),'Respiratory distress');
    assert.match(r.adm,ppv,'Historical PPV remains');includes(r.review.pending,'room air');
  },
  event_dx:r=>{
    assert.equal(r.state.problems.respiratory,true,'Arrival intubation must infer a respiratory problem');
    assert.equal(r.state.dx,'respiratory distress');assert.match(r.adm,ett,'Arrival intubation remains');
  },
  manual_dx:r=>{includes(dxLines(r),'Respiratory distress');includes(dxLines(r),'Maternal GBS colonization');},
  assessment_grammar:r=>{for(const text of [r.adm,r.acc])includes(text,'was crying, had poor muscle tone, and was receiving CPAP');},
  antibiotic_dates:r=>{
    includes(r.review.conflicts,'抗生素結束日早於開始日，請核對；跨年請加年份。');
    assert.ok(r.reviewTargets.find(([m])=>m.includes('抗生素結束日早於開始日'))?.[1].some(t=>t.selector==='#maternalAbxUntil'));
    for(const text of [r.adm,r.acc])includes(text,'from 10/10 to 10/9');
  },
  screen_grammar:r=>{for(const text of [r.adm,r.acc])includes(text,'referred for evaluation of an abnormal newborn screening result');},
  cyanosis_dx:r=>{
    includes(r.adm,'1 episode of cyanosis was reported');
    const closing=r.adm.match(/with a tentative diagnosis of ([^.]+)\./);
    assert.ok(closing,'Tentative diagnosis closing exists');assert.doesNotMatch(closing[1],/apnea/i,'Cyanosis-only closing must not add apnea');
    excludes(dxLines(r),'Respiratory symptoms');includes(dxLines(r),'Cyanotic episode');
  },
  e_fever_resp:r=>{
    for(const text of [r.adm,r.acc]){includes(text,'cough, fever, and poor feeding');includes(text,'38.2');includes(text,'from 60 to 30 mL per feed');}
    const common=[...A.readmitEpisodes().map(e=>e.line),...A.readmitModuleNarrative()];
    assert.ok(common.length,'E illness has shared sentences');
    for(const text of [r.adm,r.acc])for(const sentence of common)includes(text,sentence,'shared E sentence: '+sentence);
  },
};

capture('cause','Persisting jaundice + O2 does not document causation',()=>{reset('nursery');A.render();input('birthFinalSupport','room');multi('obSx','jaundice');seg('pwOnset','persisted');seg('obRespType','o2');});
capture('lab_map','Chest radiography and hypoglycemia chosen separately',()=>{reset('nursery');A.render();multi('brWorkup','cxr');multi('brFindings','hypoglycemia');input('brGlu','32');});
capture('lab_opposites','One CBC with both low and high WBC',()=>{reset('nursery');A.render();multi('brWorkup','cbc');multi('brFindings','leukocytosis');multi('brFindings','leukopenia');});
capture('resolved_resus','Birth PPV recovered to room air, now admitted with jaundice',()=>{reset('nursery');A.render();click('[data-ladder-v="ppv"]');input('birthFinalSupport','room');seg('obRespType','room');seg('resp','room air');multi('obSx','jaundice');});
capture('event_dx','External arrival intubation with no separately repeated support selection',()=>{reset('outborn');A.render();click('[data-add-stage-event="intubation"][data-event-phase="arrival"]');});
capture('manual_dx','Manual respiratory diagnosis suppresses independently recorded GBS risk',()=>{reset();A.render();click('.scr-row[data-scr="gbs"] input[value="pos"]');input('tentDx','respiratory distress');});
capture('ladder_ett','Intubation ladder adds a separate PPV procedure',()=>{reset();A.render();click('[data-ladder-v="ett"]');});
capture('ladder_cpr','CPR+Epi bundle has no removal control for first epinephrine',()=>{reset();A.render();click('[data-ladder-v="cpr"]');});
capture('assessment_grammar','Crying + poor tone + CPAP assessment',()=>{reset('outborn');A.render();click('[data-add-stage-event="assessment"][data-event-phase="arrival"]');const id=S.courseEvents.at(-1).id;click(`[data-event-id="${id}"] [data-event-choice="breathing"] [data-v="crying"]`);input('event-'+id+'-tone','poor');input('event-'+id+'-support','cpap');});
capture('antibiotic_dates','Antibiotic end date earlier than start date',()=>{reset();A.render();seg('maternalAbxPurpose','treatment');input('iapDrug','ampicillin');input('iapSince','10/10');input('maternalAbxUntil','10/9');});
capture('screen_grammar','Selecting an explicit screening test',()=>{reset('readmit');A.render();multi('readmitProblems','abnormal-screen');input('rm_screen_test','newborn screening');input('rm_screen_result','an elevated screening marker');});
capture('cyanosis_dx','Cyanosis-only detail remains apnea-or-cyanosis in closing',()=>{reset('readmit');A.render();multi('readmitProblems','apnea');click('[data-rm-chip="rm_apnea_type"][data-v="cyanosis"]');input('rm_apnea_count','1');});
capture('e_fever_resp','Multiple E symptoms with common onset and details',()=>{reset('readmit');A.render();multi('readmitProblems','respiratory');multi('readmitProblems','fever');multi('readmitProblems','poor-feeding');input('readmitOnsetDOL','12');input('readmitCourseType','new');click('[data-rm-chip="rm_respiratory_symptoms"][data-v="cough"]');input('rm_fever_temperature','38.2');input('rm_fever_method','rectal');input('rm_feeding_usual','60');input('rm_feeding_current','30');});
capture('nrp_order','Select PPV with no GA, then enter 24 weeks without accepting defaults',()=>{reset();raw('gaW','');A.render();click('[data-ladder-v="ppv"]');input('gaW','24');input('bw','721');});
capture('nrp_confirm','Edited FiO2 survives GA entry while IP/PEEP remain pending',()=>{reset();raw('gaW','');A.render();click('[data-ladder-v="ppv"]');const id=S.birthEvents[0].id;input('event-'+id+'-fiO2','40');input('gaW','24');input('bw','721');});
capture('nrp_ga_first','Control: enter 24 weeks before selecting PPV',()=>{reset();raw('gaW','');A.render();input('gaW','24');input('bw','721');click('[data-ladder-v="ppv"]');});

for(const [id] of scenarios)test(id,checks[id],()=>scenario(id));

test('resolved_resus_cpap',()=>{
  seg('resp','bubble CPAP');const r=snapshot();
  assert.equal(r.state.problems.respiratory,true);assert.equal(r.state.dx,'respiratory distress');
  excludes(r.review.pending,'未列入呼吸問題');
},()=>scenario('resolved_resus'));
test('resolved_resus_hint',r=>{
  includes(r.review.pending,'未列入呼吸問題');includes(r.review.pending,'（PPV）');
  const targets=r.reviewTargets.find(([message])=>message.includes('未列入呼吸問題'))?.[1];
  assert.ok(targets?.some(t=>t.selector==='[data-seg="resp"]'),'Resolved intervention links to admission support');
  includes(r.acc,'with neonatal hyperbilirubinemia');
},()=>scenario('resolved_resus'));
test('resolved_resus_manual_dx_clears_hint',()=>{
  input('tentDx','respiratory distress');excludes(snapshot().review.pending,'未列入呼吸問題');
},()=>scenario('resolved_resus'));
test('outborn_arrival_intubation_after_room',()=>{
  reset('outborn');A.render();seg('obM1Type','room');
  click('[data-add-stage-event="intubation"][data-event-phase="arrival"]');
  const r=snapshot();assert.equal(r.state.problems.respiratory,true);excludes(r.review.pending,'之後紀錄為 room air');
});
// Batch 7: station-specific ETT wording and transport CPAP availability.
test('outborn_arrival_ett_ppv_wording',()=>{
  reset('outborn');S.obM1Type='ett';raw('obM1FiO2','30');raw('obM1IP','20');raw('obM1PEEP','5');raw('obArriveSpo2','95');
  const r=snapshot();for(const text of [r.adm,r.acc]){
    includes(text,"On our team's arrival at the referring hospital, the infant was intubated, with positive-pressure ventilation (PPV) provided through the endotracheal tube (FiO2 30%, PIP 20 cmH2O, PEEP 5 cmH2O), with SpO2 95%.");
    excludes(text,'mechanical ventilation');
  }
});
test('outborn_transport_ett_continued',()=>{
  reset('outborn');S.obM1Type='ett';S.obRespType='ett';
  const r=snapshot();for(const text of [r.adm,r.acc])includes(text,'PPV was continued through the endotracheal tube during transport.');
});
test('outborn_transport_ett_unknown_prior',()=>{
  reset('outborn');S.obRespType='ett';
  const r=snapshot();for(const text of [r.adm,r.acc]){
    includes(text,'Positive-pressure ventilation (PPV) was provided through the endotracheal tube during transport.');
    excludes(text,'mechanical ventilation');excludes(text,'PPV was continued');
  }
});
test('outborn_outside_ett_keeps_mv',()=>{
  reset('outborn');S.courseEvents=[{id:1,phase:'outside',kind:'assessment',support:'ett'}];
  const r=snapshot();for(const text of [r.adm,r.acc])includes(text,"At the referring hospital before our team's arrival, the infant was receiving mechanical ventilation via an endotracheal tube.");
});
test('outborn_transport_cpap_hidden',()=>{
  reset('outborn');A.render();
  const route=get('[data-seg="obRespType"] [data-v="cpap"]');
  assert.equal(route.hidden,true);assert.equal(get('[data-seg="obM1Type"] [data-v="cpap"]').hidden,false);
  assert.equal(get('#courseAdderButtons [data-add-course="cpap"]').hidden,true);
  for(const phase of ['outside','arrival'])assert.equal(get(`[data-add-stage-event="cpap"][data-event-phase="${phase}"]`).hidden,false);
  S.obRespType='cpap';A.render();assert.equal(route.hidden,false);assert.equal(S.obRespType,'cpap');
  assert.equal(get('#courseAdderButtons [data-add-course="cpap"]').hidden,true);
  const r=snapshot();for(const text of [r.adm,r.acc])includes(text,'CPAP');
});
test('outborn_transport_ett_new_changed_and_context',()=>{
  reset('outborn');S.obRespType='ett';raw('obFiO2','40');raw('obIP','22');raw('obPEEP','6');
  for(const previous of ['room','o2']){
    S.obM1Type=previous;
    includes(A.postnatalNarrative({closeAdmission:false}).join(' '),'Positive-pressure ventilation (PPV) was provided through the endotracheal tube during transport (FiO2 40%, PIP 22 cmH2O, PEEP 6 cmH2O).');
  }
  S.obSx=['desaturation'];S.pwOnset='observed';
  S.courseEvents=[{id:1,phase:'transport',kind:'assessment',support:'ett'}];
  const text=A.postnatalNarrative({closeAdmission:false}).join(' ');
  assert.equal((text.match(/during transport/gi)||[]).length,1,'Transport context is stated once');
  includes(text,'Positive-pressure ventilation (PPV) was provided through the endotracheal tube (FiO2 40%, PIP 22 cmH2O, PEEP 6 cmH2O).');
  includes(text,'was receiving positive-pressure ventilation (PPV) through the endotracheal tube');excludes(text,'mechanical ventilation');
});
test('outborn_arrival_transport_ett_reassessment',()=>{
  for(const phase of ['arrival','transport']){
    reset('outborn');S.courseEvents=[{id:1,phase,kind:'assessment',support:'ett'}];
    const r=snapshot();for(const text of [r.adm,r.acc]){
      includes(text,'was receiving positive-pressure ventilation (PPV) through the endotracheal tube');excludes(text,'mechanical ventilation');
    }
  }
});
test('outborn_ett_to_room_source_wording',()=>{
  reset('outborn');S.obM1Type='ett';S.obRespType='room';
  includes(A.postnatalNarrative({closeAdmission:false}).join(' '),'switched from positive-pressure ventilation (PPV) through the endotracheal tube to room air during transport');
  S.obM1Type='';S.courseEvents=[{id:1,phase:'outside',kind:'assessment',support:'ett'}];
  includes(A.postnatalNarrative({closeAdmission:false}).join(' '),'switched from mechanical ventilation via an endotracheal tube to room air during transport');
});
test('nursery_o2_event_then_unfilled',()=>{
  reset('nursery');A.render();input('birthFinalSupport','room');click('[data-add-course="o2"]');
  const r=snapshot();assert.equal(S.resp,'');assert.equal(r.state.problems.respiratory,true);excludes(r.review.pending,'之後紀錄為 room air');
});
test('outborn_ett_arrival_then_room_transport',()=>{
  reset('outborn');A.render();seg('obM1Type','ett');click('[data-add-course="assessment"]');
  input('event-'+S.courseEvents.at(-1).id+'-support','room');
  const r=snapshot();assert.equal(r.state.problems.respiratory,false);
  includes(r.review.pending,'未列入呼吸問題');includes(r.review.pending,'（插管／ETT）');
});
test('birth_signs_with_intervention_unknown_support_no_hint',()=>{
  A.render();click('[data-ladder-v="ppv"]');multi('birthSigns','grunting');
  const r=snapshot();assert.equal(A.latestKnownSupport(),'');assert.equal(r.state.problems.respiratory,true);excludes(r.review.pending,'未列入呼吸問題');
});
test('course_observation_hint_source',()=>{
  reset('outborn');A.render();click('[data-add-course="assessment"]');
  const id=S.courseEvents.at(-1).id;click(`[data-event-id="${id}"] [data-event-choice="breathing"] [data-v="labored"]`);
  const r=snapshot();includes(r.review.pending,'途中再評估曾記錄呼吸徵象');excludes(r.review.pending,'出生時曾記錄呼吸徵象');
});
test('station_support_precedence',()=>{
  for(const path of ['direct','nursery']){
    reset(path);S.obRespType='room';raw('birthFinalSupport','room');
    for(const [kind,mode] of [['o2','o2'],['cpap','cpap'],['ppv','ppv'],['intubation','ett']]){
      S.courseEvents=[{kind}];assert.equal(A.latestKnownSupport(),mode);
    }
    S.courseEvents.push({kind:'assessment',support:'room'},{kind:'assessment',support:''});
    assert.equal(A.latestKnownSupport(),'room');S.resp='bubble CPAP';assert.equal(A.latestKnownSupport(),'cpap');
  }
});
test('outborn_o2_then_room',()=>{
  reset('outborn');A.render();click('[data-add-stage-event="o2"][data-event-phase="outside"]');
  seg('obM1Type','room');const r=snapshot();
  assert.equal(r.state.problems.respiratory,false);includes(r.review.pending,'未列入呼吸問題');includes(r.review.pending,'（O₂）');
});
test('manual_dx_prom',()=>{
  A.render();click('[data-ryn="prom"] [data-v="yes"]');input('promH','20');input('tentDx','respiratory distress');
  assert.equal(S.r.prom.on,true);const r=snapshot(),lines=dxLines(r);
  includes(lines,'Premature rupture of membranes (PROM)');assert.equal(lines.split('\n')[1],'# Respiratory distress');
});
test('manual_dx_replaces_auto',()=>{
  reset('nursery');A.render();multi('brFindings','hypoglycemia');input('brGlu','32');
  input('tentDx','transient tachypnea of the newborn');const r=snapshot(),lines=dxLines(r);
  excludes(lines,'Neonatal hypoglycemia');assert.equal(lines.split('\n')[1],'# Transient tachypnea of the newborn');
  assert.match(r.adm.split('Tentative diagnosis:')[0],/hypoglycemia/i);
  includes(r.adm,'Under the tentative diagnosis of transient tachypnea of the newborn,');
  includes(r.acc,'with transient tachypnea of the newborn');
});
test('manual_dx_idm',()=>{
  A.render();click('[data-ryn="gdm"] [data-v="yes"]');input('tentDx','respiratory distress');
  const r=snapshot();includes(dxLines(r),'Infant of a diabetic mother (IDM)');
  assert.equal(dxLines(r).split('\n')[1],'# Respiratory distress');
});
test('ladder_remove_compressions_hint',()=>{
  click('[data-event-kind="compressions"] [data-event-action="remove"]');const r=snapshot();
  includes(r.review.pending,'沒有壓胸');
  assert.equal(get('#birthAdderButtons [data-add-birth="compressions"]').textContent,'＋ 壓胸');
  const targets=r.reviewTargets.find(([message])=>message.includes('沒有壓胸'))?.[1];
  assert.deepEqual(targets,[{selector:'#birthAdderButtons',label:'還有嗎？補回處置'}]);
},()=>scenario('ladder_cpr'));
test('nrp_ga_cleared',()=>{
  A.render();input('gaW','24');click('[data-ladder-v="ppv"]');
  const id=S.birthEvents[0].id;input('event-'+id+'-pip','22');input('gaW','');
  const event=snapshot().birthEvents[0];
  assert.deepEqual([event.fiO2,event.pip,event.peep],['21','22','5']);
  assert.deepEqual(event.nrpFields,['fiO2','peep']);
});
test('latest_support_precedence',()=>{
  reset('outborn');raw('birthFinalSupport','cpap');assert.equal(A.latestKnownSupport(),'cpap');
  S.courseEvents=[{phase:'outside',kind:'intubation'},{phase:'outside',kind:'assessment',support:'room'}];
  assert.equal(A.latestKnownSupport(),'room');
  S.courseEvents.push({phase:'arrival',kind:'cpap'});assert.equal(A.latestKnownSupport(),'cpap');
  S.obM1Type='o2';assert.equal(A.latestKnownSupport(),'cpap','Our arrival procedure follows support on arrival');
  S.obRespType='ppv';assert.equal(A.latestKnownSupport(),'ppv');
  S.courseEvents.push({phase:'transport',kind:'intubation'},{phase:'transport',kind:'assessment',support:'room'},{phase:'transport',kind:'assessment',support:''});
  assert.equal(A.latestKnownSupport(),'room','Blank reassessment does not erase recorded support');
  for(const [value,mode] of Object.entries({'room air':'room','O2 hood':'o2',NC:'o2',HFNC:'o2','bubble CPAP':'cpap',NCPAP:'cpap','NSIMV+PS':'ppv',NIVPC:'ppv','ETT+SIMV+PS':'ett','ETT+HFOV':'ett','ETT+HFOV+iNO':'ett'})){
    S.resp=value;assert.equal(A.latestKnownSupport(),mode,value);
  }
  for(const path of ['direct','nursery']){reset(path);S.obRespType='o2';raw('birthFinalSupport','room');assert.equal(A.latestKnownSupport(),'o2');}
  reset();assert.equal(A.latestKnownSupport(),'');
});
test('respiratory_symptoms_and_readmit_scope',()=>{
  assert.deepEqual(Object.keys(A.BREATHING_NOUN).sort(),['apnea','gasping','ineffective','labored']);
  for(const breathing of Object.keys(A.BREATHING_NOUN))for(const field of ['birthBreathing','birthFinalBreathing','assessment']){
    reset();S.resp='room air';raw('birthFinalSupport','room');
    if(field==='assessment')S.courseEvents=[{kind:'assessment',breathing}];else raw(field,breathing);
    assert.equal(A.admissionProblems().respiratory,false,field+': '+breathing+' with later room air');
    A.timelineReview();includes(get('#reviewPendingList').textContent,'呼吸徵象');includes(get('#reviewPendingList').textContent,'未列入呼吸問題');
    S.resp='';raw('birthFinalSupport','');
    assert.equal(A.admissionProblems().respiratory,false,field+': '+breathing+' without later support records');
    A.timelineReview();includes(get('#reviewPendingList').textContent,'呼吸徵象');includes(get('#reviewPendingList').textContent,'未列入呼吸問題');
  }
  reset('readmit');S.resus='ppv';S.resp='bubble CPAP';raw('birthBreathing','apnea');
  assert.equal(A.admissionProblems().respiratory,false,'E only uses selected readmission problems');
  S.readmitProblems=['apnea'];assert.equal(A.admissionProblems().respiratory,true);
});

test('birth_signs_room_air_hint',()=>{
  A.render();multi('birthSigns','grunting');input('birthFinalSupport','room');seg('resp','room air');
  const r=snapshot();assert.deepEqual(S.obSx,[]);
  assert.equal(r.state.problems.respiratory,false);excludes(dxLines(r),'Respiratory distress');
  includes(r.review.pending,'出生時曾記錄呼吸徵象（grunting）');includes(r.review.pending,'未列入呼吸問題');
  const targets=r.reviewTargets.find(([message])=>message.includes('未列入呼吸問題'))?.[1];
  assert.ok(targets?.some(t=>t.selector==='[data-seg="resp"]'),'Observed signs link to admission support');
});
test('birth_signs_no_later_record',()=>{
  A.render();multi('birthSigns','grunting');input('birthFinalSupport','');
  const r=snapshot();assert.equal(S.resp,'');assert.deepEqual(S.obSx,[]);
  assert.equal(r.state.problems.respiratory,false);excludes(dxLines(r),'Respiratory distress');
  includes(r.review.pending,'出生時曾記錄呼吸徵象（grunting），未列入呼吸問題；若以呼吸問題收治，請填入院時呼吸支持或暫定診斷。');
  excludes(r.review.pending,'之後紀錄為 room air');
  const targets=r.reviewTargets.find(([message])=>message.includes('未列入呼吸問題'))?.[1];
  assert.ok(targets?.some(t=>t.selector==='[data-seg="resp"]'),'Observed signs with unknown support link to admission support');
});
test('birth_signs_and_intervention_room_air_hint',()=>{
  multi('birthSigns','grunting');const r=snapshot();
  assert.equal(r.state.problems.respiratory,false);excludes(dxLines(r),'Respiratory distress');
  includes(r.review.pending,'出生／途中曾有呼吸處置（PPV）、出生時曾記錄呼吸徵象（grunting），未列入呼吸問題；若以呼吸問題收治，請填入院時呼吸支持或暫定診斷。');
},()=>scenario('resolved_resus'));

test('nrp_accept_then_ga',()=>{
  raw('gaW','');A.render();click('[data-ladder-v="ppv"]');
  const id=S.birthEvents[0].id;click(`[data-nrp-accept="${id}"]`);input('gaW','24');
  const r=snapshot(),event=r.birthEvents[0];
  assert.deepEqual([event.fiO2,event.pip,event.peep],['21','25','5'],'Accepted settings survive GA changes');
  assert.deepEqual(event.nrpFields,[]);assert.equal(event.nrp,false);
  assert.doesNotMatch(r.review.pending,/PPV.*(?:核對|確認)/);
  assert.equal(d.querySelector(`[data-event-id="${id}"] .nrp-hint`),null);
  assert.equal(d.querySelector(`[data-event-id="${id}"] .nrp-default`),null);
  includes(r.adm,'FiO2 21%, IP/PEEP 25/5 cmH2O');
});
test('ladder_remove_then_undo',before=>{
  click('[data-event-kind="ppv"] [data-event-action="remove"]');click('[data-undo-event="birth"]');
  const after=snapshot();assert.deepEqual(after.birthEvents.map(e=>e.kind),['ppv','intubation']);
  assert.equal(after.birthEvents[0].nrp,true);assert.deepEqual(after.birthEvents,before.birthEvents);
  assert.equal(after.adm,before.adm,'Undo restores Admission verbatim');
},()=>scenario('ladder_ett'));
test('ladder_remove_hint',()=>{
  click('[data-event-kind="ppv"] [data-event-action="remove"]');
  includes(snapshot().review.pending,'插管前 PPV');
  assert.equal(get('#birthLadderSummary span').textContent,'目前記錄：插管');
  click('#birthAdderButtons [data-add-birth="ppv"]');
  const r=snapshot();excludes(r.review.pending,'插管前 PPV');assert.match(r.adm,ppv);
  assert.equal(r.birthEvents.find(e=>e.kind==='ppv').nrp,true);
},()=>scenario('ladder_ett'));
test('ladder_adder_labels',()=>{
  click('[data-event-kind="epinephrine"] [data-event-action="remove"]');
  assert.equal(get('#birthAdderButtons [data-add-birth="epinephrine"]').textContent,'＋ Epi');
  includes(get('#birthAdderButtons [data-add-birth="ppv"]').textContent,'再做一次');
  assert.equal(get('#birthLadderSummary span').textContent,'目前記錄：PPV → 插管 → 壓胸');
},()=>scenario('ladder_cpr'));

test('ladder_ett_remove_ppv',()=>{
  const selector='[data-event-kind="ppv"] [data-event-action="remove"]';
  assert.ok(d.querySelector(selector),'PPV card must have a remove button');click(selector);
  const r=snapshot();assert.doesNotMatch(r.adm,ppv,'Removed PPV must not appear');assert.match(r.adm,ett,'Intubation remains after removing PPV');
},()=>scenario('ladder_ett'));
test('ladder_cpr_remove_epi',()=>{
  const selector='[data-event-kind="epinephrine"] [data-event-action="remove"]';
  assert.ok(d.querySelector(selector),'Epinephrine card must have a remove button');click(selector);
  const r=snapshot();assert.doesNotMatch(r.adm,/epinephrine/i,'Removed epinephrine must not appear');includes(r.adm,'Chest compressions were initiated');
},()=>scenario('ladder_cpr'));
test('cause_resp_control',()=>{
  reset('nursery');A.render();input('birthFinalSupport','room');multi('obSx','tachypnea');seg('pwOnset','persisted');seg('obRespType','o2');
  const r=snapshot();for(const text of [r.adm,r.acc])includes(text,'Because tachypnea persisted, supplemental oxygen was initiated in the baby room.');
});
test('cause_mixed',()=>{
  multi('obSx','tachypnea');const r=snapshot();for(const text of [r.adm,r.acc]){
    includes(text,'During observation in the baby room, jaundice and tachypnea persisted. Supplemental oxygen was initiated.');excludes(text,'Because');
  }
},()=>scenario('cause'));
test('lab_map_matched',()=>{
  reset('nursery');A.render();multi('brWorkup','cbc');multi('brWorkup','crp');multi('brFindings','crp');
  const r=snapshot();for(const text of [r.adm,r.acc])includes(text,'which showed an elevated CRP level');
  excludes(r.review.pending,'未勾');
});
test('lab_map_cbc_only_crp',()=>{
  reset('nursery');A.render();multi('brWorkup','cbc');multi('brFindings','crp');
  const r=snapshot();for(const text of [r.adm,r.acc]){
    includes(text,'A complete blood count with differential was obtained in the baby room.');
    includes(text,'An elevated CRP level was noted in the baby room.');
  }
  includes(r.review.pending,'未勾');
  assert.ok(r.reviewTargets.find(([message])=>message.includes('未勾'))?.[1].some(t=>t.selector==='[data-msel="brWorkup"]'));
});
test('lab_findings_without_tests_no_hint',()=>{
  reset('nursery');A.render();multi('brFindings','leukocytosis');
  assert.equal(S.brWorkup.length,0);
  const r=snapshot();for(const text of [r.adm,r.acc])includes(text,'A work-up was performed in the baby room, which showed leukocytosis.');
  excludes(r.review.pending,'未勾');
});
test('lab_normal_only',()=>{
  reset('nursery');A.render();multi('brWorkup','cbc');multi('brFindings','normal');
  const r=snapshot();for(const text of [r.adm,r.acc])includes(text,'A complete blood count with differential was obtained in the baby room, and the results were unremarkable.');
});
test('lab_mapping_boundaries',()=>{
  reset('nursery');S.brWorkup=['cbc'];S.brFindings=['bandemia','crp','hypoglycemia'];raw('brGlu','32');raw('brCrp','2');raw('brFindIn','a synthetic additional finding');
  const text=A.postnatalNarrative({closeAdmission:false}).join(' ');
  includes(text,'which showed bandemia and a synthetic additional finding.');
  includes(text,'An elevated CRP level (2 mg/dL) and hypoglycemia (blood glucose 32 mg/dL) were noted in the baby room.');
  S.brWorkup=[];
  includes(A.postnatalNarrative({closeAdmission:false}).join(' '),'A work-up was performed in the baby room, which showed bandemia, an elevated CRP level (2 mg/dL), hypoglycemia (blood glucose 32 mg/dL), and a synthetic additional finding.');
});
test('assessment_room_air',()=>{
  reset('outborn');A.render();click('[data-add-stage-event="assessment"][data-event-phase="arrival"]');const id=S.courseEvents.at(-1).id;
  click(`[data-event-id="${id}"] [data-event-choice="breathing"] [data-v="crying"]`);input('event-'+id+'-tone','good');input('event-'+id+'-support','room');
  const r=snapshot();for(const text of [r.adm,r.acc])includes(text,'was crying, had good muscle tone, and was breathing room air');
});
test('assessment_adjacent_auxiliary_controls',()=>{
  for(const prior of [undefined,{signs:['grunting']}]){
    const line=a=>A.assessmentText({...a,signs:['grunting']},'On reassessment',prior).join(' ');
    includes(line({breathing:'labored',tone:'poor'}),'had labored breathing and poor muscle tone');
    includes(line({breathing:'labored',tone:'flaccid',support:'cpap'}),'had labored breathing, was flaccid, and was receiving CPAP');
    includes(line({breathing:'labored',tone:'poor',support:'cpap'}),'had labored breathing, poor muscle tone, and was receiving CPAP');
    includes(line({breathing:'crying',support:'room'}),'was crying and breathing room air');
    includes(line({breathing:'crying',tone:'poor',support:'room'}),'was crying, had poor muscle tone, and was breathing room air');
    includes(line({breathing:'crying',tone:'poor',support:'cpap'}),'was crying, had poor muscle tone, and was receiving CPAP');
  }
});
test('antibiotic_nested_range',r=>{
  for(const text of [r.adm,r.acc]){excludes(text,'from 10/10-10/11 to');includes(text,'from 10/10 to 10/11');}
  includes(r.review.conflicts,'開始欄已是區間，結束欄〈10/12〉未寫入病歷；請擇一。');
  assert.ok(r.reviewTargets.find(([m])=>m.includes('開始欄已是區間'))?.[1].some(t=>t.selector==='#maternalAbxUntil'));
},()=>{A.render();seg('maternalAbxPurpose','treatment');input('iapDrug','ampicillin');input('iapSince','10/10-10/11');input('maternalAbxUntil','10/12');return snapshot();});

for(const [id,types,label,heading] of [
  ['apnea_only_dx',['apnea'],'apnea','Apnea'],
  ['apnea_both_dx',['apnea','cyanosis'],'apnea and cyanosis','Apnea and cyanosis'],
  ['apnea_unspecified_dx',[],'apnea or a cyanotic episode','Apnea or cyanotic episode'],
  ['cyanosis_plural_dx',['cyanosis'],'cyanotic episodes','Cyanotic episodes'],
])test(id,()=>{
  reset('readmit');A.render();multi('readmitProblems','apnea');
  for(const type of types)click(`[data-rm-chip="rm_apnea_type"][data-v="${type}"]`);
  if(id==='cyanosis_plural_dx')input('rm_apnea_count','2');
  const r=snapshot();includes(r.adm,`with a tentative diagnosis of ${label}.`);
  assert.equal(r.state.dx,label);includes(dxLines(r),'# '+heading);excludes(dxLines(r),'Respiratory symptoms');
  for(const text of [r.adm,r.acc])includes(text,id==='cyanosis_plural_dx'?'2 episodes of cyanosis were reported':`The infant had ${label}.`);
  if(id==='cyanosis_plural_dx'){
    multi('readmitProblems','respiratory');const combined=snapshot();
    includes(dxLines(combined),'# Respiratory symptoms');includes(dxLines(combined),'# Cyanotic episodes');
  }
});
test('apnea_both_without_count',()=>{
  reset('readmit');A.render();multi('readmitProblems','apnea');
  for(const type of ['apnea','cyanosis'])click(`[data-rm-chip="rm_apnea_type"][data-v="${type}"]`);
  input('rm_apnea_duration','10');const r=snapshot();
  for(const text of [r.adm,r.acc])includes(text,'Apnea and cyanosis were reported, with a reported duration of approximately 10 seconds.');
});
test('screen_no_double_abnormal',()=>{
  reset('readmit');A.render();multi('readmitProblems','abnormal-screen');input('rm_screen_test','abnormal TSH');
  const r=snapshot();for(const text of [r.adm,r.acc]){includes(text,'evaluation of abnormal TSH');excludes(text,'abnormal abnormal');}
});
test('screen_follow_up_not_low',()=>{
  reset('readmit');A.render();multi('readmitProblems','abnormal-screen');input('rm_screen_test','CCHD follow-up');
  const r=snapshot();for(const text of [r.adm,r.acc])includes(text,'evaluation of an abnormal CCHD follow-up result');
});
test('screen_qualified_test_controls',()=>{
  reset('readmit');S.readmitProblems=['abnormal-screen'];
  for(const name of ['elevated TSH','low T4','positive screen','HIGH TSH','TSH result','screening results']){
    raw('rm_screen_test',name);includes(A.readmitModuleNarrative().join(' '),`evaluation of ${name}.`);
  }
  raw('rm_screen_test','');includes(A.readmitModuleNarrative().join(' '),'evaluation of an abnormal screening or laboratory result.');
});
test('antibiotic_cross_year_ok',()=>{
  A.render();seg('maternalAbxPurpose','treatment');input('iapDrug','ampicillin');input('iapSince','2025/12/30');input('maternalAbxUntil','2026/1/2');
  const r=snapshot();excludes(r.review.conflicts,'抗生素結束日早於開始日');excludes(r.review.conflicts,'開始欄已是區間');
  for(const text of [r.adm,r.acc])includes(text,'from 2025/12/30 to 2026/1/2');
});
test('antibiotic_cross_year_reversed',()=>{
  A.render();seg('maternalAbxPurpose','treatment');input('iapDrug','ampicillin');input('iapSince','2026/1/5');input('maternalAbxUntil','2025/12/1');
  const r=snapshot();includes(r.review.conflicts,'結束日早於開始日');
});
test('antibiotic_second_course_reversed',()=>{
  A.render();click('#addMaternalAbx');const id=S.maternalAbxCourses.at(-1).id;
  input(`maternal-abx-${id}-purpose`,'treatment');input(`maternal-abx-${id}-since`,'10/10');input(`maternal-abx-${id}-until`,'10/9');
  const r=snapshot(),message='抗生素結束日早於開始日，請核對；跨年請加年份。';includes(r.review.conflicts,message);
  assert.ok(r.reviewTargets.find(([m])=>m===message)?.[1].some(t=>t.selector===`#maternal-abx-${id}-until`));
});
test('antibiotic_date_boundaries',()=>{
  for(const [text,expected] of [[' 10/9 ',{y:null,m:10,d:9}],['2026/10/9',{y:2026,m:10,d:9}],['2026-10-9',{y:2026,m:10,d:9}],['2/29',{y:null,m:2,d:29}],['2024/2/29',{y:2024,m:2,d:29}]])assert.deepEqual(JSON.parse(JSON.stringify(A.parseRecordedDate(text))),expected);
  for(const value of ['','10-9','2026/10-9','2026-10/9','13/1','2/30','2025/2/29','10/10-10/11','unrecorded'])assert.equal(A.parseRecordedDate(value),null);
  raw('iapDrug','ampicillin');
  for(const [start,end,reversed] of [['2026-10-10','2026-10-9',true],['10/10','10/10',false],['2026/10/10','10/9',false],['12/30','1/2',true]]){
    raw('iapSince',start);raw('maternalAbxUntil',end);A.timelineReview();
    assert.equal(get('#reviewConflictList').textContent.includes('抗生素結束日早於開始日'),reversed);
    includes(A.maternalAntibioticNarrative().join(' '),`from ${start} to ${end}`);
  }
});

test('order_nrp_ga',([a,b])=>equalOutputs(a,b),()=>[scenario('nrp_order'),scenario('nrp_ga_first')]);
test('order_nursery_chips',()=>{
  const run=testsFirst=>{
    reset('nursery');A.render();
    const tests=()=>{multi('brWorkup','cbc');multi('brWorkup','cxr');};
    const symptoms=()=>{multi('obSx','tachypnea');multi('obSx','grunting');};
    if(testsFirst){tests();symptoms();}else{symptoms();tests();}return snapshot();
  };equalOutputs(run(true),run(false));
});
test('order_readmit_problems',()=>{
  // 結語順序＝住院醫師點選順序，2026-10-12 決定不正規化
  const run=order=>{reset('readmit');A.render();for(const problem of order)multi('readmitProblems',problem);return snapshot();};
  for(const [order,diagnosis] of [
    [['fever','respiratory','poor-feeding'],'fever, respiratory symptoms, and poor feeding'],
    [['poor-feeding','respiratory','fever'],'poor feeding, respiratory symptoms, and fever'],
  ]){
    const r=run(order);
    includes(r.adm,`with a tentative diagnosis of ${diagnosis}.`,'Closing follows selected problem order');
    const labels={fever:'# Fever',respiratory:'# Respiratory symptoms','poor-feeding':'# Poor feeding'};
    // `#` 診斷列是固定臨床順序（呼吸→發燒→餵食），不跟點選順序；只有結語跟點選順序（2026-10-12 Fable 決定）
    const lines=dxLines(r).split('\n').filter(line=>Object.values(labels).includes(line));
    assert.deepEqual(lines,['# Respiratory symptoms','# Fever','# Poor feeding'],'Diagnosis lines keep the fixed clinical order regardless of selection order');
  }
});
test('order_maternal_abx',()=>{
  const run=purposeFirst=>{
    reset();A.render();const purpose=()=>seg('maternalAbxPurpose','treatment');
    const details=()=>{input('iapDrug','ampicillin');input('iapSince','10/10');input('maternalAbxUntil','10/12');};
    if(purposeFirst){purpose();details();}else{details();purpose();}return snapshot();
  };equalOutputs(run(true),run(false));
});

const all=keys=>Array.from({length:2**keys.length},(_,mask)=>keys.filter((_,i)=>mask&(1<<i)));
const modes=['','room','o2','cpap','ppv','ett'];
function matrix(name,run){
  const key=name.split(':')[0],id='matrix_'+key.replaceAll(' ','_');
  test(id,()=>{
    const m={name,cases:0,flags:{}};
    const flag=kind=>{m.flags[kind]=(m.flags[kind]||0)+1;};
    run(m,flag);totalMatrixCases+=m.cases;
    console.log(`MATRIX ${JSON.stringify(m)}`);
    const differences=[];
    if(m.cases!==MATRIX_CASES[key])differences.push(`cases: old=${MATRIX_CASES[key]} new=${m.cases}`);
    for(const kind of new Set([...Object.keys(KNOWN_FLAGS[key]),...Object.keys(m.flags)])){
      const before=KNOWN_FLAGS[key][kind]??0,after=m.flags[kind]??0;
      if(before!==after)differences.push(`${kind}: old=${before} new=${after} (${after>before?'退步':'有進展，請更新 KNOWN_FLAGS'})`);
    }
    assert.equal(differences.length,0,differences.join('; '));
  });
}
matrix('postnatal: 3 routes x 12 symptoms x 4 onset types x 6 previous modes x 6 current modes',(m,flag)=>{
 for(const path of ['direct','nursery','outborn']){reset(path);for(const symptom of ['tachypnea','subcostal retractions','grunting','nasal flaring','cyanosis','desaturation','apnea','poor activity','poor feeding','hypoglycemia','jaundice','fever'])for(const onset of ['observed','developed','persisted','recurrent'])for(const previous of modes)for(const current of modes){
  S.obSx=[symptom];S.pwOnset=onset;S.obRespType=current;raw('birthFinalSupport',previous);S.obM1Type=previous;
  const text=A.postnatalNarrative({closeAdmission:false}).join(' ');m.cases++;
  if(!A.RESP_SX.includes(symptom)&&new RegExp('Because '+symptom+' persisted,').test(text))flag('unconfirmed_causal_link_from_nonrespiratory_symptom',{path,symptom,onset,previous,current,text});
  if(A.RESP_SX.includes(symptom)&&onset==='persisted'&&previous==='room'&&['o2','cpap','ppv','ett'].includes(current)&&!text.includes(`Because ${symptom} persisted`))flag('causal_link_lost_for_respiratory_symptom',{path,symptom,onset,previous,current,text});
  if(/subcostal retractions was noted/.test(text))flag('plural_agreement',text);
  if(/undefined|\bNaN\b|\[object Object\]/.test(text))flag('malformed',text);
 }}
});
matrix('nursery: all 32 test subsets x (64 abnormal finding subsets + normal)',(m,flag)=>{
 reset('nursery');const required={bandemia:'cbc',leukocytosis:'cbc',leukopenia:'cbc',crp:'crp',hypoglycemia:'glucose',cxr:'cxr'};
 for(const tests of all(['cbc','crp','bc','glucose','cxr']))for(const findings of [...all(Object.keys(required)),['normal']]){
  S.brWorkup=tests;S.brFindings=findings;const text=A.postnatalNarrative({closeAdmission:false}).join(' ');m.cases++;
  const missing=findings.filter(f=>required[f]&&!tests.includes(required[f]));
  const phrases={bandemia:'bandemia',leukocytosis:'leukocytosis',leukopenia:'leukopenia',crp:'an elevated CRP level',hypoglycemia:'hypoglycemia',cxr:'an abnormal chest radiograph'};
  const showed=[...text.matchAll(/which showed ([^.]*)(?:\.|$)/g)].map(m=>m[1]).join(' ').toLowerCase();
  if(tests.length&&missing.some(f=>showed.includes(phrases[f].toLowerCase())))flag('result_attributed_to_unmatched_test',{tests,findings,missing,text});
  if(missing.some(f=>!text.toLowerCase().includes(phrases[f].toLowerCase())))flag('unmatched_finding_not_written',{tests,findings,missing,text});
  if(findings.includes('leukocytosis')&&findings.includes('leukopenia')){
    // timelineReview updates the DOM / lastReviewLists; it has no return value.
    A.timelineReview();
    if(!get('#reviewConflictList').textContent.includes('白血球'))flag('opposite_wbc_results_without_timepoints',{tests,findings,text});
  }
 }
});
matrix('assessment: 7 breathing states x 4 tones x 6 support states x 8 sign subsets',(m,flag)=>{
 reset();for(const breathing of ['',...Object.keys(A.BREATHING)])for(const tone of ['',...Object.keys(A.TONE)])for(const support of modes)for(const signs of all(['grunting','retractions','cyanosis'])){
  const text=A.assessmentText({breathing,tone,support,signs},'On reassessment').join(' ');m.cases++;
  if(/was [^.]*, had (?:good|poor) muscle tone, and (?:receiving|breathing)/.test(text))flag('mixed_predicate_auxiliary_dropped',{breathing,tone,support,signs,text});
  if(/, had had|was was|and had had|and was was/.test(text))flag('auxiliary_duplicated',{breathing,tone,support,signs,text});
  if(/retractions was noted/.test(text))flag('plural_agreement',text);
 }
});
matrix('events: 6 procedures x 4 stages x 4 outcomes x 3 timing states',(m,flag)=>{
 for(const phase of ['birth','outside','arrival','transport']){reset(phase==='birth'?'direct':'outborn');raw('birthResusStatus','performed');for(const kind of ['o2','cpap','ppv','intubation','compressions','epinephrine'])for(const response of ['','improved','partial','none'])for(const minutes of ['',1,2]){
  const e={id:1,phase,kind,response,minutes};S.birthEvents=phase==='birth'?[e]:[];
  const text=A.eventNarrative(e,phase==='birth'?'birth':'course').join(' ');m.cases++;
  if(!response&&/improv|persisted/.test(text))flag('invented_response',text);
  if(/1 minutes|2 minute of|compressions was|epinephrine were|undefined/.test(text))flag('grammar',text);
 }}
});
matrix('admission problem inference: 4 birth resus x 6 final modes x 6 route modes x 3 admission modes x 2 GA x 2 jaundice states',(m,flag)=>{
 reset('nursery');for(const resus of ['none','ppv','intubation','cpr'])for(const final of modes)for(const route of modes)for(const resp of ['','room air','CPAP'])for(const ga of [35,39])for(const jaundice of [false,true]){
  Object.assign(S,{resus,obRespType:route,resp,obSx:jaundice?['jaundice']:[]});raw('birthFinalSupport',final);raw('gaW',ga);
  const problems=A.admissionProblems(),dx=A.primaryDx();m.cases++;
  if(resus!=='none'&&final==='room'&&route==='room'&&resp==='room air'&&problems.respiratory)flag('historic_resuscitation_becomes_current_respiratory_dx',{resus,final,route,resp,ga,jaundice,dx});
 }
});
matrix('course events: 3 phases x 4 respiratory procedures x 2 GA x 3 admission modes',(m,flag)=>{
 reset('outborn');for(const phase of ['outside','arrival','transport'])for(const kind of ['o2','cpap','ppv','intubation'])for(const ga of [35,39])for(const resp of ['','room air','CPAP']){
  S.courseEvents=[{id:1,phase,kind}];S.resp=resp;raw('gaW',ga);m.cases++;const dx=A.primaryDx();
  if(resp===''&&!A.admissionProblems().respiratory)flag('procedure_omitted_from_problem_inference',{phase,kind,ga,resp,dx});
 }
});
matrix('readmission: allowed problem subsets; apnea subsets have unspecified and cyanosis-only variants',(m,flag)=>{
 reset('readmit');for(const problems of all(['jaundice','prolonged-jaundice','poor-feeding','weight-loss','fever','respiratory','apnea','gastrointestinal','abnormal-screen','care'])){
  if(problems.includes('jaundice')&&problems.includes('prolonged-jaundice'))continue;
  for(const types of problems.includes('apnea')?[[],['cyanosis']]:[[]]){
  raw('rm_apnea_type',JSON.stringify(types));S.readmitProblems=problems;const dx=A.primaryDx(),text=A.readmissionNarrative({diagnosis:dx}).join(' ');m.cases++;
  if(!problems.some(x=>x.includes('jaundice'))&&/bilirubin|dark urine|pale stools/i.test(text))flag('irrelevant_jaundice',text);
  if(/transport team|referring hospital/i.test(text))flag('irrelevant_transport',text);
  if(/undefined|\bNaN\b|\[object Object\]/.test(text))flag('malformed',text);
  const closing=text.match(/with a tentative diagnosis of ([^.]+)\./)?.[1]||'';
  if(problems.includes('apnea')&&types.length&&closing.includes('apnea or a cyanotic episode'))flag('generic_apnea_label_in_diagnosis',{problems,types,dx});
  if(problems.includes('apnea')&&types.length===1&&types[0]==='cyanosis'&&/apnea/i.test(closing))flag('apnea_label_mismatch',{problems,types,dx});
  }
 }
});
matrix('maternal antibiotics: 4 purposes x 3 completeness states x 3 starts x 3 ends',(m,flag)=>{
 reset();raw('iapDrug','ampicillin');for(const purpose of ['','treatment','iap','other'])for(const iap of ['none','complete','incomplete'])for(const start of ['','10/10','10/10-10/11'])for(const end of ['','10/9','10/12']){
  S.maternalAbxPurpose=purpose;S.iap=iap;raw('iapSince',start);raw('maternalAbxUntil',end);const text=A.maternalAntibioticNarrative().join(' ');m.cases++;
  if(purpose!=='iap'&&/prophylaxis/.test(text))flag('wrong_iap_classification',text);
  A.timelineReview();const conflicts=get('#reviewConflictList').textContent;
  if(start==='10/10'&&end==='10/9'&&!conflicts.includes('抗生素結束日早於開始日'))flag('reversed_course_dates',{purpose,iap,start,end,text});
  if(text.includes('from 10/10-10/11 to'))flag('nested_date_range',{purpose,iap,start,end,text});
  if(start.includes('-')&&end&&!conflicts.includes('開始欄已是區間'))flag('nested_range_without_conflict',{purpose,iap,start,end,text});
 }
});
for(const id of KNOWN_FAILING)if(!registered.has(id)){failed++;console.error('FAIL stale KNOWN_FAILING id: '+id);}
if(!passed&&!expectedRed&&!failed){failed++;console.error('FAIL No scenarios match '+match);}
if(errors.length){failed++;console.error('FAIL page errors: '+errors.join('\n'));}
if(!match&&totalMatrixCases!==11956){failed++;console.error('FAIL total matrix cases: '+totalMatrixCases);}
console.log(`SUMMARY ${passed} passed / ${expectedRed} expected-red / ${failed} failed; matrix cases=${totalMatrixCases}`);
W.close();
if(failed)process.exit(1);
