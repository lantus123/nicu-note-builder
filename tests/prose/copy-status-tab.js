// A5：複製狀態列切分頁即隱藏且計時器清掉（不再在 Procedure 顯示 Acceptance 的「已複製 ✓ · 尚有 N 空格」）；
// Procedure 底部文案不再說「預覽直接改」。虛構資料。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const errors=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-copy.test/',beforeParse(W){
    W.scrollTo=()=>{};W.HTMLElement.prototype.scrollIntoView=()=>{};
    // jsdom 沒有 innerText 與剪貼簿：以 textContent 代替、剪貼簿直接成功
    Object.defineProperty(W.HTMLElement.prototype,'innerText',{configurable:true,get(){return this.textContent;}});
    Object.defineProperty(W.navigator,'clipboard',{configurable:true,value:{async writeText(){}}});
    W.addEventListener('error',e=>errors.push(String(e.error?.stack||e.message)));}});
  const W=dom.window,d=W.document,q=s=>d.querySelector(s);
  try{
    q('#loadExample').click();q('[data-tab="acc"]').click();
    q('#copy').click();await wait(50);
    const status=q('#copyStatus');
    assert.equal(status.hidden,false,'前提：複製後狀態列出現');assert.match(status.textContent,/已複製/);
    q('[data-tab="proc"]').click();
    assert.equal(status.hidden,true,'切分頁立即隱藏');
    // 計時器已清：再複製一次，舊計時器不會提早把新狀態收掉
    q('#copy').click();await wait(50);assert.equal(status.hidden,false);
    assert.doesNotMatch(d.getElementById('procForm').textContent,/預覽直接改/);
    assert.match(d.getElementById('procForm').textContent,/其餘 slash 選項與空格請複製到 HIS 後再修改/);
    assert.deepEqual(errors,[]);
    console.log('✓ copy-status-tab 全過');
  }catch(e){console.log('✗',e.message);process.exitCode=1;}
  finally{W.close();}
})();
