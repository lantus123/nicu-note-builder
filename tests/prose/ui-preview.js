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

test('switching to reading mode and back only changes the labels, not the note',()=>withPage(({d,note})=>{
  const dock=d.querySelector('.dock'),btn=d.getElementById('previewReading'),text=note.textContent;
  btn.click();
  assert.equal(dock.dataset.reading,'true');assert.equal(btn.textContent,'閱讀模式');
  assert.equal(btn.getAttribute('aria-pressed'),'true');
  btn.click();
  assert.equal(dock.dataset.reading,'false');assert.equal(btn.textContent,'校閱模式');
  assert.equal(note.textContent,text);
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

// 2026-09-24 Ryan 拍板：預覽唯讀，要手改就複製到 HIS 再改。舊的「手改鎖定」整套已移除。
test('the preview keeps following the form even after the reader interacts with it',()=>withPage(page=>{
  const {W,d,note,click,input}=page;seed(page);
  // 舊版只要 #note 收到一次 input 就凍結重組；現在互動不得影響任何後續更新。
  note.dispatchEvent(new W.FocusEvent('focusin',{bubbles:true}));
  note.dispatchEvent(new W.Event('input',{bubbles:true}));
  input('bw','2599');
  assert.match(note.textContent,/2599/,'A form change must reach the preview immediately');
  click('#previewReading');
  assert.equal(d.querySelector('.dock').dataset.reading,'true');
  note.dispatchEvent(new W.FocusEvent('focusin',{bubbles:true}));
  assert.equal(d.querySelector('.dock').dataset.reading,'true','Touching the preview no longer forces review mode');
  input('previewFont','large');input('bw','2601');
  assert.match(note.textContent,/2601/,'Display settings must not stop the preview from following the form');
  assert.doesNotMatch(note.textContent,/2599/);
}));

test('no manual-editing affordance remains in the preview',()=>withPage(({d,note})=>{
  assert.equal(note.hasAttribute('contenteditable'),false,'The preview must be read-only');
  assert.equal(d.querySelectorAll('[contenteditable]').length,0);
  for(const id of ['regen','regenInline','editHint'])assert.equal(d.getElementById(id),null,`Removed control still present: ${id}`);
  assert.equal(d.querySelectorAll('.edit-hint').length,0);
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
