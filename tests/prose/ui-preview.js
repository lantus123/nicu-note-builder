// Synthetic preview interactions: display controls must never rewrite clinical text.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');

async function withPage(check,{width=1200,matchMedia=true}={}){
  const errors=[];
  const dom=new JSDOM(html,{
    runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-preview.test/',
    beforeParse(W){
      Object.defineProperty(W,'innerWidth',{value:width,writable:true,configurable:true});
      W.scrollTo=()=>{};
      if(matchMedia)W.matchMedia=query=>({
        media:query,get matches(){return W.innerWidth<800;},
        addEventListener(){},removeEventListener(){}
      });
      W.addEventListener('error',e=>errors.push(String(e.error?.message||e.message)));
    }
  });
  const W=dom.window,d=W.document,note=d.getElementById('note');
  const click=selector=>{
    const el=d.querySelector(selector);
    assert.ok(el,`Missing control: ${selector}`);el.click();
  };
  const input=(id,value)=>{
    const el=d.getElementById(id);
    assert.ok(el,`Missing field: ${id}`);
    assert.ok(!el.readOnly&&!el.disabled,`Field must be editable: ${id}`);
    el.value=value;
    el.dispatchEvent(new W.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));
  };
  const resize=value=>{W.innerWidth=value;W.dispatchEvent(new W.Event('resize'));};
  try{
    await check({W,d,note,click,input,resize});
    assert.deepEqual(errors,[],'Preview interactions must not raise page errors');
  }finally{W.close();}
}

const tests=[];
const test=(name,check)=>tests.push([name,check]);
const seed=({click,input})=>{
  click('[data-seg="gender"] [data-v="male"]');
  input('gaW','34');input('gaD','0');input('bw','2487');
};

test('desktop preview starts visible in review mode with normal-size settings',()=>withPage(({d,note})=>{
  // 2026-09-20 Ryan：醫師編輯時應顯示校閱模式 ⇒ 預設校閱（data-reading=false），閱讀模式手動切。
  const dock=d.querySelector('.dock'),toggle=d.getElementById('dockToggle');
  assert.equal(dock.dataset.reading,'false');assert.equal(dock.dataset.font,'normal');
  assert.equal(d.getElementById('previewReading').getAttribute('aria-pressed'),'false');
  assert.equal(d.getElementById('previewReading').textContent,'校閱模式');
  assert.equal(d.getElementById('previewFont').value,'normal');
  assert.equal(toggle.hidden,true);assert.equal(toggle.getAttribute('aria-expanded'),'true');
  assert.equal(toggle.getAttribute('aria-controls'),'previewBody');
  assert.equal(d.getElementById('previewBody').hidden,false);
  assert.equal(d.querySelector('.preview-tools').hidden,false);
  assert.equal(dock.classList.contains('collapsed'),false);
  assert.ok(note.textContent.trim());assert.equal(note.querySelectorAll('.note-change').length,0);
}));

test('focusing the note to edit while in reading mode switches back to review mode',()=>withPage(({d,note})=>{
  const dock=d.querySelector('.dock'),btn=d.getElementById('previewReading');
  btn.click();
  assert.equal(dock.dataset.reading,'true');assert.equal(btn.textContent,'閱讀模式');
  note.dispatchEvent(new d.defaultView.FocusEvent('focusin',{bubbles:true}));
  assert.equal(dock.dataset.reading,'false','editing must show review marks');
  assert.equal(btn.getAttribute('aria-pressed'),'false');assert.equal(btn.textContent,'校閱模式');
}));

for(const matchMedia of [true,false])test(`mobile preview starts collapsed (${matchMedia?'media query':'width fallback'})`,()=>
  withPage(({d,note,click,resize})=>{
    const dock=d.querySelector('.dock'),body=d.getElementById('previewBody');
    const toggle=d.getElementById('dockToggle'),tools=d.querySelector('.preview-tools');
    const text=note.textContent;
    assert.equal(toggle.hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'false');
    assert.equal(body.hidden,true);assert.equal(tools.hidden,true);
    assert.equal(dock.classList.contains('collapsed'),true);
    assert.equal(d.body.classList.contains('dockmin'),true);
    click('#dockToggle');
    assert.equal(toggle.getAttribute('aria-expanded'),'true');
    assert.equal(body.hidden,false);assert.equal(tools.hidden,false);
    click('#dockToggle');
    assert.equal(body.hidden,true);assert.equal(tools.hidden,true);
    resize(1200);
    assert.equal(toggle.hidden,true);assert.equal(toggle.getAttribute('aria-expanded'),'true');
    assert.equal(body.hidden,false);assert.equal(tools.hidden,false);
    assert.equal(dock.classList.contains('collapsed'),false);
    resize(390);
    assert.equal(toggle.hidden,false);assert.equal(body.hidden,true);
    assert.equal(toggle.getAttribute('aria-expanded'),'false');
    click('#dockToggle');resize(1200);resize(390);
    assert.equal(body.hidden,false,'Returning to mobile retains the expanded preference');
    assert.equal(note.textContent,text,'Responsive changes must not rewrite the note');
  },{width:390,matchMedia}));

for(const mode of ['adm','plan','acc','proc'])test(`${mode} reading and font settings preserve exact DOM text and markup`,()=>
  withPage(page=>{
    const {d,note,click,input}=page;seed(page);
    click(`[data-tab="${mode}"]`);
    if(mode==='proc')click('[data-proctog] [data-v="intub"]');
    const text=note.textContent,markup=note.innerHTML;
    click('#previewReading');   // 預設校閱（2026-09-20），第一次點切到閱讀
    assert.equal(d.querySelector('.dock').dataset.reading,'true');
    assert.equal(d.getElementById('previewReading').getAttribute('aria-pressed'),'true');
    for(const size of ['large','small','normal']){
      input('previewFont',size);assert.equal(d.querySelector('.dock').dataset.font,size);
      assert.equal(note.textContent,text);assert.equal(note.innerHTML,markup);
    }
    click('#previewReading');
    assert.equal(d.querySelector('.dock').dataset.reading,'false');
    assert.equal(note.textContent,text);assert.equal(note.innerHTML,markup);
    assert.equal(d.getElementById('regen').hidden,true,'Display changes must not mark a note as manually edited');
  }));

test('only changed values are highlighted and the highlight expires without rewriting text',()=>withPage(async page=>{
  const {d,note,input}=page;seed(page);
  input('bw','2488');
  const marks=[...note.querySelectorAll('.note-change')].map(el=>el.textContent);
  assert.ok(marks.length>0,'A changed birth weight should receive a quiet update marker');
  assert.ok(marks.every(text=>/^[\d\s]+$/.test(text)),`Unchanged prose was marked: ${JSON.stringify(marks)}`);
  assert.ok(marks.join('').replace(/\s/g,'').length<12,'Repeated values must not highlight the prose between them');
  assert.equal(d.querySelectorAll('.slot.flash').length,0,'The whole note must not flash on each input');
  const text=note.textContent;
  input('bw','2488');
  assert.equal(note.textContent,text);
  assert.deepEqual([...note.querySelectorAll('.note-change')].map(el=>el.textContent),marks);
  await new Promise(resolve=>setTimeout(resolve,1050));
  assert.equal(note.querySelectorAll('.note-change').length,0);
  assert.equal(note.textContent,text,'Highlight expiry must not change note content');
}));

test('form-driven rerenders preserve preview scroll position',()=>withPage(page=>{
  const {d,note,input}=page;seed(page);
  const body=d.getElementById('previewBody');body.scrollTop=317;body.scrollLeft=19;
  input('bw','2488');
  assert.equal(body.scrollTop,317);assert.equal(body.scrollLeft,19);
  assert.match(note.textContent,/2488/);
  input('matAge','31');
  assert.equal(body.scrollTop,317);assert.equal(body.scrollLeft,19);
}));

for(const [label,before,after] of [
  ['shared high surrogate','😀','😁'],
  ['shared low surrogate',String.fromCodePoint(0x20000),String.fromCodePoint(0x20400)]
])test(`change markers preserve complete Unicode codepoints (${label})`,()=>withPage(({W,d,note,click,input})=>{
  click('[data-tog="pwStandby"] button');
  input('obCourse',`Synthetic ${before} observation`);
  input('obCourse',`Synthetic ${after} observation`);
  assert.ok(note.textContent.includes(`Synthetic ${after} observation`));
  assert.ok([...note.querySelectorAll('.note-change')].some(el=>el.textContent.includes(after)),
    'The marker must contain the whole changed codepoint, not one surrogate half');
  const walker=d.createTreeWalker(note,W.NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode())){
    const unpaired=Array.from(node.data).some(char=>char.length===1&&char.charCodeAt(0)>=0xD800&&char.charCodeAt(0)<=0xDFFF);
    assert.equal(unpaired,false,'Highlight spans must not split a valid surrogate pair between DOM text nodes');
  }
}));

test('display settings and form updates preserve a manual note until explicit regeneration',()=>withPage(page=>{
  const {W,d,note,click,input}=page;seed(page);
  const manual='Synthetic manually edited narrative.\nKeep this exact second line.';
  note.textContent=manual;note.dispatchEvent(new W.Event('input',{bubbles:true}));
  assert.equal(d.getElementById('regen').hidden,false);
  click('#previewReading');input('previewFont','large');input('bw','2599');
  assert.equal(note.textContent,manual);assert.equal(d.getElementById('regen').hidden,false);
  click('#regen');
  assert.notEqual(note.textContent,manual);assert.match(note.textContent,/2599/);
  assert.equal(d.getElementById('regen').hidden,true);
}));

test('the sticky edit hint carries its own apply button that regenerates like the header one',()=>withPage(page=>{
  const {W,d,note,click,input}=page;seed(page);
  const hint=d.getElementById('editHint');assert.equal(hint.hidden,true,'Hint stays hidden until a manual edit');
  note.textContent='Synthetic manual text.';note.dispatchEvent(new W.Event('input',{bubbles:true}));
  assert.equal(hint.hidden,false);assert.ok(hint.querySelector('#regenInline'),'Hint must contain the inline apply button');
  input('bw','2599');assert.doesNotMatch(note.textContent,/2599/,'Locked preview must not regenerate on form changes');
  click('#regenInline');
  assert.match(note.textContent,/2599/);assert.equal(d.getElementById('regen').hidden,true);assert.equal(hint.hidden,true);
}));

test('explicit regeneration clears manual markup even when the text is unchanged',()=>withPage(({W,d,note,click})=>{
  const text=note.textContent,markup=note.innerHTML,first=note.firstChild;
  const range=d.createRange(),selection=W.getSelection();
  range.setStart(first,0);range.setEnd(first,1);selection.removeAllRanges();selection.addRange(range);
  note.dispatchEvent(new W.InputEvent('beforeinput',{
    inputType:'insertText',data:first.textContent.slice(0,1),bubbles:true,cancelable:true
  }));
  assert.equal(note.textContent,text);
  assert.equal(note.querySelectorAll('.edited').length,1,'A same-character replacement still counts as a manual edit');
  assert.equal(d.getElementById('regen').hidden,false);
  click('#regen');
  assert.equal(note.textContent,text);assert.equal(note.innerHTML,markup);
  assert.equal(note.querySelectorAll('.edited').length,0);
  assert.equal(d.getElementById('regen').hidden,true);
}));

test('manual edits discard transient highlight classes without replacing nodes or replaying them from cache',()=>withPage(page=>{
  const {W,d,note,click,input}=page;seed(page);input('bw','2488');
  const marker=note.querySelector('.note-change'),markedText=marker?.firstChild;
  assert.ok(marker,'The preceding automatic update should be highlighted');
  const addendum=d.createTextNode(' Synthetic manual addendum.');note.appendChild(addendum);
  const range=d.createRange(),selection=W.getSelection();
  range.setStart(addendum,addendum.length);range.collapse(true);selection.removeAllRanges();selection.addRange(range);
  note.dispatchEvent(new W.Event('input',{bubbles:true}));
  const text=note.textContent;
  assert.equal(note.querySelectorAll('.note-change').length,0);
  assert.equal(marker.isConnected,true);assert.equal(marker.firstChild,markedText);
  assert.equal(selection.anchorNode,addendum);assert.equal(selection.anchorOffset,addendum.length);
  click('[data-tab="plan"]');click('[data-tab="adm"]');
  assert.equal(note.textContent,text);assert.equal(note.querySelectorAll('.note-change').length,0);
  assert.equal(d.getElementById('regen').hidden,false);
}));

test('escaped free text remains literal across display modes and later updates',()=>withPage(page=>{
  const {d,note,click,input}=page;seed(page);
  const literal='<b>Synthetic observation</b> & follow-up';
  click('[data-tog="pwStandby"] button');input('obCourse',literal);
  assert.ok(note.textContent.includes(literal));assert.equal(note.querySelector('b'),null);
  const text=note.textContent;
  click('#previewReading');input('previewFont','large');
  assert.equal(note.textContent,text);assert.equal(note.querySelector('b'),null);
  input('bw','2488');
  assert.ok(note.textContent.includes(literal));assert.equal(note.querySelector('b'),null);
  assert.equal(d.getElementById('regen').hidden,true);
}));

test('text-mode procedure updates preserve literal operator input',()=>withPage(page=>{
  const {note,click,input}=page;seed(page);
  click('[data-tab="proc"]');click('[data-proctog] [data-v="intub"]');
  input('procOperator','<b>Synthetic Operator A</b>');
  assert.ok(note.textContent.includes('<b>Synthetic Operator A</b>'));
  input('procOperator','<b>Synthetic Operator B</b>');
  assert.ok(note.textContent.includes('<b>Synthetic Operator B</b>'));
  assert.equal(note.querySelector('b'),null);
  assert.ok(note.querySelectorAll('.note-change').length>0);
  const text=note.textContent;click('#previewReading');input('previewFont','small');
  assert.equal(note.textContent,text);
}));

test('copy uses the same note text in reading and review modes without toolbar labels',()=>withPage(async page=>{
  const {W,note,click,input}=page;seed(page);
  const copies=[];
  // jsdom has no layout-derived innerText; model its plain-text result for the clipboard contract.
  Object.defineProperty(note,'innerText',{get(){return this.textContent;},configurable:true});
  Object.defineProperty(W.navigator,'clipboard',{value:{async writeText(value){copies.push(value);}},configurable:true});
  const text=note.textContent;
  click('#copy');await Promise.resolve();
  click('#previewReading');input('previewFont','large');
  click('#copy');await Promise.resolve();
  assert.deepEqual(copies,[text,text]);
  assert.doesNotMatch(copies[0],/閱讀模式|校閱模式|字級/);
}));

(async()=>{
  let failed=0;
  for(const [name,check] of tests){
    try{await check();console.log(`PASS ${name}`);}
    catch(error){failed++;console.error(`FAIL ${name}\n${error.stack||error}`);}
  }
  console.log(`Preview UI: ${tests.length-failed}/${tests.length} passed`);
  if(failed)process.exitCode=1;
})();
