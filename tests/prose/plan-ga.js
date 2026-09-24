// NI plan 依出生週數細分的驗收（Ryan 2026-09-24 拍板）。
// 驗的是「門檻表 PLAN_GA 有沒有真的分流」與「日期算得對不對」，不是臨床治療建議本身。
// 全部假資料：不得出現任何真實病人資訊。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');

function withPage(check){
  const errors=[];
  const dom=new JSDOM(html,{
    runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-plan-ga.test/',
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
  const planOn=key=>click(`[data-planon] [data-v="${key}"]`);
  // checkbox 的正規事件是 change，不是 input
  const check2=id=>{const el=get(`#${id}`);el.checked=true;el.dispatchEvent(new W.Event('change',{bubbles:true}));};
  const tab=name=>click(`[data-tab="${name}"]`);
  const note=()=>get('#note').textContent.trim();
  // 分頁切回去時預覽才會重繪成那一份 note
  const onTab=name=>{tab(name);return note();};
  const planWarn=()=>{const el=get('#planWarn');return el.hidden?'':el.textContent;};
  const api={W,d,get,click,input,seg,planOn,check:check2,tab,note,onTab,planWarn};
  try{
    // 共同底稿：男嬰、NSD、去處 NICU、DOL 0；週數／體重／生日由各情境自己填
    seg('gender','male');seg('delivery','nsd');seg('dest','NICU');seg('dol','0');
    input('ap1','8');input('ap5','9');input('gravida','1');input('para','1');input('matAge','30');
    check(api);
    assert.deepEqual(errors,[],'Plan interactions must not raise page errors');
  }finally{W.close();}
}

const tests=[];
const test=(name,check)=>tests.push([name,()=>withPage(check)]);

// 29+0／1100 g／生日 2026-08-01：四條規則全中，日期全部算得出來
test('a. 29+0 1100 g：ROP／腦超／echo／caffeine／PN 全列，日期依生後天數與 PMA 換算',page=>{
  const {input,onTab}=page;
  input('gaW','29');input('gaD','0');input('bw','1100');input('birthDate','2026-08-01');
  const plan=onTab('plan');
  // ROP 首檢＝生後 28 天（8/29）vs PMA 31 週（8/15）取較晚者 → 8/29
  assert.match(plan,/Arrange the first ROP screening examination on August 29, 2026 \(at 4 weeks of age or a PMA of 31 weeks, whichever is later\)/);
  // 腦超：第 7–10 天＝8/8–8/11；PMA 36 週＝生後第 49 天＝9/19
  assert.match(plan,/Obtain cranial ultrasonography at 7–10 days of age \(August 8, 2026–August 11, 2026\) and again at a PMA of 36 weeks \(September 19, 2026\)/);
  assert.match(plan,/Obtain echocardiography to assess for hsPDA if clinically indicated/);
  // caffeine：PMA 34 週＝生後第 35 天＝9/5
  assert.match(plan,/Start caffeine citrate for apnea of prematurity \(loading dose 20 mg\/kg, then 5–10 mg\/kg\/day\); continue until at least a PMA of 34 weeks \(September 5, 2026\) and 5–7 days without apnea/);
  assert.match(plan,/Advance nutritional support with parenteral nutrition \(PN\)/);
  assert.match(plan,/Monitor for complications of prematurity: RDS, CLD, ROP/);
  assert.doesNotMatch(plan,/moderate prematurity|late prematurity/);
  // caffeine 排在呼吸模式之後、surfactant 之前 → 至少要在 PN 之前
  assert.ok(plan.indexOf('caffeine citrate')<plan.indexOf('parenteral nutrition'),'caffeine 應排在 PN 之前');
});

test('b. 35+0 2300 g room air：ROP／腦超／echo／caffeine／PN 全不列，預後寫 late prematurity',page=>{
  const {input,onTab}=page;
  input('gaW','35');input('gaD','0');input('bw','2300');input('birthDate','2026-08-01');
  const plan=onTab('plan');
  assert.doesNotMatch(plan,/ROP screening/);
  assert.doesNotMatch(plan,/cranial ultrasonography/);
  assert.doesNotMatch(plan,/hsPDA/);
  assert.doesNotMatch(plan,/caffeine citrate/);
  assert.doesNotMatch(plan,/parenteral nutrition/);
  assert.match(plan,/Monitor for complications of late prematurity: hypothermia, hypoglycemia, feeding difficulty, and hyperbilirubinemia/);
});

test('c. 33+0 1900 g：moderate prematurity，caffeine 與 PN 有、腦超與 ROP 無',page=>{
  const {input,onTab}=page;
  input('gaW','33');input('gaD','0');input('bw','1900');input('birthDate','2026-08-01');
  const plan=onTab('plan');
  assert.match(plan,/Monitor for complications of moderate prematurity: RDS, apnea of prematurity, feeding intolerance, hypoglycemia, and hyperbilirubinemia/);
  assert.match(plan,/caffeine citrate/);
  assert.match(plan,/parenteral nutrition/);   // GA <34
  assert.doesNotMatch(plan,/cranial ultrasonography/);
  assert.doesNotMatch(plan,/ROP screening/);
  assert.doesNotMatch(plan,/hsPDA/);
});

test('d. 36+0 1400 g：ROP／腦超／PN 由體重觸發，caffeine 不列，預後寫 late prematurity',page=>{
  const {input,onTab}=page;
  input('gaW','36');input('gaD','0');input('bw','1400');input('birthDate','2026-08-01');
  const plan=onTab('plan');
  assert.match(plan,/ROP screening examination on August 29, 2026/);   // PMA 31 週早已過 → 取生後 28 天
  assert.match(plan,/cranial ultrasonography at 7–10 days of age \(August 8, 2026–August 11, 2026\)/);
  assert.match(plan,/parenteral nutrition/);
  assert.doesNotMatch(plan,/caffeine citrate/);
  assert.match(plan,/Monitor for complications of late prematurity/);
});

test('e. 生日空白：條件同 a，但所有括號日期都不出現，相對說法仍在',page=>{
  const {input,onTab}=page;
  input('gaW','29');input('gaD','0');input('bw','1100');
  const plan=onTab('plan');
  assert.match(plan,/Arrange the first ROP screening examination \(at 4 weeks of age or a PMA of 31 weeks, whichever is later\)/);
  assert.match(plan,/Obtain cranial ultrasonography at 7–10 days of age and again at a PMA of 36 weeks$/m);
  assert.match(plan,/continue until at least a PMA of 34 weeks and 5–7 days without apnea/);
  assert.match(plan,/hsPDA/);
  assert.doesNotMatch(plan,/2026/,'生日沒填就不該冒出任何年份');
});

test('f. 開關：關掉 ROP 該行消失，按「全部回自動」回來',page=>{
  const {input,planOn,click,onTab,get}=page;
  input('gaW','29');input('gaD','0');input('bw','1100');input('birthDate','2026-08-01');
  assert.match(onTab('plan'),/ROP screening/);
  planOn('rop');
  assert.doesNotMatch(onTab('plan'),/ROP screening/);
  assert.equal(get('[data-planon] [data-v="rop"]').getAttribute('aria-pressed'),'false');
  assert.equal(get('#planOnReset').hidden,false,'有手動覆寫時「全部回自動」要出現');
  click('#planOnReset');
  assert.match(onTab('plan'),/ROP screening/);
  assert.equal(get('[data-planon] [data-v="rop"]').getAttribute('aria-pressed'),'true');
});

test('g. 勾民國紀年：plan 的日期跟著改成民國格式',page=>{
  const {input,check,onTab}=page;
  input('gaW','29');input('gaD','0');input('bw','1100');input('birthDate','2026-08-01');
  check('rocYear');
  const plan=onTab('plan');
  assert.match(plan,/ROP screening examination on 115\/8\/29 /);
  assert.match(plan,/at 7–10 days of age \(115\/8\/8–115\/8\/11\) and again at a PMA of 36 weeks \(115\/9\/19\)/);
  assert.match(plan,/a PMA of 34 weeks \(115\/9\/5\)/);
  assert.doesNotMatch(plan,/2026/,'民國模式不該殘留西元年');
});

test('h. GA 空白：四條 GA 規則都不出現，既有 planWarn 提醒不變',page=>{
  const {input,onTab,planWarn}=page;
  input('bw','3100');input('birthDate','2026-08-01');
  const plan=onTab('plan');
  assert.match(plan,/Therapeutic plans:/,'plan 本體要有內容，否則下面的 doesNotMatch 是假通過');
  assert.doesNotMatch(plan,/ROP screening/);
  assert.doesNotMatch(plan,/cranial ultrasonography/);
  assert.doesNotMatch(plan,/hsPDA/);
  assert.doesNotMatch(plan,/caffeine citrate/);
  assert.doesNotMatch(plan,/prematurity/);
  assert.match(planWarn(),/GA 未填 → 以下以足月組稿，請回 Admission 填 GA/);
});

let failures=0;
for(const [name,check] of tests){
  try{check();console.log(`PASS ${name}`);}
  catch(error){failures++;console.error(`FAIL ${name}\n${error.stack}`);}
}
console.log(`${tests.length-failures}/${tests.length} plan GA checks passed`);
if(failures)process.exitCode=1;
