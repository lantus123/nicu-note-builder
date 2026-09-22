// admission → NI plan / Acceptance 的下游接線驗收（2026-09-23）。
// 驗的是「admission 填的東西有沒有進到 DX chip、入院結語、plan、acceptance」，不是臨床治療建議。
// 全部假資料：不得出現任何真實病人資訊。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');

function withPage(check){
  const errors=[];
  const dom=new JSDOM(html,{
    runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-downstream.test/',
    beforeParse(W){
      const RealDate=W.Date,fixed=new RealDate(2026,7,30,12).getTime();
      W.Date=class extends RealDate{
        constructor(...args){super(...(args.length?args:[fixed]));}
        static now(){return fixed;}
      };
      W.scrollTo=()=>{};
      W.HTMLElement.prototype.scrollIntoView=()=>{};
      W.addEventListener('error',e=>errors.push(String(e.error?.message||e.message)));
    }
  });
  const W=dom.window,d=W.document;
  function get(selector){
    const el=d.querySelector(selector);assert.ok(el,`Missing control: ${selector}`);return el;
  }
  function change(el,value){
    assert.ok(!el.readOnly&&!el.disabled,`Control must be editable: ${el.id||el.outerHTML}`);
    if(el.tagName==='SELECT')assert.ok([...el.options].some(o=>o.value===value),
      `Missing option ${JSON.stringify(value)} in ${el.id}`);
    el.value=value;
    el.dispatchEvent(new W.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));
  }
  const click=selector=>get(selector).click();
  const input=(id,value)=>change(get(`#${id}`),value);
  const seg=(key,value)=>click(`[data-seg="${key}"] [data-v="${value}"]`);
  const msel=(key,value)=>click(`[data-msel="${key}"] [data-v="${value}"]`);
  const story=key=>click(`#pathwayCard .story[data-story="${key}"]`);
  // flag 型風險（fever）只有是／否；choice 型（prom）要再點一次分類鈕，時數另填。
  const riskYes=key=>click(`[data-ryn="${key}"] [data-v="yes"]`);
  const riskChoice=(key,value)=>click(`[data-rc="${key}"] [data-v="${value}"]`);
  function screening(key,value){
    const radio=get(`.scr-row[data-scr="${key}"] input[type=radio][value="${value}"]`);
    radio.click();
  }
  function addBirth(kind){
    if(get('#birthResusStatus').value!=='performed')input('birthResusStatus','performed');
    click(`[data-add-birth="${kind}"]`);
  }
  const tab=name=>click(`[data-tab="${name}"]`);
  const note=()=>get('#note').textContent.trim();
  const dx=()=>[...d.querySelectorAll('#dx .tag')].map(el=>el.textContent.trim());
  const planWarn=()=>{const el=get('#planWarn');return el.hidden?'':el.textContent;};
  // 分頁切回去時預覽才會重繪成那一份 note
  const onTab=name=>{tab(name);return note();};
  const api={W,d,get,click,input,seg,msel,story,riskYes,riskChoice,screening,addBirth,tab,note,dx,planWarn,onTab};
  try{
    seg('gender','male');input('gaW','39');input('gaD','0');input('bw','3100');
    seg('delivery','nsd');seg('dest','NICU');seg('dol','0');
    input('ap1','8');input('ap5','9');input('gravida','1');input('para','1');input('matAge','30');
    check(api);
    assert.deepEqual(errors,[],'Downstream interactions must not raise page errors');
  }finally{W.close();}
}

const tests=[];
const test=(name,check)=>tests.push([name,()=>withPage(check)]);

test('產房結束時掛著 CPAP 就會進診斷、計畫與 acceptance（沒有急救事件也算）',page=>{
  const {input,story,dx,note,onTab}=page;
  story('A');input('birthResusStatus','none');input('birthFinalSupport','cpap');
  assert.ok(dx().includes('Respiratory distress'),`DX chip 缺 Respiratory distress：${dx().join('|')}`);
  const admission=note();
  assert.match(admission,/with a tentative diagnosis of respiratory distress/);
  const plan=onTab('plan');
  assert.match(plan,/sepsis work-up/);
  assert.match(plan,/OG decompression/);
  const acceptance=onTab('acc');
  assert.match(acceptance,/admitted to our NICU with respiratory distress/);
});

test('嬰兒室驗出的低血糖會變成診斷、Dex 指徵與入院原因（沒勾症狀也算）',page=>{
  const {input,story,msel,dx,note,onTab}=page;
  story('C');input('birthResusStatus','none');
  msel('brWorkup','glucose');msel('brFindings','hypoglycemia');input('brGlu','30');
  assert.ok(dx().includes('Hypoglycemia'),`DX chip 缺 Hypoglycemia：${dx().join('|')}`);
  assert.match(note(),/tentative diagnosis of neonatal hypoglycemia/);
  const plan=onTab('plan');
  assert.match(plan,/Check Dex STAT and Q6H \(indications:[^)]*neonatal hypoglycemia/);
  const acceptance=onTab('acc');
  assert.match(acceptance,/with neonatal hypoglycemia/);
});

test('嬰兒室抽出的 bandemia 會變成疑似敗血症，並讓 plan 只補沒做過的項目',page=>{
  const {input,story,msel,dx,note,onTab}=page;
  story('C');input('birthResusStatus','none');
  msel('brWorkup','cbc');msel('brWorkup','crp');msel('brFindings','bandemia');
  assert.ok(dx().includes('Suspected sepsis'),`DX chip 缺 Suspected sepsis：${dx().join('|')}`);
  assert.match(note(),/tentative diagnosis of suspected neonatal sepsis/);
  const plan=onTab('plan');
  assert.match(plan,/remaining sepsis work-up, including B\/C, CXR, and urine GBS Ag/);
  assert.match(plan,/obtained in the baby room/);
  assert.match(plan,/empirical antibiotics/);
  assert.doesNotMatch(plan,/Obtain a sepsis work-up, including CBC\/DC/);
});

test('入院時呼吸支持在 Admission 與 Acceptance 是同一個值，並同時進三份輸出',page=>{
  const {get,click,input,note,onTab,d}=page;
  const admResp=v=>click(`[data-stop="adm"] [data-seg="resp"] [data-v="${v}"]`);
  const accPressed=v=>d.querySelector(`#accForm [data-seg="resp"] [data-v="${v}"]`).getAttribute('aria-pressed');
  page.story('A');input('birthResusStatus','none');
  admResp('NCPAP');
  assert.equal(accPressed('NCPAP'),'true','Acceptance A 區必須跟著亮起來');
  assert.match(note(),/On admission to our NICU, the infant was receiving respiratory support with NCPAP\./);
  assert.match(onTab('plan'),/Provide respiratory support with NCPAP/);
  assert.match(onTab('acc'),/At acceptance, the infant is receiving respiratory support with NCPAP/);
  // 再點一次＝清空：三處都不得殘留
  onTab('adm');admResp('NCPAP');
  assert.equal(accPressed('NCPAP'),'false','清空後兩組按鈕都要熄掉');
  assert.doesNotMatch(note(),/NCPAP/);
  assert.doesNotMatch(onTab('plan'),/NCPAP/);
  assert.doesNotMatch(onTab('acc'),/NCPAP/);
  // 與入院時狀況併成一句
  onTab('adm');admResp('NCPAP');input('obAdmissionStatus','the infant was pink and active');
  assert.match(note(),/On admission to our NICU, the infant was receiving respiratory support with NCPAP; the infant was pink and active\./);
  assert.equal(get('#planWarn').textContent.includes('BR'),false);
});

test('去處決定 plan：BR 不產生、NBC 用非加護配置、NICU 維持加護配置',page=>{
  const {input,seg,note,onTab,planWarn,get}=page;
  input('gaW','30');input('bw','1300');
  seg('dest','BR');
  assert.equal(onTab('plan'),'','去處 BR 不得產生任何 NI plan 內容');
  assert.match(planWarn(),/BR/);
  assert.equal(get('#planControls').hidden,true,'BR 時 plan 設定控制項必須收起');
  seg('dest','NBC');
  const nbc=note();
  assert.equal(get('#planControls').hidden,false);
  assert.match(nbc,/Provide incubator care/);
  assert.doesNotMatch(nbc,/Giraffe/);
  assert.doesNotMatch(nbc,/Minimize handling/);
  seg('dest','NICU');
  const nicu=note();
  assert.match(nicu,/Provide incubator \(Giraffe\) care/);
  assert.match(nicu,/Minimize handling/);
});

test('兒科去嬰兒室評估的原因句用 Because of + 名詞片語',page=>{
  const {input,story,msel,riskYes,note}=page;
  riskYes('fever');
  story('C');input('birthResusStatus','none');msel('brEval','maternal');
  assert.match(note(),/Because of maternal risk factors/);
  assert.doesNotMatch(note(),/Because maternal risk factors/);
});

test('回歸：產房結束時已回 room air，但做過 PPV 仍算呼吸問題',page=>{
  const {input,story,addBirth,dx}=page;
  story('A');addBirth('ppv');input('birthFinalSupport','room');
  assert.ok(dx().includes('Respiratory distress'),`急救事件規則不得被產房結束支持覆蓋：${dx().join('|')}`);
});

test('回歸：母體 PROM 仍能從風險列填進來並進入感染風險',page=>{
  const {input,story,riskYes,riskChoice,screening,onTab}=page;
  riskYes('prom');riskChoice('prom','prom');input('promH','20');
  screening('gbs','pos');
  story('C');input('birthResusStatus','none');
  assert.match(onTab('plan'),/empirical antibiotics/);
});

let failures=0;
for(const [name,check] of tests){
  try{check();console.log(`PASS ${name}`);}
  catch(error){failures++;console.error(`FAIL ${name}\n${error.stack}`);}
}
console.log(`${tests.length-failures}/${tests.length} admission downstream checks passed`);
if(failures)process.exitCode=1;
