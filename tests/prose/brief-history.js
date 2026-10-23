// Acceptance Brief history is a focused handover summary. All cases are synthetic.
// Optional differential gate: BRIEF_HISTORY_BASELINE=/path/to/old/index.html node brief-history.js
// It compares every unchanged note plus the full Acceptance suffix from Hospital course onward.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');
const baseline=process.env.BRIEF_HISTORY_BASELINE
  ?fs.readFileSync(process.env.BRIEF_HISTORY_BASELINE,'utf8'):null;
const match=process.env.BRIEF_HISTORY_MATCH?new RegExp(process.env.BRIEF_HISTORY_MATCH,'i'):null;
let passed=0,failed=0;

function withPage(check,source=html,eventFixture=false){
  const errors=[];
  const dom=new JSDOM(source,{runScripts:'dangerously',pretendToBeVisual:true,
    url:'https://nicu-brief-history.test/',beforeParse(W){
      const RealDate=W.Date,fixed=new RealDate(2026,7,30,12).getTime();
      W.Date=class extends RealDate{
        constructor(...args){super(...(args.length?args:[fixed]));}
        static now(){return fixed;}
      };
      W.scrollTo=()=>{};W.HTMLElement.prototype.scrollIntoView=()=>{};
      W.addEventListener('error',e=>errors.push(String(e.error?.message||e.message)));
    }});
  const W=dom.window,d=W.document;
  const get=selector=>{const el=d.querySelector(selector);assert.ok(el,'Missing control: '+selector);return el;};
  const click=selector=>get(selector).click();
  const input=(id,value)=>{
    const el=get('#'+id);assert.ok(!el.readOnly&&!el.disabled,'Uneditable control: '+id);
    if(el.tagName==='SELECT')assert.ok([...el.options].some(o=>o.value===value),'Missing option '+value+' in '+id);
    el.value=value;el.dispatchEvent(new W.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));
  };
  const choose=selector=>{const el=get(selector);if(el.getAttribute('aria-pressed')!=='true')el.click();};
  const seg=(key,value)=>choose(`[data-seg="${key}"] [data-v="${value}"]`);
  const msel=(key,value)=>choose(`[data-msel="${key}"] [data-v="${value}"]`);
  const tog=key=>choose(`[data-tog="${key}"] button`);
  const risk=(key,value='yes')=>click(`[data-ryn="${key}"] [data-v="${value}"]`);
  const screening=(key,value)=>get(`.scr-row[data-scr="${key}"] input[type="radio"][value="${value}"]`).click();
  const story=key=>click(`[data-story="${key}"]`);
  const note=mode=>{const tab=get(`[data-tab="${mode}"]`);if(tab.getAttribute('aria-selected')!=='true')tab.click();return get('#note').textContent.trim();};
  const brief=()=>{
    const text=note('acc'),start=text.indexOf('【Brief history】'),end=text.indexOf('【Hospital course】');
    assert.ok(start>=0&&end>start,'Acceptance must retain both section boundaries');
    return text.slice(start+'【Brief history】'.length,end).trim();
  };
  const row=label=>{
    const match=brief().split('\n').find(line=>line.toLowerCase().startsWith(label.toLowerCase()+':'));
    assert.ok(match,'Missing Brief history row: '+label);return match;
  };
  const page={W,d,get,click,input,seg,msel,tog,risk,screening,story,note,brief,row};
  try{
    if(eventFixture){
      // Reference initialization kept for the optional fixture-parity verification.
      seg('gender','male');input('gaW','38');input('gaD','2');input('bw','3120');
      seg('delivery','nsd');seg('dest','NICU');input('gravida','2');input('para','1');
      input('matAge','31');input('ap1','8');input('ap5','9');
      input('birthDate','2026-08-30');input('birthTime','14:20');
      input('tentDx','respiratory distress');story('A');input('birthResusStatus','none');
    }else{
      // Only this shared fixture is batched. The original UI selectors then render it;
      // every action specific to a clinical scenario still dispatches its real UI event.
      for(const [id,value] of Object.entries({gaW:'38',gaD:'2',bw:'3120',gravida:'2',para:'1',matAge:'31',
        ap1:'8',ap5:'9',birthDate:'2026-08-30',birthTime:'14:20',tentDx:'respiratory distress',birthResusStatus:'none'}))get('#'+id).value=value;
      seg('gender','male');seg('delivery','nsd');seg('dest','NICU');story('A');
    }
    const result=check(page);assert.deepEqual(errors,[],'No runtime errors during note generation');return result;
  }finally{W.close();}
}
function test(name,check){
  if(match&&!match.test(name))return;
  try{withPage(check);passed++;console.log('PASS '+name);}
  catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}
}
const unknown=/(?:unknown|unavailable|not (?:documented|recorded)|_+|\?)/i;

if(process.env.BRIEF_HISTORY_VERIFY_FIXTURE){
  const snapshot=p=>({
    notes:Object.fromEntries(['adm','plan','proc','acc'].map(mode=>[mode,p.note(mode)])),
    inputs:[...p.d.querySelectorAll('input,select,textarea')].map(el=>[el.id,el.value,el.checked,el.disabled,el.readOnly]),
    choices:[...p.d.querySelectorAll('button[aria-pressed]')].map(el=>[el.id,el.dataset.v,el.getAttribute('aria-pressed')])
  });
  test('fixture parity: batched initialization equals original UI events',p=>{
    assert.deepEqual(snapshot(p),withPage(snapshot,html,true));
  });
}

test('routine history has seven readable rows with identity, reason, and birth details',p=>{
  p.tog('birthNegConfirmed');p.seg('resp','NCPAP');p.seg('acceptanceResp','room air');
  const text=p.brief(),lines=text.split('\n').filter(line=>line.trim());
  assert.equal(lines.length,7,'Routine history should be an opening plus six clinical rows');
  assert.match(lines[0],/^A male neonate,\s*GA 38\+2 weeks,\s*BW 3120 g\s*\(AGA\)/i);
  assert.match(lines[0],/admitted to .*NICU.*for respiratory distress/i);
  assert.match(p.row('Birth history'),/G2P1.*VD/i);
  assert.match(p.row('Birth history'),/14:20.*(?:2026[-/]0?8[-/]30|8\/30|August 30, 2026)/);
  assert.match(p.row('Apgar scores'),/8 and 9 at 1 and 5 minutes/i);
  assert.ok(lines.some(line=>/^Fetal distress/i.test(line)));
  for(const label of ['Respiratory','Perinatal history','Infection risk factors'])p.row(label);
  assert.doesNotMatch(text,/This .*infant was born at|The infant was delivered|The mother received regular prenatal care/i);
  assert.doesNotMatch(text,/pediatric team was called to stand by/i,'Standby logistics should not duplicate Admission');
});

test('unconfirmed birth events stay unknown even with high Apgar scores and no resuscitation',p=>{
  const initial=p.brief();
  for(const label of ['Fetal distress','DOIC','MSAF']){
    assert.match(initial,new RegExp(label+'\\s*\\([^)]*(?:unknown|_+|\\?)[^)]*\\)','i'));
    assert.doesNotMatch(initial,new RegExp(label+'\\s*\\(-\\)','i'));
  }
  p.tog('birthNegConfirmed');
  for(const label of ['Fetal distress','DOIC','MSAF'])assert.match(p.brief(),new RegExp(label+'\\s*\\(-\\)','i'));
});

test('positive birth events retain details and override the negative confirmation',p=>{
  p.tog('birthNegConfirmed');p.tog('doic');p.input('doicMin','3.5');p.tog('msaf');p.seg('msafGrade','thick');
  p.input('ap1','4');p.input('ap5','7');p.input('ap10','9');
  const text=p.brief();
  assert.match(text,/Fetal distress\s*\(-\)/i);
  assert.match(text,/DOIC\s*\(\+[^\n]*3\.5\s*(?:min|minute)/i);
  assert.match(text,/MSAF\s*\(\+[^\n]*thick/i);
  assert.match(p.row('Apgar scores'),/4,\s*7,?\s*and 9 at 1,\s*5,?\s*and 10 minutes/i);
  assert.doesNotMatch(text,/DOIC\s*\(-\)|MSAF\s*\(-\)/i);
});

test('GA days, zero gravidity/parity, and unknown values are preserved without inference',p=>{
  p.input('gaW','34');p.input('gaD','0');p.input('bw','2100');p.input('gravida','0');p.input('para','0');
  assert.match(p.brief().split('\n')[0],/GA 34(?:\+0)? weeks.*BW 2100 g/i);
  assert.match(p.row('Birth history'),/G0P0/);
  p.input('gravida','3');p.input('para','');p.input('abortion','1');
  assert.match(p.row('Birth history'),/G3P(?:_+|\?|unknown)/i);
  assert.doesNotMatch(p.row('Birth history'),/G3P[012]/,'P must not be calculated from G or A');
  p.input('gaW','');p.input('gaD','');p.input('bw','');
  const opening=p.brief().split('\n')[0];
  assert.match(opening,unknown);assert.doesNotMatch(opening,/\b(?:AGA|SGA|LGA)\b|GA 0|BW 0|NaN|undefined/i);
});

test('acceptance support remains independent of prior PPV and admission NCPAP',p=>{
  p.click('[data-ladder-v="ppv"]');p.input('birthFinalSupport','cpap');p.seg('resp','NCPAP');
  let respiratory=p.row('Respiratory');
  assert.match(respiratory,/PPV|positive-pressure ventilation/i);
  assert.match(respiratory,/at admission:\s*NCPAP/i);
  assert.match(respiratory,/at acceptance:[^;]*?(?:unknown|not (?:recorded|documented)|_+|\?)/i);
  p.seg('acceptanceResp','room air');respiratory=p.row('Respiratory');
  assert.match(respiratory,/at acceptance:\s*(?:breathing )?room air/i);
  assert.doesNotMatch(respiratory,/at acceptance:[^;]*NCPAP/i);
  p.click('[data-clear-seg="resp"]');
  assert.match(p.row('Respiratory'),/at acceptance:\s*(?:breathing )?room air/i);
});

test('outborn birth and transfer hospitals stay distinct with correctly timed support',p=>{
  p.story('D');p.input('obFacility','Birth Hospital A');p.input('obTransferFrom','Referring Hospital B');
  p.input('obReason','respiratory distress');p.seg('obM1Type','cpap');p.seg('obRespType','ppv');
  p.msel('obSx','tachypnea');p.input('obArrival','the infant was pale');
  p.input('obCourse','The infant remained pale during transport.');
  p.seg('resp','NCPAP');p.seg('acceptanceResp','room air');
  assert.match(p.row('Birth history'),/Birth Hospital A/);
  assert.match(p.brief(),/from Referring Hospital B/i);
  assert.match(p.row('Respiratory'),/(?:transport-team arrival|arrival of .*team|team.*arrival)[^;]*CPAP/i);
  assert.match(p.row('Respiratory'),/during transport:[^;]*(?:PPV|positive-pressure)/i);
  assert.match(p.row('Respiratory'),/at admission:\s*NCPAP/i);
  assert.match(p.row('Respiratory'),/at acceptance:\s*(?:breathing )?room air/i);
  assert.doesNotMatch(p.row('Birth history'),/born.*Referring Hospital B/i);
  const respiratory=p.row('Respiratory');
  assert.ok(respiratory.search(/team.*arrival[^;]*CPAP/i)<respiratory.search(/during transport:\s*tachypnea/i),
    'The referring-hospital arrival support must precede the recorded transport symptom');
  assert.match(respiratory,/during transport:\s*tachypnea/i);
  assert.ok(respiratory.search(/during transport:[^;]*(?:PPV|positive-pressure)/i)<respiratory.search(/at admission:\s*NCPAP/i),
    'Transport support must precede support on admission');
  const other=p.row('Other relevant findings');
  assert.match(other,/on team arrival at referring hospital:\s*the infant was pale/i);
  assert.match(other,/during transport:\s*The infant remained pale during transport/i);
  assert.ok(other.indexOf('the infant was pale')<other.indexOf('The infant remained pale during transport'),
    'Raw arrival and transport observations must retain their chronological order');
});

test('nursery transfer retains its source even without observations or a recorded diagnosis',p=>{
  p.story('C');p.seg('dest','NBC');
  const text=p.brief(),opening=text.split('\n')[0];
  assert.match(opening,/transferred from the baby room and admitted to our NBC/i);
  assert.match(opening,/for _+/,'An unrecorded reason must remain a placeholder');
  assert.doesNotMatch(text,/respiratory distress|tachypnea|retractions|hypoglycemia|jaundice|sepsis|unremarkable/i);
});

test('readmission includes present age and route while birth ventilation remains historical',p=>{
  p.click('[data-ladder-v="ett"]');p.input('birthFinalSupport','room');
  p.story('E');p.input('birthDate','2026-08-13');p.input('birthHosp','Birth Hospital A');
  p.input('tentDx','');p.seg('dest','NBC');p.seg('readmitSource','clinic');
  p.msel('readmitProblems','prolonged-jaundice');p.seg('resp','room air');p.seg('acceptanceResp','room air');
  const text=p.brief(),opening=text.split('\n')[0];
  assert.match(opening,/(?:DOL\s*18|18-day-old)/i);
  assert.match(opening,/admitted.*NBC.*(?:jaundice)/i);
  assert.match(text,/(?:outpatient clinic|clinic)/i);
  assert.match(p.row('Birth history'),/Birth Hospital A/);
  const respiratory=p.row('Respiratory');
  assert.match(respiratory,/(?:birth|prior)[^;]*(?:intubation|PPV|ETT)/i);
  assert.match(respiratory,/at (?:this |current )?admission:\s*(?:breathing )?room air/i);
  assert.match(respiratory,/at acceptance:\s*(?:breathing )?room air/i);
  assert.doesNotMatch(text,/transport team|transferred from|referring hospital/i);
});

test('switching pathways excludes inactive transport and jaundice drafts',p=>{
  p.story('D');p.input('obFacility','Inactive Hospital Z');p.input('obReason','obsolete transport reason');
  p.seg('obM1Type','ett');p.input('obM1FiO2','80');
  p.story('E');p.seg('dest','NBC');p.seg('readmitSource','emergency');p.input('tentDx','');
  p.msel('readmitProblems','jaundice');p.input('readmitTSB','19.9');
  p.click('[data-msel="readmitProblems"] [data-v="jaundice"]');p.msel('readmitProblems','respiratory');
  let text=p.brief();assert.match(text,/respiratory symptoms/i);assert.match(text,/emergency/i);
  assert.doesNotMatch(text,/Inactive Hospital Z|obsolete transport reason|80%|19\.9|bilirubin|jaundice|transport team/i);
  p.story('A');p.input('tentDx','prematurity');text=p.brief();
  assert.doesNotMatch(text,/emergency|Inactive Hospital Z|obsolete transport reason|bilirubin|19\.9/i);
});

test('GBS state and antibiotic purpose remain explicit; treatment is never assumed IAP',p=>{
  p.screening('gbs','pos');p.seg('maternalAbxPurpose','treatment');p.input('iapDrug','Cefazolin');
  let line=p.row('Infection risk factors');assert.match(line,/GBS[^;]*(?:positive|\+)/i);
  assert.match(line,/Cefazolin/);assert.match(line,/(?:treatment|infection)/i);
  assert.match(line,/IAP[^;]*(?:unknown|not (?:recorded|documented)|_+|\?)/i);
  assert.doesNotMatch(line,/(?:complete|adequate) IAP|IAP[^;]*(?:complete|adequate)/i);
  p.seg('maternalAbxPurpose','iap');p.seg('iap','incomplete');line=p.row('Infection risk factors');
  assert.match(line,/(?:IAP[^;]*incomplete|incomplete[^;]*IAP)/i);assert.match(line,/Cefazolin/);
  p.seg('iap','none');line=p.row('Infection risk factors');
  assert.match(line,/IAP[^;]*(?:unknown|not (?:recorded|documented)|_+|\?)/i);
});

test('GBS pending, not tested, and unknown are distinguishable from negative',p=>{
  for(const [state,word] of [['pend',/pending/i],['nd',/not (?:tested|performed|obtained)/i],['unknown',unknown]]){
    p.screening('gbs',state);const line=p.row('Infection risk factors');
    assert.match(line,word);assert.doesNotMatch(line,/GBS[^;]*(?:negative|\(-\))/i);
  }
});

test('recorded ROM decimal durations retain both precision and unit; missing duration is not zero',p=>{
  p.risk('prom');p.input('promH','0.5');
  assert.match(p.row('Infection risk factors'),/0\.5\s*hours?/i);
  p.click('[data-numunit="promH"] [data-v="days"]');
  assert.match(p.row('Infection risk factors'),/0\.5\s*days?/i);
  assert.doesNotMatch(p.row('Infection risk factors'),/0\.5\s*hours?/i);
  p.input('promH','');const line=p.row('Infection risk factors');
  assert.match(line,/ROM|rupture of membranes/i);assert.doesNotMatch(line,/\b0\s*(?:hours?|days?)/i);
});

test('important maternal, prenatal, and examination findings survive summary selection',p=>{
  p.risk('gdm');p.click('[data-rc="gdm"] [data-v="insulin"]');
  p.click('[data-r3="pre"] [data-v="confirmed"]');p.risk('steroid');
  p.input('matOtherHx','hypothyroidism under regular follow-up');
  p.seg('us','abnormal');p.input('usFindings','right hydronephrosis');
  p.input('birthInitialNote','a cleft palate was noted');
  p.screening('hbsag','pos');p.screening('hbeag','pos');
  assert.match(p.row('Perinatal history'),/insulin/i);assert.match(p.row('Perinatal history'),/GDM|gestational diabetes/i);
  assert.match(p.row('Perinatal history'),/preeclampsia/i);assert.match(p.row('Perinatal history'),/betamethasone/i);
  assert.match(p.row('Perinatal history'),/hypothyroidism/i);assert.match(p.row('Perinatal history'),/right hydronephrosis/i);
  assert.match(p.brief(),/cleft palate/);assert.match(p.row('Infection risk factors'),/HBsAg/);
  assert.match(p.row('Infection risk factors'),/HBeAg/);
});

test('maternal high risk of preeclampsia does not become confirmed preeclampsia',p=>{
  p.click('[data-r3="pre"] [data-v="highrisk"]');
  const line=p.row('Perinatal history');assert.match(line,/high risk (?:of|for) preeclampsia/i);
  assert.match(line,/aspirin/i);assert.doesNotMatch(line,/(?:confirmed|severe|mild) preeclampsia/i);
});

test('a recorded normal diagnostic test remains alongside a high-risk prenatal screen',p=>{
  p.seg('nipt','high');p.input('niptFind','trisomy 21');p.seg('amnio','normal');
  const line=p.row('Perinatal history');assert.match(line,/high-risk NIPT[^;]*trisomy 21/i);
  assert.match(line,/aCGH[^;]*normal|normal[^;]*aCGH/i);
  assert.doesNotMatch(line,/confirmed trisomy 21|trisomy 21 confirmed/i);
});

test('clinically important current jaundice findings survive with measured bilirubin values',p=>{
  p.story('E');p.seg('dest','NBC');p.input('tentDx','');p.msel('readmitProblems','prolonged-jaundice');
  p.input('birthDate','2026-08-13');p.input('readmitDischargeDate','2026-08-15');
  p.msel('readmitProblems','poor-feeding');p.input('readmitDischargeWeight','3000');
  p.input('readmitTSB','12.4');p.input('readmitDB','5.2');p.msel('readmitJaundiceSigns','pale stools');
  const text=p.brief();assert.match(text,/pale stools/i);
  assert.match(text,/(?:TSB|total bilirubin)[^;\n]*12\.4\s*mg\/dL/i);
  assert.match(text,/(?:DB|direct bilirubin)[^;\n]*5\.2\s*mg\/dL/i);
  assert.equal((text.match(/August 15, 2026/g)||[]).length,1,'The recorded previous discharge date is written once');
  assert.match(p.row('Other relevant findings'),/previous discharge:\s*August 15, 2026,\s*weight 3000 g/i,
    'The relevant discharge weight stays beside its discharge date');
  for(const sign of ['dark urine','pale stools']){
    p.msel('readmitJaundiceSigns',sign);
    assert.match(p.brief(),new RegExp('\\b'+sign+'\\b','i'));
    assert.doesNotMatch(p.brief(),new RegExp('\\bno '+sign+'\\b','i'));
    assert.equal(p.get(`[data-msel="readmitJaundiceSigns"] [data-v="no ${sign}"]`).getAttribute('aria-pressed'),'false');
    p.msel('readmitJaundiceSigns','no '+sign);
    const negative=p.brief();assert.match(negative,new RegExp('\\bno '+sign+'\\b','i'));
    assert.equal((negative.match(new RegExp('\\b'+sign+'\\b','gi'))||[]).length,1,
      'The chosen negative must not coexist with an earlier positive '+sign);
    assert.equal(p.get(`[data-msel="readmitJaundiceSigns"] [data-v="${sign}"]`).getAttribute('aria-pressed'),'false');
  }
  assert.match(p.brief(),/no dark urine/i);assert.match(p.brief(),/no pale stools/i);
  p.click('[data-msel="readmitProblems"] [data-v="prolonged-jaundice"]');p.msel('readmitProblems','fever');
  assert.doesNotMatch(p.brief(),/12\.4|5\.2|dark urine|pale stools|bilirubin/i,'Hidden jaundice drafts are not current facts');
});

test('measured fever and bilious vomiting remain visible under generic admission diagnoses',p=>{
  p.story('E');p.seg('dest','NBC');p.input('tentDx','');p.msel('readmitProblems','fever');
  p.input('rm_fever_temperature','38.6');p.input('rm_fever_method','rectal');
  p.msel('readmitProblems','gastrointestinal');
  p.click('[data-rm-chip="rm_gastrointestinal_symptoms"][data-v="vomiting"]');
  p.input('rm_gastrointestinal_character','bilious');p.input('rm_gastrointestinal_count','3');
  const text=p.brief();assert.match(text,/38\.6\s*°C/i);assert.match(text,/rectal/i);
  assert.match(text,/bilious/i);assert.match(text,/vomiting/i);
});

test('abnormal screening and care admission retain the actual reason without inventing a diagnosis',p=>{
  p.story('E');p.seg('dest','NBC');p.input('tentDx','');p.msel('readmitProblems','abnormal-screen');
  p.input('rm_screen_test','TSH');p.input('rm_screen_result','45 mIU/L');
  let text=p.brief();assert.match(text,/TSH/);assert.match(text,/45\s*mIU\/L/);
  assert.doesNotMatch(text,/congenital hypothyroidism/i,'A screening result is not a confirmed diagnosis');
  p.click('[data-msel="readmitProblems"] [data-v="abnormal-screen"]');p.msel('readmitProblems','care');
  p.input('rm_care_reason','temporary care while the mother remains hospitalized');text=p.brief();
  assert.match(text,/temporary care while the mother remains hospitalized/i);assert.doesNotMatch(text,/TSH|45\s*mIU\/L/);
});

test('nursery abnormal findings retain numeric values even when only one diagnosis leads',p=>{
  p.story('C');p.input('tentDx','');p.msel('brWorkup','crp');p.msel('brFindings','crp');p.input('brCrp','4.7');
  p.msel('brWorkup','glucose');p.msel('brFindings','hypoglycemia');p.input('brGlu','32');
  p.input('brFindIn','Platelet count was 68000/uL');
  const text=p.brief();assert.match(text,/CRP[^;\n]*4\.7\s*mg\/dL/i);
  assert.match(text,/glucose[^;\n]*32\s*mg\/dL/i);assert.match(text,/68000\/uL/i);
  p.story('A');assert.doesNotMatch(p.brief(),/4\.7|32\s*mg\/dL|68000\/uL/);
});

test('major delivery-room resuscitation is retained as birth history',p=>{
  p.click('[data-ladder-v="cpr"]');p.input('birthFinalSupport','ett');
  p.seg('resp','ETT+SIMV+PS');p.seg('acceptanceResp','NCPAP');
  const text=p.brief();assert.match(text,/chest compressions|CPR/i);assert.match(text,/epinephrine/i);
  assert.match(p.row('Respiratory'),/at acceptance:\s*NCPAP/i);
});

test('free text is preserved as text and cannot create HTML in the note',p=>{
  const payload='<img src=x onerror="window.briefHistoryInjected=1">';
  p.input('tentDx','respiratory distress '+payload);p.input('matOtherHx','hypothyroidism '+payload);
  p.input('birthInitialNote','a cleft palate '+payload);const text=p.brief();
  assert.ok(text.includes(payload),'Entered text must be escaped once and remain readable');
  assert.equal(p.get('#note').querySelector('img,script,svg,iframe'),null,'Free text must not create active markup');
  assert.equal(p.W.briefHistoryInjected,undefined);
});

// Differential scenarios deliberately populate the unaffected Hospital course, laboratory,
// respiratory, antibiotic, and Procedure sections so empty outputs cannot mask a regression.
const differentialCases=[
  ['inborn preterm respiratory admission',p=>{
    p.input('gaW','34');p.input('gaD','2');p.input('bw','2100');p.tog('birthNegConfirmed');
    p.click('[data-ladder-v="ett"]');p.input('birthFinalSupport','cpap');
    p.seg('resp','NCPAP');p.seg('acceptanceResp','room air');p.risk('pih');p.risk('steroid');p.screening('gbs','pos');
    p.seg('maternalAbxPurpose','iap');p.seg('iap','incomplete');p.input('iapDrug','Ampicillin');
  }],
  ['outborn transport',p=>{
    p.story('D');p.input('obFacility','Birth Hospital A');p.input('obTransferFrom','Referring Hospital B');
    p.input('obReason','respiratory distress');p.seg('obM1Type','cpap');p.input('obM1FiO2','35');
    p.seg('obRespType','ett');p.seg('resp','ETT+SIMV+PS');p.seg('acceptanceResp','NCPAP');
    p.input('obAdmissionStatus','the infant was active');
  }],
  ['post-discharge readmission',p=>{
    p.story('E');p.input('birthDate','2026-08-13');p.seg('dest','NBC');p.input('tentDx','');
    p.seg('readmitSource','clinic');p.msel('readmitProblems','prolonged-jaundice');
    p.input('readmitTSB','15.2');p.input('readmitDB','0.6');p.input('readmitCurrentWeight','3260');
    p.seg('resp','room air');p.seg('acceptanceResp','room air');
  }]
];
function capture(p,setup){
  setup(p);p.click('[data-hct="workup"] button');p.click('[data-hc="infMarkers"] [data-v="none"]');
  p.click('[data-hc="cultures"] [data-v="nogrowth"]');p.click('[data-hct="aline"] button');
  p.click('[data-am="resp"] [data-v="NCPAP"]');p.click('[data-am="abx"] [data-v="ampicillin"]');
  p.input('accCXR','Mild bilateral infiltrates');p.input('accABG','pH 7.32 PCO2 43 PO2 75 HCO3 22 BE -3');
  p.input('hcExtra','Feeding was advanced as tolerated');p.input('accAbxNote','Ampicillin was discontinued after 48 hours');
  p.input('accBrainUS','No intraventricular hemorrhage');p.click('[data-proctog] [data-v="aline"]');
  const out={};for(const mode of ['adm','plan','proc','acc'])out[mode]=p.note(mode);
  out.brief=p.brief();out.accSuffix=out.acc.slice(out.acc.indexOf('【Hospital course】'));
  return out;
}
if(baseline){
  for(const [name,setup] of differentialCases){
    if(match&&!match.test('unchanged surrounding notes: '+name))continue;
    try{
      const prior=withPage(p=>capture(p,setup),baseline),current=withPage(p=>capture(p,setup));
      for(const mode of ['adm','plan','proc'])assert.equal(current[mode],prior[mode],name+': '+mode+' changed');
      assert.equal(current.accSuffix,prior.accSuffix,name+': Acceptance Hospital course or later section changed');
      assert.notEqual(current.brief,prior.brief,name+': the old duplicate narrative must be replaced');
      passed++;console.log('PASS unchanged surrounding notes: '+name);
    }catch(error){failed++;console.error('FAIL differential '+name+'\n'+error.stack);}
  }
}
if(!passed&&!failed){failed++;console.error('FAIL no Brief history checks matched');}
console.log(`${passed} Brief history checks passed; ${failed} failures${baseline?'; differential baseline checked':''}`);
if(failed)process.exitCode=1;
