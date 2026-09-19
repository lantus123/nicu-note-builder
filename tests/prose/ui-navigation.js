// UI-only regressions. All fields are synthetic; navigation must not rewrite notes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');
const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

function withPage(check){
  const errors=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu.test/',
    beforeParse(W){
      let x=0,y=0;
      Object.defineProperties(W,{scrollX:{get:()=>x,configurable:true},scrollY:{get:()=>y,configurable:true}});
      W.scrollTo=(nextX,nextY)=>{
        if(typeof nextX==='object'){x=nextX.left??x;y=nextX.top??y;}
        else{x=nextX;y=nextY;}
      };
      W.addEventListener('error',e=>errors.push(String(e.error?.message||e.message)));
    }});
  const W=dom.window,d=W.document;
  const tab=(mode,pointer=true)=>{
    const button=d.querySelector(`[data-tab="${mode}"]`);
    button.focus();
    button.dispatchEvent(new W.MouseEvent('click',{bubbles:true,detail:pointer?1:0}));
  };
  try{check({W,d,tab});assert.deepEqual(errors,[],'No page errors');}
  finally{W.close();}
}

test('the six Admission sections retain their order (birth and pathway merged into one journey, 2026-09-20)',()=>withPage(({d})=>{
  const names=['寶寶基本','母親病史','產前篩檢','產程用藥','出生到入院','暫定診斷'];
  const headings=[...d.querySelectorAll('#admSections > .card > .sec-h')];
  assert.equal(headings.length,names.length);
  names.forEach((name,i)=>assert.ok(headings[i].textContent.includes(name),`Section ${i+1}: ${name}`));
}));

test('pointer tab changes restore each form scroll, focus, and preview scroll',()=>withPage(({W,d,tab})=>{
  const weight=d.getElementById('bw'),preview=d.querySelector('.dock-body');
  weight.focus();W.scrollTo(0,740);preview.scrollTop=210;
  tab('plan');
  assert.equal(W.scrollY,0,'First visit starts at the top');
  const planControl=d.querySelector('[data-seg="planAbx"] [data-v="none"]');
  planControl.focus();W.scrollTo(0,280);preview.scrollTop=70;
  tab('adm');
  assert.equal(W.scrollY,740);
  assert.equal(d.activeElement,weight);
  assert.equal(preview.scrollTop,210);
  tab('plan');
  assert.equal(W.scrollY,280);
  assert.equal(d.activeElement,planControl);
  assert.equal(preview.scrollTop,70);
}));

test('clicking the active tab does not reset the viewport or note',()=>withPage(({W,d,tab})=>{
  const before=d.getElementById('note').textContent;
  W.scrollTo(0,620);
  tab('adm');
  assert.equal(W.scrollY,620);
  assert.equal(d.getElementById('note').textContent,before);
}));

test('manual tab activation keeps keyboard focus on the tab',()=>withPage(({d,tab})=>{
  d.getElementById('bw').focus();
  tab('plan',false);tab('adm',false);
  assert.equal(d.activeElement.id,'note-tab-adm');
}));

test('tab arrows move focus without activating or changing clinical inputs',()=>withPage(({W,d})=>{
  const admission=d.getElementById('note-tab-adm');admission.focus();
  const note=d.getElementById('note').textContent;
  admission.dispatchEvent(new W.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal(d.activeElement.id,'note-tab-plan');
  assert.equal(admission.getAttribute('aria-selected'),'true');
  assert.equal(d.getElementById('note').textContent,note);
  d.activeElement.dispatchEvent(new W.KeyboardEvent('keydown',{key:'End',bubbles:true}));
  assert.equal(d.activeElement.id,'note-tab-proc');
  d.activeElement.dispatchEvent(new W.KeyboardEvent('keydown',{key:'Home',bubbles:true}));
  assert.equal(d.activeElement,admission);
  assert.equal(d.querySelectorAll('.tabs [tabindex="0"]').length,1);
}));

test('tab and panel accessibility relationships remain synchronized',()=>withPage(({d,tab})=>{
  for(const mode of ['plan','acc','proc','adm']){
    tab(mode,false);
    const button=d.querySelector(`[data-tab="${mode}"]`),panel=d.getElementById(button.getAttribute('aria-controls'));
    assert.equal(button.getAttribute('aria-selected'),'true');
    assert.equal(panel.getAttribute('role'),'tabpanel');
    assert.equal(panel.getAttribute('aria-labelledby'),button.id);
    assert.equal(panel.hidden,false);
    assert.equal(d.querySelectorAll('.tabs [aria-selected="true"]').length,1);
  }
}));

test('collapsible sections use native buttons with honest expanded state',()=>withPage(({d})=>{
  for(const button of d.querySelectorAll('.section-toggle')){
    assert.equal(button.tagName,'BUTTON');
    const content=d.getElementById(button.getAttribute('aria-controls'));
    assert.ok(content);
    const expanded=button.getAttribute('aria-expanded')==='true';
    assert.equal(content.hidden,!expanded);
    const note=d.getElementById('note').textContent;
    button.click();
    assert.equal(button.getAttribute('aria-expanded'),String(!expanded));
    assert.equal(content.hidden,expanded);
    assert.equal(d.getElementById('note').textContent,note);
    button.click();
    assert.equal(content.hidden,!expanded);
  }
}));

test('restoring a tab does not focus a now-hidden field',()=>withPage(({d,tab})=>{
  const input=d.getElementById('doicMin');
  d.querySelector('[data-tog="doic"] button').click();input.focus();
  // Programmatic form change leaves the remembered field hidden, as a later
  // conditional-field change could do; tab restoration must not focus it.
  d.querySelector('[data-tog="doic"] button').click();
  assert.ok(input.closest('[hidden]'));
  tab('plan');tab('adm');
  assert.notEqual(d.activeElement,input);
}));

test('delayed numeric selection cannot steal focus after rapid field or tab changes',()=>withPage(({W,d,tab})=>{
  const pending=[],selected=[],setTimeout=W.setTimeout;
  W.setTimeout=fn=>{pending.push(fn);return pending.length;};
  W.HTMLInputElement.prototype.select=function(){selected.push(this.id);this.focus();};
  d.getElementById('bw').focus();
  d.getElementById('matAge').focus();
  pending.splice(0).forEach(fn=>fn());
  assert.deepEqual(selected,['matAge']);
  assert.equal(d.activeElement.id,'matAge');
  d.getElementById('bw').focus();
  tab('plan',false);
  pending.splice(0).forEach(fn=>fn());
  assert.deepEqual(selected,['matAge']);
  assert.equal(d.activeElement.id,'note-tab-plan');
  W.setTimeout=setTimeout;
}));

let failures=0;
for(const [name,check] of tests){
  try{check();console.log(`✓ ${name}`);}
  catch(e){failures++;console.error(`✗ ${name}\n  ${e.stack}`);}
}
if(failures)process.exitCode=1;
else console.log(`✓ ${tests.length} navigation UI scenarios passed`);
