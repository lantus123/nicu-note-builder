// Screening interactions: direct native controls must preserve recorded clinical states.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const {render}=require('./driver');

function withPage(check){
  const errors=[];
  const dom=new JSDOM(fs.readFileSync(__dirname+'/../../index.html','utf8'),{
    runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu.test/',
    beforeParse(W){W.scrollTo=()=>{};W.addEventListener('error',e=>errors.push(String(e.error?.message||e.message)));}
  });
  const W=dom.window,d=W.document;
  const row=key=>{const el=d.querySelector(`.scr-row[data-scr="${key}"]`);assert.ok(el,`Missing screening row: ${key}`);return el;};
  const radio=(key,value)=>{const el=[...row(key).querySelectorAll('input[type="radio"]')].find(input=>input.value===value);assert.ok(el,`Missing screening choice: ${key}/${value}`);return el;};
  const pick=(key,value)=>radio(key,value).click();
  const select=(key,value)=>{const el=row(key).querySelector('.scr-select');assert.ok([...el.options].some(option=>option.value===value));el.value=value;el.dispatchEvent(new W.Event('change',{bubbles:true}));};
  const state=(key,value)=>{
    const el=row(key);assert.equal(el.dataset.state,value);
    assert.equal(el.querySelector('.scr-select').value,value);
    assert.deepEqual([...el.querySelectorAll('input:checked')].map(input=>input.value),[value]);
  };
  try{check({W,d,row,radio,pick,select,state,note:()=>d.getElementById('note').textContent});assert.deepEqual(errors,[]);}
  finally{W.close();}
}

const tests=[];
const test=(name,check)=>tests.push([name,check]);

test('screening controls have native accessible groups and preserve undocumented defaults',()=>withPage(({d,row,radio,state})=>{
  assert.equal(d.querySelector('.scr-btn'),null,'The cycling button must not remain as a hidden fallback');
  for(const key of ['hbsag','hbeag','syphilis','hiv','gbs','rubella']){
    const el=row(key), values=key==='rubella'?['neg','pos','pend','nd']:['na','neg','pos','pend','nd'];
    assert.deepEqual([...el.querySelectorAll('input[type="radio"]')].map(input=>input.value),values);
    assert.ok(el.querySelector('fieldset legend').textContent.trim());
    const select=el.querySelector('select');
    assert.ok(d.getElementById(select.getAttribute('aria-labelledby'))?.textContent.trim());
    for(const value of values){assert.equal(radio(key,value).name,`scr-${key}`);assert.ok(radio(key,value).labels.length);}
    state(key,key==='rubella'?'neg':'na');
  }
  radio('gbs','na').focus();
  assert.equal(d.activeElement,radio('gbs','na'),'Native radios remain keyboard-focusable');
}));

test('desktop choices select the requested result directly and never cycle on a repeated click',()=>withPage(({pick,state,note})=>{
  pick('gbs','nd');state('gbs','nd');assert.match(note(),/GBS\) culture was not obtained/);
  pick('gbs','pos');state('gbs','pos');assert.match(note(),/GBS\) culture was positive/);
  pick('gbs','pos');state('gbs','pos');
  pick('gbs','neg');state('gbs','neg');assert.match(note(),/GBS\) culture was negative/);
  pick('gbs','na');state('gbs','na');assert.doesNotMatch(note(),/GBS\) culture was (?:positive|negative|not obtained)/);
}));

test('mobile native selects and desktop radios stay synchronized in both directions',()=>withPage(({pick,select,state,note})=>{
  select('gbs','pend');state('gbs','pend');assert.match(note(),/GBS\) culture result was pending/);
  pick('gbs','pos');state('gbs','pos');
  select('gbs','na');state('gbs','na');
  select('hbsag','pos');state('hbsag','pos');
}));

test('HBeAg becomes available with positive HBsAg and retains its recorded value while hidden',()=>withPage(({row,pick,select,state,note})=>{
  assert.equal(row('hbeag').hidden,true);
  pick('hbsag','pos');assert.equal(row('hbeag').hidden,false);
  select('hbeag','pend');state('hbeag','pend');assert.match(note(),/HBeAg\) result was pending/);
  pick('hbsag','neg');assert.equal(row('hbeag').hidden,true);state('hbeag','pend');
  assert.doesNotMatch(note(),/HBeAg\)/);
  pick('hbsag','pos');assert.equal(row('hbeag').hidden,false);state('hbeag','pend');
  assert.match(note(),/HBeAg\) result was pending/);
}));

test('bulk screening updates only core screening fields and synchronizes both controls',()=>withPage(({d,pick,state,note})=>{
  pick('hbsag','pos');pick('hbeag','pos');pick('rubella','nd');
  for(const value of ['neg','pend','nd']){
    d.querySelector(`[data-scrall] [data-v="${value}"]`).click();
    for(const key of ['hbsag','syphilis','hiv','gbs'])state(key,value);
    state('hbeag','pos');state('rubella','nd');
    assert.match(note(),/Maternal rubella IgG was nonreactive/);
  }
  pick('hbsag','pos');state('hbeag','pos');assert.match(note(),/HBeAg\) testing was also positive/);
}));

test('Rubella keeps its distinct IgG semantics and an unmentioned value stays neutral',()=>withPage(({row,pick,select,note})=>{
  const el=row('rubella');
  assert.equal(el.querySelector('input[value="neg"]').closest('label').dataset.tone,'neutral');
  assert.equal(el.querySelector('select').dataset.tone,'neutral');
  assert.doesNotMatch(note(),/rubella IgG/i);
  pick('rubella','pos');assert.match(note(),/rubella IgG was reactive/);assert.equal(el.querySelector('select').dataset.tone,'good');
  select('rubella','nd');assert.match(note(),/rubella IgG was nonreactive/);assert.equal(el.querySelector('select').dataset.tone,'risk');
  select('rubella','pend');assert.match(note(),/rubella IgG result was pending/);
  pick('rubella','neg');assert.doesNotMatch(note(),/rubella IgG/i);assert.equal(el.querySelector('select').dataset.tone,'neutral');
}));

test('direct GBS risk selection retains the IAP prompt without recording prophylaxis',()=>withPage(({d,pick,select,note})=>{
  const hint=d.getElementById('iapHint');assert.equal(hint.hidden,true);
  pick('gbs','pos');assert.equal(hint.hidden,false);assert.ok(hint.classList.contains('pulse'));
  assert.equal(d.querySelector('[data-seg="iap"] [data-v="none"]').getAttribute('aria-pressed'),'true');
  assert.doesNotMatch(note(),/prophylaxis \(IAP\) was (?:in)?complete/);
  select('gbs','na');assert.equal(hint.hidden,true);
}));

// 預覽唯讀（2026-09-24 Ryan）：改篩檢就直接重組，不再需要按「套用最新選擇」。
test('changing screening rewrites the read-only preview immediately',()=>withPage(({W,d,pick,note})=>{
  const el=d.getElementById('note');el.dispatchEvent(new W.Event('input',{bubbles:true}));
  pick('gbs','pos');
  assert.match(note(),/GBS\) culture was positive/);
  assert.equal(d.getElementById('regen'),null,'The apply button must be gone');
}));

test('legacy scenario requests adapt to direct choices and report unavailable states',()=>{
  const valid=render({steps:[{cycle:['.scr-row[data-scr="gbs"] .scr-btn','pos']}]});
  assert.deepEqual(valid.misses,[]);assert.deepEqual(valid.errors,[]);assert.match(valid.out.admission,/GBS\) culture was positive/);
  const invalid=render({steps:[{cycle:['.scr-row[data-scr="rubella"] .scr-btn','na']}]});
  assert.ok(invalid.misses.some(message=>message.includes('篩檢選項不存在')));
});

let failures=0;
for(const [name,check] of tests){try{check();console.log(`PASS ${name}`);}catch(error){failures++;console.error(`FAIL ${name}\n${error.stack}`);}}
console.log(`${tests.length-failures}/${tests.length} screening UI checks passed`);
if(failures)process.exitCode=1;
