// Clinical stage guidance. Synthetic inputs; no network or real patient data.
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8').replace('function render(){','window.guidanceTest={S,render,drawEvents,clinicalPhases,journeyViews,rememberJourneyView};function render(){');
const tests=[];
const test=(name,run)=>tests.push([name,()=>{
 const errors=[],dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-guidance.test/',beforeParse(W){W.scrollTo=()=>{};W.HTMLElement.prototype.scrollIntoView=()=>{};W.addEventListener('error',e=>errors.push(String(e.error?.stack||e.message)));}});
 const W=dom.window,d=W.document,get=s=>{const e=d.querySelector(s);assert.ok(e,'Missing '+s);return e;},click=s=>get(s).click();
 const input=(id,v)=>{const e=get('#'+id);e.value=v;e.dispatchEvent(new W.Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));};
 const story=s=>click(`[data-story="${s}"]`),seg=(k,v)=>click(`[data-seg="${k}"] [data-v="${v}"]`),phase=p=>click(`[data-phase-target="${p}"]`),choose=(f,v)=>click(`#${f}-choice-${v}`),note=()=>get('#note').textContent;
 const facts=()=>JSON.stringify(W.guidanceTest.S,(key,value)=>['journeyStep','journeyOpen'].includes(key)?undefined:value);
 const add=(stage,kind)=>{phase('course:'+({outside:'obCare',arrival:'obArrive',transport:'route'}[stage]));click(stage==='transport'?`[data-add-course="${kind}"]`:`[data-event-phase="${stage}"][data-add-stage-event="${kind}"]`);return W.guidanceTest.S.courseEvents.at(-1).id;};
 try{run({W,d,get,click,input,story,seg,phase,choose,note,facts,add});assert.deepEqual(errors,[],'Page exceptions');}finally{W.close();}
}]);
test('single selections and the D route survive a second click; clear is explicit',({story,seg,click,get,note,facts})=>{
 story('D');seg('dest','NICU');seg('gender','male');const text=note(),state=facts();story('D');seg('dest','NICU');seg('gender','male');assert.equal(note(),text);assert.equal(facts(),state);
 click('[data-clear-seg="gender"]');assert.doesNotMatch(note(),/\bmale\b/);assert.doesNotMatch(note(),/undefined/);assert.equal(get('[data-clear-seg="gender"]').disabled,true);assert.equal(get('[data-story="D"]').getAttribute('aria-checked'),'true');
});
test('single and multiple selections have distinct markers; add-event controls are actions',({story,get,click})=>{
 story('D');assert.equal(get('[data-seg="gender"] [data-v="male"]').dataset.choiceKind,'single');const sx=get('[data-msel="obSx"] [data-v="tachypnea"]');assert.equal(sx.dataset.choiceKind,'multi');sx.click();assert.equal(sx.getAttribute('aria-pressed'),'true');sx.click();assert.equal(sx.getAttribute('aria-pressed'),'false');assert.equal(get('[data-add-course="cpap"]').dataset.choiceKind,undefined);
});
test('arrow navigation moves single-choice focus without selecting a clinical fact',({story,get,W,d,note})=>{
 story('D');const first=get('[data-seg="gender"] [data-v="male"]'),text=note();first.focus();first.dispatchEvent(new W.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(d.activeElement,get('[data-seg="gender"] [data-v="female"]'));assert.equal(note(),text);
});
test('direct transport mode recording needs no abstract action and never means continuation',({story,input,get,click,seg,note,phase,d})=>{
 story('D');input('birthFinalSupport','cpap');click('#obM1Relation-choice-continued');phase('course:route');assert.equal(d.querySelector('#obRespRelation-choice-observed'),null);assert.doesNotMatch(get('#obRespRelationGuide').textContent,/只知道當時|記錄外院使用方式/);seg('obRespType','o2');assert.match(note(),/receiving supplemental oxygen during transport/);assert.doesNotMatch(note(),/oxygen was continued during transport/);
});
test('unknown predecessor does not require going back to record current transport support',({story,phase,get,seg,note})=>{
 story('D');phase('course:route');assert.equal(get('#pathwaySupportControls').hidden,false);seg('obRespType','cpap');assert.match(note(),/receiving CPAP during transport/);assert.doesNotMatch(note(),/CPAP was continued|CPAP was initiated/);
});
test('stage preview highlights exact recorded sentences without rewriting or auto-scrolling',({story,phase,input,get,note,click,d})=>{
 story('D');phase('course:obArrive');input('obArrival','The infant was tachypneic.');const text=note(),body=get('#previewBody');body.scrollTop=150;phase('course:route');assert.equal(note(),text);assert.equal(body.scrollTop,150);assert.equal(get('#previewStage').disabled,true);
 phase('course:obArrive');assert.match(get('.note-scope[data-active="true"]').textContent,/On our team's arrival.*tachypneic/);assert.match(get('#previewStage').textContent,/我方抵達外院/);const formTop=d.documentElement.scrollTop;click('#previewStage');assert.equal(d.documentElement.scrollTop,formTop);assert.equal(note(),text);
});
test('transport symptom labels and narrative agree on timing and follow the on-site record',({story,phase,input,get,note,click})=>{
 story('D');phase('course:obArrive');input('obArrival','The infant had mild retractions.');phase('course:route');click('[data-msel="obSx"] [data-v="tachypnea"]');input('obCourse','Transport monitoring was continued.');assert.match(get('#pwSxWrap > .lab').textContent,/轉送途中/);
 for(const tab of ['adm','acc']){click(`[data-tab="${tab}"]`);const text=note();assert.match(text,/During transport, tachypnea was noted/);assert.doesNotMatch(text,/Before transfer, tachypnea/);assert.ok(text.indexOf("On our team's arrival")<text.indexOf('During transport, tachypnea'));assert.equal(text.split('Transport monitoring was continued.').length,2);}
});
test('five chart chapters and unique fields remain, relation controls have visual alternatives',({d,get,story})=>{
 story('D');const ids=[...d.querySelectorAll('[id]')].map(e=>e.id);assert.equal(ids.length,new Set(ids).size);
 assert.equal(d.querySelectorAll('#flowMenu [data-flow-target]').length,5);
 assert.ok(get('#obM1Relation').closest('[hidden]'));assert.equal(get('#obM1RelationChoices').getAttribute('role'),'group');
 assert.match(get('#entryPathSummary').textContent,/產前資料.*出生經過.*外院照護.*外院聯繫.*我方抵達.*轉送途中.*核對/);
});
test('guidance stays concise while retaining the actual stage and entered observations',({story,input,phase,get,note,facts})=>{
 story('D');input('birthBreathing','labored');input('birthHR','120');const text=note(),state=facts();
 phase('birth:dr');const birth=get('#context-birth-dr');assert.match(birth.querySelector('.phase-inherit').textContent,/呼吸費力.*120/);assert.equal(birth.querySelectorAll('p:not(.phase-inherit)').length,0);
 phase('course:obCare');const care=get('#journeyContext');assert.match(care.textContent,/外院團隊.*我方抵達前.*出生處置後/);assert.equal(care.querySelectorAll('p').length,0);
 phase('course:obArrive');assert.equal(get('#journeyContext').querySelectorAll('p:not(.phase-inherit)').length,1);assert.match(get('#journeyContext').textContent,/非我方外接可略過/);
 assert.doesNotMatch(birth.textContent,/不必重填|唯讀摘要/);assert.equal(note(),text);assert.equal(facts(),state);
});
test('support explanations are opt-in, not repeated on each choice or outside parameter details',({story,input,choose,get,click,note,facts})=>{
 story('D');input('birthFinalSupport','cpap');const help=get('#obM1RelationHelp'),text=note(),state=facts();
 assert.equal(help.open,false);assert.equal(get('#obM1RelationChoices').querySelector('small'),null);assert.equal(get('#obM1RelationBefore').querySelector('span'),null);
 click('#obM1RelationHelp > summary');assert.equal(help.open,true);assert.match(help.textContent,/不代表已改為 Room air/);assert.equal(note(),text);assert.equal(facts(),state);
 choose('obM1Relation','continued');assert.equal(help.open,true);assert.ok(get('#obM1RelationDetails').contains(get('#obM1RelationSummary')));assert.equal(get('#obM1RelationDetails').open,false);
 const confirmed=note();click('#obM1RelationHelp > summary');click('#obM1RelationDetails > summary');assert.equal(get('#obM1RelationDetails').open,true);assert.equal(note(),confirmed);assert.equal(get('#obM1Flow').value,'');
});
test('returning to a shorter stage retains spacing below the sticky navigation',({story,phase,get,W,d})=>{
 story('D');phase('course:obArrive');const offset=parseFloat(d.documentElement.style.getPropertyValue('--workflow-offset'))||140;
 get('#journeyWorkspace').getBoundingClientRect=()=>({top:offset+20});W.guidanceTest.rememberJourneyView();assert.equal(W.guidanceTest.journeyViews['outborn:obArrive'].offset,-20);
});
test('recorded events remain outside the add-event disclosure in every transfer phase',({story,add,get,click,note,facts,d})=>{
 story('D');
 for(const [phase,host] of [['outside','obCareEvents'],['arrival','obArriveEvents'],['transport','courseEvents']]){
  const id=add(phase,'cpap'),events=get('#'+host),palette=events.previousElementSibling;
  assert.ok(palette.matches('details.optional-events'));assert.equal(get('#event-'+id+'-minutes').closest('details'),null);
  const text=note(),state=facts();palette.open=true;palette.querySelector('summary').click();assert.equal(palette.open,false);assert.equal(note(),text);assert.equal(facts(),state);
  assert.equal(d.querySelectorAll('#journeyWorkspace details details').length,0);
  click(`[data-event-id="${id}"] [data-event-action="remove"]`);assert.ok(events.contains(get('[data-undo-event="course"]')));click('[data-undo-event="course"]');assert.ok(events.contains(get('#event-'+id+'-minutes')));assert.equal(palette.open,false);assert.equal(note(),text);
 }
});
test('phase highlighting keeps menu controls stable, including focus and scroll',({story,phase,get,click,W,d,note})=>{
 story('D');phase('birth:birth');const selector='#flowSubsteps [data-phase-target="course:adm"]',button=get(selector);phase('birth:dr');assert.equal(get(selector),button);
 click('#phaseMenu > summary');button.focus();const menu=get('#flowSubsteps');menu.scrollTop=125;const text=note();W.guidanceTest.render();assert.equal(get(selector),button);assert.equal(d.activeElement,button);assert.equal(menu.scrollTop,125);assert.equal(note(),text);
});
test('birth rail follows the actual delivery setting and does not modify any clinical facts',({story,seg,phase,note,facts,get})=>{
 story('A');seg('delivery','cs');const text=note(),state=facts();
 for(const key of ['birth:info','birth:standby','birth:birth','birth:dr','birth:drEnd','course:route','course:adm']){phase(key);assert.equal(note(),text);assert.equal(facts(),state);}
 phase('birth:dr');assert.match(get('#flowDetail').textContent,/刀房處置/);assert.match(get('#context-birth-dr').textContent,/刀房/);
});
test('birth next navigation advances stages without collapsing or creating NRP events',({story,phase,click,get,W})=>{
 story('B');phase('birth:birth');click('#flowNext');assert.match(get('#flowDetail').textContent,/出生後會診/);click('#flowNext');assert.match(get('#flowDetail').textContent,/處置/);click('#flowNext');assert.match(get('#flowDetail').textContent,/離開/);click('#flowNext');assert.match(get('#flowDetail').textContent,/入院前處置/);assert.equal(W.guidanceTest.S.birthEvents.length,0);
});
test('E retains historical birth records and three complaint-driven admission stages',({story,seg,phase,get,input,note,d})=>{
 story('E');seg('dest','NBC');clickProblem(d,'respiratory');phase('birth:dr');input('birthResusStatus','none');assert.match(note(),/No resuscitation was required at birth/);
 phase('course:illness');assert.match(get('#journeyContext').textContent,/再次就醫/);assert.ok(get('#readmitTSB').closest('[hidden]'));
 assert.equal(WCourse(d),3);assert.match(get('#context-birth-info').textContent,/出生背景/);
});
function clickProblem(d,p){d.querySelector(`[data-msel="readmitProblems"] [data-v="${p}"]`).click();}
function WCourse(d){return [...d.querySelectorAll('#journey > li')].filter(e=>!e.hidden).length;}
test('C clearly identifies BR as preadmission and inherits maternal risk without new fields',({story,phase,get})=>{
 story('C');phase('course:route');assert.match(get('#journeyContext').textContent,/BR.*尚未收入/);phase('course:brEval');assert.match(get('#journeyContext').textContent,/兒科在 BR/);
});
test('continued mode needs an explicit click and never copies previous parameters',({story,input,choose,get,note})=>{
 story('D');input('birthFinalSupport','cpap');assert.equal(get('#obM1Relation').value,'');assert.match(get('#obM1RelationBefore').textContent,/CPAP/);
 choose('obM1Relation','continued');assert.match(note(),/CPAP was continued at the referring hospital/);assert.equal(get('#obM1Flow').value,'');
 assert.equal(get('[data-seg="obM1Type"]').hidden,true);
});
test('unknown prior support offers direct mode choices without inferring continuation',({story,seg,d,note})=>{
 story('D');assert.equal(d.querySelector('#obM1Relation-choice-continued'),null);assert.equal(d.querySelector('#obM1Relation-choice-observed'),null);seg('obM1Type','cpap');assert.match(note(),/was receiving CPAP at the referring hospital/);assert.doesNotMatch(note(),/CPAP was continued|CPAP was initiated/);
});
test('changing relationship preserves its own draft and does not leak settings or stability',({story,input,choose,seg,note,get})=>{
 story('A');input('birthFinalSupport','cpap');choose('obRespRelation','changed');seg('obRespType','ppv');input('obFiO2','40');get('[data-tog="obRespStable"] button').click();
 choose('obRespRelation','continued');assert.equal(get('#obFiO2').value,'');assert.doesNotMatch(note(),/40%|stable heart rate|remained stable during/);
 choose('obRespRelation','changed');assert.equal(get('#obFiO2').value,'40');assert.match(note(),/\(FiO2 40%\), with stable heart rate and oxygen saturation\./);assert.doesNotMatch(note(),/remained stable during/);
 choose('obRespRelation','stopped');assert.doesNotMatch(note(),/40%|stable heart rate|remained stable during/);
});
test('reconfirming a changed predecessor does not silently reuse settings from the old mode',({story,input,choose,get,note})=>{
 story('A');input('birthFinalSupport','cpap');choose('obRespRelation','continued');input('obPEEP','6');input('obFiO2','30');input('birthFinalSupport','ett');choose('obRespRelation','continued');assert.equal(get('#obPEEP').value,'');assert.equal(get('#obFiO2').value,'');assert.doesNotMatch(note(),/30%|6 cmH2O/);
 input('birthFinalSupport','cpap');choose('obRespRelation','continued');assert.equal(get('#obPEEP').value,'6');assert.equal(get('#obFiO2').value,'30');
});
test('editing the source invalidates a previous confirmation and review targets the visual choices',({story,input,choose,note,get,click,d})=>{
 story('D');input('birthFinalSupport','cpap');choose('obM1Relation','continued');input('birthFinalSupport','ppv');assert.doesNotMatch(note(),/was continued at the referring hospital/);
 const link=[...d.querySelectorAll('#reviewConflictList [data-review-target]')].find(e=>e.dataset.reviewTarget==='#obM1RelationChoices');assert.ok(link);click('[data-flow-target="finalReviewCard"]');link.click();assert.equal(d.activeElement,get('#obM1RelationChoices'));assert.match(get('#flowDetail').textContent,/外院照護/);
});
test('outside, on-site and transport events keep one record each and render in chronological stage order',({story,add,input,W,get,note,click})=>{
 story('D');const outside=add('outside','cpap'),arrival=add('arrival','intubation'),transport=add('transport','epinephrine');
 input('event-'+outside+'-note','Synthetic outside care.');input('event-'+arrival+'-note','Synthetic on-site care.');input('event-'+transport+'-note','Synthetic transport care.');
 assert.ok(get('#obCareEvents').contains(get('#event-'+outside+'-minutes')));assert.ok(get('#obArriveEvents').contains(get('#event-'+arrival+'-minutes')));
 assert.equal(W.guidanceTest.S.courseEvents.length,3);
 for(const tab of ['adm','acc']){click(`[data-tab="${tab}"]`);const n=note();assert.ok(n.indexOf('Synthetic outside care.')<n.indexOf('Synthetic on-site care.'));assert.ok(n.indexOf('Synthetic on-site care.')<n.indexOf('Synthetic transport care.'));assert.equal(n.split('Synthetic on-site care.').length,2);assert.match(n,/before our team's arrival/);assert.match(n,/after our team's arrival/);assert.match(n,/During transport/);}
});
test('outside intubation is not recorded as a procedure performed by our team',({story,add,get})=>{
 story('D');add('outside','intubation');assert.equal(get('[data-proctog] [data-v="intub"]').getAttribute('aria-pressed'),'false');add('arrival','intubation');assert.equal(get('[data-proctog] [data-v="intub"]').getAttribute('aria-pressed'),'true');
});
test('outborn birth-history intubation is retained in the narrative but not our procedure',({story,click,note,get})=>{
 story('D');click('[data-add-birth="intubation"]');assert.match(note(),/endotracheal intubation was performed/i);assert.equal(get('[data-proctog] [data-v="intub"]').getAttribute('aria-pressed'),'false');
});
test('explicit on-site support becomes the transport comparison without guessing its parameters',({story,add,input,phase,choose,note,get})=>{
 story('D');const event=add('arrival','cpap');input('event-'+event+'-fiO2','35');phase('course:route');assert.match(get('#obRespRelationBefore').textContent,/我方在外院.*CPAP/);choose('obRespRelation','continued');assert.match(note(),/CPAP was continued during transport/);assert.equal(get('#obFiO2').value,'');
 input('event-'+event+'-phase','outside');assert.doesNotMatch(note(),/CPAP was continued during transport/);
});
test('changing event phase relocates one stable event and focuses it; old location text is preserved',({story,add,input,W,get,d,note})=>{
 story('D');const event=add('transport','cpap');input('event-'+event+'-location','Example ward');input('event-'+event+'-phase','arrival');assert.equal(W.guidanceTest.S.courseEvents.length,1);assert.ok(get('#obArriveEvents').contains(get('#event-'+event+'-phase')));assert.equal(d.activeElement.id,'event-'+event+'-phase');assert.equal(get('#event-'+event+'-location').value,'Example ward');assert.match(note(),/after our team's arrival \(Example ward\)/);
});
test('outside events also supply the comparison when no on-site support was recorded',({story,add,input,phase,choose,note,get})=>{
 story('D');const id=add('outside','cpap');input('event-'+id+'-fiO2','35');phase('course:route');assert.match(get('#obRespRelationBefore').textContent,/外院團隊最後.*CPAP/);choose('obRespRelation','continued');assert.match(note(),/CPAP was continued during transport/);assert.equal(get('#obFiO2').value,'');
});
test('changing from D NICU to E NBC never leaves a stale NICU location in admission fields',({story,seg,phase,get})=>{
 story('D');seg('dest','NICU');phase('course:adm');story('E');seg('dest','NBC');seg('readmitSource','clinic');phase('course:evaluation');assert.doesNotMatch(get('#admissionStatusBody').textContent,/NICU/);assert.match(get('#journeyContext').textContent,/門診.*NBC/);
});
test('legacy events are not reclassified or given a fictitious phase in narrative',({story,W,get,note})=>{
 story('D');W.guidanceTest.S.courseEvents.push({id:501,kind:'cpap',location:'Example location'});W.guidanceTest.drawEvents('course');W.guidanceTest.render();assert.equal(get('#event-501-phase').value,'');assert.ok(get('#courseEvents').contains(get('#event-501-phase')));assert.match(note(),/At Example location, CPAP was provided/);assert.match(get('#event-501-phase').closest('.clinical-event').textContent,/尚未指定/);
});
test('review links follow moved events, keep phase selection, and return to review',({story,add,input,get,click,note,facts,d})=>{
 story('D');const id=add('arrival','epinephrine');input('event-'+id+'-minutes','30');click('[data-flow-target="finalReviewCard"]');const n=note(),s=facts();const link=[...d.querySelectorAll('#reviewPendingList [data-review-target]')].find(e=>e.dataset.reviewTarget===`#event-${id}-drugDose`);assert.ok(link);link.click();assert.equal(d.activeElement.id,`event-${id}-drugDose`);assert.match(get('#flowDetail').textContent,/我方抵達外院/);assert.equal(get('#event-'+id+'-drugDose').closest('details'),null);assert.equal(note(),n);assert.equal(facts(),s);click('#returnToReview');assert.equal(get('#flowChapter').textContent,'核對病歷');
});
test('phase changes preserve all route drafts and keep E free of outside events',({story,add,input,note,W,get})=>{
 story('D');const id=add('arrival','cpap');input('event-'+id+'-note','Synthetic on-site observation.');const before=note();story('E');assert.doesNotMatch(note(),/Synthetic on-site/);story('D');assert.equal(note(),before);assert.equal(W.guidanceTest.S.courseEvents[0].phase,'arrival');assert.ok(get('#obArriveEvents').contains(get('#event-'+id+'-minutes')));
});
test('removing and undoing a site event restores it in its original phase',({story,add,get,click,W})=>{
 story('D');const id=add('arrival','cpap');click(`[data-event-id="${id}"] [data-event-action="remove"]`);assert.equal(W.guidanceTest.S.courseEvents.length,0);assert.ok(get('#obArriveEvents').contains(get('[data-undo-event="course"]')));click('[data-undo-event="course"]');assert.equal(W.guidanceTest.S.courseEvents[0].id,id);assert.ok(get('#obArriveEvents').contains(get('#event-'+id+'-minutes')));
});
let failures=0;for(const [name,run] of tests){try{run();console.log('✓ '+name);}catch(e){failures++;console.error('✗ '+name+'\n'+e.stack);}}if(failures)process.exitCode=1;else console.log(`✓ ${tests.length} clinical guidance scenarios passed`);
