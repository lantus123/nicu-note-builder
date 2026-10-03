// Institutional admission destinations, not clinical treatment recommendations.
// Synthetic data only; expose state in this test copy to exercise stale/legacy values.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(__dirname+'/../../index.html','utf8');
assert.equal(source.split('function render(){').length,2,'Test hook must match exactly one render function');
const html=source.replace('function render(){','window.destinationTest={S,render,destPhrase,destPlan}; function render(){');
const tests=[];
const test=(name,check)=>tests.push([name,()=>{
  const errors=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-destination.test/',beforeParse(W){
    W.scrollTo=()=>{};W.HTMLElement.prototype.scrollIntoView=()=>{};
    W.addEventListener('error',e=>errors.push(String(e.error?.message||e.message)));
  }});
  const W=dom.window,d=W.document;
  const get=selector=>{const el=d.querySelector(selector);assert.ok(el,`Missing ${selector}`);return el;};
  const click=selector=>get(selector).click();
  const seg=(key,value)=>click(`[data-seg="${key}"] [data-v="${value}"]`);
  const story=key=>click(`[data-story="${key}"]`);
  const input=(id,value)=>{const el=get('#'+id);el.value=value;el.dispatchEvent(new W.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
  const note=(mode='adm')=>{click(`[data-tab="${mode}"]`);return get('#note').textContent.trim();};
  const selected=()=>get('[data-seg="dest"]').querySelector('[aria-pressed="true"]')?.dataset.v||'';
  try{check({W,d,get,click,seg,story,input,note,selected,state:W.destinationTest});assert.deepEqual(errors,[],'No page errors');}
  finally{W.close();}
}]);

test('inpatient choices exclude BR and start unselected',({get,d,selected,note})=>{
  assert.deepEqual([...d.querySelectorAll('[data-seg="dest"] button[data-v]')].map(b=>b.dataset.v),['NBC','NICU','PICU']);
  assert.equal(selected(),'');
  assert.match(get('#destNurseryHelp').textContent,/BR.*健康.*不列為住院去處/);
  assert.match(note(),/admitted to ____/);
  assert.equal(note('plan'),'');
  assert.match(get('#planWarn').textContent,/先.*確認住院去處/);
});

test('E offers NBC/PICU only and cannot select NICU even by a dispatched event',({W,get,story,selected,note})=>{
  story('E');const nicu=get('[data-seg="dest"] [data-v="NICU"]');
  assert.equal(nicu.hidden,true);assert.equal(nicu.disabled,true);
  assert.match(get('#destHelp').textContent,/已返家.*NBC／PICU.*不收入 NICU/);
  nicu.click();nicu.dispatchEvent(new W.MouseEvent('click',{bubbles:true}));
  assert.equal(selected(),'');assert.match(note(),/admitted to ____/);
  assert.doesNotMatch(note('acc'),/admitted to our NICU/);
  assert.equal(note('plan'),'');
});

test('NICU to E clears explicitly without choosing NBC; valid choice resolves the warning',({get,story,seg,selected,note})=>{
  story('A');seg('dest','NICU');story('E');
  assert.equal(selected(),'');assert.equal(get('#destNotice').hidden,false);
  assert.match(get('#destNotice').textContent,/原選 NICU.*重新選 NBC 或 PICU/);
  assert.doesNotMatch(get('#contextReview').textContent,/原選 NICU/,'The entry card should not repeat the same destination notice');
  assert.match(get('#reviewConflictList').textContent,/原選 NICU/,'The final review still includes the unresolved destination');
  assert.match(get('#reviewMissingList').textContent,/收治單位/);
  assert.match(note(),/admitted to ____/);assert.match(note('acc'),/admitted to ____/);assert.equal(note('plan'),'');
  note();seg('dest','NBC');assert.equal(selected(),'NBC');assert.equal(get('#destNotice').hidden,true);
  assert.doesNotMatch(get('#reviewMissingList').textContent,/收治單位/);
  assert.match(note(),/admitted to our NBC/);assert.match(note('acc'),/admitted to our NBC/);
  assert.ok(note('plan'));assert.doesNotMatch(note('plan'),/Giraffe|Minimize handling/);
});

test('E PICU is shared by admission and acceptance but never borrows a NICU plan',({get,story,seg,input,note})=>{
  story('E');seg('dest','PICU');seg('readmitSource','emergency');
  input('obAdmissionStatus','the infant was tachypneic');
  assert.match(note(),/admitted to our PICU/);
  assert.match(note(),/On admission to our PICU, the infant was tachypneic/);
  const acceptance=note('acc');assert.match(acceptance,/admitted to our PICU/);
  assert.equal((acceptance.match(/the infant was tachypneic/g)||[]).length,1);
  assert.doesNotMatch(acceptance,/our NICU|admitted to our baby room/);
  assert.equal(get('#destPlanHelp').hidden,false);
  assert.equal(note('plan'),'');assert.match(get('#planWarn').textContent,/PICU.*尚未設定.*不會套用 NICU/);
  assert.equal(get('#planControls').hidden,true);
});

test('C retains nursery history, distinct from the inpatient destination',({story,seg,note})=>{
  story('C');seg('dest','PICU');
  for(const mode of ['adm','acc']){
    assert.match(note(mode),/initially cared for in the baby room/);
    assert.match(note(mode),/admitted to our PICU/);
    assert.doesNotMatch(note(mode),/admitted to our baby room/);
  }
});

test('route drafts restore each chosen unit without overwriting prenatal/birth or E complaint',({get,story,seg,input,note,selected})=>{
  story('A');seg('dest','NICU');input('gaW','38');input('bw','3100');
  story('E');seg('dest','PICU');input('readmitComplaint','cough');
  story('A');assert.equal(selected(),'NICU');assert.match(note(),/admitted to our NICU/);
  story('E');assert.equal(selected(),'PICU');assert.match(note(),/admitted to our PICU/);
  assert.equal(get('#gaW').value,'38');assert.equal(get('#bw').value,'3100');assert.equal(get('#readmitComplaint').value,'cough');
  story('C');seg('dest','NBC');story('E');assert.equal(selected(),'PICU');story('C');assert.equal(selected(),'NBC');
});

test('first route selection preserves a compatible previously chosen destination',({story,seg,selected})=>{
  seg('dest','NBC');story('E');assert.equal(selected(),'NBC');
});

test('unresolved destination notice survives leaving and returning to E',({story,seg,get,selected})=>{
  story('A');seg('dest','NICU');story('E');story('A');story('E');
  assert.equal(selected(),'');assert.equal(get('#destNotice').hidden,false);
  assert.match(get('#destNotice').textContent,/NICU.*不適用情境 E/);
});

test('explicitly clearing PICU leaves a placeholder and no fallback NICU plan',({story,seg,note,selected,get})=>{
  story('E');seg('dest','PICU');seg('dest','PICU');assert.equal(selected(),'PICU');get('[data-clear-seg="dest"]').click();
  assert.equal(selected(),'');assert.match(note(),/admitted to ____/);assert.equal(note('plan'),'');
  assert.equal(get('#destPlanHelp').hidden,true);
});

test('legacy BR and stale E NICU are rejected at output and render boundaries',({state,get,note})=>{
  for(const [pathway,dest] of [['direct','BR'],['readmit','NICU'],['readmit','BR'],['direct','unknown']]){
    state.S.pathway=pathway;state.S.dest=dest;
    assert.equal(state.destPhrase(),'____','Output guard must not need a UI render');
    assert.equal(state.destPlan(),null,'No fallback NICU configuration');
    state.render();assert.equal(state.S.dest,'');assert.equal(get('#destNotice').hidden,false);
    assert.doesNotMatch(note(),/admitted to our (?:baby room|NICU)|undefined/);
    assert.doesNotMatch(note('acc'),/admitted to our (?:baby room|NICU)|undefined/);
    assert.equal(note('plan'),'');
  }
});

test('stale saved E draft is revalidated when restored',({state,story,seg,selected,get,note})=>{
  story('E');seg('dest','NBC');story('A');
  state.S.routeDrafts.readmit.destination='NICU';story('E');
  assert.equal(selected(),'');assert.match(get('#destNotice').textContent,/NICU.*不適用情境 E/);
  assert.doesNotMatch(note(),/admitted to our NICU/);
});

let failed=0;
for(const [name,run] of tests){try{run();console.log('✓ '+name);}catch(error){failed++;console.error('✗ '+name+'\n'+error.stack);}}
console.log(`${tests.length} destination regressions, ${failed} failed`);process.exitCode=failed?1:0;
