// 2026-10-05 院內模板骨架回歸（A：文案回到模板骨架；B：住院醫師手打的洞；C：安胎後出院）。
// 全部是虛構資料；固定日期 2026-08-30（DOL 1 = 出生當天）。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');

function withPage(check,fixedDate=[2026,7,30,12]){
  const errors=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-template.test/',beforeParse(W){
    const RealDate=W.Date,fixed=new RealDate(...fixedDate).getTime();
    W.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};
    W.scrollTo=()=>{};W.HTMLElement.prototype.scrollIntoView=()=>{};
    W.addEventListener('error',e=>errors.push(String(e.error?.stack||e.message)));
  }});
  const W=dom.window,d=W.document;
  const get=sel=>{const el=d.querySelector(sel);assert.ok(el,`Missing ${sel}`);return el;};
  const click=sel=>get(sel).click();
  const input=(id,value)=>{const el=get(`#${id}`);el.value=value;el.dispatchEvent(new W.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
  const seg=(key,value)=>click(`[data-seg="${key}"] [data-v="${value}"]`);
  const msel=(key,value)=>click(`[data-msel="${key}"] [data-v="${value}"]`);
  const ryn=(key,value)=>click(`[data-ryn="${key}"] [data-v="${value}"]`);
  const tog=key=>click(`[data-tog="${key}"] button`);
  const story=key=>click(`[data-story="${key}"]`);
  const choose=(field,value)=>click(`#${field}-choice-${value}`);
  const tab=name=>click(`[data-tab="${name}"]`);
  const note=(mode='adm')=>{tab(mode);return get('#note').textContent.trim();};
  const body=(mode='adm')=>note(mode).split('\n\nTentative diagnosis')[0];
  const paragraphs=()=>body().split('\n\n');
  try{
    check({W,d,get,click,input,seg,msel,ryn,tog,story,choose,tab,note,body,paragraphs});
    assert.deepEqual(errors,[],'page errors');
  }finally{W.close();}
}
const tests=[];const test=(name,fn,date)=>tests.push([name,()=>withPage(fn,date)]);
const count=(text,re)=>(text.match(re)||[]).length;

// ── A：文案回到模板骨架 ──
test('A1 opening is one template sentence followed by the EDC sentence',({input,seg,body})=>{
  seg('gender','female');seg('dest','NICU');
  input('gaW','38');input('gaD','1');input('bw','3333');input('matAge','40');input('gravida','5');input('para','2');
  input('birthDate','2026-08-30');input('birthTime','11:39');input('edc','2026-09-12');
  seg('delivery','cs');input('csReason','previous cesarean section');
  assert.ok(body().startsWith('This 1-day-old term female newborn was born to a 40-year-old G5P2 mother at a gestational age (GA) of 38+1 weeks with a birth weight (BW) of 3333 g (AGA) at 11:39 on August 30, 2026 at TPEMMH via cesarean section (C/S) due to previous cesarean section. The expected date of confinement was September 12, 2026. During pregnancy, she received'),body());
  assert.doesNotMatch(body(),/now on day of life|years old \(G|Birth weight \(BW\) was|estimated due date/);
});
test('A1 missing required pieces stay grey placeholders and optional clauses disappear',({input,seg,click,get,body})=>{
  input('gaW','35');seg('delivery','nsd');click('#addAbortion');input('abortion','1');input('gravida','3');input('para','1');
  const text=body();
  assert.match(text,/^This __-day-old late preterm ____ newborn was born to a __-year-old G3P1A1 mother at a gestational age \(GA\) of 35 weeks with a birth weight \(BW\) of ____ g \(____\) at TPEMMH via vaginal delivery \(VD\)\. The expected date of confinement was ____\./);
  assert.doesNotMatch(text.split('. ')[0],/ due to | on [A-Z]/,'VD has no reason clause; no date means no date clause');
  assert.ok(get('#note').querySelectorAll('.ph').length>=5,'missing values are rendered as grey placeholders');
});
test('A1 outborn and E keep their own birthplace semantics',({story,seg,input,body})=>{
  story('D');seg('delivery','nsd');input('obFacility','Fictional Clinic');
  assert.match(body(),/newborn was born to .* at Fictional Clinic via vaginal delivery \(VD\)\./);
  story('E');assert.match(body(),/newborn was born to .* at ____ via vaginal delivery \(VD\)\./,'E does not assume our hospital');
});
test('A2 the course paragraph opens with the maternal admission and merges steroids',({input,seg,ryn,click,paragraphs,story})=>{
  story('B');seg('delivery','cs');input('admReason','induction of labor');ryn('steroid','yes');
  const p2=paragraphs()[1];
  assert.ok(p2.startsWith('The mother was admitted to our hospital for induction of labor, and antenatal betamethasone (2 doses, a complete course) was administered for fetal lung maturation.'),p2);
  assert.doesNotMatch(paragraphs().join(' '),/Prior to delivery/);
  click('[data-seg="toco"] [data-v="ritodrine"]');
  assert.ok(paragraphs()[1].startsWith('The mother was admitted to our hospital for induction of labor. Ritodrine was administered for tocolysis.'),paragraphs()[1]);
});
test('A2 outborn and E never claim our hospital for the maternal admission',({story,input,body})=>{
  story('D');assert.doesNotMatch(body(),/The mother was admitted/,'no reason, no outborn maternal sentence');
  input('admReason','preterm labor');assert.match(body(),/The mother was admitted for preterm labor\./);
  assert.doesNotMatch(body(),/admitted to our hospital for preterm labor/);
  story('E');assert.match(body(),/The mother was admitted for preterm labor\./);
});
test('A5 complications use There was no …; PPH drops during pregnancy',({body,ryn})=>{
  assert.match(body(),/There was no gestational diabetes mellitus \(GDM\), pregnancy-induced hypertension \(PIH\), preeclampsia, antepartum hemorrhage \(APH\), postpartum hemorrhage \(PPH\), or maternal fever\./);
  ryn('pph','unknown');
  assert.match(body(),/There was no gestational diabetes mellitus \(GDM\), pregnancy-induced hypertension \(PIH\), preeclampsia, antepartum hemorrhage \(APH\), or maternal fever during pregnancy\./);
  assert.doesNotMatch(body(),/reported in the maternal history/);
});
test('A5 complications with no prenatal care keep the same sentence shape',({seg,ryn,body})=>{
  seg('ancReg','none');ryn('gdm','unknown');
  assert.match(body(),/There was no pregnancy-induced hypertension \(PIH\), preeclampsia, antepartum hemorrhage \(APH\), postpartum hemorrhage \(PPH\), or maternal fever\./);
});
test('A5 all-negative screening absorbs the rubella sentence; other results stay separate',({click,body})=>{
  assert.match(body(),/screening were all negative, and rubella IgG was reactive\./);
  assert.doesNotMatch(body(),/Maternal rubella IgG was reactive/);
  click('.scr-row[data-scr="rubella"] input[value="nd"]');
  assert.match(body(),/were all negative, and rubella IgG was nonreactive\./);
  click('.scr-row[data-scr="gbs"] input[value="pos"]');
  assert.match(body(),/Maternal rubella IgG was nonreactive\./);
});
test('A3 repeated pre-admission findings are not relisted; persisting ones explain the support',({story,input,msel,seg,choose,tog,body,note})=>{
  story('A');input('birthBreathing','apnea');msel('obSx','apnea');msel('obSx','tachypnea');
  choose('obRespRelation','new');seg('obRespType','cpap');input('obPEEP','6');
  const text=body();
  assert.match(text,/Before admission, tachypnea was noted\. Because apnea persisted, CPAP was initiated \(pressure 6 cmH2O\)\./);
  assert.equal(count(text,/before admission/gi),1,'one time phrase per paragraph');
  assert.doesNotMatch(text,/apnea was noted|apnea and tachypnea/);
  assert.match(note('acc'),/Because apnea persisted, CPAP was initiated/,'Acceptance reuses the same narrative');
});
test('A3 persisted symptoms with support merge into one Because sentence',({story,msel,seg,choose,input,body})=>{
  story('A');msel('obSx','grunting');seg('pwOnset','persisted');choose('obRespRelation','new');seg('obRespType','o2');seg('obO2Dev','hood');
  const text=body();
  assert.match(text,/Because grunting persisted, supplemental oxygen was initiated before admission via an oxygen hood\./);
  assert.doesNotMatch(text,/grunting persisted\. /);
  input('pwOnsetH','2');input('pwOnsetUnit','hours');
  assert.match(body(),/Before admission, grunting persisted at 2 hours of age\. Supplemental oxygen was initiated via an oxygen hood\./,'timed symptom keeps its own sentence; the support does not repeat the time phrase');
});
test('A3 new symptoms keep their sentence and passive support never gains a cause',({story,msel,seg,body})=>{
  story('A');msel('obSx','tachypnea');seg('pwOnset','developed');seg('obRespType','o2');seg('obO2Dev','cannula');
  const text=body();
  assert.match(text,/Before admission, tachypnea developed\. The infant was receiving supplemental oxygen via a nasal cannula\./);
  assert.doesNotMatch(text,/Because/);
});
test('A3 PPV and stable vital signs form one sentence; stability needs the toggle',({story,input,choose,seg,tog,body})=>{
  story('A');input('birthBreathing','labored');input('birthFinalBreathing','labored');
  choose('obRespRelation','new');seg('obRespType','ppv');input('obFiO2','40');input('obIP','20');input('obPEEP','5');
  assert.match(body(),/Because labored breathing persisted, positive-pressure ventilation \(PPV\) was initiated before admission \(FiO2 40%, PIP 20 cmH2O, PEEP 5 cmH2O\)\.(?! with)/);
  tog('obRespStable');
  const text=body();
  assert.match(text,/Because labored breathing persisted, positive-pressure ventilation \(PPV\) was initiated before admission \(FiO2 40%, PIP 20 cmH2O, PEEP 5 cmH2O\), with stable heart rate and oxygen saturation\./);
  assert.doesNotMatch(text,/remained stable during/);
});
test('A3 no recorded persisting finding means the support sentence stands alone',({story,input,choose,seg,body})=>{
  story('A');input('birthBreathing','labored');input('birthFinalBreathing','spontaneous');
  choose('obRespRelation','new');seg('obRespType','cpap');
  assert.match(body(),/(?<!persisted, )CPAP was initiated before admission\./);assert.doesNotMatch(body(),/Because/);
});
test('A3 transport time phrase appears once in the outborn course',({story,msel,seg,click,input,W,body})=>{
  story('D');msel('obSx','tachypnea');seg('obRespType','o2');seg('obO2Dev','hood');
  click('[data-add-course="cpap"]');const id=W.document.querySelector('#courseEvents [data-event-id]').dataset.eventId;
  input(`event-${id}-phase`,'transport');input(`event-${id}-peep`,'5');
  const text=body();
  assert.equal(count(text,/during transport/gi),1,text);
  assert.match(text,/During transport, tachypnea was noted\. The infant was receiving supplemental oxygen via an oxygen hood\. CPAP was provided \(pressure 5 cmH2O\)\./);
});
test('A4 post-birth routes close with the tentative diagnosis and no admission date',({story,seg,msel,click,input,body})=>{
  story('B');seg('dest','NICU');msel('obSx','grunting');
  assert.match(body(),/Under the tentative diagnosis of respiratory distress, the infant was admitted to our NICU for further evaluation and treatment\.$/);
  assert.doesNotMatch(body(),/on August 30, 2026|Subsequently/);
  story('C');seg('dest','NBC');msel('brWorkup','crp');msel('brFindings','crp');
  assert.match(body(),/Under the tentative diagnosis of suspected neonatal sepsis, the infant was therefore admitted to our NBC for further evaluation and treatment\.$/);
  story('D');seg('dest','NICU');input('obFacility','Fictional Clinic');input('tentDx','apnea of prematurity');
  assert.match(body(),/Under the tentative diagnosis of apnea of prematurity, the infant was transferred from Fictional Clinic to our hospital and admitted to our NICU for further evaluation and treatment\.$/);
  input('tentDx','');click('[data-clear-seg="dest"]');
});
test('A4 an empty diagnosis keeps the previous fallback; E keeps its dated closing',({story,seg,body,click,input})=>{
  story('B');seg('dest','NICU');
  assert.match(body(),/Subsequently, the infant was admitted to our NICU for further evaluation and treatment\.$/);
  story('E');seg('dest','NBC');click('[data-msel="readmitProblems"] [data-v="jaundice"]');
  assert.match(body(),/The infant was subsequently admitted to our NBC on August 30, 2026 for further evaluation and management, with a tentative diagnosis of jaundice\./);
});
test('A4 Acceptance still owns its admission sentence',({story,seg,msel,note})=>{
  story('B');seg('dest','NICU');msel('obSx','grunting');
  const acc=note('acc');
  assert.match(acc,/The infant was admitted to our NICU on August 30, 2026 with respiratory distress for further evaluation and treatment\./);
  assert.doesNotMatch(acc,/Under the tentative diagnosis/);
});

// ── B：補住院醫師手打的洞 ──
test('B1 maternal other history is normalized, escaped once and follows the complications',({input,body,get})=>{
  input('matOtherHx','  # Charcot-Marie-Tooth disease with normal function and without medication.  ');
  assert.match(body(),/or maternal fever\. The mother had a history of Charcot-Marie-Tooth disease with normal function and without medication\. Maternal group B/);
  input('matOtherHx','A & B <x>');
  assert.match(body(),/The mother had a history of A & B <x>\./);
  assert.match(get('#note').innerHTML,/history of <span class="slot abn">A &amp; B &lt;x&gt;<\/span>\./,'escaped exactly once');
  input('matOtherHx','   ');assert.doesNotMatch(body(),/had a history of/);
});
test('B2 birth signs follow the breathing clause as nouns',({story,input,msel,body})=>{
  story('A');input('birthBreathing','labored');msel('birthSigns','cyanosis');
  assert.match(body(),/At birth, the infant had labored breathing, with cyanosis\./);
  msel('birthSigns','grunting');
  assert.match(body(),/At birth, the infant had labored breathing, with grunting and cyanosis\./);
  input('birthBreathing','');
  assert.match(body(),/At birth, grunting and cyanosis were noted\./);
  msel('birthSigns','grunting');msel('birthSigns','cyanosis');msel('birthSigns','retractions');
  assert.match(body(),/At birth, retractions were noted\./);
  input('birthHR','90');
  assert.match(body(),/At birth, retractions were noted, with a heart rate of 90 beats\/min\./);
});
test('B3 the delivery-room end assessment writes persisting findings once',({story,seg,input,msel,body,note})=>{
  story('A');seg('delivery','cs');input('birthBreathing','labored');msel('birthSigns','cyanosis');
  input('birthFinalBreathing','labored');msel('birthFinalSigns','grunting');
  assert.match(body(),/On reassessment in the operating room, labored breathing persisted, with grunting\./);
  msel('birthFinalSigns','cyanosis');
  assert.match(body(),/On reassessment in the operating room, labored breathing and cyanosis persisted, with grunting\./);
  input('birthFinalBreathing','spontaneous');
  assert.match(body(),/On reassessment in the operating room, cyanosis persisted, and the infant was breathing spontaneously, with grunting\./);
  msel('birthFinalSigns','cyanosis');msel('birthFinalSigns','grunting');input('birthFinalBreathing','labored');input('birthFinalSupport','cpap');
  assert.match(body(),/labored breathing persisted, and the infant was receiving CPAP\./);
  assert.match(note('acc'),/labored breathing persisted, and the infant was receiving CPAP\./,'Acceptance shares the delivery-room narrative');
});
test('B3 a timed end assessment with only signs is not reported as unspecified',({story,input,msel,body})=>{
  story('A');input('birthFinalMin','10');msel('birthFinalSigns','retractions');
  assert.match(body(),/On reassessment at 10 minutes of age, retractions were noted\./);
  assert.doesNotMatch(body(),/findings were not specified/);
});
test('B4 signs follow the labored-breathing precedent downstream: narrative and summaries only',({story,seg,input,msel,get,note})=>{
  story('A');seg('dest','NICU');input('gaW','39');msel('birthSigns','grunting');msel('birthFinalSigns','cyanosis');
  assert.doesNotMatch(get('#dx').textContent,/Respiratory distress/,'labored breathing never created a diagnosis; signs do not either');
  assert.match(get('[data-stop-toggle="birth"] .sum').textContent,/Grunting/);
  assert.match(get('[data-stop-toggle="drEnd"] .sum').textContent,/Cyanosis/);
  note('plan');
});
test('B pre-admission symptoms already written at birth are not relisted',({story,input,msel,choose,seg,body})=>{
  story('A');input('birthFinalBreathing','labored');msel('birthFinalSigns','grunting');msel('obSx','grunting');
  assert.doesNotMatch(body(),/grunting was noted/);
  choose('obRespRelation','new');seg('obRespType','cpap');
  assert.match(body(),/Because grunting persisted, CPAP was initiated before admission\./);
});

// ── C：安胎後出院 ──
const toco=({click,input,tog},{reason,gaW,gaD,from,until,discharged,abx}={})=>{
  click('[data-seg="toco"] [data-v="ritodrine"]');
  if(reason)click(`[data-fill="tocoReason"] [data-v="${reason}"]`);
  if(gaW)input('tocoGaW',gaW);if(gaD)input('tocoGaD',gaD);if(from)input('tocoSince',from);if(until)input('tocoUntil',until);
  if(discharged)tog('tocoDischarged');if(abx)input('tocoAbx',abx);
};
test('C discharged tocolysis is a prior hospitalization at the end of the maternal paragraph',page=>{
  const {story,seg,input,paragraphs,get}=page;
  story('B');seg('delivery','cs');input('admReason','scheduled C/S');
  assert.equal(get('#tocoDetailWrap').hidden,true,'details appear only after a tocolytic is chosen');
  toco(page,{reason:'preterm uterine contractions',gaW:'32',gaD:'3',from:'8/23',until:'8/26',discharged:true,abx:'Ampicillin'});
  assert.equal(get('#tocoDetailWrap').hidden,false);assert.equal(get('#tocoAbxWrap').hidden,false);
  const [p1,p2]=paragraphs();
  assert.ok(p1.endsWith('At 32+3 weeks, the mother was hospitalized for preterm uterine contractions, received ritodrine for tocolysis from 8/23 to 8/26, and was then discharged. Ampicillin was also given during that hospitalization.'),p1);
  assert.ok(p2.startsWith('The mother was readmitted to our hospital for scheduled C/S.'),p2);
  assert.doesNotMatch(p2,/tocolysis|Ritodrine/);
});
test('C missing tocolysis details are omitted while the sentence stays fluent',page=>{
  const {story,input,paragraphs,click}=page;
  story('B');toco(page,{discharged:true});
  assert.match(paragraphs()[0],/The mother was hospitalized, received ritodrine for tocolysis, and was then discharged\.$/);
  input('tocoUntil','8/26');assert.match(paragraphs()[0],/received ritodrine for tocolysis until 8\/26, and was then discharged\.$/);
  input('tocoUntil','');input('tocoSince','8/23');assert.match(paragraphs()[0],/received ritodrine for tocolysis from 8\/23, and was then discharged\.$/);
  assert.ok(paragraphs()[1].startsWith('The mother was readmitted to our hospital for ____.'));
  click('[data-seg="toco"] [data-v="atosiban"]');assert.match(paragraphs()[0],/received atosiban for tocolysis from 8\/23/);
});
test('C undischarged tocolysis keeps the course sentence and adds the reason',page=>{
  const {story,input,paragraphs,get,click}=page;
  story('B');input('admReason','preterm labor');toco(page,{reason:'preterm labor',from:'7/19',abx:'Ampicillin'});
  const p2=paragraphs()[1];
  assert.ok(p2.startsWith('The mother was admitted to our hospital for preterm labor. Ritodrine was administered for tocolysis due to preterm labor, starting on 7/19.'),p2);
  assert.doesNotMatch(paragraphs().join(' '),/discharged|Ampicillin|readmitted/,'antibiotics for a prior stay need the discharge switch');
  assert.equal(get('#tocoAbxWrap').hidden,true);
  click('[data-seg="toco"] [data-v="none"]');assert.equal(get('#tocoDetailWrap').hidden,true);
  assert.doesNotMatch(paragraphs().join(' '),/due to preterm labor/);
});
test('C a discharge switch without a tocolytic writes nothing new',page=>{
  const {story,click,tog,paragraphs}=page;
  story('B');toco(page,{discharged:true});click('[data-seg="toco"] [data-v="none"]');
  assert.doesNotMatch(paragraphs().join(' '),/hospitalized|readmitted|tocolysis/);
});

// ── 規格虛構案例（全部虛構） ──
const FICTIONAL_ADMISSION=[
  'This 1-day-old term female newborn was born to a 40-year-old G5P2 mother at a gestational age (GA) of 38+1 weeks with a birth weight (BW) of 3333 g (AGA) at 11:39 on October 5, 2026 at TPEMMH via cesarean section (C/S) due to previous C/S. The expected date of confinement was October 18, 2026. During pregnancy, she received regular prenatal care at ____, and prenatal ultrasound showed normal findings. Neither amniocentesis with array comparative genomic hybridization (aCGH) nor noninvasive prenatal testing (NIPT) was performed. There was no gestational diabetes mellitus (GDM), pregnancy-induced hypertension (PIH), preeclampsia, antepartum hemorrhage (APH), postpartum hemorrhage (PPH), or maternal fever. The mother had a history of Charcot-Marie-Tooth disease with normal function and without medication. Maternal group B streptococcus (GBS) culture, rapid plasma reagin (RPR) testing, hepatitis B surface antigen (HBsAg) screening, and human immunodeficiency virus (HIV) screening were all negative, and rubella IgG was reactive. The mother denied cigarette smoking, alcohol consumption, or substance abuse during pregnancy. At 32+3 weeks, the mother was hospitalized for preterm uterine contractions, received ritodrine for tocolysis from 8/23 to 8/26, and was then discharged.',
  'The mother was readmitted to our hospital for scheduled C/S. The pediatric team was called to stand by in the operating room for the delivery. The cesarean delivery was uncomplicated. At birth, the infant had labored breathing, with cyanosis. Apgar scores were 8 and 9 at 1 and 5 minutes, respectively. On reassessment in the operating room, labored breathing persisted, with grunting.',
  'Because labored breathing persisted, positive-pressure ventilation (PPV) was initiated before admission (FiO2 40%, PIP 20 cmH2O, PEEP 5 cmH2O), with stable heart rate and oxygen saturation. Under the tentative diagnosis of respiratory distress, the infant was admitted to our NICU for further evaluation and treatment.'];
function fillFictionalCase(page){
  const {story,seg,input,msel,tog,choose}=page;
  story('A');seg('dest','NICU');seg('gender','female');input('gaW','38');input('gaD','1');input('bw','3333');
  input('matAge','40');input('gravida','5');input('para','2');input('birthDate','2026-10-05');input('birthTime','11:39');
  seg('delivery','cs');input('csReason','previous C/S');tog('csUncompl');
  seg('amnio','none');seg('nipt','none');
  input('matOtherHx','Charcot-Marie-Tooth disease with normal function and without medication');
  toco(page,{reason:'preterm uterine contractions',gaW:'32',gaD:'3',from:'8/23',until:'8/26',discharged:true});
  input('admReason','scheduled C/S');
  input('birthBreathing','labored');msel('birthSigns','cyanosis');input('ap1','8');input('ap5','9');
  input('birthFinalBreathing','labored');msel('birthFinalSigns','grunting');
  choose('obRespRelation','new');seg('obRespType','ppv');input('obFiO2','40');input('obIP','20');input('obPEEP','5');tog('obRespStable');
}
test('spec fictional case: admission note follows the template skeleton',page=>{
  fillFictionalCase(page);
  assert.deepEqual(page.paragraphs(),FICTIONAL_ADMISSION);
  assert.match(page.note(),/Tentative diagnosis:\n# Term newborn, GA 38\+1 weeks, BW 3333 g, AGA\n# Respiratory distress/);
},[2026,9,5,12]);

let failed=0;
for(const [name,fn] of tests){try{fn();console.log(`✓ ${name}`);}catch(e){failed++;console.error(`✗ ${name}\n  ${e.stack||e.message}`);}}
if(failed){console.error(`${failed}/${tests.length} template prose checks failed`);process.exitCode=1;}
else console.log(`✓ ${tests.length} template prose checks passed`);
