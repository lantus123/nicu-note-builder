// Synthetic field-to-note regressions: assert recorded facts, not a particular prose template.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const {render}=require('./driver');

const set=(id,value)=>({set:[id,value]});
const pick=(attribute,key,value)=>({click:`[data-${attribute}="${key}"] [data-v="${value}"]`});
const seg=(key,value)=>pick('seg',key,value);
const hc=(key,value)=>pick('hc',key,value);
const toggle=key=>({click:`[data-tog="${key}"] button`});
const screen=(key,value)=>({cycle:[`.scr-row[data-scr="${key}"] .scr-btn`,value]});
const tab=mode=>({tab:mode});
const BASE=[seg('gender','male'),set('gaW','40'),set('gaD','0'),set('bw','3500'),
  seg('delivery','nsd'),set('gravida','2'),set('para','1'),set('matAge','32'),
  set('ap1','8'),set('ap5','9'),seg('dol','0')];

function notes(steps,procedure=false){
  const result=render({steps:[...BASE,...steps],procedure});
  assert.deepEqual(result.misses,[],'Every scenario control must exist and be editable');
  assert.deepEqual(result.errors,[],'Rendering must not raise page errors');
  return result.out;
}
function includes(text,value){assert.ok(text.includes(value),`Missing recorded value: ${value}`);}
function section(text,title){
  const marker=`【${title}】`;
  assert.ok(text.includes(marker),`Missing section: ${title}`);
  return text.split(marker)[1].split('【')[0].trim();
}

// Only DOM interactions that cannot be observed through the note driver use this helper.
function withPage(check){
  const errors=[];
  const dom=new JSDOM(fs.readFileSync(__dirname+'/../../index.html','utf8'),{
    runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu.test/',
    beforeParse(W){
      W.scrollTo=()=>{};
      W.addEventListener('error',e=>errors.push(String(e.error?.message||e.message)));
    }
  });
  const W=dom.window,d=W.document;
  const click=selector=>{
    const el=d.querySelector(selector);
    assert.ok(el,`Missing control: ${selector}`);
    el.click();
  };
  const input=(id,value)=>{
    const el=d.getElementById(id);
    assert.ok(el,`Missing field: ${id}`);
    assert.ok(!el.readOnly&&!el.disabled,`Field must be editable: ${id}`);
    el.value=value;
    el.dispatchEvent(new W.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));
  };
  try{
    check({W,d,click,input,note:()=>d.getElementById('note').textContent});
    assert.deepEqual(errors,[],'Page interactions must not raise errors');
  }finally{W.close();}
}

const tests=[];
const test=(name,check)=>tests.push([name,check]);

test('standby retains its visible supplemental course',()=>{
  const {admission}=notes([toggle('pwStandby'),set('obCourse','Synthetic standby observation retained')]);
  includes(admission,'Synthetic standby observation retained');
});

test('IAP drug and date survive undocumented completeness',()=>{
  const {admission}=notes([set('iapDrug','Ampicillin'),set('iapSince','08/28 09:45')]);
  includes(admission,'Ampicillin');
  includes(admission,'08/28 09:45');
  assert.doesNotMatch(admission,/\b(?:IAP|prophylaxis) was (?:in)?complete\b/i,
    'Drug entry must not infer IAP completeness');
});

test('IAP date alone is retained without inventing an antibiotic',()=>{
  const {admission}=notes([set('iapSince','08/28 11:25')]);
  includes(admission,'08/28 11:25');
  assert.doesNotMatch(admission,/\b(?:Ampicillin|Penicillin|Cefazolin)\b/i);
});

test('IAP date survives a documented status with no drug',()=>{
  const {admission}=notes([seg('iap','incomplete'),set('iapSince','08/28 12:15')]);
  includes(admission,'08/28 12:15');
  assert.match(admission,/\bincomplete\b/i);
});

for(const [state,result] of [['pend',/\bpending\b/i],['nd',/not (?:obtained|examined|performed|tested|done)/i]]){
  test(`HBeAg ${state} is documented when HBsAg is positive`,()=>{
    const {admission}=notes([screen('hbsag','pos'),screen('hbeag',state)]);
    const mention=admission.match(/[^.]*HBeAg[^.]*\./i)?.[0];
    assert.ok(mention,'HBeAg result must be present');
    assert.match(mention,result);
  });
}

test('standalone antibiotic plan retains duration without inventing a drug',()=>{
  const {acceptance}=notes([tab('acc'),hc('abxPlan','course')]);
  const course=section(acceptance,'Hospital course');
  assert.match(course,/\b7(?:\s+|-)days?\b/i);
  assert.doesNotMatch(course,/\b(?:Ampicillin|Gentamicin|Cefotaxime)\b/i);
});

test('partially parsed laboratory data retains the unparsed observation',()=>{
  const observation='Custom assay: uninterpretable (repeat #2)';
  const {acceptance}=notes([tab('acc'),set('accOther',`CRP 1.2 mg/dL\n${observation}`)]);
  const labs=section(acceptance,'Initial laboratory data');
  assert.match(labs,/CRP[^\n]*1\.2/i);
  includes(labs,observation);
});

test('explicit current room air overrides previous invasive support',()=>{
  const {acceptance}=notes([seg('obRespType','ett'),tab('acc'),seg('resp','room air')]);
  const brief=section(acceptance,'Brief history');
  assert.match(brief,/\broom air\b/i);
  assert.doesNotMatch(brief,/(?:currently|at (?:the time of )?acceptance)[^.\n]*mechanical ventilation/i);
});

test('BH and HC percentiles reach the written growth assessment',()=>{
  const {acceptance}=notes([tab('acc'),set('accBH','51'),set('accHC','35.4')]);
  const growth=section(acceptance,'Infant growth assessment');
  assert.match(growth,/\bBH\b[^\n;]*?\b51(?:\.0)?\s*(?:cm\s*)?\([^)]*P\d/i);
  assert.match(growth,/\bHC\b[^\n;]*?\b35\.4\s*(?:cm\s*)?\([^)]*P\d/i);
});

test('current weight is editable, survives renders, and does not replace birth weight',()=>{
  const {acceptance}=notes([seg('dol','3'),tab('acc'),set('accGrBW','3250'),set('accMeds','Synthetic medication note')]);
  includes(acceptance.split('【')[0],'3250');
  includes(section(acceptance,'Infant growth assessment'),'3250');
  includes(section(acceptance,'Brief history'),'3500');
});

test('infant admission reason is distinct from maternal admission reason',()=>{
  const {admission,acceptance}=notes([set('admReason','induction of labor'),set('tentDx','neonatal hypoglycemia')]);
  includes(admission,'induction of labor');
  const brief=section(acceptance,'Brief history');
  includes(brief,'neonatal hypoglycemia');
  assert.doesNotMatch(brief,/\b(?:infant|neonate|newborn|baby)\b[^.\n]*admitted[^.\n]*due to induction of labor/i);
});

test('acceptance retains birth timing and detailed perinatal events',()=>{
  const {acceptance}=notes([
    set('birthDate','2026-08-28'),set('birthTime','1437'),
    set('ap1','4'),set('ap5','6'),set('ap10','9'),
    toggle('doic'),set('doicMin','3'),toggle('msaf'),seg('msafGrade','thick')
  ]);
  const brief=section(acceptance,'Brief history');
  includes(brief,'14:37');
  assert.match(brief,/2026/);
  assert.match(brief,/\b4\b[^.\n]*\b6\b[^.\n]*\b9\b[^.\n]*\b10\s+minutes?/i,
    'All three Apgar scores and the 10-minute time point must be retained');
  assert.match(brief,/(?:DOIC[^.\n]*\b3\s+minutes?|first cry[^.\n]*\b3\s+minutes?\s*\(DOIC\))/i);
  assert.match(brief,/\bthick\b[^.\n]*(?:meconium|MSAF)/i);
});

test('CSF remains selected independently of the sepsis work-up group',()=>{
  const {plan}=notes([tab('plan'),{click:'[data-planon] [data-v="csf"]'}]);
  assert.match(plan,/\bCSF\b/);
  assert.doesNotMatch(plan,/Sepsis work-up/i,'CSF selection must not silently add the whole work-up');
});

for(const mode of ['o2','cpap','ppv','ett']){
  test(`admission ${mode} history informs existing plan rules without asserting current support`,()=>{
    const {plan}=notes([seg('obRespType',mode)]);
    assert.doesNotMatch(plan,/Provide respiratory support with/i,
      'Historical support must not become a confirmed current respiratory instruction');
    assert.match(plan,/OG decompression/i);
    if(mode==='ett')assert.match(plan,/arterial line|A-line/i);
  });
}

test('explicit current support is retained in the NI plan independently of earlier support',()=>{
  const {plan}=notes([seg('obRespType','ett'),tab('acc'),seg('resp','NCPAP')]);
  assert.match(plan,/Provide respiratory support with NCPAP/i);
  assert.doesNotMatch(plan,/Provide respiratory support with[^\n]*ETT/i);
});

test('+A exposes an editable field and records the entered parity detail',()=>withPage(({d,click,input,note})=>{
  assert.equal(d.getElementById('abortion').hidden,true);
  click('#addAbortion');
  assert.equal(d.getElementById('abortion').hidden,false);
  input('gravida','2');input('para','1');input('abortion','2');
  assert.match(note(),/G2P1A2/);
}));

test('manual notes survive form edits and tab changes until explicit regeneration',()=>withPage(({W,d,click,input,note})=>{
  const manual='Synthetic manually edited clinical narrative.';
  const editor=d.getElementById('note');
  editor.textContent=manual;
  editor.dispatchEvent(new W.Event('input',{bubbles:true}));
  input('bw','1820');
  assert.equal(note(),manual);
  assert.equal(d.getElementById('regen').hidden,false);
  click('[data-tab="acc"]');
  click('[data-tab="adm"]');
  assert.equal(note(),manual);
  click('#regen');
  includes(note(),'1820');
  assert.ok(!note().includes(manual));
  assert.equal(d.getElementById('regen').hidden,true);
}));

test('all visible Procedure inputs and options reach the selected procedures',()=>{
  const chosen=['intub','aline','lisa','lp','uac','uvc','chest','bet'];
  const {procedure}=notes([
    set('bw','2100'),tab('proc'),
    ...chosen.map(value=>({click:`[data-proctog] [data-v="${value}"]`})),
    set('lisaTimeIn','08/28 15:42'),set('lpVolIn','1.6'),set('uacDepthIn','13.7'),set('uvcDepthIn','8.2'),
    set('procOperator','Synthetic Operator'),hc('surfDrug','curosurf'),
    pick('po','alineSide','left'),pick('po','alineArtery','brachial'),pick('po','uacPos','low'),
    pick('po','chestType','chest'),pick('po','chestSide','left'),pick('po','chestICS','5th'),
    pick('po','lpCompl','hematoma'),pick('po','betABO','AB'),pick('po','betRh','Rh-negative')
  ],true);
  for(const value of ['Tracheal intubation','Arterial line','LISA','Lumbar puncture','UAC','UVC',
    'Chest tube','Blood Exchange Transfusion','08/28 15:42','Synthetic Operator','Curosurf',
    'brachial','13.7 cm','8.2 cm','5th','hematoma','AB Rh-negative'])includes(procedure,value);
  assert.match(procedure,/1\.6\s*m[lL]/);
  assert.match(procedure,/left\s+elbow/);
  assert.match(procedure,/low position/i);
});

test('recorded tocolysis date survives without a selected agent',()=>{
  const {admission}=notes([set('tocoSince','08/27 10:25')]);
  includes(admission,'08/27 10:25');
  assert.doesNotMatch(admission,/\b(?:ritodrine|atosiban)\b/i);
});

test('outborn reason, symptoms, supplemental course and diagnosis are independent',()=>{
  const {admission}=notes([seg('pathway','outborn'),set('obFacility','TSMMH'),
    set('admReason','induction of labor'),set('obReason','the need for a higher level of care'),
    pick('msel','obSx','tachypnea'),set('tentDx','transient tachypnea of the newborn'),
    set('obCourse','Synthetic transport details retained'),seg('obM1Type','room'),seg('obRespType','room')]);
  for(const value of ['TSMMH','induction of labor','the need for a higher level of care',
    'tachypnea','transient tachypnea of the newborn','Synthetic transport details retained','room air'])includes(admission,value);
  assert.doesNotMatch(admission,/developed (?:prematurity|the need for)/i);
});

test('complete steroid course and entered dates are both retained',()=>{
  const {admission,acceptance}=notes([pick('ryn','steroid','yes'),set('steroidDates','08/27-08/28')]);
  for(const text of [admission,acceptance]){
    includes(text,'complete course'); includes(text,'08/27-08/28');
  }
});

test('undocumented day of life does not become day zero or a current birth weight',()=>{
  const {acceptance}=notes([seg('dol','x'),tab('acc')]);
  const header=acceptance.split('【')[0];
  assert.doesNotMatch(header,/\b0 d\/o/);
  assert.match(header,/PMA _+/);
  assert.match(header,/Wt: _+/);
  includes(section(acceptance,'Brief history'),'3500');
});

test('current room air is not replaced by older ETT in the treatment plan',()=>{
  const {plan}=notes([seg('obRespType','ett'),tab('acc'),seg('resp','room air')]);
  assert.doesNotMatch(plan,/respiratory support with|OG decompression|arterial line/i);
});

test('course keeps related findings together without inventing treatment response or causality',()=>{
  const {acceptance}=notes([tab('acc'),pick('am','resp','NCPAP'),
    {click:'[data-hct="workup"] button'},hc('infMarkers','crp'),hc('cultures','positive'),
    pick('am','abx','Ampicillin (200 mg/kg/day)'),hc('abxPlan','course'),
    pick('hcm','cxrDx','rds2'),{click:'[data-hct="surf"] button'},pick('hcm','surfReason','o2')]);
  const course=section(acceptance,'Hospital course'), paragraphs=course.split(/\n\n/);
  assert.ok(paragraphs.some(p=>/NCPAP/.test(p)&&/Chest (?:X-ray|radiography)/.test(p)&&/Survanta/.test(p)));
  assert.ok(paragraphs.some(p=>/sepsis work-up/.test(p)&&/CRP/.test(p)&&/Ampicillin/.test(p)));
  assert.doesNotMatch(course,/therefore|significant improvement|improved significantly|Blood and GJ cultures yielded/i);
});

test('a new route excludes another route draft from the plan and restoring it restores its rules',()=>{
  // pathway 不再預設 direct（2026-09-19）：草稿是綁路徑的，這條測的是「切走再切回」，所以先明選 direct
  const prior=[seg('pathway','direct'),seg('obRespType','ett')];
  const {plan}=notes([...prior,seg('pathway','nursery')]);
  assert.doesNotMatch(plan,/respiratory support with|OG decompression|arterial line/i);
  const restored=notes([...prior,seg('pathway','nursery'),seg('pathway','direct')]).plan;
  assert.match(restored,/OG decompression/i);assert.match(restored,/arterial line/i);
  assert.doesNotMatch(restored,/Provide respiratory support with/i,
    'Restoring an earlier route draft must still not assert current support');
});

test('standalone vaccination date is retained without inventing the administered vaccine',()=>{
  const {acceptance}=notes([tab('acc'),set('accVacDate','08/28 11:35')]);
  const vaccination=section(acceptance,'Vaccination');
  includes(vaccination,'08/28 11:35');
  assert.doesNotMatch(vaccination,/HBV|HBIG|BCG/);
});

test('free text with angle brackets stays readable in the note',()=>{
  const value='Synthetic finding <5 & repeat review';
  const {admission,acceptance}=notes([set('obCourse',value),tab('acc'),set('hcExtra',value)]);
  includes(admission,value); includes(acceptance,value);
});

for(const observation of ['pH was reviewed.','iNO was documented.','"Synthetic observation."','已完成觀察。']){
  test(`supplemental prose preserves meaningful case and terminal punctuation: ${observation}`,()=>{
    const {admission,acceptance}=notes([set('obCourse',observation),tab('acc'),set('hcExtra',observation)]);
    for(const text of [admission,section(acceptance,'Brief history'),section(acceptance,'Hospital course')]){
      includes(text,observation);
      assert.ok(!text.includes(observation+'.'),'Already terminated text must not receive another period');
    }
  });
}

test('inline reasons and diagnoses do not split their surrounding sentences',()=>{
  const {admission,acceptance}=notes([seg('delivery','cs'),set('csReason','breech presentation.'),
    set('admReason','induction of labor.'),set('tentDx','neonatal hypoglycemia.')]);
  for(const text of [admission,section(acceptance,'Brief history')]){
    assert.doesNotMatch(text,/\.\.|\.\s*,|presentation\. at/);
    for(const value of ['breech presentation','induction of labor','neonatal hypoglycemia'])includes(text,value);
  }
});

test('grammar cleanup preserves diagnostic uncertainty in free text',()=>{
  const {admission,acceptance}=notes([set('tentDx','sepsis?')]);
  includes(admission,'sepsis?');
  includes(section(acceptance,'Brief history'),'sepsis?');
});

test('generic transfer need remains a reason, not a diagnosis',()=>{
  const reason='the need for a higher level of care';
  const {admission,acceptance}=notes([seg('pathway','outborn'),set('obFacility','TSMMH'),set('obReason',reason)]);
  for(const text of [admission,section(acceptance,'Brief history')]){
    includes(text,reason);
    assert.doesNotMatch(text,/(?:diagnosis of|admitted[^.]* with) the need for/i);
  }
});

test('a recorded transfer reason and a tentative diagnosis both survive in acceptance',()=>{
  const {acceptance}=notes([seg('pathway','outborn'),set('obFacility','TSMMH'),
    set('obReason','the need for a higher level of care'),set('tentDx','neonatal hypoglycemia')]);
  const brief=section(acceptance,'Brief history');
  includes(brief,'because of the need for a higher level of care');
  includes(brief,'with neonatal hypoglycemia');
});

for(const details of ['date only','drug only','drug and date']){
  test(`undocumented IAP completeness has a grammatical subject: ${details}`,()=>{
    const steps=[...(details!=='drug only'?[set('iapSince','08/28 11:25')]:[]),
      ...(details!=='date only'?[set('iapDrug','Ampicillin')]:[])];
    const {admission,acceptance}=notes(steps);
    for(const text of [admission,section(acceptance,'Brief history')]){
      if(details!=='drug only')includes(text,'08/28 11:25');
      if(details!=='date only')includes(text,'Ampicillin');
      else assert.doesNotMatch(text,/Ampicillin/);
      assert.doesNotMatch(text,/details were|prophylaxis[^.]* was (?:in)?complete[.;]/i);
      assert.match(text,/completeness was not (?:specified|documented)/i);
    }
  });
}

// Grammar is checked on rendered combinations so singular/plural and tense cannot
// pass merely because a corrected phrase exists in the source or a snapshot.
for(const amount of ['0','1','1.5','2']){
  for(const timeUnit of ['hours','days']){
    test(`numeric agreement: ${amount} ${timeUnit}, delayed cry, and nursery onset`,()=>{
      const {admission,acceptance}=notes([
        pick('ryn','prom','yes'),set('promH',amount),pick('numunit','promH',timeUnit),
        toggle('doic'),set('doicMin',amount),seg('pathway','nursery'),
        seg('pwOnset','developed'),set('pwOnsetH',amount),set('pwOnsetUnit','hours'),pick('msel','obSx','tachypnea')
      ]);
      const inflection=unit=>amount==='1'?unit:unit+'s';
      for(const text of [admission,section(acceptance,'Brief history')]){
        includes(text,`for ${amount} ${inflection(timeUnit==='days'?'day':'hour')}`);
        includes(text,`by ${amount} ${inflection('minute')} (DOIC)`);
        includes(text,`at ${amount} ${inflection('hour')} of age`);
        assert.doesNotMatch(text,/\b1 (?:minutes|hours|days)\b/);
      }
    });
  }
}

for(const dose of ['1','2']){
  test(`antenatal steroid dose agreement: ${dose}`,()=>{
    const {admission,acceptance}=notes([pick('ryn','steroid','yes'),pick('rc','steroid',dose)]);
    const expected=new RegExp(`\\b${dose} dose${dose==='1'?'':'s'}\\b`);
    for(const text of [admission,acceptance])assert.match(text,expected);
  });
}

test('unknown durations remain unknown instead of becoming zero or one',()=>{
  const {admission,acceptance}=notes([pick('ryn','prom','yes'),toggle('doic'),
    seg('pathway','nursery'),pick('msel','obSx','tachypnea')]);
  for(const text of [admission,section(acceptance,'Brief history')]){
    assert.match(text,/tachypnea was noted/i,'An observed symptom must remain recorded when onset is unknown');
    assert.match(text,/DOIC/);
    assert.doesNotMatch(text,/\b(?:for|by|at) [01] (?:minutes?|hours?|days?)\b/);
    assert.doesNotMatch(text,/tachypnea[^.]*developed|tachypnea[^.]*persisted/i,
      'An undocumented onset does not establish new or persistent symptoms');
  }
});

test('pending screens refer to pending results without asserting negatives',()=>{
  const {admission}=notes(['gbs','syphilis','hbsag','hiv','rubella'].map(key=>screen(key,'pend')));
  for(const label of ['GBS','RPR','HBsAg','HIV','rubella IgG']){
    assert.ok(admission.split(/\.\s+/).some(s=>s.includes(label)&&/pending/.test(s)),
      `Pending result not retained for ${label}`);
  }
  assert.doesNotMatch(admission,/all negative|pending for|not (?:obtained|performed)/i);
});

test('absent prenatal care does not turn undocumented conditions into negative tests',()=>{
  const {admission}=notes([seg('ancReg','none')]);
  assert.match(admission,/no prenatal care|not received prenatal care/i);
  assert.doesNotMatch(admission,/were not examined|all negative/i);
  assert.ok(admission.split(/\.\s+/).some(s=>/GDM/.test(s)&&/not (?:available|documented)|unavailable|undocumented/i.test(s)),
    'Maternal risk history must remain explicitly unknown');
});

test('vaginal delivery is expressed without duplicated delivery nouns',()=>{
  const {admission,acceptance}=notes([]);
  assert.match(section(acceptance,'Brief history'),/delivered vaginally/);
  assert.doesNotMatch(admission+'\n'+acceptance,/Delivery was by vaginal delivery/i);
  assert.match(admission,/3500 g\b/);
});

test('plan keeps family counseling as a selected completed event',()=>{
  const initial=notes([tab('plan')]).plan;
  assert.doesNotMatch(initial,/was explained to the family/);
  const explained=notes([tab('plan'),toggle('planExplained')]).plan;
  includes(explained,'The plan was explained to the family.');
  assert.doesNotMatch(explained,/On (?:incubator|open warmer|EKG)|Explained to family fully/);
});

test('plan wording does not prescribe repeating a documented procedure or surfactant dose',()=>{
  const {plan,acceptance}=notes([tab('acc'),{click:'[data-hct="aline"] button'},
    {click:'[data-hct="surf"] button'}]);
  assert.match(plan,/An arterial line was placed/);
  assert.match(plan,/Surfactant therapy: Survanta \(4 mL\/kg\)/);
  assert.doesNotMatch(plan,/Place an arterial line|Administer Survanta/i);
  assert.match(section(acceptance,'Hospital course'),/Survanta was administered/);
});

test('pulmonary findings use infiltrates and retain the consolidation qualifier',()=>{
  const {acceptance}=notes([tab('acc'),pick('hcm','cxrDx','infl')]);
  const course=section(acceptance,'Hospital course');
  assert.match(course,/pulmonary infiltrates/);
  assert.match(course,/without frank consolidation/);
  assert.doesNotMatch(course,/pulmonary infiltrations/);
  includes(acceptance,'【Antibiotic course】');
});

test('multiple radiographic findings keep each finding paired with its interpretation',()=>{
  const {acceptance}=notes([tab('acc'),...['rds2','pna','ptx','pmd'].map(dx=>pick('hcm','cxrDx',dx))]);
  const course=section(acceptance,'Hospital course');
  assert.match(course,/air-space consolidation, compatible with neonatal pneumonia; a peripheral lucent area with lung collapse, compatible with pneumothorax; and lucency/);
  assert.doesNotMatch(course,/it also showed/);
});

for(const cultureState of ['pending','nogrowth','positive']){
  for(const specimen of ['blood','both','unspecified']){
    test(`culture result grammar: ${specimen}, ${cultureState}`,()=>{
      const selection=specimen==='unspecified'?[]:[{click:'[data-hct="workup"] button'},
        ...(specimen==='blood'?[pick('hcm','workupItems','GJ/C')]:[])];
      const {acceptance}=notes([tab('acc'),...selection,hc('cultures',cultureState)]);
      const course=section(acceptance,'Hospital course');
      if(cultureState==='pending')assert.match(course,/results of [^.]* are still pending/i);
      else if(cultureState==='nogrowth')assert.match(course,/culture[s]? showed no growth/i);
      else{
        assert.match(course,/(?:the blood|a) culture was positive for ____/i);
        assert.doesNotMatch(course,/cultures (?:were|was) positive/i,'One positive result cannot make every culture positive');
      }
    });
  }
}

test('procedures distinguish completed steps from prospective follow-up and exchange plans',()=>{
  const {procedure}=notes([tab('proc'),...['intub','aline','lisa','lp','uac','uvc','chest','bet']
    .map(value=>({click:`[data-proctog] [data-v="${value}"]`}))],true);
  const blocks=procedure.split('< Procedure Note >').filter(Boolean);
  assert.equal(blocks.length,8);
  for(const title of ['Tracheal intubation','Less Invasive','UAC (','UVC (','Pigtail']){
    const block=blocks.find(b=>b.trim().startsWith(title));
    assert.ok(block,`Missing procedure ${title}`);
    const [completed,plan]=block.split('[Follow-up plan]');
    assert.ok(plan,`Missing follow-up plan for ${title}`);
    assert.match(completed,/was (?:placed|inserted|positioned)/);
    assert.match(plan,/(?:[Oo]btain a chest|Repeat blood gas)/);
    assert.doesNotMatch(completed,/radiograph (?:was|showed)|blood gas analysis (?:was|showed)/i);
  }
  const exchange=blocks.find(b=>b.trim().startsWith('Blood Exchange Transfusion'));
  includes(exchange,'[Procedure plan]');
  includes(exchange,'Transfuse 560 mL'); // 160 mL/kg × 3.5 kg, unchanged calculation.
  assert.doesNotMatch(exchange,/\b(?:was|were) (?:transfused|administered|given|performed)\b/i);
  assert.doesNotMatch(procedure,/Newly-born|maxillo-facial|by tapes|in supine position|post-tapping|\bml\b/);
  includes(procedure,'secured with tape');
});


// ── 2026-09-19 拍板：入院去處可選、產房／刀房依生產方式、pathway 不預設、seg 可取消 ──
test('destination is a placeholder until chosen, then names the chosen unit in both notes',()=>{
  const none=notes([]);
  includes(none.admission,'admitted to ____ for further evaluation');
  assert.doesNotMatch(none.admission,/our NICU|our NBC|baby room/);
  const nbc=notes([seg('dest','NBC')]);
  includes(nbc.admission,'admitted to our NBC for further evaluation and management');
  includes(nbc.acceptance,'admitted to our NBC');
  assert.doesNotMatch(nbc.admission,/our NICU/);
  includes(notes([seg('dest','BR')]).admission,'admitted to our baby room for further evaluation');
  includes(notes([seg('dest','NICU')]).admission,'admitted to our NICU');
});
test('admission-status sentence follows the chosen destination and is not duplicated in acceptance',()=>{
  const {admission,acceptance}=notes([seg('dest','NBC'),set('obAdmissionStatus','the infant was tachypneic with mild retractions')]);
  includes(admission,'On admission to our NBC, the infant was tachypneic');
  assert.equal((acceptance.match(/tachypneic with mild retractions/g)||[]).length,1,'acceptance must reuse the sentence once, not duplicate it');
});
test('standby and reassessment name the operating room for C/S and the delivery room for NSD',()=>{
  const nsd=notes([seg('dest','NICU'),toggle('pwStandby'),pick('msel','pwSbR','preterm labor')]);
  includes(nsd.admission,'called to stand by in the delivery room for the delivery');
  const cs=notes([seg('dest','NICU'),seg('delivery','cs'),toggle('pwStandby'),pick('msel','pwSbR','preterm labor')]);
  includes(cs.admission,'called to stand by in the operating room for the delivery');
  assert.doesNotMatch(cs.admission,/stand by in the delivery room/);
});
test('consult location is added only for an explicit direct pathway',()=>{
  const direct=notes([seg('dest','NICU'),seg('delivery','cs'),seg('pathway','direct'),toggle('pwConsult')]);
  includes(direct.admission,'was consulted in the operating room');
  const nursery=notes([seg('dest','NICU'),seg('delivery','cs'),seg('pathway','nursery'),toggle('pwConsult')]);
  assert.doesNotMatch(nursery.admission,/consulted in the (operating|delivery) room/);
  const unset=notes([seg('dest','NICU'),seg('delivery','cs'),toggle('pwConsult')]);
  assert.doesNotMatch(unset.admission,/consulted in the (operating|delivery) room/,'no pathway chosen ⇒ no asserted place');
});
test('pathway has no default and can be un-picked by clicking the same button again',()=>{
  const blank=notes([seg('dest','NICU')]).admission;
  assert.doesNotMatch(blank,/initially cared for in the baby room|referring hospital/);
  const nursery=notes([seg('dest','NICU'),seg('pathway','nursery')]).admission;
  includes(nursery,'initially cared for in the baby room');
  const unpicked=notes([seg('dest','NICU'),seg('pathway','nursery'),seg('pathway','nursery')]).admission;
  assert.doesNotMatch(unpicked,/initially cared for in the baby room/,'second click on the same pathway must clear it');
  assert.equal(unpicked,blank,'un-picked pathway must render exactly like never picked');
});
test('clearable segments can be un-picked; segments with semantic defaults cannot',()=>{
  const chosen=notes([seg('dest','NBC'),seg('dest','NBC')]).admission;
  includes(chosen,'admitted to ____');
  const female=notes([seg('gender','female')]).admission, cleared=notes([seg('gender','female'),seg('gender','female')]).admission;
  includes(female,'female'); assert.doesNotMatch(cleared,/\bfemale\b/);
  const dolTwice=notes([seg('dol','0'),seg('dol','0')]).acceptance;
  includes(dolTwice,'0 d/o');   // dol 有語意預設，再點不可清空
});


// ── 2026-09-20 故事 C（Ryan）：嬰兒室有狀況／母體風險 → 兒科去看（不是會診）→ 嬰兒室抽血 → 結果異常才收 ──
test('story C: the baby-room evaluation is not a consultation and derives maternal risk factors from section 2',()=>{
  const {admission}=notes([seg('dest','NBC'),seg('pathway','nursery'),pick('msel','obSx','tachypnea'),seg('pwOnset','persisted'),
    pick('ryn','fever','yes'),pick('ryn','prom','yes'),pick('rc','prom','prom'),set('promH','18'),screen('gbs','pos'),
    pick('msel','brEval','persist24'),pick('msel','brEval','maternal')]);
  includes(admission,'initially cared for in the baby room');
  includes(admission,'Because of persistence of tachypnea beyond 24 hours of age');   // 2026-09-23：Because of + 名詞片語
  includes(admission,'maternal risk factors (');includes(admission,'maternal fever');includes(admission,'PROM for 18 hours');includes(admission,'maternal GBS colonization');
  includes(admission,'the pediatric team was asked to evaluate the infant in the baby room');
  assert.doesNotMatch(admission,/was consulted|nursery/i);
});
test('story C: baby-room work-up findings are recorded once and justify the admission',()=>{
  const {admission,acceptance}=notes([seg('dest','NBC'),seg('pathway','nursery'),pick('msel','brWorkup','cbc'),pick('msel','brWorkup','crp'),
    pick('msel','brFindings','bandemia'),pick('msel','brFindings','crp'),set('brCrp','12.3')]);
  includes(admission,'complete blood count with differential');
  includes(admission,'were obtained in the baby room, which showed bandemia and an elevated CRP level (12.3 mg/dL).');
  includes(admission,'The infant was therefore admitted to our NBC');
  assert.doesNotMatch(admission,/Subsequently, the infant was admitted/);
  includes(acceptance,'bandemia');
  assert.equal((admission.match(/bandemia/g)||[]).length,1,'the finding is stated once');
});
test('story C: a work-up without recorded results is not written as normal; an explicit confirmation is',()=>{
  const pending=notes([seg('dest','NBC'),seg('pathway','nursery'),pick('msel','brWorkup','cbc')]).admission;
  includes(pending,'A complete blood count with differential was obtained in the baby room.');
  assert.doesNotMatch(pending,/unremarkable|normal|therefore/i);
  const normal=notes([seg('dest','NBC'),seg('pathway','nursery'),pick('msel','brWorkup','cbc'),pick('msel','brFindings','normal')]).admission;
  includes(normal,'and the results were unremarkable');
  includes(normal,'Subsequently, the infant was admitted');
  // 勾了異常再勾「無異常」⇒ 互斥，只剩無異常
  const flipped=notes([seg('dest','NBC'),seg('pathway','nursery'),pick('msel','brFindings','bandemia'),pick('msel','brFindings','normal')]).admission;
  assert.doesNotMatch(flipped,/bandemia/);includes(flipped,'unremarkable');
});
test('story C: maternal-risk reason without any recorded risk falls back to a generic phrase',()=>{
  const {admission}=notes([seg('dest','NBC'),seg('pathway','nursery'),pick('msel','brEval','maternal')]);
  includes(admission,'Because of maternal risk factors, the pediatric team was asked to evaluate');   // 2026-09-23：Because of + 名詞片語
  assert.doesNotMatch(admission,/maternal risk factors \(/);
});

let failed=0;
for(const [name,check] of tests){
  try{check();console.log(`✓ ${name}`);}
  catch(error){failed++;console.error(`✗ ${name}\n  ${error.message}`);}
}
if(failed){console.error(`${failed}/${tests.length} regression scenarios failed`);process.exitCode=1;}
else console.log(`✓ ${tests.length} field-to-note regression scenarios passed`);
