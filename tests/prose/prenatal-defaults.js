// UI-only normal presets must never become clinical facts without an explicit action.
// All examples are synthetic. Tests exercise the same DOM controls used by physicians.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');
const tests=[];
const test=(name,check)=>tests.push([name,()=>{
  const errors=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-prenatal-defaults.test/',beforeParse(W){
    W.scrollTo=()=>{};W.HTMLElement.prototype.scrollIntoView=()=>{};W.addEventListener('error',e=>errors.push(String(e.error?.message||e.message)));
  }});
  const W=dom.window,d=W.document,get=s=>{const el=d.querySelector(s);assert.ok(el,`Missing ${s}`);return el;};
  const click=s=>get(s).click(),seg=(k,v)=>click(`[data-seg="${k}"] [data-v="${v}"]`);
  const risk=(k,v)=>click(`[data-ryn="${k}"] [data-v="${v}"],[data-r3="${k}"] [data-v="${v}"]`);
  const input=(id,value)=>{const el=get('#'+id);el.value=value;el.dispatchEvent(new W.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
  const screen=(k,v)=>click(`.scr-row[data-scr="${k}"] input[value="${v}"]`);
  const note=(mode='adm')=>{click(`[data-tab="${mode}"]`);return get('#note').textContent;};
  const selected=k=>get(`[data-ryn="${k}"],[data-r3="${k}"],[data-seg="${k}"]`).querySelector('[aria-pressed="true"]')?.dataset.v;
  const pending=()=>[...d.querySelectorAll('.prenatal-status[data-pending="true"]')].map(el=>el.id.replace('prenatalStatus-',''));
  const confirm=()=>click('#confirmPrenatalNext');
  try{check({W,d,get,click,seg,risk,input,screen,note,selected,pending,confirm});assert.deepEqual(errors,[],'No page errors');}finally{W.close();}
}]);

test('normal presets are visibly selected but absent from unconfirmed notes',({d,get,selected,pending,note})=>{
  assert.equal(pending().length,10);
  for(const key of ['gdm','pih','aph','pph','uri','fever','prom'])assert.equal(selected(key),'no');
  assert.equal(selected('pre'),'neg');assert.equal(selected('ancReg'),'regular');assert.equal(selected('us'),'normal');
  assert.match(get('#prenatalDefaultStatus').textContent,/10.*尚未寫入/);
  for(const mode of ['adm','acc'])assert.doesNotMatch(note(mode),/No gestational diabetes|regular prenatal care|ultrasound showed normal|all negative|amniocentesis.*normal/);
  for(const control of d.querySelectorAll('[data-default-state]')){
    assert.ok(d.getElementById(control.getAttribute('aria-labelledby')));assert.ok(d.getElementById(control.getAttribute('aria-describedby')));
    assert.equal(control.querySelectorAll('[aria-pressed="true"]').length,1);
    assert.ok([...control.querySelectorAll('button')].every(b=>!b.hidden&&!b.disabled));
  }
});

test('one explicit group confirmation commits only displayed normal presets',({get,confirm,pending,note,selected})=>{
  confirm();assert.equal(pending().length,0);
  assert.match(note(),/regular prenatal care/);assert.match(note(),/prenatal ultrasound showed normal findings/);
  assert.match(note(),/No gestational diabetes mellitus/);
  assert.doesNotMatch(note(),/level II|all negative|aCGH.*normal|NIPT.*low risk/);
  for(const key of ['hbsag','hiv','gbs','syphilis'])assert.equal(get(`.scr-row[data-scr="${key}"]`).dataset.state,'na');
  assert.equal(selected('amnio'),'na');assert.equal(selected('nipt'),'na');assert.equal(selected('steroid'),'na');
  assert.equal(get('#prenatalSkip').hidden,true);
});

test('exceptions and their details survive group confirmation',({risk,click,seg,input,confirm,note,selected,get})=>{
  risk('gdm','yes');click('[data-rc="gdm"] [data-v="insulin"]');risk('pre','highrisk');risk('fever','unknown');
  seg('ancReg','irregular');seg('us','abnormal');input('usFindings','a synthetic ultrasound abnormality');
  confirm();assert.equal(selected('gdm'),'yes');assert.equal(selected('pre'),'highrisk');assert.equal(selected('fever'),'unknown');
  assert.equal(selected('ancReg'),'irregular');assert.equal(selected('us'),'abnormal');
  assert.match(note(),/gestational diabetes mellitus \(GDM\) treated with insulin/);
  assert.match(note(),/irregular prenatal care/);assert.match(note(),/synthetic ultrasound abnormality/);
  assert.doesNotMatch(note(),/ultrasound showed normal/);assert.equal(get('[data-child="gdm"]').hidden,false);
});

test('explicit unknown history and prenatal findings are never converted to normal',({risk,seg,confirm,note,selected})=>{
  risk('gdm','unknown');seg('ancReg','unknown');seg('us','unknown');confirm();
  for(const key of ['gdm','ancReg','us'])assert.equal(selected(key),'unknown');
  assert.match(note(),/gestational diabetes mellitus.*was unavailable/);
  assert.match(note(),/prenatal care.*was unavailable/);assert.match(note(),/ultrasound findings were unavailable/);
  assert.doesNotMatch(note(),/regular prenatal care|ultrasound showed normal|No gestational diabetes/);
});

test('explicitly clearing a field opts out of the preset, including on later confirmation',({risk,seg,confirm,selected,note,pending})=>{
  risk('gdm','na');seg('ancReg','na');seg('us','na');assert.equal(pending().length,7);confirm();
  for(const key of ['gdm','ancReg','us'])assert.equal(selected(key),'na');
  assert.doesNotMatch(note(),/No gestational diabetes|regular prenatal care|ultrasound showed normal/);
});

test('clicking the visibly preselected normal button explicitly confirms only that field',({risk,selected,note,pending,get})=>{
  risk('gdm','no');assert.equal(selected('gdm'),'no');assert.equal(pending().length,9);
  assert.equal(get('#prenatalStatus-gdm').dataset.pending,'false');assert.match(note(),/No gestational diabetes/);
  assert.doesNotMatch(note(),/regular prenatal care|ultrasound showed normal/);
});

test('tab changes, birth data, and route changes do not attest to the presets',({click,input,pending,note})=>{
  input('gaW','38');input('bw','3100');click('[data-story="E"]');note('acc');note('plan');note('adm');
  click('#entryDirect');assert.equal(pending().length,10);
  assert.doesNotMatch(note(),/No gestational diabetes|regular prenatal care|ultrasound showed normal/);
});

test('chapter jumps and skip navigation leave defaults unconfirmed and visible in final review',({click,pending,get,note})=>{
  click('#flowMenu [data-flow-target="prenatalCard"]');click('#flowMenu [data-flow-target="birthHistoryCard"]');
  assert.equal(pending().length,10);click('#prenatalSkip');assert.equal(pending().length,10);
  assert.match(get('#reviewPendingList').textContent,/10.*正常預設.*未寫入/);
  assert.doesNotMatch(note(),/No gestational diabetes|regular prenatal care|ultrasound showed normal/);
});

test('sticky forward action clearly announces and performs group confirmation',({click,get,pending,note})=>{
  click('#flowMenu [data-flow-target="prenatalCard"]');
  assert.match(get('#flowNext').textContent,/已核對/);assert.match(get('#flowNext').getAttribute('aria-label'),/正常預設/);
  click('#flowNext');assert.equal(pending().length,0);assert.match(note(),/regular prenatal care/);
});

test('no prenatal care cancels only the unconfirmed ultrasound preset',({seg,get,confirm,note,selected})=>{
  seg('ancReg','none');assert.equal(selected('us'),'na');assert.equal(get('#prenatalNoCareNotice').hidden,false);
  confirm();assert.match(note(),/not received prenatal care/);assert.doesNotMatch(note(),/ultrasound showed normal/);
});

test('an explicitly supplied ultrasound result survives selecting no prenatal care',({seg,input,confirm,note})=>{
  seg('us','abnormal');input('usFindings','a synthetic ultrasound finding');seg('ancReg','none');confirm();
  assert.match(note(),/synthetic ultrasound finding/);assert.doesNotMatch(note(),/ultrasound showed normal/);
});

test('screening positives, pending and unperformed results survive normal history confirmation',({screen,confirm,get,note})=>{
  screen('hbsag','pos');screen('gbs','pend');screen('hiv','nd');screen('syphilis','neg');confirm();
  for(const [k,v] of [['hbsag','pos'],['gbs','pend'],['hiv','nd'],['syphilis','neg']])assert.equal(get(`.scr-row[data-scr="${k}"]`).dataset.state,v);
  assert.match(note(),/surface antigen.*positive/);assert.match(note(),/GBS\) culture result was pending/);
  assert.doesNotMatch(note(),/all negative/);
});

test('screening shortcut fills blanks without overwriting any prior result',({screen,click,get})=>{
  screen('hbsag','pos');screen('gbs','pend');screen('hiv','nd');click('[data-scrall] [data-v="neg"]');
  for(const [k,v] of [['hbsag','pos'],['gbs','pend'],['hiv','nd'],['syphilis','neg']])assert.equal(get(`.scr-row[data-scr="${k}"]`).dataset.state,v);
});

test('abnormal detail controls expand in place and retained hidden details do not leak',({risk,click,get,note})=>{
  const child=get('[data-child="gdm"]'),parent=child.parentElement;
  risk('gdm','yes');assert.equal(child.hidden,false);assert.equal(child.parentElement,parent);click('[data-rc="gdm"] [data-v="insulin"]');
  risk('gdm','no');assert.equal(child.hidden,true);assert.doesNotMatch(note(),/treated with insulin/);
  risk('gdm','yes');assert.equal(child.hidden,false);assert.match(note(),/treated with insulin/);
});

test('group confirmation is idempotent and later edits are never reset',({confirm,note,risk,selected})=>{
  confirm();const first=note();confirm();assert.equal(note(),first);
  risk('pih','yes');confirm();assert.equal(selected('pih'),'yes');assert.match(note(),/notable for pregnancy-induced hypertension/);
});

test('confirmed background remains shared across routes without a second confirmation',({confirm,click,pending,selected})=>{
  confirm();click('#entryDirect');click('[data-story="E"]');assert.equal(pending().length,0);assert.equal(selected('ancReg'),'regular');
});

let failed=0;
for(const [name,run] of tests){try{run();console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}}
console.log(`${tests.length-failed}/${tests.length} prenatal default checks passed`);process.exitCode=failed?1:0;
