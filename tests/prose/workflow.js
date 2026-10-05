// Forward-only admission workflow. Synthetic cases; no patient information.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');
const tests=[];
function test(name,run){tests.push([name,run]);}
function page(run){
  const errors=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-workflow.test/',beforeParse(W){
    W.scrollTo=()=>{};W.HTMLElement.prototype.scrollIntoView=()=>{};
    W.addEventListener('error',e=>errors.push(String(e.error?.stack||e.message)));
  }});
  const W=dom.window,d=W.document,get=s=>{const el=d.querySelector(s);assert.ok(el,'Missing '+s);return el;};
  const click=s=>get(s).click();
  const input=(id,value)=>{const el=get('#'+id);el.value=value;el.dispatchEvent(new W.Event(el.tagName==='SELECT'||el.type==='date'?'change':'input',{bubbles:true}));};
  const seg=(k,v)=>click(`[data-seg="${k}"] [data-v="${v}"]`),problem=p=>click(`[data-msel="readmitProblems"] [data-v="${p}"]`);
  const story=s=>click(`[data-story="${s}"]`),tab=s=>click(`[data-tab="${s}"]`),note=()=>get('#note').textContent;
  const visible=id=>!get('#'+id).closest('[hidden]');
  const seed=()=>{seg('gender','male');seg('delivery','nsd');seg('dest','NBC');input('gaW','39');input('gaD','0');input('bw','3200');input('birthDate','2026-09-15');input('admissionDate','2026-10-02');input('birthHosp','Example Birth Clinic');input('ap1','9');input('ap5','10');};
  try{run({W,d,get,click,input,seg,problem,story,tab,note,visible,seed});assert.deepEqual(errors,[],'Page errors');}
  finally{W.close();}
}
test('entry precedes chart; all IDs are unique and no duplicate jaundice onset exists',({d,get})=>{
  assert.equal(get('#admSections > .card').id,'admissionContext');
  assert.deepEqual([...d.querySelectorAll('#admSections > .card')].map(e=>e.id||e.querySelector('h2').textContent.trim()),['admissionContext','prenatalCard','2產前篩檢 篩檢陰性・Rubella 有抗體▾','2產程用藥','birthHistoryCard','pathwayCard','finalReviewCard']);
  const ids=[...d.querySelectorAll('[id]')].map(e=>e.id);assert.equal(ids.length,new Set(ids).size);
  assert.equal(d.querySelector('#readmitJaundiceDOL'),null);
  for(const id of ['birthDate','admissionDate','readmitComplaint'])assert.ok(get('#admissionContext').contains(get('#'+id)));
});
test('entry scenario cards retain visible codes, explanations and timelines',({W,d,get})=>{
  assert.equal(get('#entryRoutes').getAttribute('role'),'radiogroup');
  assert.equal(d.querySelectorAll('#entryRoutes > button').length,4);
  for(const card of d.querySelectorAll('#entryRoutes > button')){
    assert.equal(card.getAttribute('role'),'radio');
    for(const selector of ['.k','.t','.d','.p']){
      const part=card.querySelector(selector);assert.ok(part?.textContent.trim());
      assert.notEqual(W.getComputedStyle(part).display,'none',`${card.id||card.dataset.story} ${selector} must remain visible`);
    }
  }
  assert.match(get('[data-story="E"] .d').textContent,/已返家.*門診.*急診/);
  assert.match(get('[data-story="D"] .d').textContent,/跨院轉入/);
  assert.ok(get('#admissionContext').contains(get('#storyHelp')));
});
test('birth team descriptions remain visible and entry selection stays synchronized',({W,get,click,story})=>{
  click('#entryDirect');assert.equal(get('#entryDirect').getAttribute('aria-checked'),'true');
  for(const k of ['A','B'])assert.notEqual(W.getComputedStyle(get(`[data-story="${k}"] .d`)).display,'none');
  story('A');assert.equal(get('#entryDirect').getAttribute('aria-checked'),'true');
  story('E');assert.equal(get('#entryDirect').getAttribute('aria-checked'),'false');
  assert.equal(get('[data-story="E"]').getAttribute('aria-checked'),'true');
});
test('explicit unknown data overrides live defaults without assuming dates or prenatal tests',({note,seg,click,input})=>{
  assert.match(note(),/This __-day-old/);assert.doesNotMatch(note(),/parents denied|Neither amniocentesis/);
  assert.match(note(),/mother denied/);assert.match(note(),/There was no gestational diabetes/);
  seg('amnio','unknown');assert.match(note(),/Information on amniocentesis was unavailable/);
  click('[data-ryn="gdm"] [data-v="unknown"]');assert.match(note(),/gestational diabetes mellitus.*was unavailable/);
  assert.doesNotMatch(note(),/There was no gestational diabetes/);
  click('[data-ryn="gdm"] [data-v="no"]');assert.match(note(),/There was no gestational diabetes/);
  input('habitStatus','unknown');assert.doesNotMatch(note(),/mother denied/);
  input('habitStatus','negative');assert.match(note(),/mother denied/);
});
test('unknown dates never fall back to a stale calculated DOL',({seed,input,note})=>{
  seed();assert.match(note(),/This 18-day-old/);input('birthDate','');assert.match(note(),/This __-day-old/);
  input('birthDate','2026-10-03');assert.match(note(),/This __-day-old/);
});
for(const [birth,admission,dol] of [['2026-10-02','2026-10-02',1],['2026-09-30','2026-10-02',3],['2024-02-28','2024-03-01',3],['2025-12-31','2026-01-01',2]]){
  test(`calendar DOL ${birth} to ${admission}`,({input,note})=>{input('birthDate',birth);input('admissionDate',admission);assert.match(note(),new RegExp('This '+dol+'-day-old '));});
}
test('E retains visible birth observations and resuscitation without switching route',({seed,story,visible,input,note})=>{
  seed();story('E');assert.equal(visible('birthBreathing'),true);assert.equal(visible('birthResusStatus'),true);
  input('birthBreathing','crying');input('birthResusStatus','none');assert.match(note(),/No resuscitation was required at birth/);
});
test('entry selection does not jump; E source and problems live at the entry',({W,story,get})=>{
  let calls=0;W.HTMLElement.prototype.scrollIntoView=()=>calls++;story('E');assert.equal(calls,0);
  assert.ok(get('#admissionContext').contains(get('[data-seg="readmitSource"]')));
  assert.ok(get('#admissionContext').contains(get('[data-msel="readmitProblems"]')));
});
test('E has three forward stages, merging home context and evaluation/admission',({story,click,get,visible,input})=>{
  story('E');assert.match(get('#journeyCounter').textContent,/1／3/);assert.equal(visible('readmitHomeNote'),true);
  click('#journeyNext');assert.match(get('#journeyCounter').textContent,/2／3/);input('readmitCourse','The symptoms persisted.');
  assert.match(get('#journeyCounter').textContent,/2／3/);click('#journeyNext');assert.equal(visible('obAdmissionStatus'),true);assert.equal(visible('readmitCurrentWeight'),true);
  click('#journeyPrev');assert.equal(get('#readmitCourse').value,'The symptoms persisted.');
});
test('birth and admission times reach the note with distinct dates',({seed,story,input,note,get})=>{
  seed();story('E');input('birthTime','06:20');input('admissionTime','14:37');assert.match(note(),/06:20 on September 15/);assert.match(note(),/October 2, 2026 at 14:37/);
  input('admissionTime','29:75');assert.match(get('#contextReview').textContent,/24 小時/);assert.doesNotMatch(note(),/29:75/);
});
test('feeding is included once; supplied fragments acquire a subject',({seed,story,seg,input,note})=>{
  seed();story('E');seg('readmitPrior','treated');input('readmitPriorCourse','received phototherapy');seg('readmitFeeding','breast milk');input('readmitHomeNote','remained active');
  assert.match(note(),/The infant received phototherapy\./);assert.match(note(),/At discharge, the infant was fed breast milk\./);assert.match(note(),/The infant remained active\./);
  assert.equal((note().match(/was fed breast milk/g)||[]).length,1);
});
test('birth hospital and maternal admission location are not inferred for E',({story,input,note})=>{
  story('E');input('admReason','induction of labor');assert.match(note(),/newborn was born to .* at ____ via/);assert.doesNotMatch(note(),/mother was admitted to our hospital/);
});
test('acceptance support has an explicit reuse action and does not rewrite admission',({seed,story,seg,click,tab,note})=>{
  seed();story('E');seg('resp','room air');const admission=note();tab('acc');assert.match(note(),/Respiratory support at acceptance is ____/);
  click('#useAdmissionResp');assert.match(note(),/At acceptance, the infant is breathing room air/);seg('acceptanceResp','NC');tab('adm');assert.equal(note(),admission);
  seg('resp','HFNC');tab('acc');assert.match(note(),/At acceptance.*NC/);
});
test('a newly measured acceptance weight does not replace admission weight',({seed,story,input,seg,tab,note,get})=>{
  seed();story('E');input('readmitCurrentWeight','3450');const adm=note();tab('acc');assert.match(note(),/weight recorded at admission/);
  seg('acceptanceWeightMode','measured');assert.equal(get('#accWeightField').hidden,false);input('accGrBW','3510');assert.match(note(),/Wt: 3510 g/);tab('adm');assert.equal(note(),adm);
  tab('acc');seg('acceptanceWeightMode','admission');assert.match(note(),/Wt: 3450 g/);seg('acceptanceWeightMode','measured');assert.match(note(),/Wt: 3510 g/);
});
test('care and abnormal-result modules do not ask for symptom onset',({story,problem,click,get,note})=>{
  story('E');problem('care');click('[data-stop-toggle="illness"]');assert.ok(get('#readmitOnsetDOL').closest('[hidden]'));assert.ok(get('#readmitCourseType').closest('[hidden]'));assert.doesNotMatch(note(),/developed continued/);
  problem('care');problem('abnormal-screen');assert.ok(get('#readmitOnsetDOL').closest('[hidden]'));
});
test('abdominal distension does not request vomiting details or leak a vomiting draft',({story,problem,click,input,get,note})=>{
  story('E');problem('gastrointestinal');click('[data-stop-toggle="illness"]');
  const vomiting='[data-rm-chip="rm_gastrointestinal_symptoms"][data-v="vomiting"]';click(vomiting);input('rm_gastrointestinal_character','bilious');assert.match(note(),/vomitus was bilious/);click(vomiting);
  click('[data-rm-chip="rm_gastrointestinal_symptoms"][data-v="abdominal distension"]');assert.ok(get('#rm_gastrointestinal_character').closest('[hidden]'));assert.match(note(),/abdominal distension/);assert.doesNotMatch(note(),/vomitus was bilious/);
});
test('jaundice choices share one module and are mutually exclusive',({story,problem,get})=>{
  story('E');problem('jaundice');problem('prolonged-jaundice');assert.equal(get('[data-msel="readmitProblems"] [data-v="jaundice"]').getAttribute('aria-pressed'),'false');
  assert.equal(get('[data-msel="readmitProblems"] [data-v="prolonged-jaundice"]').getAttribute('aria-pressed'),'true');
});
test('a confirmed thyroid history does not invent its type',({click,note})=>{
  click('[data-par="thyroid"] [data-v="mother"]');assert.match(note(),/maternal thyroid disease/);assert.doesNotMatch(note(),/maternal hyperthyroidism/);
  click('[data-seg="thyType"] [data-v="hypo"]');assert.match(note(),/maternal hypothyroidism/);
});
test('E birth resuscitation remains history, not a current diagnosis or procedure',({seed,story,input,click,problem,note,tab,get})=>{
  seed();story('E');input('birthResusStatus','performed');click('[data-add-birth="intubation"]');input('birthFinalSupport','ett');problem('jaundice');
  assert.match(note(),/intubat/i);assert.doesNotMatch(note().split('Tentative diagnosis:')[1],/Respiratory distress/);
  assert.equal(get('[data-proctog] [data-v="intub"]').getAttribute('aria-pressed'),'false');tab('plan');assert.doesNotMatch(note(),/via an OG tube|respiratory support with ETT/);
});
const samples=[
  ['jaundice',{rm_jaundice_trend:'persisted'},/The jaundice persisted/],
  ['prolonged-jaundice',{rm_jaundice_trend:'increased'},/The jaundice increased/],
  ['respiratory',{rm_respiratory_setting:'during feeding'},/Respiratory symptoms were reported during feeding/],
  ['fever',{rm_fever_temperature:'38.3',rm_fever_method:'axillary',rm_fever_time:'2026-10-02T10:15'},/38.3 °C.*axillary.*2026-10-02 10:15/],
  ['poor-feeding',{rm_feeding_usual:'90',rm_feeding_current:'45',rm_feeding_frequency:'every 3 hours'},/decreased from 90 to 45 mL per feed/],
  ['weight-loss',{rm_feeding_current:'30'},/Current milk intake was 30 mL/],
  ['apnea',{rm_apnea_count:'2',rm_apnea_duration:'15',rm_apnea_setting:'during sleep',rm_apnea_recovery:'after tactile stimulation'},/2 episodes of apnea or cyanosis were reported during sleep, each lasting approximately 15 seconds; the infant recovered after tactile stimulation/],
  ['gastrointestinal',{rm_gastrointestinal_character:'nonbilious',rm_gastrointestinal_count:'3'},/3 episodes of vomiting were reported/],
  ['abnormal-screen',{rm_screen_test:'TSH',rm_screen_result:'21 mIU/L',rm_screen_date:'2026-09-17'},/TSH.*September 17, 2026.*21 mIU\/L/],
  ['care',{rm_care_reason:'feeding support',rm_care_needs:'The family requested assistance with feeding.'},/Admission was requested for feeding support/]
];
for(const [reason,fields,expected] of samples)test(`E ${reason} module outputs and inactive drafts are excluded`,({seed,story,problem,input,tab,note,click,get})=>{
  seed();story('E');problem(reason);click('[data-stop-toggle="illness"]');if(reason==='gastrointestinal')click('[data-rm-chip="rm_gastrointestinal_symptoms"][data-v="vomiting"]');for(const [id,value] of Object.entries(fields)){assert.ok(!get('#'+id).closest('[hidden]'),id+' must be visible');input(id,value);}
  for(const t of ['adm','acc']){tab(t);assert.match(note(),expected);if(reason==='care'||reason==='abnormal-screen')assert.doesNotMatch(note(),/developed (continued|an abnormal)/);}
  tab('adm');problem(reason);assert.doesNotMatch(note(),expected);problem(reason);assert.match(note(),expected);
});
test('mixed complaints share common inputs and keep both selected problems',({seed,story,problem,click,input,note,d})=>{
  seed();story('E');problem('respiratory');problem('poor-feeding');click('[data-stop-toggle="illness"]');
  click('[data-rm-chip="rm_respiratory_symptoms"][data-v="cough"]');input('readmitComplaint','irritability');input('readmitOnsetDOL','16');input('rm_feeding_current','40');input('readmitSickContact','An older sibling had URI symptoms.');
  assert.match(note(),/On day of life 16, the infant had cough, poor feeding, and irritability/);
  assert.equal((note().match(/On day of life 16/g)||[]).length,1);
  assert.match(note(),/An older sibling had URI symptoms\./);assert.doesNotMatch(note(),/notable for an older sibling had/);
  for(const id of ['readmitIntake','readmitUrine','readmitActivity','readmitSickContact'])assert.equal(d.querySelectorAll('#'+id).length,1);
});
test('different onset is kept per problem; impossible onset is surfaced inline',({seed,story,problem,input,get,note})=>{
  seed();story('E');problem('jaundice');problem('respiratory');input('readmitDischargeDate','2026-09-19');input('readmitOnsetDOL','17');input('rm_jaundice_onset','3');
  const n=note();assert.ok(n.indexOf('Jaundice was noted on day of life 3')<n.indexOf('discharged home'));assert.match(n,/On day of life 17, the infant had respiratory symptoms/);
  input('rm_jaundice_onset','25');assert.match(get('#pathwayReview').textContent,/黃疸的起始 DOL/);assert.match(get('.readmit-local-review').textContent,/黃疸的起始 DOL/);
});
test('different known onset times are narrated in chronological rather than module order',({seed,story,problem,input,note})=>{
  seed();story('E');problem('respiratory');problem('fever');input('rm_respiratory_onset','17');input('rm_fever_onset','16');
  assert.ok(note().indexOf('On day of life 16')<note().indexOf('On day of life 17'));
});
test('fever measurement after admission is flagged without changing the recorded value',({seed,story,problem,input,get})=>{
  seed();story('E');problem('fever');input('admissionTime','14:00');input('rm_fever_time','2026-10-02T15:00');
  assert.match(get('#workflowReview').textContent,/體溫測量時間/);assert.equal(get('#rm_fever_time').value,'2026-10-02T15:00');
  input('rm_fever_time','2026-10-02T13:00');assert.doesNotMatch(get('#workflowReview').textContent,/體溫測量時間/);
});
test('E respiratory care does not show or output bilirubin even after switching modules',({seed,story,problem,input,click,visible,note})=>{
  seed();story('E');problem('jaundice');input('readmitTSB','15.2');problem('jaundice');problem('respiratory');click('[data-stop-toggle="evaluation"]');
  assert.equal(visible('readmitTSB'),false);assert.doesNotMatch(note(),/bilirubin/);
});
test('route switching preserves module drafts and does not contaminate other routes',({seed,story,problem,input,note,get,click})=>{
  seed();story('E');problem('fever');input('rm_fever_temperature','38.7');input('tentDx','viral illness');click('[data-stop-toggle="evaluation"]');
  story('D');assert.doesNotMatch(note(),/38.7|viral illness/);story('E');assert.equal(get('#rm_fever_temperature').value,'38.7');assert.match(note(),/38.7/);assert.match(note(),/viral illness/);
  click('[data-stop-toggle="evaluation"]');assert.ok(get('#readmitEvaluationBody').contains(get('#admissionStatusBody')));
  story('A');assert.equal(get('[data-story="A"]').getAttribute('aria-checked'),'true');click('[data-stop-toggle="adm"]');assert.ok(get('#journeyWorkspace').contains(get('#admissionStatusBody')));
});
test('feeding quantities replace the duplicate intake question with a read-only summary',({story,problem,click,input,get,note})=>{
  story('E');problem('poor-feeding');click('[data-stop-toggle="illness"]');input('rm_feeding_usual','90');input('rm_feeding_current','45');
  assert.equal(get('#readmitIntakeField').hidden,true);
  assert.equal(get('[data-set-field="readmitIntake"]').parentElement.hidden,true);
  assert.match(get('#readmitFeedingSummary').textContent,/90 → 45.*減少/);
  assert.equal(get('#readmitFeedingSummary').querySelector('input'),null);
  input('readmitFeedingNote','The infant required frequent pauses during feeds.');
  assert.match(note(),/decreased from 90 to 45 mL per feed/);assert.match(note(),/required frequent pauses/);
});
test('partial, zero and equal feeding quantities are represented without invented direction',({story,problem,input,get,note})=>{
  story('E');problem('poor-feeding');input('rm_feeding_usual','90');assert.match(get('#readmitFeedingSummary').textContent,/資料未齊，不推定增減/);
  input('rm_feeding_current','0');assert.match(get('#readmitFeedingSummary').textContent,/90 → 0.*減少/);assert.match(note(),/decreased from 90 to 0/);
  input('rm_feeding_current','90');assert.match(get('#readmitFeedingSummary').textContent,/相同/);assert.match(note(),/was unchanged at 90/);
});
test('contradictory old intake is retained and flagged; removal is explicit and reversible',({story,problem,click,input,get,note})=>{
  story('E');problem('respiratory');click('[data-set-field="readmitIntake"][data-v="remained at the usual level"]');problem('poor-feeding');input('rm_feeding_usual','90');input('rm_feeding_current','45');
  assert.equal(get('#readmitIntake').value,'remained at the usual level');
  assert.equal(get('#readmitIntakeReview').dataset.conflict,'true');assert.match(get('#reviewConflictList').textContent,/進食描述/);
  click('#clearPreviousIntake');assert.equal(get('#readmitIntake').value,'');assert.doesNotMatch(get('#reviewConflictList').textContent,/進食描述/);assert.doesNotMatch(note(),/Oral intake remained/);
  click('#restorePreviousIntake');assert.equal(get('#readmitIntake').value,'remained at the usual level');assert.equal(get('#readmitIntakeReview').dataset.conflict,'true');
});
test('matching legacy intake is deduplicated in both notes without deleting the input',({story,problem,input,get,note,tab})=>{
  story('E');problem('poor-feeding');input('readmitIntake','decreased');input('rm_feeding_usual','90');input('rm_feeding_current','45');
  for(const mode of ['adm','acc']){tab(mode);assert.match(note(),/decreased from 90 to 45/);assert.doesNotMatch(note(),/Oral intake decreased/);}
  assert.equal(get('#readmitIntake').value,'decreased');assert.match(get('#readmitIntakeReview').textContent,/合併為一次/);
});
test('feeding supplement drafts stay isolated; earlier baseline and current decline are not conflicts',({story,problem,input,seg,click,get,note})=>{
  story('E');problem('poor-feeding');click('[data-msel="readmitBaseline"] [data-v="feeding well"]');input('rm_feeding_usual','90');input('rm_feeding_current','45');input('readmitFeedingNote','The infant tired during feeds.');
  assert.doesNotMatch(get('#reviewConflictList').textContent,/進食描述/);assert.match(note(),/After discharge.*continued to feed well/);
  problem('poor-feeding');problem('respiratory');assert.doesNotMatch(note(),/tired during feeds|90 to 45/);problem('poor-feeding');assert.match(note(),/tired during feeds/);
  story('D');assert.doesNotMatch(note(),/tired during feeds/);story('E');assert.match(note(),/tired during feeds/);
});
test('review separates missing keys, unconfirmed actions, conflicts and neutral optional items',({seed,story,problem,input,click,get})=>{
  assert.match(get('#reviewMissingList').textContent,/出生日期/);assert.equal(get('#reviewConflicts').dataset.issues,'false');assert.equal(get('#reviewOptional').hasAttribute('data-issues'),false);
  seed();story('E');problem('respiratory');input('rm_respiratory_onset','25');
  assert.match(get('#reviewConflictList').textContent,/起始 DOL/);assert.doesNotMatch(get('#reviewMissingList').textContent,/起始 DOL/);
  assert.doesNotMatch(get('#reviewOptionalList').textContent,/黃疸|bilirubin/);
  input('birthResusStatus','performed');assert.match(get('#reviewPendingList').textContent,/實際處置/);
  assert.doesNotMatch(get('#reviewConflictList').textContent,/實際處置/);
  get('#reviewOptional').open=true;input('rm_respiratory_onset','17');assert.equal(get('#reviewOptional').open,true,'Input must not close optional review');
});
test('combined navigation identifies the exact E substage and copy only becomes primary at review',({story,click,get,note})=>{
  assert.equal(get('#flowMenu > summary').getAttribute('aria-label'),'切換病歷章節','Chapter switching is separate from the current clinical stage');
  assert.equal(get('#copy').disabled,false);assert.equal(get('#copy').dataset.primary,'false');assert.equal(get('#copy').textContent,'複製草稿');
  story('E');click('#birthHistoryCard [data-flow-target="pathwayCard"]');assert.match(get('#flowChapter').textContent,/本次病程/);assert.match(get('#flowDetail').textContent,/出院與返家基準.*1\/3/);
  click('#flowNext');assert.match(get('#flowDetail').textContent,/症狀與變化.*2\/3/);
  const before=note();click('#flowNext');assert.match(get('#flowDetail').textContent,/評估與收治.*3\/3/);click('#flowNext');
  assert.equal(get('#copy').dataset.primary,'true');assert.equal(get('#copy').textContent,'複製病歷');assert.equal(get('#flowNext').hidden,true);assert.equal(note(),before);
  click('#flowBack');assert.equal(get('#copy').dataset.primary,'false');assert.match(get('#flowDetail').textContent,/3\/3/);
});
test('first and last substage controls connect to the adjacent chart chapters',({story,click,get})=>{
  story('E');click('[data-stop-toggle="prior"]');click('#journeyPrev');assert.equal(get('#flowChapter').textContent,'出生資料');
  click('[data-stop-toggle="evaluation"]');assert.equal(get('#journeyNext').disabled,false);click('#journeyNext');assert.equal(get('#flowChapter').textContent,'核對病歷');
});
test('navigation menu closes on selection and Escape; navigation never edits clinical facts',({W,story,click,get,input,note})=>{
  story('E');input('readmitCourse','The symptoms persisted.');const before=note();get('#flowMenu').open=true;
  click('#flowSubsteps [data-phase-target="course:illness"]');assert.equal(get('#flowMenu').open,false);assert.equal(note(),before);
  get('#flowMenu').open=true;get('#flowMenu').dispatchEvent(new W.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(get('#flowMenu').open,false);assert.equal(note(),before);
});
test('confirmed support reuse is a read-only mode summary, not an unanswered second question',({story,seg,input,get,note,click})=>{
  story('D');input('birthFinalSupport','cpap');input('obM1Relation','continued');
  assert.match(get('#obM1RelationSummary').textContent,/CPAP.*離開外院出生場所前/);assert.equal(get('#obM1RelationDetails').open,false);
  assert.equal(get('#outsideSupportControls').parentElement.id,'obM1RelationDetails');
  input('obRespRelation','continued');assert.match(get('#obRespRelationSummary').textContent,/CPAP.*外院照護時/);assert.equal(get('#obRespRelationDetails').open,false);
  const before=note();get('#obRespRelationDetails').open=true;assert.equal(note(),before);
  input('obPEEP','6');get('#obRespRelationDetails').open=false;input('obAdmissionStatus','The infant remained tachypneic.');
  assert.equal(get('#obRespRelationDetails').open,false);assert.match(get('#obRespRelationDetails > summary').textContent,/原值保留/);assert.match(note(),/6 cmH2O/);
  input('birthFinalSupport','room');assert.equal(get('#obRespRelationSummary').hidden,true);assert.equal(get('#pathwaySupportControls').parentElement.closest('details'),null);
  assert.match(get('#reviewConflictList').textContent,/重新確認是否仍持續使用/);assert.equal(get('#obPEEP').value,'6');
});
test('all module clinical fields have a definition and output tests',({d})=>{
  const inputs=[...d.querySelectorAll('#readmitModules input:not([type="hidden"]),#readmitModules select')];
  assert.equal(inputs.length,25);assert.ok(inputs.every(el=>el.id&&d.querySelector(`label[for="${el.id}"]`)), 'Every field is labeled');
});
let failed=0;for(const [name,run]of tests){try{page(run);console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}}
console.log(`${tests.length-failed}/${tests.length} workflow checks passed`);if(failed)process.exitCode=1;
