// 組合驅動器：headless 渲染 nicu-note-builder，輸出各情境的實際 note 文字
// 教訓（2026-08）：選擇器寫錯=靜默 no-op，情境看似通過其實沒測到——
// 故 misses 一律回傳，check.js 視任何缺失為紅燈。
const {JSDOM}=require('jsdom');
const fs=require('fs');

function render(scenario){
  const html=fs.readFileSync(__dirname+'/../../index.html','utf8');
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true});
  const d=dom.window.document, W=dom.window;
  const misses=[], errors=[];
  W.addEventListener('error',e=>errors.push(String(e.error&&e.error.message||e.message)));
  const set=(id,v)=>{const el=d.getElementById(id); if(!el)return misses.push('欄位 '+id);
    el.value=v; el.dispatchEvent(new W.Event('input',{bubbles:true}));};
  const click=sel=>{const el=d.querySelector(sel); if(!el)return misses.push('按鈕 '+sel);
    el.dispatchEvent(new W.MouseEvent('click',{bubbles:true}));};
  const tab=t=>click(`[data-tab="${t}"]`);
  for(const step of scenario.steps){
    if(step.set) set(step.set[0], step.set[1]);
    else if(step.click) click(step.click);
    else if(step.cycle){const [sel,want]=step.cycle; const el=d.querySelector(sel);
      if(!el){misses.push('循環鈕 '+sel);}
      else{let guard=0; while(el.dataset.state!==want&&guard++<8) el.dispatchEvent(new W.MouseEvent('click',{bubbles:true}));
        if(el.dataset.state!==want)misses.push('循環鈕未達目標 '+sel+'→'+want);}}
    else if(step.tab) tab(step.tab);
  }
  const grab=()=>{const n=d.getElementById('note'); return (n.textContent||'').trim();};
  const out={};
  tab('adm'); out.admission=grab();
  tab('plan'); out.plan=grab();
  tab('acc'); out.acceptance=grab();
  return {out, misses, errors};
}
module.exports={render};
