// Support state semantics, explicit procedures, review navigation, and prose boundaries.
// All data are synthetic. No network or production writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8').replace('function render(){','window.safetyAPI={S,render,drawEvents,supportSentence,resolvedSupport,clockTime};function render(){');
let passed=0,failed=0,matrix=0;
function test(name,run){
 const errors=[],dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-safety.test/',beforeParse(W){W.scrollTo=()=>{};W.HTMLElement.prototype.scrollIntoView=()=>{};W.addEventListener('error',e=>errors.push(e.error?.stack||e.message));}}),W=dom.window,d=W.document;
 const get=s=>{const e=d.querySelector(s);assert.ok(e,'Missing '+s);return e;},click=s=>get(s).click();
 const input=(id,v)=>{const e=get('#'+id);e.value=v;e.dispatchEvent(new W.Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));};
 const seg=(k,v)=>click(`[data-seg="${k}"] [data-v="${v}"]`),story=s=>click(`[data-story="${s}"]`),note=()=>get('#note').textContent;
 const both=check=>{for(const t of ['adm','acc']){click(`[data-tab="${t}"]`);check(note());}click('[data-tab="adm"]');};
 const warning=(target,word)=>[...d.querySelectorAll('#reviewConflictList [data-review-target]')].find(e=>e.dataset.reviewTarget===target&&(!word||e.textContent.includes(word)));
 try{run({W,d,get,click,input,seg,story,note,both,warning,...W.safetyAPI});assert.deepEqual(errors,[]);passed++;console.log('✓ '+name);}catch(e){failed++;console.error('✗ '+name+'\n'+e.stack);}finally{W.close();}
}
test('72 derived support combinations never imply intubation and link only what the two stations say',({S,d,story,supportSentence,resolvedSupport})=>{
 // 2026-10-06：拿掉「與前一站的關係」問題；關係只由前一站（A＝離開產房、D＝我方到場）與本段的值推導。
 const modes=['','room','o2','cpap','ppv','ett'];
 for(const s of ['A','D']){story(s);
  for(const source of modes)for(const selected of modes){
   S.courseEvents=[];d.getElementById('birthFinalSupport').value=s==='A'?source:'';S.obM1Type=s==='D'?source:'';
   const {relation}=resolvedSupport('obRespRelation',selected),text=supportSentence('obRespRelation',selected,'during transport',{fiO2:'30',peep:'6'});
   assert.doesNotMatch(text,/\b(?:reintubated|intubated|intubation|reintubation|discontinued|wean|improv|extubat)\b/i);
   if(!selected){assert.equal(text,'');assert.equal(relation,'');}
   else if(!source){assert.equal(relation,'');assert.match(text,/was receiving|was breathing room air/);}
   else if(selected===source){assert.equal(relation,'continued');assert.match(text,/was continued|continued breathing room air/);}
   else if(source==='room'){assert.equal(relation,'new');assert.match(text,/was initiated/);}
   else if(selected==='room'){assert.equal(relation,'changed');assert.match(text,/was switched from .* to room air/);}
   else {assert.equal(relation,'changed');assert.match(text,/respiratory support was changed to/i);}
   if(relation!=='continued')assert.doesNotMatch(text,/was continued|continued breathing/);
   matrix++;
  }}
 assert.equal(matrix,72);
});
test('same mode with entered settings is a continuation carrying only the entered values',({story,input,seg,note,phase,click})=>{
 story('D');click('[data-phase-target="course:obArrive"]');seg('obM1Type','cpap');click('[data-phase-target="course:route"]');seg('obRespType','cpap');input('obFiO2','40');input('obPEEP','6');
 assert.match(note(),/CPAP was continued during transport \(FiO2 40%, pressure 6 cmH2O\)/);assert.doesNotMatch(note(),/were adjusted|changed to CPAP/);
 seg('obM1Type','o2');assert.match(note(),/respiratory support was changed to CPAP during transport \(FiO2 40%, pressure 6 cmH2O\)/i,'Editing the previous station re-derives at once; the entered values stay with this station');
});
test('explicit reintubation is recorded once and only our known phase enables Procedure',({story,click,input,both,S,get})=>{
 story('D');click('[data-add-stage-event="intubation"][data-event-phase="arrival"]');const id=S.courseEvents.at(-1).id;
 input(`event-${id}-intubationAction`,'repeat');both(n=>assert.equal((n.match(/endotracheal reintubation was performed/gi)||[]).length,1));assert.equal(get('[data-proctog] [data-v="intub"]').getAttribute('aria-pressed'),'true');
 for(const phase of ['outside','']){input(`event-${id}-phase`,phase);assert.equal(get('[data-proctog] [data-v="intub"]').getAttribute('aria-pressed'),'false');}
 input(`event-${id}-phase`,'transport');assert.equal(get('[data-proctog] [data-v="intub"]').getAttribute('aria-pressed'),'true');
});
test('birth time parser rejects malformed values and review returns to the actual field',({story,input,warning,d,click,get,both,clockTime})=>{
 for(const [raw,expected] of [['930','09:30'],['9:30','09:30'],['0000','00:00'],['2359','23:59'],['24:00',''],['9999',''],['12:60',''],['9x30',''],['abc','']])assert.equal(clockTime(raw),expected);
 story('A');input('birthTime','9999');click('[data-flow-target="finalReviewCard"]');const issue=warning('#birthTime');assert.ok(issue);issue.click();assert.equal(d.activeElement.id,'birthTime');assert.equal(get('#birthTime').value,'9999');both(n=>assert.doesNotMatch(n,/99:99/));input('birthTime','0930');assert.equal(warning('#birthTime'),undefined);both(n=>assert.match(n,/at 09:30/));
});
test('fractional counts remain editable, omitted as facts, and warnings clear without rounding',({story,click,input,warning,d,get,both})=>{
 story('E');click('[data-msel="readmitProblems"] [data-v="apnea"]');input('rm_apnea_count','1.5');click('[data-phase-target="course:evaluation"]');click('[data-flow-target="finalReviewCard"]');const issue=warning('#rm_apnea_count','整數');assert.ok(issue);issue.click();assert.equal(d.activeElement.id,'rm_apnea_count');assert.equal(get('#rm_apnea_count').value,'1.5');both(n=>assert.doesNotMatch(n,/1\.5 episodes/));input('rm_apnea_count','2');assert.equal(warning('#rm_apnea_count','整數'),undefined);both(n=>assert.match(n,/2 episodes of apnea or cyanosis/));
});
test('vomiting count validation applies only while vomiting is selected',({story,click,input,warning,both})=>{
 story('E');click('[data-msel="readmitProblems"] [data-v="gastrointestinal"]');click('[data-rm-chip="rm_gastrointestinal_symptoms"][data-v="vomiting"]');input('rm_gastrointestinal_count','2.5');assert.ok(warning('#rm_gastrointestinal_count','整數'));both(n=>assert.doesNotMatch(n,/2\.5 episodes/));click('[data-rm-chip="rm_gastrointestinal_symptoms"][data-v="vomiting"]');assert.equal(warning('#rm_gastrointestinal_count','整數'),undefined);
});
test('prior-course conflict links to its choice and does not silently edit the history',({story,input,click,seg,warning,d,get})=>{
 story('E');input('birthDate','2026-09-20');input('admissionDate','2026-10-04');input('readmitDischargeDate','2026-09-23');seg('readmitPrior','uneventful');click('[data-msel="readmitProblems"] [data-v="apnea"]');input('rm_apnea_onset','2');click('[data-flow-target="finalReviewCard"]');const issue=warning('[data-seg="readmitPrior"]');assert.ok(issue);issue.click();assert.equal(d.activeElement,get('[data-seg="readmitPrior"]'));assert.equal(get('[data-seg="readmitPrior"] [data-v="uneventful"]').getAttribute('aria-pressed'),'true');seg('readmitPrior','treated');assert.equal(warning('[data-seg="readmitPrior"]'),undefined);
});
test('predicate normalization preserves full sentences, negation, uncertainty and medical case',({story,input,seg,both})=>{
 story('D');seg('dest','NICU');seg('resp','room air');
 for(const value of ['had mild retractions','Had mild retractions','was not cyanotic','appeared to have mild retractions']){input('obArrival',value);input('obAdmissionStatus',value);both(n=>{assert.match(n,new RegExp('arrival at the referring hospital, the infant '+value.toLowerCase()));assert.match(n,new RegExp('admission to our NICU, the infant (?:'+value.toLowerCase()+'|was breathing room air and '+value.toLowerCase()+')'));});}
 for(const value of ['pH was 7.31.','iNO was not required.','Possible mild retractions were noted.']){input('obArrival',value);input('obAdmissionStatus',value);both(n=>{assert.ok(n.includes(value));assert.ok(!n.includes('the infant '+value));});}
});
test('apnea details form one episode sentence without inventing unknown counts or timing',({story,click,input,both})=>{
 story('E');click('[data-msel="readmitProblems"] [data-v="apnea"]');click('[data-rm-chip="rm_apnea_type"][data-v="apnea"]');input('rm_apnea_duration','15');input('rm_apnea_recovery','spontaneously');both(n=>{assert.match(n,/Apnea was reported, with a reported duration of approximately 15 seconds; the infant recovered spontaneously/);assert.doesNotMatch(n,/Episodes of apnea|The infant had apnea\./);});
 input('rm_apnea_count','1');both(n=>assert.match(n,/1 episode of apnea was reported, lasting approximately 15 seconds; the infant recovered spontaneously/));input('rm_apnea_count','2');both(n=>assert.match(n,/2 episodes of apnea were reported, each lasting approximately 15 seconds/));
});
test('care and screening together do not fabricate a disease or omit either reason',({story,click,input,both})=>{
 story('E');for(const v of ['care','abnormal-screen'])click(`[data-msel="readmitProblems"] [data-v="${v}"]`);input('rm_care_reason','temporary caregiver unavailability');input('rm_screen_test','newborn screening');input('rm_screen_result','an elevated marker');both(n=>{assert.match(n,/temporary caregiver unavailability/);assert.match(n,/newborn screening/);assert.doesNotMatch(n,/with ____ for further evaluation and treatment/);});
});
test('the same mode before and after is never written as a change',({story,input,seg,both})=>{
 story('A');input('birthFinalSupport','o2');seg('obRespType','o2');input('obO2Flow','2');both(n=>{assert.doesNotMatch(n,/was changed to/);assert.match(n,/Supplemental oxygen was continued before admission \(flow 2 L\/min\)/);});
});
test('no relation questions or relation warnings remain; room air keeps its own meaning',({d,story,input,seg,note,warning})=>{
 story('D');assert.equal(d.querySelector('#obM1Relation,#obRespRelation,[data-support-choice],[id$="RelationChoices"]'),null);
 story('A');input('birthFinalSupport','room');seg('obRespType','room');assert.match(note(),/The infant continued breathing room air before admission/);
 input('birthFinalSupport','o2');assert.match(note(),/The infant was switched from supplemental oxygen to room air before admission/);
 assert.equal([...d.querySelectorAll('#reviewConflictList [data-review-target]')].filter(e=>/Relation/.test(e.dataset.reviewTarget)).length,0);
});
test('arrival settings have editable parameters, isolated drafts and no transport inheritance',({story,input,seg,get,both,click,d,warning})=>{
 story('D');click('[data-phase-target="course:obArrive"]');seg('obM1Type','cpap');input('obM1FiO2','35');input('obM1PEEP','6');assert.equal(get('#obM1IPWrap').hidden,true);assert.equal(get('#obM1RRWrap').hidden,true);both(n=>assert.match(n,/On our team's arrival at the referring hospital, the infant was receiving CPAP \(FiO2 35%, pressure 6 cmH2O\)/));
 click('[data-phase-target="course:route"]');seg('obRespType','cpap');assert.equal(get('#obFiO2').value,'');assert.equal(get('#obPEEP').value,'');
 story('E');both(n=>assert.doesNotMatch(n,/FiO2 35%/));story('D');assert.equal(get('#obM1FiO2').value,'35');assert.equal(get('#obM1PEEP').value,'6');
 input('obM1FiO2','150');click('[data-phase-target="course:route"]');click('[data-flow-target="finalReviewCard"]');const issue=warning('#obM1FiO2');assert.ok(issue);issue.click();assert.equal(d.activeElement.id,'obM1FiO2');input('obM1FiO2','35');assert.equal(warning('#obM1FiO2'),undefined);
});
test('mode choices are direct, never inside a disclosure',({story,get,d})=>{
 story('D');for(const key of ['obM1Type','obRespType']){assert.equal(get(`[data-seg="${key}"]`).closest('details'),null,key);}
 assert.equal(d.querySelector('#obM1RelationHelp,#obRespRelationHelp,#obM1RelationDetails,#obRespRelationDetails'),null);
});
test('explicit event automation never overrides a manual Procedure opt-out',({story,click,input,S,get})=>{
 story('D');click('[data-add-stage-event="intubation"][data-event-phase="arrival"]');click('[data-proctog] [data-v="intub"]');assert.equal(get('[data-proctog] [data-v="intub"]').getAttribute('aria-pressed'),'false');const id=S.courseEvents.at(-1).id;input(`event-${id}-intubationAction`,'repeat');assert.equal(get('[data-proctog] [data-v="intub"]').getAttribute('aria-pressed'),'false');
});
console.log(`${passed} safety scenarios passed; ${matrix} support combinations checked; ${failed} failures`);if(failed)process.exitCode=1;
