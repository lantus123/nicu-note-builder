// 新測試共用的 jsdom 頁面（B1–B4 驗收用）。selector 寫錯會靜默 no-op 變假陰性，所以找不到控制項一律 throw。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');

function withPage(check){
  const errors=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(W){
    const RealDate=W.Date,fixed=new RealDate(2026,7,30,12).getTime();
    W.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[fixed]));}static now(){return fixed;}};
    W.scrollTo=()=>{};W.HTMLElement.prototype.scrollIntoView=()=>{};
    W.addEventListener('error',e=>errors.push(String(e.error?.message||e.message)));}});
  const W=dom.window,d=W.document;
  const get=sel=>{const el=d.querySelector(sel);assert.ok(el,'Missing control: '+sel);return el;};
  const click=sel=>get(sel).click();
  const input=(id,v)=>{const el=get('#'+id);assert.ok(!el.readOnly&&!el.disabled,'Uneditable '+id);
    if(el.tagName==='SELECT')assert.ok([...el.options].some(o=>o.value===v),'Missing option '+v+' in '+id);
    el.value=v;el.dispatchEvent(new W.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
  const choose=sel=>{const el=get(sel);if(el.getAttribute('aria-pressed')!=='true')el.click();};
  const seg=(k,v)=>choose(`[data-seg="${k}"] [data-v="${v}"]`);
  const msel=(k,v)=>choose(`[data-msel="${k}"] [data-v="${v}"]`);
  const tog=k=>click(`[data-tog="${k}"] button`);
  const screening=(k,v)=>get(`.scr-row[data-scr="${k}"] input[type="radio"][value="${v}"]`).click();
  const story=k=>click(`[data-story="${k}"]`);
  const note=mode=>{const t=get(`[data-tab="${mode}"]`);if(t.getAttribute('aria-selected')!=='true')t.click();return get('#note').textContent.trim();};
  const section=(text,name)=>{const s=text.indexOf(`【${name}】`);assert.ok(s>=0,'Missing section '+name);const e=text.indexOf('【',s+1);return text.slice(s,e<0?undefined:e);};
  try{
    const r=check({W,d,get,click,input,choose,seg,msel,tog,screening,story,note,section});
    assert.deepEqual(errors,[],'No runtime errors');return r;
  }finally{W.close();}
}
function makeTest(label){
  let passed=0,failed=0;
  return {
    test(name,fn){try{withPage(fn);passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}},
    done(){console.log(`${passed} ${label} checks passed; ${failed} failures`);if(failed||!passed)process.exitCode=1;}
  };
}
module.exports={withPage,makeTest};
