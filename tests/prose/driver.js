// 組合驅動器：headless 渲染 nicu-note-builder，輸出各情境的實際 note 文字
// 教訓（2026-08）：選擇器寫錯=靜默 no-op，情境看似通過其實沒測到——
// 故 misses 一律回傳，check.js 視任何缺失為紅燈。
const {JSDOM}=require('jsdom');
const fs=require('fs');

function render(scenario){
  const html=fs.readFileSync(__dirname+'/../../index.html','utf8');
  const misses=[], errors=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,
    beforeParse(W){
      // 固定本機日曆日期，避免起始日期讓 golden tests 每天失敗。
      const RealDate=W.Date, fixed=new RealDate(2026,7,30,12).getTime();
      W.Date=class extends RealDate{
        constructor(...args){super(...(args.length?args:[fixed]));}
        static now(){return fixed;}
      };
      W.scrollTo=()=>{};
      W.addEventListener('error',e=>errors.push(String(e.error&&e.error.message||e.message)));
    }});
  const d=dom.window.document, W=dom.window;
  const set=(id,v)=>{const el=d.getElementById(id); if(!el)return misses.push('欄位 '+id);
    if(el.readOnly||el.disabled)return misses.push('不可編輯欄位 '+id);
    el.value=v;
    el.dispatchEvent(new W.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
  const click=sel=>{const el=d.querySelector(sel); if(!el)return misses.push('按鈕 '+sel);
    el.dispatchEvent(new W.MouseEvent('click',{bubbles:true}));};
  const tab=t=>click(`[data-tab="${t}"]`);
  for(const step of scenario.steps){
    if(step.set) set(step.set[0], step.set[1]);
    else if(step.click) click(step.click);
    // 舊語料的 cycle 是「選定篩檢結果」；新 UI 直接選取 radio，不保留隱藏循環鈕。
    else if(step.cycle){const [sel,want]=step.cycle, row=d.querySelector(sel.replace(/\s+\.scr-btn$/,''));
      if(!row||!row.matches('.scr-row'))misses.push('篩檢列 '+sel);
      else{const input=[...row.querySelectorAll('input[type="radio"]')].find(el=>el.value===want);
        if(!input)misses.push('篩檢選項不存在 '+sel+'→'+want);
        else{input.click();
          if(row.dataset.state!==want||!input.checked||row.querySelector('.scr-select')?.value!==want)
            misses.push('篩檢未達目標 '+sel+'→'+want);}}}
    else if(step.tab) tab(step.tab);
  }
  const grab=()=>{const n=d.getElementById('note'); return (n.textContent||'').trim();};
  const out={};
  tab('adm'); out.admission=grab();
  tab('plan'); out.plan=grab();
  tab('acc'); out.acceptance=grab();
  if(scenario.procedure){tab('proc'); out.procedure=grab();}
  dom.window.close();
  return {out, misses, errors};
}
module.exports={render};
