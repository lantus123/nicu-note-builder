// A1 草稿暫存（sessionStorage）：模擬 reload 後四份 note 逐字相同、時序帶與分頁一致；
// 清空重填／看範例／12 小時外三條邊界。虛構資料。
// reload＝把舊 window 的 sessionStorage 原樣搬進新 JSDOM（真瀏覽器同分頁 reload 的行為）。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(__dirname+'/../../index.html','utf8');
assert.equal(source.split('function render(){').length,2);
const html=source.replace('function render(){','window.draftTest={S,render}; function render(){');
const KEY='nicu_draft_v1';
const wait=ms=>new Promise(r=>setTimeout(r,ms));

function open(initial={},{now}={}){
  const errors=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-draft.test/',beforeParse(W){
    if(now){const RealDate=W.Date;W.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};}
    W.scrollTo=()=>{};W.HTMLElement.prototype.scrollIntoView=()=>{};
    W.resets=[];W.nicuReset=()=>W.resets.push(W.sessionStorage.getItem('nicu_after_reset')||'');
    for(const [k,v] of Object.entries(initial))W.sessionStorage.setItem(k,v);
    W.addEventListener('error',e=>errors.push(String(e.error?.stack||e.message)));
  }});
  const W=dom.window,d=W.document;
  const get=s=>{const e=d.querySelector(s);assert.ok(e,'Missing '+s);return e;};
  const click=s=>get(s).click();
  const input=(id,v)=>{const e=get('#'+id);e.value=v;e.dispatchEvent(new W.Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));};
  const session=()=>Object.fromEntries(Array.from({length:W.sessionStorage.length},(_,i)=>W.sessionStorage.key(i)).map(k=>[k,W.sessionStorage.getItem(k)]));
  return {W,d,S:W.draftTest.S,get,click,input,errors,session,close:()=>W.close()};
}
// 四份 note：切分頁取文字，最後切回原分頁（取樣本身不改變狀態）
function notes(p){
  const back=p.S.mode,out={};
  for(const t of ['adm','plan','acc','proc']){p.click(`[data-tab="${t}"]`);out[t]=p.get('#note').textContent;}
  p.click(`[data-tab="${back}"]`);return out;
}
// 畫面狀態：所有按鈕的 pressed／checked、時序帶目前節點、分頁、各段可見性
function ui(p){
  const {d}=p;
  return {
    tab:d.querySelector('.tabs [aria-selected="true"]')?.dataset.tab,
    band:d.querySelector('#stageBand .band-node[aria-current="step"]')?.dataset.bandNode||'',
    chapter:d.querySelector('#stageBand .band-head[aria-current="step"] .t')?.textContent||'',
    stagesOn:[...d.querySelectorAll('#admSections > .card')].filter(c=>!c.hasAttribute('data-stage-off')).map(c=>c.id),
    pressed:[...d.querySelectorAll('button[aria-pressed],button[aria-checked]')].filter(b=>!b.closest('#draftNotice')).map(b=>`${b.closest('[id]')?.id}|${b.parentElement.getAttributeNames().filter(n=>n.startsWith('data-')).map(n=>n+'='+b.parentElement.getAttribute(n)).join(',')}|${b.dataset.v??b.id}|${b.getAttribute('aria-pressed')??b.getAttribute('aria-checked')}`),
    hidden:[...d.querySelectorAll('.app-layout [id]')].filter(e=>!e.closest('#draftNotice')&&!/^review-\w+-\d+$/.test(e.id)).map(e=>`${e.id}:${e.hidden}`),
  };
}
async function reload(p,opts){await wait(400);const s=p.session();p.close();return open(s,opts);}
// 完整情境：範例（PPV＋NRP 採用＋反應）＋Acceptance ABG 與抗生素＋Procedure UVC，最後停在 Acceptance
function fullCase(p){
  p.click('#loadExample');
  const ppv=p.S.birthEvents.find(e=>e.kind==='ppv');
  assert.ok(ppv&&ppv.nrp===false&&ppv.nrpFields.length===0&&ppv.fiO2==='30'&&ppv.response==='improved','範例要有 PPV＋NRP 採用（nrpFields 清空、值保留）＋反應');
  p.click('[data-tab="acc"]');
  p.input('accABG','pH 7.25\npCO2 58\npO2 55\nHCO3 24\nBE -3');
  p.click('[data-am="abx"] [data-v="ampicillin"]');p.click('[data-am="abx"] [data-v="gentamicin"]');
  p.click('[data-tab="proc"]');p.click('[data-proctog] [data-v="uvc"]');
  p.click('[data-tab="acc"]');
  assert.deepEqual([...p.S.acc.abx],['ampicillin','gentamicin']);assert.equal(p.S.proc.uvc,true);
}
const tests=[];const test=(n,f)=>tests.push([n,f]);

test('reload restores the four notes word for word, the band and the tab',async()=>{
  let p=open();fullCase(p);
  // 先停在第 3 段出生處置，驗時序帶位置也被還原
  p.click('[data-tab="adm"]');
  const ppvId=p.S.birthEvents.find(e=>e.kind==='ppv').id;
  p.get(`#event-${ppvId}-minutes`).dispatchEvent(new p.W.FocusEvent('focusin',{bubbles:true}));
  p.click('[data-tab="acc"]');
  const before=notes(p),uiBefore=ui(p),S0=JSON.stringify(p.S);
  assert.equal(uiBefore.band,`birth:dr:${ppvId}`,'測試前提：時序帶停在 PPV 節點');
  assert.match(before.acc,/7\.25/);assert.match(before.acc,/Ampicillin/);assert.match(before.proc,/UVC|umbilical venous/i);
  assert.match(before.adm,/positive pressure ventilation|PPV/i);
  assert.deepEqual(p.errors,[]);
  p=await reload(p);
  try{
    assert.ok(p.get('#draftNotice')&&!p.get('#draftNotice').hidden,'還原提示要出現');
    assert.match(p.get('#draftNotice').textContent,/已還原本分頁的草稿（\d\d:\d\d 儲存）。若不是同一位病人，請按『清空重填』。/);
    const after=notes(p),uiAfter=ui(p);   // 兩邊都在四個分頁各 render 過之後取畫面狀態
    assert.equal(uiAfter.tab,'acc');
    for(const k of ['tab','band','chapter','stagesOn'])assert.deepEqual(uiAfter[k],uiBefore[k],'畫面狀態 '+k);
    const diff=(a,b)=>a.map((x,i)=>x===b[i]?null:`${b[i]} → ${x}`).filter(Boolean);
    const setDiff=(a,b)=>({missing:b.filter(x=>!a.includes(x)),extra:a.filter(x=>!b.includes(x))});
    assert.deepEqual(setDiff(uiAfter.pressed,uiBefore.pressed),{missing:[],extra:[]},'按鈕 pressed 狀態');
    assert.deepEqual(diff(uiAfter.pressed,uiBefore.pressed),[],'按鈕 pressed 狀態');
    assert.deepEqual(setDiff(uiAfter.hidden,uiBefore.hidden),{missing:[],extra:[]},'元素 hidden 狀態');
    assert.deepEqual(diff(uiAfter.hidden,uiBefore.hidden),[],'元素 hidden 狀態');
    for(const t of ['adm','plan','acc','proc'])assert.equal(after[t],before[t],t+' note 逐字相同');
    assert.equal(JSON.stringify(p.S),S0,'S 完全相同');
    p.click('#draftNoticeClose');assert.equal(p.get('#draftNotice').hidden,true);
    // 第二次 reload 也穩定（還原後再存的草稿仍正確）
    p=await reload(p);
    const again=notes(p);for(const t of ['adm','plan','acc','proc'])assert.equal(again[t],before[t],t+' 二次 reload');
    assert.deepEqual(p.errors,[]);
  }finally{p.close();}
});
// 20 情境語料庫全數走一次 reload：路徑（直入／嬰兒室／外接／返家）、風險、處置組合各自的畫面狀態都要回得來
function replay(p,steps){
  for(const step of steps){
    if(step.set)p.input(step.set[0],step.set[1]);
    else if(step.click)p.click(step.click);
    else if(step.tab)p.click(`[data-tab="${step.tab}"]`);
    else if(step.cycle){const [sel,want]=step.cycle,row=p.get(sel.replace(/\s+\.scr-btn$/,''));
      [...row.querySelectorAll('input[type="radio"]')].find(el=>el.value===want).click();assert.equal(row.dataset.state,want);}
  }
}
function assertSame(before,uiBefore,S0,p,label){
  const after=notes(p),uiAfter=ui(p);
  for(const t of ['adm','plan','acc','proc'])assert.equal(after[t],before[t],`${label} ${t} note`);
  for(const k of ['tab','band','chapter','stagesOn'])assert.deepEqual(uiAfter[k],uiBefore[k],`${label} ${k}`);
  const setDiff=(a,b)=>({missing:b.filter(x=>!a.includes(x)),extra:a.filter(x=>!b.includes(x))});
  assert.deepEqual(setDiff(uiAfter.pressed,uiBefore.pressed),{missing:[],extra:[]},label+' pressed');
  assert.deepEqual(setDiff(uiAfter.hidden,uiBefore.hidden),{missing:[],extra:[]},label+' hidden');
  assert.equal(JSON.stringify(p.S),S0,label+' S');
}
test('every golden corpus scenario survives a reload unchanged',async()=>{
  const {S:corpus}=require('./corpus');
  assert.equal(Object.keys(corpus).length,20);
  for(const [name,steps] of Object.entries(corpus)){
    let p=open();
    try{replay(p,steps);}catch(e){p.close();throw new Error(name+' replay: '+e.message);}
    const before=notes(p),uiBefore=ui(p),S0=JSON.stringify(p.S);
    assert.ok(before.adm.trim(),name+' 有內容');
    p=await reload(p);
    try{assert.ok(p.d.getElementById('draftNotice'),name+' 還原提示');assertSame(before,uiBefore,S0,p,name);assert.deepEqual(p.errors,[],name+' errors');}
    finally{p.close();}
  }
});
test('typing without a render still saves (root input listener); homeHosp stays out of the draft',async()=>{
  let p=open();p.click('#loadExample');
  const el=p.get('#tentDx');el.value='respiratory distress syndrome';el.dispatchEvent(new p.W.Event('input',{bubbles:true}));
  await wait(400);
  const saved=JSON.parse(p.session()[KEY]);
  assert.equal(saved.fields.tentDx,'respiratory distress syndrome');
  assert.equal('homeHosp' in saved.fields,false,'院區不進草稿');
  p=await reload(p);try{assert.equal(p.get('#tentDx').value,'respiratory distress syndrome');}finally{p.close();}
});
test('清空重填 removes the draft before reload and is not blocked by beforeunload',async()=>{
  let p=open();p.click('#loadExample');await wait(400);
  assert.ok(p.session()[KEY],'有草稿');
  const ev=new p.W.Event('beforeunload',{cancelable:true});p.W.dispatchEvent(ev);assert.equal(ev.defaultPrevented,true,'有資料要攔');
  p.click('#resetAll');p.click('#exampleConfirmYes');
  assert.deepEqual(p.W.resets,['']);
  assert.equal(p.session()[KEY],undefined,'reload 前已刪草稿');
  const ev2=new p.W.Event('beforeunload',{cancelable:true});p.W.dispatchEvent(ev2);assert.equal(ev2.defaultPrevented,false,'清空重填自己不被攔');
  p.S.gender='male';p.W.draftTest.render();await wait(400);assert.equal(p.session()[KEY],undefined,'reset 後停存');
  p=await reload(p);
  try{assert.equal(p.d.getElementById('draftNotice'),null);assert.equal(p.S.pathway,'');assert.equal(p.get('#gaW').value,'');}finally{p.close();}
});
test('看範例 from a filled page reloads into the example, and the next reload keeps it',async()=>{
  let p=open();p.click('#entryDirect');p.input('gaW','28');await wait(400);
  assert.ok(p.session()[KEY]);
  p.click('#loadExample');p.click('#exampleConfirmYes');
  assert.deepEqual(p.W.resets,['example']);assert.equal(p.session()[KEY],undefined);
  p=await reload(p);
  let ex;
  try{assert.equal(p.d.getElementById('draftNotice'),null,'看範例的 reload 不顯示還原提示');
    assert.equal(p.get('#gaW').value,'34');ex=notes(p);}catch(e){p.close();throw e;}
  p=await reload(p);
  try{assert.ok(p.get('#draftNotice'));assert.equal(p.get('#gaW').value,'34');
    const n=notes(p);for(const t of ['adm','plan','acc','proc'])assert.equal(n[t],ex[t],t);}finally{p.close();}
});
test('a draft older than 12 hours is not restored and is dropped; an untouched page stores nothing',async()=>{
  const t0=new Date(2026,9,24,8,0).getTime();
  let p=open({},{now:t0});p.click('#loadExample');await wait(400);
  const s=p.session();p.close();
  p=open(s,{now:t0+11*3600*1000});try{assert.equal(p.get('#gaW').value,'34','11 小時內還原');}finally{p.close();}
  p=open(s,{now:t0+12*3600*1000+60000});
  try{assert.equal(p.get('#gaW').value,'');assert.equal(p.d.getElementById('draftNotice'),null);assert.equal(p.session()[KEY],undefined,'過期草稿刪掉');}finally{p.close();}
  p=open();await wait(400);
  try{assert.equal(p.session()[KEY],undefined,'沒填資料不存草稿');
    p.click('[data-tab="plan"]');await wait(400);assert.equal(p.session()[KEY],undefined,'只切分頁不算資料');
    const ev=new p.W.Event('beforeunload',{cancelable:true});p.W.dispatchEvent(ev);assert.equal(ev.defaultPrevented,false,'空白頁不攔');}finally{p.close();}
});
test('sessionStorage unavailable: page still works silently',async()=>{
  const errors=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-draft.test/',beforeParse(W){
    W.scrollTo=()=>{};W.HTMLElement.prototype.scrollIntoView=()=>{};
    Object.defineProperty(W,'sessionStorage',{get(){throw new Error('blocked');}});
    W.addEventListener('error',e=>errors.push(String(e.error?.stack||e.message)));}});
  const W=dom.window;W.document.getElementById('loadExample').click();await wait(400);
  try{assert.match(W.document.getElementById('note').textContent,/34/);assert.deepEqual(errors,[]);}finally{W.close();}
});

(async()=>{let fail=0;
  for(const [n,f] of tests){try{await f();console.log('✓',n);}catch(e){fail++;console.log('✗',n,'\n ',e.message.slice(0,3000));}}
  console.log(fail?`✗ ${fail}/${tests.length} 失敗`:`✓ ${tests.length} 項全過`);process.exit(fail?1:0);})();
