// User-requested live normal defaults; all examples are synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8'),tests=[];
const test=(name,check)=>tests.push([name,()=>{
  const errors=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-defaults.test/',beforeParse(W){
    W.scrollTo=()=>{};W.HTMLElement.prototype.scrollIntoView=()=>{};W.addEventListener('error',e=>errors.push(String(e.error?.message||e.message)));
  }});
  const W=dom.window,d=W.document,get=s=>{const el=d.querySelector(s);assert.ok(el,`Missing ${s}`);return el;};
  const click=s=>get(s).click(),seg=(k,v)=>click(`[data-seg="${k}"] [data-v="${v}"]`);
  const risk=(k,v)=>click(`[data-ryn="${k}"] [data-v="${v}"],[data-r3="${k}"] [data-v="${v}"]`);
  const input=(id,value)=>{const el=get('#'+id);el.value=value;el.dispatchEvent(new W.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
  const screen=(k,v)=>click(`.scr-row[data-scr="${k}"] input[value="${v}"]`);
  const note=(mode='adm')=>{click(`[data-tab="${mode}"]`);return get('#note').textContent;};
  const selected=k=>get(`[data-ryn="${k}"],[data-r3="${k}"],[data-seg="${k}"]`).querySelector('[aria-pressed="true"]')?.dataset.v;
  try{check({W,d,get,click,seg,risk,input,screen,note,selected});assert.deepEqual(errors,[]);}finally{W.close();}
}]);

test('normal history and prenatal defaults are visible and immediately written',({d,get,selected,note})=>{
  for(const key of ['gdm','pih','aph','pph','uri','fever','prom'])assert.equal(selected(key),'no');
  assert.equal(selected('pre'),'neg');assert.equal(selected('ancReg'),'regular');assert.equal(selected('us'),'normal');
  assert.match(get('#prenatalDefaultStatus').textContent,/直接帶入病歷/);
  assert.match(note(),/No gestational diabetes mellitus/);assert.match(note(),/regular prenatal care/);assert.match(note(),/prenatal ultrasound showed normal findings/);
  for(const control of d.querySelectorAll('[data-default-state]')){
    assert.ok(d.getElementById(control.getAttribute('aria-labelledby')));assert.ok(d.getElementById(control.getAttribute('aria-describedby')));
    assert.equal(control.querySelectorAll('[aria-pressed="true"]').length,1);
    assert.ok([...control.querySelectorAll('button')].every(b=>!b.hidden&&!b.disabled));assert.equal(control.querySelector('[data-v="na"]'),null);
  }
});
test('pending confirmation and undocumented choices are removed from changed controls',({d,get})=>{
  assert.equal(d.querySelector('#confirmPrenatalNext,#prenatalSkip,[data-confirm-prenatal],.prenatal-status[data-pending]'),null);
  assert.equal(d.querySelector('[data-ryn] [data-v="na"],[data-r3] [data-v="na"],#screen input[value="na"]'),null);
  assert.deepEqual([...get('#habitStatus').options].map(o=>o.value),['negative','unknown']);assert.doesNotMatch(get('#reviewPendingList').textContent,/正常預設/);
});
test('defaults do not imply amniocentesis, NIPT, steroids or level II ultrasound',({selected,note})=>{
  assert.equal(selected('amnio'),'na');assert.equal(selected('nipt'),'na');assert.equal(selected('steroid'),'unknown');
  assert.doesNotMatch(note(),/level II|aCGH.*normal|NIPT.*low risk|received.*betamethasone/i);
});
test('exceptions immediately replace normal defaults without navigation',({risk,click,seg,input,note,selected,get})=>{
  risk('gdm','yes');click('[data-rc="gdm"] [data-v="insulin"]');risk('pre','highrisk');risk('fever','unknown');
  seg('ancReg','irregular');seg('us','abnormal');input('usFindings','a synthetic ultrasound abnormality');
  assert.equal(selected('gdm'),'yes');assert.equal(selected('pre'),'highrisk');assert.equal(selected('fever'),'unknown');
  assert.match(note(),/gestational diabetes mellitus \(GDM\) treated with insulin/);assert.match(note(),/irregular prenatal care/);assert.match(note(),/synthetic ultrasound abnormality/);
  assert.doesNotMatch(note(),/ultrasound showed normal|No gestational diabetes/);assert.equal(get('[data-child="gdm"]').hidden,false);assert.equal(get('#prenatalStatus-gdm').dataset.default,'false');
});
test('unknown history and findings survive forward navigation without reverting to normal',({risk,seg,click,note,selected})=>{
  risk('gdm','unknown');seg('ancReg','unknown');seg('us','unknown');click('#prenatalNext');
  for(const key of ['gdm','ancReg','us'])assert.equal(selected(key),'unknown');
  assert.match(note(),/gestational diabetes mellitus.*was unavailable/);assert.match(note(),/prenatal care.*was unavailable/);assert.match(note(),/ultrasound findings were unavailable/);
  assert.doesNotMatch(note(),/regular prenatal care|ultrasound showed normal|No gestational diabetes/);
});
test('repeated normal selections are idempotent and never clear the value',({risk,seg,selected,note})=>{
  const original=note();risk('gdm','no');risk('gdm','no');seg('ancReg','regular');seg('us','normal');
  assert.equal(selected('gdm'),'no');assert.equal(selected('us'),'normal');assert.equal(note(),original);
});
test('tabs, chapter jumps, back and forward preserve exceptions',({risk,seg,click,note,selected,get})=>{
  risk('gdm','yes');seg('us','unknown');note('acc');note('plan');note('adm');
  click('#flowMenu [data-flow-target="prenatalCard"]');assert.doesNotMatch(get('#flowNext').textContent,/核對/);
  click('#flowNext');click('#flowBack');click('#flowMenu [data-flow-target="birthHistoryCard"]');
  assert.equal(selected('gdm'),'yes');assert.equal(selected('us'),'unknown');assert.doesNotMatch(note(),/No gestational diabetes|ultrasound showed normal/);
});
test('no prenatal care withdraws only the untouched normal ultrasound default',({seg,get,note,selected})=>{
  seg('ancReg','none');assert.equal(selected('us'),'unknown');assert.equal(get('#prenatalNoCareNotice').hidden,false);
  assert.match(note(),/not received prenatal care/);assert.match(note(),/ultrasound findings were unavailable/);assert.doesNotMatch(note(),/ultrasound showed normal/);
  seg('ancReg','regular');assert.equal(selected('us'),'unknown');
});
test('an explicitly selected ultrasound result survives no prenatal care',({seg,input,note,selected})=>{
  seg('us','abnormal');input('usFindings','a synthetic ultrasound finding');seg('ancReg','none');assert.match(note(),/synthetic ultrasound finding/);
  seg('us','normal');seg('ancReg','none');assert.equal(selected('us'),'normal');
});
test('screening defaults are negative with reactive Rubella, not assumed infection',({get,note})=>{
  for(const key of ['hbsag','hbeag','hiv','gbs','syphilis'])assert.equal(get(`.scr-row[data-scr="${key}"]`).dataset.state,'neg');
  assert.equal(get('.scr-row[data-scr="rubella"]').dataset.state,'pos');assert.match(note(),/all negative/);assert.match(note(),/Maternal rubella IgG was reactive/);
  assert.equal(get('[data-csum="scr"]').textContent,'篩檢陰性・Rubella 有抗體');
});
test('screening exceptions replace the all-negative sentence and persist on navigation',({screen,click,get,note})=>{
  screen('hbsag','pos');screen('gbs','pend');screen('hiv','nd');screen('syphilis','unknown');click('#prenatalNext');
  for(const [k,v] of [['hbsag','pos'],['gbs','pend'],['hiv','nd'],['syphilis','unknown']])assert.equal(get(`.scr-row[data-scr="${k}"]`).dataset.state,v);
  assert.match(note(),/surface antigen.*positive/);assert.match(note(),/GBS\) culture result was pending/);assert.match(note(),/RPR\) testing was unavailable/);assert.doesNotMatch(note(),/all negative/);
});
test('batch shortcuts edit untouched defaults and protect even explicit negatives',({screen,click,get})=>{
  screen('hbsag','pos');screen('gbs','neg');screen('hiv','unknown');click('[data-scrall] [data-v="pend"]');
  for(const [k,v] of [['hbsag','pos'],['gbs','neg'],['hiv','unknown'],['syphilis','pend'],['rubella','pos']])assert.equal(get(`.scr-row[data-scr="${k}"]`).dataset.state,v);
  click('[data-scrall] [data-v="nd"]');assert.equal(get('.scr-row[data-scr="syphilis"]').dataset.state,'nd');assert.equal(get('.scr-row[data-scr="gbs"]').dataset.state,'neg');
});
test('habits default to none; selecting one retains negatives for the others',({click,get,note})=>{
  assert.equal(get('#habitStatus').value,'negative');assert.match(note(),/mother denied cigarette smoking, alcohol consumption, or substance abuse during pregnancy/);
  click('[data-habit="smoking"] button');assert.match(note(),/mother reported cigarette smoking but denied alcohol consumption or substance abuse/);assert.doesNotMatch(note(),/denied cigarette smoking/);
  click('[data-habit="smoking"] button');assert.match(note(),/mother denied cigarette smoking, alcohol consumption, or substance abuse/);
});
test('unknown unselected habits stay unknown while selected habits remain recorded',({click,input,note})=>{
  input('habitStatus','unknown');click('[data-habit="alcohol"] button');assert.match(note(),/Information on maternal cigarette smoking and substance abuse was unavailable/);
  assert.match(note(),/mother reported alcohol consumption/);assert.doesNotMatch(note(),/mother denied|but denied/);
});
test('abnormal details expand in place and hidden drafts do not leak',({risk,click,get,note})=>{
  const child=get('[data-child="gdm"]'),parent=child.parentElement;risk('gdm','yes');assert.equal(child.hidden,false);assert.equal(child.parentElement,parent);click('[data-rc="gdm"] [data-v="insulin"]');
  risk('gdm','no');assert.equal(child.hidden,true);assert.doesNotMatch(note(),/treated with insulin/);risk('gdm','yes');assert.equal(child.hidden,false);assert.match(note(),/treated with insulin/);
});
test('routes share the common background and default habits without resetting exceptions',({risk,click,selected,note})=>{
  risk('pih','yes');click('#entryDirect');click('[data-story="E"]');assert.equal(selected('pih'),'yes');assert.equal(selected('ancReg'),'regular');
  assert.match(note(),/notable for pregnancy-induced hypertension/);assert.match(note(),/mother denied cigarette smoking/);
});
let failed=0;
for(const [name,run] of tests){try{run();console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}}
console.log(`${tests.length-failed}/${tests.length} prenatal default checks passed`);process.exitCode=failed?1:0;
