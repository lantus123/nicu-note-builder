// Synthetic prenatal histories: retain selected findings without inventing chronology or confirmation.
const assert=require('node:assert/strict');
const {render}=require('./driver');
const set=(id,value)=>({set:[id,value]});
const seg=(key,value)=>({click:`[data-seg="${key}"] [data-v="${value}"]`});
const BASE=[seg('gender','female'),set('gaW','39'),set('gaD','0'),set('bw','3200'),
  seg('delivery','nsd'),set('gravida','2'),set('para','1'),set('matAge','31'),
  set('ap1','8'),set('ap5','9'),seg('dol','0')];
const NIPT_FINDING='synthetic trisomy 21 risk', ACGH_FINDING='synthetic deletion finding';
const cache=new Map();
function notes(steps){
  const key=JSON.stringify(steps);
  if(!cache.has(key)){
    const result=render({steps:[...BASE,...steps]});
    assert.deepEqual(result.misses,[],'Every scenario must operate a real, editable control');
    assert.deepEqual(result.errors,[],'Prenatal selection must not raise page errors');
    cache.set(key,result.out);
  }
  return cache.get(key);
}
function prenatalSentence(admission){
  const sentence=admission.split(/(?<=[.!?])\s+/).find(part=>part.includes('(aCGH)'));
  assert.ok(sentence,'The aCGH history must remain in Admission');
  return sentence;
}
function noInventedLink(sentence){
  assert.doesNotMatch(sentence,/\b(?:subsequently|therefore|confirm(?:ed|ing|ation|atory)?|because)\b/i,
    'Selected tests do not establish their chronology, reason, or confirmatory relationship');
}
const tests=[];
const test=(name,check)=>tests.push([name,check]);

for(const [state,finding] of [['normal',''],['abnormal',ACGH_FINDING],['abnormal','']]){
  test(`aCGH ${state}${state==='abnormal'&&!finding?' with unfilled result':''} stands alone when NIPT was not performed`,()=>{
    const {admission}=notes([seg('amnio',state),set('acghFindings',finding),seg('nipt','none')]);
    assert.doesNotMatch(admission,/\bNIPT\b|noninvasive prenatal testing/i,
      'An unperformed NIPT must not interrupt the recorded aCGH narrative');
    const sentence=prenatalSentence(admission);
    assert.match(sentence,/\(aCGH\).*following amniocentesis/i);
    if(state==='normal')assert.match(sentence,/showed normal results/);
    else if(finding)assert.ok(sentence.includes(finding));
    else assert.match(sentence,/showed ____/,'An unspecified abnormal finding must remain unknown');
    noInventedLink(sentence);
  });
}

const bothResults=[];
for(const risk of ['low','high'])for(const acgh of ['normal','abnormal']){
  const steps=[seg('nipt',risk),set('niptFind',risk==='high'?NIPT_FINDING:''),
    seg('amnio',acgh),set('acghFindings',acgh==='abnormal'?ACGH_FINDING:'')];
  bothResults.push(steps);
  test(`both recorded tests retain ${risk}-risk NIPT and ${acgh} aCGH in screening-first order`,()=>{
    const sentence=prenatalSentence(notes(steps).admission);
    assert.match(sentence,/^Noninvasive prenatal testing \(NIPT\)/);
    assert.ok(sentence.indexOf('(NIPT)')<sentence.indexOf('(aCGH)'),'NIPT should introduce the combined sentence');
    assert.match(sentence,new RegExp(`indicated a ${risk} risk of`));
    if(risk==='low')assert.match(sentence,/trisomies 21, 18, and 13/);
    else assert.ok(sentence.includes(NIPT_FINDING));
    if(acgh==='normal')assert.match(sentence,/\(aCGH\).*showed normal results/);
    else assert.ok(sentence.includes(ACGH_FINDING));
    assert.doesNotMatch(sentence,/not performed/);
    noInventedLink(sentence);
  });
}

test('both abnormal selections retain separate placeholders when their findings are unfilled',()=>{
  const sentence=prenatalSentence(notes([seg('nipt','high'),seg('amnio','abnormal')]).admission);
  assert.match(sentence,/NIPT\) indicated a high risk of ____/);
  assert.match(sentence,/aCGH\).*showed ____/);
  assert.equal((sentence.match(/____/g)||[]).length,2);
  noInventedLink(sentence);
});

test('hiding an entered NIPT result suppresses its mention and restoring the selection restores the result',()=>{
  const entered=[seg('amnio','normal'),seg('nipt','high'),set('niptFind',NIPT_FINDING)];
  const before=notes(entered);
  const hidden=notes([...entered,seg('nipt','none')]);
  assert.doesNotMatch(hidden.admission,/\bNIPT\b|noninvasive prenatal testing/i);
  assert.ok(!hidden.admission.includes(NIPT_FINDING));
  const restored=notes([...entered,seg('nipt','none'),seg('nipt','high')]);
  assert.ok(restored.admission.includes(NIPT_FINDING),'Changing the status must not erase the entered finding');
  assert.equal(restored.admission,before.admission);
});

test('the existing sentence for two unperformed tests remains unchanged',()=>{
  const sentence=prenatalSentence(notes([seg('amnio','none'),seg('nipt','none')]).admission);
  assert.equal(sentence,'Neither amniocentesis with array comparative genomic hybridization (aCGH) nor noninvasive prenatal testing (NIPT) was performed.');
});

for(const risk of ['low','high'])test(`the existing NIPT-only ${risk}-risk wording remains unchanged`,()=>{
  const sentence=prenatalSentence(notes([seg('amnio','none'),seg('nipt',risk),set('niptFind',NIPT_FINDING)]).admission);
  const result=risk==='low'?'a low risk of trisomies 21, 18, and 13':`a high risk of ${NIPT_FINDING}`;
  assert.equal(sentence,`Amniocentesis with array comparative genomic hybridization (aCGH) was not performed, while noninvasive prenatal testing (NIPT) indicated ${result}.`);
});

test('prenatal reporting choices do not change NI Plan or Acceptance output',()=>{
  const reference=notes([seg('amnio','none'),seg('nipt','none')]);
  for(const steps of [[seg('amnio','normal'),seg('nipt','none')],
    [seg('amnio','abnormal'),set('acghFindings',ACGH_FINDING),seg('nipt','none')],...bothResults]){
    const result=notes(steps);
    assert.equal(result.plan,reference.plan,'Prenatal wording changes must not alter treatment plans');
    assert.equal(result.acceptance,reference.acceptance,'Acceptance is outside this narrative change');
  }
});

let failures=0;
for(const [name,check] of tests){try{check();console.log(`PASS ${name}`);}catch(error){failures++;console.error(`FAIL ${name}\n${error.stack}`);}}
console.log(`${tests.length-failures}/${tests.length} prenatal narrative checks passed`);
if(failures)process.exitCode=1;
