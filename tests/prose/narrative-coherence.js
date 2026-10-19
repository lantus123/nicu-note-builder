// Synthetic data only. DOM/prose regressions are not a substitute for real-browser layout QA.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(__dirname+'/../../index.html','utf8');
const html=source.replace('function abbr(key,longForm){', 'function abbr(key,longForm){if(window.abbrTrace)window.abbrTrace.push({key,note:composingNote,body:window.admBodyStarted});')
  .replace('function renderAdm(){','function renderAdm(){window.admBodyStarted=false;')
  .replace('// ── 段落 1：出生 + 產檢 + 母體病史 + 篩檢 ──','window.admBodyStarted=true; // ── 段落 1：出生 + 產檢 + 母體病史 + 篩檢 ──')
  .replace('function writeNote(content,format){','function writeNote(content,format){if(window.failWriteNote)throw new Error("synthetic write failure");')
  .replace('function render(){','window.coherenceAPI={S,render,renderAdm,renderAcc,postnatalNarrative,timelineReview,abbr,getComposingNote:()=>composingNote,maternalAbxRecords,maternalAntibioticNarrative,maternalIapStatus,recordedDatePhrase,eventNarrative,dolInfo,primaryDx};function render(){');
assert.notEqual(html,source,'Test hook must be attached');
let passed=0,failed=0;
const matchIndex=process.argv.indexOf('--match'),match=matchIndex<0?'':process.argv[matchIndex+1];
if(matchIndex>=0&&!match)throw Error('--match requires a test-name fragment');
function test(name,run){
  if(match&&!name.includes(match))return;
  const errors=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-coherence.test/',beforeParse(W){
    const RealDate=W.Date,fixed=(name.startsWith('batch9C')?new RealDate(2026,9,12,12):new RealDate(2026,7,30,12)).getTime();
    W.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};
    W.scrollTo=()=>{};W.HTMLElement.prototype.scrollIntoView=()=>{};
    W.addEventListener('error',e=>errors.push(String(e.error?.stack||e.message)));
  }});
  const W=dom.window,d=W.document;
  const get=s=>{const e=d.querySelector(s);assert.ok(e,'Missing '+s);return e;};
  const click=s=>get(s).click();
  const input=(id,value)=>{const e=get('#'+id);e.value=value;e.dispatchEvent(new W.Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));};
  const seg=(key,value)=>click(`[data-seg="${key}"] [data-v="${value}"]`);
  const note=()=>get('#note').textContent;
  const both=check=>{for(const mode of ['adm','acc']){click(`[data-tab="${mode}"]`);check(note(),mode);}click('[data-tab="adm"]');};
  const issue=(selector,word)=>[...d.querySelectorAll('#workflowReview [data-review-target]')].find(e=>e.dataset.reviewTarget===selector&&(!word||(e.getAttribute('aria-label')||e.textContent).includes(word)));
  try{run({W,d,get,click,input,seg,note,both,issue,...W.coherenceAPI});assert.deepEqual(errors,[],'No page errors');passed++;console.log('✓ '+name);}
  catch(e){failed++;console.error('✗ '+name+'\n'+e.stack);}
  finally{W.close();}
}

test('no maternal antibiotic default or extra required field is introduced',({get,note,maternalAbxRecords,maternalIapStatus})=>{
  assert.equal(maternalAbxRecords().length,0);assert.equal(maternalIapStatus(),'none');
  assert.equal(get('#maternalIapStatus').hidden,true);assert.equal(get('#maternalAbxCourses').children.length,0);
  assert.equal(get('#deliveryTriggerMore').open,false);assert.equal(get('#reviewWriting').hidden,true);
  assert.doesNotMatch(note(),/The mother received antibiotics|antibiotic treatment|Intrapartum antibiotic prophylaxis|Delivery occurred because of/);
  assert.ok(get('#maternalAntibiotics').classList.contains('pn-full'));
  assert.equal(get('#maternalAntibiotics').closest('.card'),get('[data-seg="mgso4"]').closest('.card'),'Keep the original prenatal medication location');
});

test('infection treatment and unspecified antibiotics never become IAP',({S,input,seg,both,get,issue,maternalIapStatus,click})=>{
  input('iapDrug','Synthetic antibiotic');input('iapSince','8/1');input('birthDate','2026-08-30');
  both((n,mode)=>{assert.match(n,mode==='adm'?/The mother received antibiotics with Synthetic antibiotic starting on 8\/1\./:/maternal antibiotics \(purpose unspecified\): Synthetic antibiotic starting on 8\/1/);assert.doesNotMatch(n,/Intrapartum antibiotic prophylaxis|\bIAP:/);});
  const missing=issue('[data-seg="maternalAbxPurpose"]');assert.ok(missing);missing.click();
  assert.equal(get('[data-seg="maternalAbxPurpose"]').getAttribute('tabindex'),'-1');
  seg('maternalAbxPurpose','treatment');
  both((n,mode)=>{assert.match(n,mode==='adm'?/The mother received antibiotic treatment with Synthetic antibiotic starting on 8\/1\./:/maternal infection treatment: Synthetic antibiotic starting on 8\/1/);assert.doesNotMatch(n,/Intrapartum antibiotic prophylaxis|\bIAP:|completeness was/);});
  assert.equal(issue('#iapSince','IAP開始'),undefined);assert.equal(issue('[data-seg="maternalAbxPurpose"]'),undefined);
  assert.equal(maternalIapStatus(),'none');assert.equal(get('#maternalIapStatus').hidden,true);
  // Explicit old IAP status is retained as a draft, but is not active under another purpose.
  seg('maternalAbxPurpose','iap');seg('iap','complete');assert.equal(maternalIapStatus(),'complete');
  seg('maternalAbxPurpose','other');assert.equal(S.iap,'complete');assert.equal(maternalIapStatus(),'none');
  both(n=>assert.doesNotMatch(n,/Intrapartum antibiotic prophylaxis|\bIAP:|prophylaxis was documented as complete|documented complete/));
  seg('maternalAbxPurpose','iap');assert.equal(get('[data-seg="iap"] [data-v="complete"]').getAttribute('aria-pressed'),'true');
  assert.equal(get('#iapDrug').value,'Synthetic antibiotic');assert.equal(get('#iapSince').value,'8/1');
  click('[data-flow-target="prenatalCard"]');assert.match(get('[data-band-node="prenatal:iap"]').textContent,/IAP/);
});

test('explicit IAP reports only recorded completeness and review links to its actual fields',({input,seg,get,issue,d,both,maternalIapStatus})=>{
  seg('maternalAbxPurpose','iap');input('iapDrug','Synthetic prophylactic antibiotic');input('iapSince','8/1');input('birthDate','2026-08-30');
  both((n,mode)=>assert.match(n,mode==='adm'?/Intrapartum antibiotic prophylaxis \(IAP\) with Synthetic prophylactic antibiotic was administered starting on 8\/1; its adequacy could not be determined from the available record\./:/IAP: Synthetic prophylactic antibiotic starting on 8\/1 \(adequacy unknown\)/));
  assert.equal(maternalIapStatus(),'none');
  const status=issue('[data-seg="iap"]','完整性仍需');assert.ok(status);status.click();assert.equal(d.activeElement,get('[data-seg="iap"]'));
  const date=issue('#iapSince','IAP開始日期比出生早 29 天');assert.ok(date);date.click();assert.equal(d.activeElement.id,'iapSince');
  seg('iap','incomplete');both((n,mode)=>assert.match(n,mode==='adm'?/prophylaxis was documented as incomplete\./:/IAP: Synthetic prophylactic antibiotic starting on 8\/1 \(documented incomplete\)/));
  assert.equal(maternalIapStatus(),'incomplete');assert.equal(issue('[data-seg="iap"]','完整性仍需'),undefined);
  seg('iap','none');assert.equal(get('[data-seg="iap"] [data-v="none"]').getAttribute('aria-pressed'),'false');
  assert.equal(maternalIapStatus(),'none');
});

test('multiple courses use one source, preserve focus and drafts, and support undo',({S,input,seg,click,get,d,both,maternalIapStatus})=>{
  seg('maternalAbxPurpose','treatment');input('iapDrug','Synthetic treatment A');input('iapSince','8/20');input('maternalAbxUntil','8/22');
  click('#addMaternalAbx');const id=S.maternalAbxCourses[0].id,key=k=>`maternal-abx-${id}-${k}`;
  assert.equal(d.activeElement.id,key('purpose'));input(key('purpose'),'iap');input(key('iap'),'complete');
  const drug=get('#'+key('drug'));drug.focus();input(key('drug'),'Synthetic prophylaxis B');assert.equal(d.activeElement,drug);assert.equal(get('#'+key('drug')),drug,'Typing must not rebuild the row');
  input(key('since'),'8/30');assert.equal(maternalIapStatus(),'complete');
  both((n,mode)=>{assert.equal((n.match(/Synthetic treatment A/g)||[]).length,1);assert.equal((n.match(/Synthetic prophylaxis B/g)||[]).length,1);assert.match(n,mode==='adm'?/with Synthetic treatment A from 8\/20 to 8\/22/:/maternal infection treatment: Synthetic treatment A from 8\/20 to 8\/22/);});
  input(key('purpose'),'treatment');assert.equal(maternalIapStatus(),'none');assert.equal(S.maternalAbxCourses[0].iap,'complete');
  assert.equal(get('#'+key('iap')).parentElement.hidden,true);
  input(key('purpose'),'iap');assert.equal(get('#'+key('iap')).value,'complete');
  click(`[data-remove-maternal-abx="${id}"]`);assert.equal(S.maternalAbxCourses.length,0);both(n=>assert.doesNotMatch(n,/Synthetic prophylaxis B/));
  click('#undoMaternalAbx');assert.equal(get('#'+key('drug')).value,'Synthetic prophylaxis B');assert.equal(maternalIapStatus(),'complete');
  click('[data-story="E"]');click('[data-story="D"]');assert.equal(get('#'+key('since')).value,'8/30');
  assert.equal(get('#iapDrug').value,'Synthetic treatment A');
});

test('extra-course review targets remain stable and conflicting IAP statuses are not collapsed',({S,input,seg,click,get,d,issue,maternalIapStatus,both,render,note})=>{
  seg('maternalAbxPurpose','iap');seg('iap','complete');input('iapDrug','Synthetic drug A');
  click('#addMaternalAbx');const id=S.maternalAbxCourses[0].id,key=k=>`maternal-abx-${id}-${k}`;
  input(key('drug'),'Synthetic drug B');issue('#'+key('purpose')).click();assert.equal(d.activeElement.id,key('purpose'));
  input(key('purpose'),'iap');issue('#'+key('iap'),'完整性仍需').click();assert.equal(d.activeElement.id,key('iap'));
  input(key('iap'),'incomplete');assert.equal(maternalIapStatus(),'none');
  S.scr.gbs='pos';render();assert.match(note(),/IAP adequacy requires verification/);assert.doesNotMatch(note(),/IAP status not documented/,'Conflicting documented courses are not described as unrecorded');
  assert.ok(issue('#'+key('iap'),'不同 IAP 療程'));assert.ok(issue('[data-seg="iap"]','不同 IAP 療程'));
  both((n,mode)=>{assert.match(n,mode==='adm'?/with Synthetic drug A was administered; prophylaxis was documented as complete/:/IAP: Synthetic drug A \(documented complete\)/);assert.match(n,mode==='adm'?/with Synthetic drug B was administered; prophylaxis was documented as incomplete/:/IAP: Synthetic drug B \(documented incomplete\)/);});
  input(key('iap'),'complete');assert.equal(maternalIapStatus(),'complete');assert.equal(issue('#'+key('iap'),'不同 IAP 療程'),undefined);
  input(key('purpose'),'other');assert.equal(maternalIapStatus(),'complete','Other purposes do not negate an explicit IAP course');
});

test('dates, missing drugs and literal drug text survive without guessing',({S,input,seg,click,get,both,recordedDatePhrase,maternalAntibioticNarrative})=>{
  for(const separator of ['-','–','~','～'])assert.equal(recordedDatePhrase('8/20 '+separator+' 8/22'),'from 8/20 to 8/22');
  assert.equal(recordedDatePhrase('8/20'),'on 8/20');assert.equal(recordedDatePhrase('8/20, 8/22'),'on 8/20, 8/22');
  input('iapSince','8/20-8/22');
  both((n,mode)=>{assert.match(n,mode==='adm'?/The mother received antibiotics from 8\/20 to 8\/22; the antibiotic was ____\./:/maternal antibiotics \(purpose unspecified\): antibiotic ____ from 8\/20 to 8\/22/);assert.doesNotMatch(n,/starting from|Intrapartum antibiotic prophylaxis/);assert.ok([...get('#note').querySelectorAll('.ph')].some(el=>el.closest('.slot')?.textContent.includes(mode==='adm'?'the antibiotic was ____':'antibiotic ____')),'A missing drug keeps placeholder styling');});
  seg('maternalAbxPurpose','iap');both((n,mode)=>{assert.match(n,mode==='adm'?/IAP\) was recorded from 8\/20 to 8\/22; the antibiotic was ____/:/IAP: antibiotic ____ from 8\/20 to 8\/22 \(adequacy unknown\)/);assert.doesNotMatch(n,/Ampicillin/);});
  input('iapDrug','Drug <tag> & "literal"');both(n=>assert.ok(n.includes('Drug <tag> & "literal"')));assert.equal(get('#note').querySelector('tag'),null);
  click('#addMaternalAbx');const id=S.maternalAbxCourses[0].id;input(`maternal-abx-${id}-drug`,'  Synthetic B  ');
  assert.ok(maternalAntibioticNarrative().some(n=>n==='The mother received antibiotics with Synthetic B.'));
  assert.equal(get(`#maternal-abx-${id}-drug`).value,'  Synthetic B  ','The editable draft itself is untouched');
});

test('event response matrix retains the selected findings and never assumes prior ventilation',({eventNarrative,S})=>{
  S.pathway='direct';
  for(const scope of ['birth','course'])for(const kind of ['ppv','intubation','compressions','epinephrine','o2','cpap']){
    const event={kind,fiO2:'30',pip:'16',peep:'5',response:''};
    const unchanged=eventNarrative(event,scope).join(' ');assert.doesNotMatch(unchanged,/following the intervention|partial improvement|subsequently improved|partially improved|No improvement was noted/);
    for(const [value,phrase] of [['partial','Respiratory distress partially improved.'],['improved','Heart rate and oxygen saturation subsequently improved.'],['none','No improvement was noted.']]){
      const n=eventNarrative({...event,response:value},scope).join(' ');assert.ok(n.endsWith(phrase));assert.doesNotMatch(n,/\.\.|continued through|partial improvement|Thus,|Therefore,/);
      if(value!=='improved')assert.doesNotMatch(n,/heart rate and oxygen saturation subsequently improved/i);
    }
    if(kind==='intubation'){assert.match(unchanged,/ventilatory support was provided through the endotracheal tube/);assert.doesNotMatch(unchanged,/continued/);}
  }
  assert.doesNotMatch(eventNarrative({kind:'intubation'},'birth').join(' '),/ventilatory support|FiO2|cmH2O/,'No settings means no fabricated ventilation settings');
});

test('intubation, partial response and Apgar retain chronological facts in both notes',({S,input,click,get,both})=>{
  click('[data-story="D"]');click('[data-add-stage-event="intubation"][data-event-phase="arrival"]');
  const id=S.courseEvents.at(-1).id;
  input(`event-${id}-pip`,'16');input(`event-${id}-peep`,'5');
  click(`[data-event-id="${id}"] [data-event-choice="response"] [data-v="partial"]`);
  input('ap1','8');input('ap5','9');
  input('tentDx','prematurity');assert.equal(get('#respiratoryDxReview').hidden,false,'Course events alone also prompt review, without adding a diagnosis');
  both((n,mode)=>{
    assert.match(n,mode==='adm'?/Apgar scores were 8 and 9/:/Apgar scores: 8 and 9/);
    assert.match(n,mode==='adm'?/endotracheal intubation was performed and ventilatory support was provided through the endotracheal tube \(PIP 16 cmH2O, PEEP 5 cmH2O\)\. Respiratory distress partially improved\./i:/after team arrival at referring hospital: intubation \(partial improvement in respiratory distress\)/);
    assert.doesNotMatch(n,/Thus,|continued through the endotracheal tube|due to poor response/);
  });
  assert.equal(get(`#event-${id}-pip`).value,'16');assert.equal(get(`#event-${id}-peep`).value,'5','Omitting routine settings from the brief does not change their source');
});

test('delivery trigger is optional, separate from admission and C/S reasons, and shared once',({input,seg,both,get})=>{
  input('admReason','synthetic maternal observation');seg('delivery','cs');input('csReason','synthetic surgical indication');
  both(n=>assert.doesNotMatch(n,/Delivery occurred because of/));
  input('deliveryTrigger','synthetic delivery trigger');
  for(const mode of ['cs','nsd']){seg('delivery',mode);both((n,noteMode)=>{
    assert.equal((n.match(noteMode==='adm'?/Delivery occurred because of synthetic delivery trigger\./g:/delivery indication: synthetic delivery trigger/g)||[]).length,1);
    assert.doesNotMatch(n,/Delivery occurred because of synthetic maternal observation/);
    if(noteMode==='acc')assert.match(n,/maternal admission: synthetic maternal observation/,'Maternal admission and delivery indications keep their own labels');
  });}
  const scope=[...get('#note').querySelectorAll('.note-scope')].find(el=>el.textContent==='Delivery occurred because of synthetic delivery trigger.');
  assert.equal(scope?.dataset.notePhase,'birth:info','Preview links back to the stage that contains the trigger field');
  assert.equal(get('#csReason').value,'synthetic surgical indication','Changing delivery mode keeps its draft');
  input('deliveryTrigger','');both(n=>assert.doesNotMatch(n,/synthetic delivery trigger|Delivery occurred because of/));
});

test('respiratory reminder never adds a diagnosis without confirmation or converts it to RDS',({input,click,get,note,both,issue,d,primaryDx})=>{
  click('#entryDirect');input('tentDx','prematurity');input('birthBreathing','labored');
  assert.equal(primaryDx(),'prematurity');assert.equal(get('#respiratoryDxReview').hidden,false);
  assert.match(note(),/admitted to .* for management of prematurity\./);assert.doesNotMatch(note(),/tentative diagnosis of prematurity/);
  issue('#tentDx','前文有呼吸相關紀錄').click();assert.equal(d.activeElement.id,'tentDx');
  click('#confirmRespiratoryDx');assert.equal(get('#tentDx').value,'prematurity and respiratory distress');
  assert.equal(get('#respiratoryDxReview').hidden,true);click('#confirmRespiratoryDx');assert.equal(get('#tentDx').value,'prematurity and respiratory distress');
  both(n=>{assert.match(n,/prematurity and respiratory distress/);assert.doesNotMatch(n,/respiratory distress syndrome|\bRDS\b/);});
  input('tentDx','suspected pneumonia');assert.equal(get('#respiratoryDxReview').hidden,true);both(n=>assert.match(n,/suspected pneumonia/));
  click('[data-story="E"]');input('tentDx','prematurity');assert.equal(get('#respiratoryDxReview').hidden,true,'Historic birth distress is not a current readmission problem');
});

test('writing suggestions link back without editing drugs, organisms, numbers or free text',({input,click,get,d,issue,note})=>{
  const text='She received McDonald cerclage. An endocervix culture was obtained. After admission, tocolysis with Ceftrixone was recorded. Synthetic organism A (few), value 0.42.';
  input('matOtherHx',text);assert.equal(get('#reviewWriting').hidden,false);assert.match(get('#reviewWritingSummary').textContent,/5 項/);
  assert.equal(get('#matOtherHx').value,text);assert.ok(note().includes('Ceftrixone'));assert.ok(note().includes('Synthetic organism A (few), value 0.42'));
  issue('#matOtherHx','藥名').click();assert.equal(d.activeElement.id,'matOtherHx');assert.equal(get('#matOtherHx').value,text);
  input('matOtherHx','After admission, the mother received treatment.');assert.equal(get('#reviewWriting').hidden,true,'An explicit subject does not get the ambiguity hint');
  input('readmitCourse','An endocervix culture was obtained.');assert.equal(get('#reviewWriting').hidden,true,'Inactive route draft is not reviewed');
  click('[data-story="E"]');input('readmitCourse','An endocervix culture was obtained.');assert.ok(issue('#readmitCourse','endocervical'));
});

test('DOL calculation, default today, manual control, opening and PMA remain unchanged',({input,get,note,click,seg,dolInfo})=>{
  assert.equal(get('#admissionDate').value,'2026-08-30');input('birthDate','2026-08-30');input('gaW','32');input('gaD','4');
  assert.equal(dolInfo().value,1);assert.equal(dolInfo().elapsed,0);assert.match(note(),/^This 1-day-old /);
  click('[data-tab="acc"]');assert.match(note(),/DOL 1, PMA 32\+4 wks/);click('[data-tab="adm"]');
  input('admissionDate','2026-08-31');assert.equal(dolInfo().value,2);assert.equal(dolInfo().elapsed,1);assert.match(note(),/^This 2-day-old /);
  click('#dolManual');seg('dol','x');input('dolOther','9');assert.equal(dolInfo().value,9);assert.match(note(),/^This 9-day-old /);
  click('#dolAutoReset');assert.equal(dolInfo().value,2);assert.equal(get('#dolManualWrap').hidden,true);
  input('admissionDate','2026-08-29');assert.equal(dolInfo().value,null);assert.match(note(),/^This __-day-old /);
  input('admissionDate','2026-09-04');click('[data-story="E"]');assert.equal(dolInfo().value,6);assert.match(note(),/^This 6-day-old /);
  click('[data-tab="acc"]');assert.match(note(),/DOL 6, PMA 33\+2 wks/);
});

// Batch 9C uses synthetic October audit dates; existing August scenarios stay unchanged.
test('batch9C nursery maternal PROM registers only after paragraph one begins',({S,get,W,renderAdm,note})=>{
  Object.assign(S,{pathway:'nursery',outborn:false,brEval:['maternal']});S.r.prom.on=true;
  get('#promH').value='20';get('#birthDate').value='2026-10-12';
  for(const [ga,key,long] of [['38','PROM','Premature'],['34','PPROM','Preterm premature']]){
    get('#gaW').value=ga;W.abbrTrace=[];renderAdm();
    const body=note().split('Tentative diagnosis:')[0];
    assert.match(body,new RegExp(long+' rupture of membranes \\('+key+'\\) occurred 20 hours before delivery\\.'));
    assert.equal(body.indexOf(key),body.indexOf('('+key+')')+1,'No acronym before its definition');
    assert.ok(W.abbrTrace.some(x=>!x.body&&x.key===key),'Probe exercises the pre-body review call');
    assert.ok(W.abbrTrace.filter(x=>!x.body).every(x=>x.note===null),'No abbreviation registration before paragraph 1');
    assert.match(note().split('Tentative diagnosis:')[1],/for 20 hours \(prolonged, >18 hours\)/);
  }
});

test('batch9C response deduplication follows actual phase order and sentence adjacency',({S,postnatalNarrative})=>{
  Object.assign(S,{pathway:'outborn',outborn:true});
  const transport={id:'synthetic-t',kind:'cpap',phase:'transport',response:'improved'};
  const outside={id:'synthetic-o',kind:'ppv',phase:'outside',response:'improved'};
  const count=()=> (postnatalNarrative().join(' ').match(/Heart rate and oxygen saturation subsequently improved\./g)||[]).length;
  for(const events of [[transport,outside],[outside,transport]]){S.courseEvents=events;assert.equal(count(),2,'Across phases and consultation both responses survive');}
  S.courseEvents=[outside,{...transport,phase:'outside'}];assert.equal(count(),1,'Adjacent same-phase response is omitted');
  S.courseEvents=[{...outside,note:'Synthetic intervening observation.'},{...transport,phase:'outside'}];assert.equal(count(),2,'An intervening note breaks adjacency');
  S.courseEvents=[outside,{id:'synthetic-a',kind:'assessment',phase:'outside',hr:'142'},{...transport,phase:'outside'}];assert.equal(count(),2,'Reassessment breaks adjacency');
  S.courseEvents=[outside,{...transport,phase:'arrival'}];S.obM1Type='room';assert.equal(count(),2,'Arrival sentence breaks adjacency');
});

test('batch9C birth signs use neutral sentences without an added resuscitation review',({S,get,renderAdm,renderAcc,note,timelineReview})=>{
  Object.assign(S,{pathway:'direct',outborn:false});
  for(const [id,value] of Object.entries({birthBreathing:'spontaneous',birthTone:'good',birthHR:'142',birthResusStatus:'none'}))get('#'+id).value=value;
  for(const sign of ['retractions','grunting','cyanosis']){
    S.birthSigns=[sign];
    for(const renderNote of [renderAdm,renderAcc]){
      renderNote();
      if(renderNote===renderAdm){
        assert.match(note(),new RegExp('At birth, the infant was breathing spontaneously and had good muscle tone, with '+sign+' and a heart rate of 142 beats/min\\.'));
        assert.match(note(),/No resuscitation was performed at birth\./);
      }else{
        assert.match(note(),new RegExp('Respiratory: at birth: '+sign+'; no resuscitation at birth'));
        assert.match(note(),/at admission: ____; at acceptance: ____/,'Birth observations do not define either later support state');
      }
      assert.doesNotMatch(note(),/did not require resuscitation/);
    }
    timelineReview();assert.doesNotMatch(get('#workflowReview').textContent,/出生呼吸紀錄與「無需急救」並存/);
  }
});

test('batch9C Admission defines abbreviations while Acceptance retains concise PPV GBS and DOIC facts',({S,get,renderAdm,renderAcc,note})=>{
  Object.assign(S,{pathway:'outborn',outborn:true,doic:true,obM1Type:'',birthEvents:[],courseEvents:[{id:'synthetic-support',kind:'assessment',phase:'transport',support:'ett'}]});
  S.scr.gbs='pos';get('#doicMin').value='3';get('#birthResusStatus').value='';
  renderAdm();const body=note().split('Tentative diagnosis:')[0];
  assert.match(body,/positive-pressure ventilation \(PPV\) through the endotracheal tube/);
  assert.equal((body.match(/positive-pressure ventilation \(PPV\)/g)||[]).length,1);
  assert.match(body,/The infant had delayed initial crying \(DOIC\), with the first cry at 3 minutes of age\./);
  renderAcc();
  assert.match(note(),/during transport: PPV via ETT/);
  assert.match(note(),/maternal GBS positive/);
  assert.match(note(),/DOIC \(\+; first cry at 3 minutes of age\)/);
  assert.match(note(),/at admission: ____; at acceptance: ____/,'Transfer support cannot become current support without an entry');
});

test('batch9C time bounds, dynamic rupture chip, and exception cleanup',({S,get,click,render,renderAdm,renderAcc,note,W,getComposingNote,abbr})=>{
  Object.assign(S,{pathway:'nursery',outborn:false,brEval:['persist24']});
  get('#birthDate').value='2026-10-12';get('#birthTime').value='10:00';
  for(const [date,time,prompt] of [['2026-10-11','09:00',false],['2026-10-12','09:59',false],['2026-10-12','10:00',true],['2026-10-13','09:59',true],['2026-10-13','10:00',false]]){
    get('#admissionDate').value=date;get('#admissionTime').value=time;renderAdm();
    assert.equal(get('#workflowReview').textContent.includes('不足 24 小時'),prompt,date+' '+time);
  }
  for(const ga of ['34','38','']){
    get('#gaW').value=ga;get('#admReason').value='';click('[data-fill="admReason"] [data-prom-reason]');
    const expected=(ga==='34'?'preterm ':'')+'premature rupture of membranes';assert.equal(get('#admReason').value,expected);
    assert.equal(get('[data-fill="admReason"] [data-prom-reason]').textContent,ga==='34'?'PPROM':'PROM','Chip label follows the current GA');
    get('#gaW').value=ga==='34'?'38':'34';render();assert.equal(get('#admReason').value,expected,'Free text survives subsequent GA edits');
    assert.equal(get('[data-fill="admReason"] [data-prom-reason]').textContent,ga==='34'?'PROM':'PPROM','Chip label re-derives after a GA edit (full render, as a GA input does)');
    // 2026-10-13（Opus 審 9C）：GA 改過後再點同一顆 chip 是移除舊寫法，不得疊成 PROM and PPROM；aria-pressed 兩種寫法都算已選。
    assert.equal(get('[data-fill="admReason"] [data-prom-reason]').getAttribute('aria-pressed'),'true','Either rupture wording counts as selected');
    click('[data-fill="admReason"] [data-prom-reason]');assert.equal(get('#admReason').value,'','Second click removes the earlier wording instead of stacking');
    assert.equal(get('[data-fill="admReason"] [data-prom-reason]').getAttribute('aria-pressed'),'false');
  }
  for(const renderNote of [renderAdm,renderAcc]){
    W.failWriteNote=true;assert.throws(renderNote,/synthetic write failure/);W.failWriteNote=false;
    assert.equal(getComposingNote(),null);assert.equal(abbr('PROM','premature rupture of membranes'),'premature rupture of membranes (PROM)');
    renderNote();const first=note();renderNote();assert.equal(note(),first);assert.equal(getComposingNote(),null);
  }
});

console.log(`${passed} narrative-coherence scenarios passed; ${failed} failures`);
if(!passed&&!failed)throw Error('No scenarios match '+match);
if(failed)process.exitCode=1;
