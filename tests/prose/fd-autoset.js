// A4 Fetal distress／MSAF 自動勾選的防誤取消：自動帶入第一次點不取消、再點才取消；
// 來源移除時自動清回；手動點過的不動。虛構資料。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(__dirname+'/../../index.html','utf8');
assert.equal(source.split('function render(){').length,2);
const html=source.replace('function render(){','window.fdTest={S,render}; function render(){');

function page(){
  const errors=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-fd.test/',beforeParse(W){
    W.scrollTo=()=>{};W.HTMLElement.prototype.scrollIntoView=()=>{};
    W.addEventListener('error',e=>errors.push(String(e.error?.stack||e.message)));
  }});
  const W=dom.window,d=W.document,S=W.fdTest.S;
  const get=s=>{const e=d.querySelector(s);assert.ok(e,'Missing '+s);return e;};
  const click=s=>get(s).click();
  const input=(id,v)=>{const e=get('#'+id);e.value=v;e.dispatchEvent(new W.Event('input',{bubbles:true}));};
  const pressed=k=>get(`[data-tog="${k}"] button`).getAttribute('aria-pressed');
  const shown=id=>!get('#'+id).hidden;
  const note=()=>get('#note').textContent;
  // A＝產前 standby，standby 原因 chip 才看得到
  click('#entryDirect');click('[data-story="A"]');click('[data-seg="dest"] [data-v="NICU"]');
  return {W,d,S,get,click,input,pressed,shown,note,errors};
}
const SB='[data-msel="pwSbR"] [data-v="fetal distress"]';
let fail=0;const test=(n,f)=>{try{f();console.log('✓',n);}catch(e){fail++;console.log('✗',n,'\n ',e.message);}};

test('standby 原因 fetal distress：自動勾→第一次點不取消並提示→再點才取消',()=>{
  const p=page();
  assert.equal(p.S.fd,false);p.click(SB);
  assert.equal(p.S.fd,true);assert.equal(p.S.fdAuto,true);assert.equal(p.pressed('fd'),'true');
  assert.ok(p.shown('fdAutoNote'),'按鈕旁顯示自動帶入');assert.match(p.get('#fdAutoNote').textContent,/自動帶入（來自 standby／C\/S／入院原因）/);
  assert.match(p.note(),/fetal distress/i);
  p.click('[data-tog="fd"] button');
  assert.equal(p.S.fd,true,'第一次點不取消');assert.equal(p.S.fdAuto,false);assert.equal(p.pressed('fd'),'true');
  assert.ok(p.shown('autoTogConfirm'));assert.match(p.get('#autoTogConfirm').textContent,/已由原因帶入；再點一次才會取消/);
  assert.equal(p.shown('fdAutoNote'),false);
  p.click('[data-tog="fd"] button');
  assert.equal(p.S.fd,false,'第二次點才取消');assert.equal(p.pressed('fd'),'false');assert.equal(p.shown('autoTogConfirm'),false);
  assert.deepEqual(p.errors,[]);p.W.close();
});
test('移除 standby 原因 → 仍是自動狀態就清回 false',()=>{
  const p=page();p.click(SB);assert.equal(p.S.fd,true);
  p.click(SB);   // 再點 chip＝移除原因
  assert.equal([...p.S.pwSbR].includes('fetal distress'),false,'前提：原因已移除');
  assert.equal(p.S.fd,false);assert.equal(p.S.fdAuto,false);assert.equal(p.pressed('fd'),'false');assert.equal(p.shown('fdAutoNote'),false);
  assert.doesNotMatch(p.note(),/Because of fetal distress/);
  p.W.close();
});
test('手動點過（第一次點擋下後 auto=false）再移除原因 → 不清',()=>{
  const p=page();p.click(SB);p.click('[data-tog="fd"] button');
  assert.equal(p.S.fd,true);assert.equal(p.S.fdAuto,false);
  p.click(SB);assert.equal([...p.S.pwSbR].includes('fetal distress'),false);
  assert.equal(p.S.fd,true,'使用者確認過的不被來源移除清掉');assert.equal(p.pressed('fd'),'true');
  p.W.close();
});
test('先手動勾 fd 再選原因 → 不標成自動，移除原因不清',()=>{
  const p=page();p.click('[data-tog="fd"] button');assert.equal(p.S.fd,true);
  p.click(SB);assert.equal(p.S.fdAuto,false);
  p.click(SB);assert.equal(p.S.fd,true);
  p.click('[data-tog="fd"] button');assert.equal(p.S.fd,false,'手動勾的一次就取消');
  p.W.close();
});
test('C/S 原因 chip 與手改文字：來源文字不再含 fetal distress 就清回',()=>{
  const p=page();p.click('[data-seg="delivery"] [data-v="cs"]');
  p.click('[data-fill="csReason"] [data-v="fetal distress"]');
  assert.match(p.get('#csReason').value,/fetal distress/);assert.equal(p.S.fd,true);assert.equal(p.S.fdAuto,true);
  p.input('csReason','preterm labor');
  assert.equal(p.S.fd,false,'手改文字移除後清回');
  // 媽媽入院原因同理
  p.click('[data-fill="admReason"] [data-v="fetal distress"]');assert.equal(p.S.fd,true);assert.equal(p.S.fdAuto,true);
  p.click('[data-fill="admReason"] [data-v="fetal distress"]');assert.equal(p.S.fd,false,'再點 chip 移除後清回（以前反而會把 fd 設成 true）');
  p.W.close();
});
test('MSAF 同樣：自動勾、第一次點不取消、來源移除清回並收起稠度',()=>{
  const p=page();const MS='[data-msel="pwSbR"] [data-v="meconium-stained amniotic fluid"]';
  p.click(MS);assert.equal(p.S.msaf,true);assert.equal(p.S.msafAuto,true);assert.ok(p.shown('msafAutoNote'));assert.ok(p.shown('msafGradeWrap'));
  p.click('[data-tog="msaf"] button');assert.equal(p.S.msaf,true);assert.match(p.get('#autoTogConfirm').textContent,/MSAF 已由原因帶入/);
  p.click('[data-tog="msaf"] button');assert.equal(p.S.msaf,false);
  p.click(MS);assert.equal(p.S.msaf,false,'移除原因不會把已取消的再打開');
  p.click(MS);assert.equal(p.S.msaf,true,'再選原因→又自動帶入');assert.equal(p.S.msafAuto,true);
  p.click(MS);assert.equal(p.S.msaf,false,'移除→清回');assert.equal(p.shown('msafGradeWrap'),false);
  p.W.close();
});
console.log(fail?`✗ ${fail} 項失敗`:'✓ fd-autoset 全過');process.exit(fail?1:0);
