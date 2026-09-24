// Synthetic campus routing: home campuses and external facilities have distinct scopes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');
const LABELS=['台北','淡水','新竹','台東'];
const EXTERNAL=['桃園秉坤','中壢秉坤','三重惠心','民權禾馨','李木生','周天給','四季和安'];
const FACILITY_FIELDS=['ancPlace','birthHosp','obFacility','obTransferFrom'];

function withPage(check,{persistedHome}={}){
  const errors=[];
  const dom=new JSDOM(html,{
    runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-campus.test/',
    beforeParse(W){
      W.scrollTo=()=>{};
      if(persistedHome!==undefined)W.localStorage.setItem('nicu_home_hosp',persistedHome);
      W.addEventListener('error',e=>errors.push(String(e.error?.message||e.message)));
    }
  });
  const W=dom.window,d=W.document;
  // 共用院所清單的值；四個院所欄位是 input + list="hospList"，homeHosp 仍是 select。
  const datalistValues=()=>[...d.querySelectorAll('#hospList option')].map(option=>option.value);
  const select=(id,value,{custom=false}={})=>{
    const el=d.getElementById(id);
    assert.ok(el,`Missing facility field: ${id}`);
    if(el.tagName==='INPUT'){
      // custom=true 代表刻意打清單外的自填字串，不檢查 datalist；其餘一定要在清單裡。
      if(!custom)assert.ok(datalistValues().includes(value),`Missing datalist entry: ${id}/${value}`);
      el.value=value;el.dispatchEvent(new W.Event('input',{bubbles:true}));
    }else{
      assert.ok([...el.options].some(option=>option.value===value),`Missing option: ${id}/${value}`);
      el.value=value;el.dispatchEvent(new W.Event('change',{bubbles:true}));
    }
    assert.equal(el.value,value,`Selection must survive rendering: ${id}/${value}`);
  };
  const click=selector=>{
    const el=d.querySelector(selector);assert.ok(el,`Missing control: ${selector}`);el.click();
  };
  const campuses=()=>[...d.getElementById('homeHosp').options].map(option=>({label:option.textContent.trim(),value:option.value}));
  const campusValue=label=>{
    const option=campuses().find(option=>option.label===label);
    assert.ok(option,`Missing home campus: ${label}`);return option.value;
  };
  const note=()=>d.getElementById('note').textContent;
  try{check({W,d,select,click,campuses,campusValue,note,datalistValues});assert.deepEqual(errors,[],'Campus interactions must not raise page errors');}
  finally{W.close();}
}
function birthSentence(text){
  const sentence=text.match(/[^.\n]*was delivered[^.\n]*\./)?.[0];
  assert.ok(sentence,'The note must contain a delivery sentence');return sentence;
}
function assertBirthplace(text,value){
  assert.ok(birthSentence(text).includes(`at ${value}`),`Delivery site must retain ${value}`);
}
const tests=[];
const test=(name,check)=>tests.push([name,check]);

test('home hospital has exactly the four named campuses and retains legacy Taipei/Tamsui values',()=>withPage(({d,campuses,campusValue})=>{
  const options=campuses();
  assert.deepEqual(options.map(option=>option.label),LABELS);
  assert.equal(new Set(options.map(option=>option.value)).size,4);
  assert.ok(options.every(option=>option.value));
  assert.equal(campusValue('台北'),'TPEMMH');assert.equal(campusValue('淡水'),'TSMMH');
  assert.equal(d.getElementById('homeHosp').value,'TPEMMH');
  assert.ok(options.every(option=>!EXTERNAL.includes(option.value)),'External facilities must not appear in home campuses');
}));

for(const id of FACILITY_FIELDS)test(`${id} is a typeable field backed by the shared facility datalist`,()=>withPage(({d,select,campuses,datalistValues})=>{
  const el=d.getElementById(id);
  assert.equal(el.tagName,'INPUT','Facility fields must accept typed input');
  assert.equal(el.getAttribute('list'),'hospList','Facility fields must share one datalist');
  assert.ok(el.placeholder.trim(),'The automatic/undocumented hint must survive as a placeholder');
  assert.equal(el.value,'','A facility field starts empty, meaning automatic/undocumented');
  const values=datalistValues();
  assert.equal(new Set(values).size,values.length,'Datalist entries must not be duplicated');
  for(const value of [...EXTERNAL,...campuses().map(option=>option.value)]){
    assert.ok(values.includes(value),`Missing datalist entry: ${value}`);
    select(id,value);
  }
}));

test('every valid campus can be saved and restored on the next page load',()=>{
  let options;
  withPage(({campuses})=>{options=campuses();});
  assert.deepEqual(options.map(option=>option.label),LABELS);
  for(const {label,value} of options){
    withPage(({W,select})=>{
      select('homeHosp',value);
      assert.equal(W.localStorage.getItem('nicu_home_hosp'),value,`${label} selection must be persisted`);
    });
    withPage(({d,note})=>{
      assert.equal(d.getElementById('homeHosp').value,value,`${label} must restore from its saved value`);
      assertBirthplace(note(),value);
    },{persistedHome:value});
  }
});

test('legacy external and unrecognized persisted home values fall back to Taipei',()=>{
  for(const value of [...EXTERNAL,'Synthetic unknown home campus'])withPage(({d,note})=>{
    assert.equal(d.getElementById('homeHosp').value,'TPEMMH');
    assertBirthplace(note(),'TPEMMH');
    assert.ok(!birthSentence(note()).includes(value),'A stale home setting must not become the default birth site');
  },{persistedHome:value});
});

for(const label of ['新竹','台東']){
  test(`${label} becomes the default birth site in Admission and Acceptance`,()=>withPage(({d,select,click,campusValue,note})=>{
    const value=campusValue(label);select('homeHosp',value);
    assert.equal(d.getElementById('birthHosp').value,'','Automatic birth site remains automatic');
    assertBirthplace(note(),value);
    click('[data-tab="acc"]');assertBirthplace(note(),value);
    click('[data-tab="adm"]');assertBirthplace(note(),value);
  }));

  test(`${label} prenatal care is never mislabeled as an external OBGYN clinic`,()=>withPage(({select,click,campusValue,note})=>{
    const value=campusValue(label);select('ancPlace',value);
    for(const status of ['regular','irregular','na']){
      click(`[data-seg="ancReg"] [data-v="${status}"]`);
      const sentence=note().split(/(?<=\.)\s+/).find(text=>/prenatal care/i.test(text)&&text.includes(value));
      assert.ok(sentence,`${label} prenatal care must be retained for ${status}`);
      assert.ok(sentence.includes(`at ${value}`));
      assert.doesNotMatch(sentence,/OBGYN clinic/);
    }
  }));
}

test('an external prenatal facility still receives the existing clinic designation',()=>withPage(({select,click,note})=>{
  select('ancPlace','周天給');click('[data-seg="ancReg"] [data-v="regular"]');
  assert.ok(note().includes('周天給 OBGYN clinic'));
}));

test('explicit external birth and transfer facilities stay distinct from the selected home campus',()=>withPage(({d,select,click,campusValue,note})=>{
  const birth='民權禾馨',source='桃園秉坤';
  select('homeHosp',campusValue('新竹'));select('ancPlace','周天給');select('birthHosp',birth);
  assertBirthplace(note(),birth);
  click('[data-tab="acc"]');assertBirthplace(note(),birth);click('[data-tab="adm"]');
  click('[data-seg="pathway"] [data-v="outborn"]');
  select('obFacility',birth);select('obTransferFrom',source);
  for(const homeLabel of ['新竹','台東']){
    const home=campusValue(homeLabel);select('homeHosp',home);
    for(const mode of ['adm','acc']){
      click(`[data-tab="${mode}"]`);
      const text=note();assertBirthplace(text,birth);
      assert.ok(text.includes(`transferred from ${source}`),'Transfer source must not be overwritten by the home or birth facility');
      assert.ok(!birthSentence(text).includes(home));
      assert.ok(!text.includes(`transferred from ${home}`));
      assert.equal(d.getElementById('homeHosp').value,home);
      assert.equal(d.getElementById('obFacility').value,birth);
      assert.equal(d.getElementById('obTransferFrom').value,source);
    }
    click('[data-tab="adm"]');
  }
}));

test('another MMH campus remains selectable as an explicit outside birth and transfer facility',()=>withPage(({select,click,campusValue,note})=>{
  select('homeHosp',campusValue('新竹'));
  click('[data-seg="pathway"] [data-v="outborn"]');
  select('obFacility',campusValue('淡水'));select('obTransferFrom',campusValue('台東'));
  for(const mode of ['adm','acc']){
    click(`[data-tab="${mode}"]`);assertBirthplace(note(),campusValue('淡水'));
    assert.ok(note().includes(`transferred from ${campusValue('台東')}`));
  }
}));

test('a typed facility outside the list is written into both notes verbatim',()=>withPage(({select,click,note})=>{
  const typed='Synthetic Clinic';
  select('birthHosp',typed,{custom:true});
  assertBirthplace(note(),typed);
  click('[data-tab="acc"]');assertBirthplace(note(),typed);
  click('[data-tab="adm"]');assertBirthplace(note(),typed);
}));

test('an empty transfer source inherits a typed outborn facility',()=>withPage(({d,select,click,note})=>{
  const typed='Synthetic Birth Center';
  click('[data-seg="pathway"] [data-v="outborn"]');
  select('obFacility',typed,{custom:true});
  assert.equal(d.getElementById('obTransferFrom').value,'','The transfer source stays automatic');
  for(const mode of ['adm','acc']){
    click(`[data-tab="${mode}"]`);
    const text=note();
    assertBirthplace(text,typed);
    assert.ok(text.includes(`transferred from ${typed}`),`An empty transfer source must inherit the typed birth facility (${mode})`);
  }
}));

let failures=0;
for(const [name,check] of tests){
  try{check();console.log(`PASS ${name}`);}
  catch(error){failures++;console.error(`FAIL ${name}\n${error.stack||error}`);}
}
console.log(`Campus UI: ${tests.length-failures}/${tests.length} passed`);
if(failures)process.exitCode=1;
