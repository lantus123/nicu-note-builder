// 家庭樹（Pedigree）：HIS 是純文字等寬環境，對齊靠空格，所以這裡驗的是「欄位」不是「像不像」。
// 例 A／例 B 用精確字串；同胎、近親婚、符號樣式用欄位座標驗；樣式偏好走 localStorage。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');

// 顯示寬度：符號樣式的 □○◇ 與 ─│┬ 以及 CJK 在等寬中文字型下佔 2 欄，其餘 ASCII 佔 1 欄。
const WIDE=/[←-↓■-◿─-╿　-〿぀-ヿ一-鿿＀-｠￠-￦]/;
const dw=s=>[...String(s)].reduce((n,ch)=>n+(WIDE.test(ch)?2:1),0);
// 某字元在該行的「起始欄」＝它左邊所有字元的顯示寬度總和
const colOf=(line,ch)=>{const i=[...line].findIndex(c=>c===ch); return i<0?-1:dw([...line].slice(0,i).join(''));};
const colsOf=(line,set)=>{const out=[]; let col=0;
  for(const c of line){ if(set.includes(c))out.push(col); col+=dw(c); }
  return out;};

function withPage(check,seed){
  const errors=[];
  const dom=new JSDOM(html,{
    runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-pedigree.test/',
    beforeParse(W){
      const RealDate=W.Date,fixed=new RealDate(2026,7,30,12).getTime();
      W.Date=class extends RealDate{
        constructor(...args){super(...(args.length?args:[fixed]));}
        static now(){return fixed;}
      };
      W.scrollTo=()=>{};
      W.HTMLElement.prototype.scrollIntoView=()=>{};
      // 讀回測試：頁面腳本跑之前先種下偏好（jsdom 的 localStorage 需要 https:// 的 url）
      if(seed)for(const [k,v] of Object.entries(seed))W.localStorage.setItem(k,v);
      W.addEventListener('error',e=>errors.push(String(e.error?.message||e.message)));
    }
  });
  const W=dom.window,d=W.document;
  function get(selector){
    const el=d.querySelector(selector);assert.ok(el,`Missing control: ${selector}`);return el;
  }
  const click=selector=>get(selector).click();
  function input(id,value){
    const el=get(`#${id}`);
    assert.ok(!el.readOnly&&!el.disabled,`Control must be editable: ${id}`);
    el.value=value;el.dispatchEvent(new W.Event('input',{bubbles:true}));
  }
  const seg=(key,value)=>click(`[data-seg="${key}"] [data-v="${value}"]`);
  const toggle=key=>click(`[data-tog="${key}"] button`);
  const sibCards=()=>[...d.querySelectorAll('#sibList [data-sib-id]')];
  // 新增一位手足並回傳操作它的小工具；欄位 id 是 sib-{id}-age／sib-{id}-note
  function addSib(){
    const before=sibCards().map(el=>el.dataset.sibId);
    click('#addSib');
    const added=sibCards().filter(el=>!before.includes(el.dataset.sibId));
    assert.equal(added.length,1,'＋手足 必須只新增一列');
    const id=added[0].dataset.sibId;
    // 每次都重新查：新增／刪除會整段重畫 #sibList，抓著舊節點點下去不會冒泡到 document
    const card=()=>{const el=d.querySelector(`#sibList [data-sib-id="${id}"]`);assert.ok(el,`手足 ${id} 已不在清單上`);return el;};
    const hit=selector=>{const el=card().querySelector(selector);assert.ok(el,`Missing sib control: ${selector}`);el.click();};
    return{id,card,
      sex:v=>hit(`[data-sibseg="sex"] [data-v="${v}"]`),
      affected:()=>hit('[data-sibtog="affected"] button'),
      twin:()=>hit('[data-sibtog="twin"] button'),
      age:v=>input(`sib-${id}-age`,v),
      note:v=>input(`sib-${id}-note`,v),
      remove:()=>hit('[data-sib-action="remove"]')};
  }
  // note 只有一棵樹，取 "Pedigree:" 之後到結尾
  function tree(){
    const text=get('#note').textContent;
    const at=text.indexOf('Pedigree:\n');
    assert.ok(at>=0,`Admission note 必須以 Pedigree: 之後接家庭樹\n${text}`);
    return text.slice(at+'Pedigree:\n'.length);
  }
  const api={W,d,get,click,input,seg,toggle,addSib,sibCards,tree};
  try{
    check(api);
    assert.deepEqual(errors,[],'家庭樹操作不得觸發頁面錯誤');
  }finally{W.close();}
}

const tests=[];
const test=(name,check,seed)=>tests.push([name,()=>withPage(check,seed)]);

// ── 例 A：本人男、母 30y G1P1、無父親年齡、無手足 ─────────────────────────────
// 子代只有本人 → 單元中心 10、m=10，橫桿與子代主幹兩列省略。
test('例 A：最小樹（父母＋本人）逐字相符',({seg,input,tree})=>{
  seg('gender','male');input('matAge','30');input('gravida','1');input('para','1');
  assert.equal(tree(),[
    ' [ ]------+------( )',
    ' Father          Mother 30y G1P1',
    '          |',
    '       ->[ ]',
    '         NB'].join('\n'));
});

// ── 例 B：父 35、母 32 G3P2A1、手足兩位、本人女 ───────────────────────────────
// 座標：子代中心 10／18／26，m=18，父親符號 9–11，母親 25–27。
test('例 B：兩位手足＋帶病＋備註逐字相符',({seg,input,click,addSib,tree})=>{
  seg('gender','female');input('matAge','32');input('gravida','3');input('para','2');
  click('#addAbortion');input('abortion','1');input('fatherAge','35');
  const a=addSib();a.sex('male');a.age('5y');
  const b=addSib();b.sex('female');b.age('3y');b.note('G6PD deficiency');b.affected();
  assert.equal(tree(),[
    '         [ ]------+------( )',
    '         Father 35y      Mother 32y G3P2A1',
    '                  |',
    '          +-------+-------+',
    '          |       |       |',
    '         [ ]     (#)   ->( )',
    '         5y      3y      NB',
    '                 G6PD deficiency'].join('\n'));
});

// ── 例 C：同胎（結構驗證）─────────────────────────────────────────────────────
// 單元 1 中心 10；同胎組成員中心 18、24（組中心 21）；橫桿 10→21；分叉列 18→24。
test('例 C：同胎組畫成分叉，成員中心 18／24 對齊',({seg,addSib,tree})=>{
  seg('gender','male');
  const a=addSib();a.sex('female');a.age('5y');
  const b=addSib();b.sex('male');b.twin();
  const lines=tree().split('\n');
  const bar=lines.findIndex(l=>/^\s*\+-+\+/.test(l));
  assert.ok(bar>=0,`必須有橫桿列\n${lines.join('\n')}`);
  assert.deepEqual(colsOf(lines[bar],'+'),[10,16,21],'橫桿：單元中心 10／21，父母主幹接點在中點 16');
  const fork=lines.findIndex((l,i)=>i>bar+1&&/^\s*\|\s+\+-+\+/.test(l));
  assert.ok(fork>=0,`必須有同胎分叉列\n${lines.join('\n')}`);
  assert.deepEqual(colsOf(lines[fork],'+'),[18,21,24],'分叉列：成員中心 18／24，組中心 21');
  assert.deepEqual(colsOf(lines[fork],'|'),[10],'非同胎的單元在分叉列仍畫主幹');
  const syms=lines[lines.length-2];
  assert.deepEqual(colsOf(syms,'[('),[9,17,23],'符號左緣＝中心 −1（單元 1 在 10、同胎成員在 18／24）');
  assert.ok(syms.includes('->[ ]'),`本人在同胎組最後、緊貼箭頭\n${syms}`);
});

// ── 例 D：近親婚 ─────────────────────────────────────────────────────────────
test('例 D：近親婚把父母線換成 =',({seg,toggle,tree})=>{
  seg('gender','male');toggle('consang');
  const first=tree().split('\n')[0];
  assert.equal(first,' [ ]======+======( )');
});

// ── 例 E：符號樣式（□○）欄位對齊 ─────────────────────────────────────────────
// 以顯示寬度量測：符號與接點都佔 2 欄，各列關鍵字元必須落在同一組中心欄。
test('例 E：符號樣式各列落在同一組中心欄',({seg,input,click,addSib,tree})=>{
  seg('gender','female');input('matAge','32');input('gravida','3');input('para','2');
  click('#addAbortion');input('abortion','1');input('fatherAge','35');
  const a=addSib();a.sex('male');a.age('5y');
  const b=addSib();b.sex('female');b.age('3y');b.note('G6PD deficiency');b.affected();
  seg('pedStyle','symbol');
  const lines=tree().split('\n');
  assert.match(lines[0],/^ *□───┬───○$/,`父母列應為 □───┬───○ 形態\n${lines[0]}`);
  assert.equal(colOf(lines[0],'□'),10,'父親符號起始欄');
  assert.equal(colOf(lines[0],'┬'),18,'父母線中點 ┬ 起始欄');
  assert.equal(colOf(lines[0],'○'),26,'母親符號起始欄');
  assert.equal(colOf(lines[2],'│'),18,'主幹 │ 起始欄');
  // 橫桿：兩端 ┌ ┐、單元中心 ┬；m 與子代接點重合時用 ┼（例 B 的 m=18 正好是中間單元）
  assert.deepEqual(colsOf(lines[3],'┌┬┐┴┼'),[10,18,26],'橫桿接點起始欄');
  assert.equal([...lines[3]].filter(c=>c==='┼').length,1,'m 與子代接點重合 → ┼');
  assert.deepEqual(colsOf(lines[4],'│'),[10,18,26],'子代主幹 │ 起始欄');
  assert.deepEqual(colsOf(lines[5],'□●○'),[10,18,26],'子代符號起始欄');
  assert.equal(colOf(lines[5],'→'),24,'本人箭頭緊貼符號左邊（2 欄）');
  assert.deepEqual(lines.slice(6),['          5y      3y      NB','                  G6PD deficiency'],
    '年齡／備註左緣對齊符號左緣（ASCII 1 欄）');
  // 每一列用顯示寬度量測都不超過最寬那列，且沒有行尾空白
  lines.forEach(l=>assert.doesNotMatch(l,/\s$/,`行尾不得留空白：${JSON.stringify(l)}`));
});

// ── 樣式偏好：寫入與讀回 ─────────────────────────────────────────────────────
test('樣式切換寫入 localStorage，且立刻換符號',({W,seg,tree})=>{
  seg('gender','male');
  assert.ok(tree().includes('[ ]'),'預設是 ASCII 樣式');
  seg('pedStyle','symbol');
  assert.equal(W.localStorage.getItem('nicu_ped_style'),'symbol');
  assert.ok(tree().includes('□'),'切換後立刻改畫符號');
  seg('pedStyle','ascii');
  assert.equal(W.localStorage.getItem('nicu_ped_style'),'ascii');
  assert.ok(tree().includes('[ ]'));
});

test('載入時讀回 localStorage 的樣式偏好',({d,seg,tree})=>{
  seg('gender','male');
  assert.ok(tree().includes('□'),'開頁即套用上次選的符號樣式');
  const on=d.querySelector('[data-seg="pedStyle"] [data-v="symbol"]');
  assert.equal(on.getAttribute('aria-pressed'),'true','按鈕狀態要跟著回來');
},{nicu_ped_style:'symbol'});

// ── 手足增刪 ─────────────────────────────────────────────────────────────────
test('刪除手足後重畫，樹回到剩下的人',({seg,addSib,sibCards,tree})=>{
  seg('gender','male');
  const a=addSib();a.sex('female');a.age('5y');
  const b=addSib();b.sex('male');b.age('3y');
  assert.equal(sibCards().length,2);
  assert.ok(tree().includes('5y'));
  assert.ok(tree().includes('3y'));
  b.remove();
  assert.equal(sibCards().length,1,'刪除後清單要重畫');
  const after=tree();
  assert.ok(after.includes('5y'),'留下來的手足還在');
  assert.ok(!after.includes('3y'),`刪掉的手足不得留在樹上\n${after}`);
  assert.deepEqual(colsOf(after.split('\n')[after.split('\n').length-2],'(['),[9,17],
    '剩兩個子代單元：中心 10／18');
  a.remove();
  assert.equal(sibCards().length,0);
  assert.equal(tree().split('\n').length,5,'全刪回到最小樹（父母＋本人五列）');
});

test('手足未選性別畫成 < >（不預選、不當成男或女）',({seg,addSib,tree})=>{
  seg('gender','male');
  const a=addSib();a.age('5y');
  const lines=tree().split('\n');
  assert.ok(lines[lines.length-2].includes('< >'),`未選性別要畫未知符號\n${lines.join('\n')}`);
  a.sex('female');
  assert.ok(!tree().includes('< >'),'選了性別就不再是未知');
  a.sex('female');   // 再點一次＝回到未選
  assert.ok(tree().includes('< >'),'再點一次已選的性別要能回到未選');
});

// ── 本人與父母的資料來源 ─────────────────────────────────────────────────────
test('本人性別沿用第 1 區，父母帶病畫實心並附病名',({seg,click,input,tree})=>{
  seg('gender','female');input('matAge','32');input('fatherAge','40');
  click('[data-par="g6pd"] [data-v="father"]');
  click('[data-par="thyroid"] [data-v="mother"]');
  const lines=tree().split('\n');
  assert.equal(lines[0],' [#]------+------(#)','父母都帶病 → 兩邊都實心');
  assert.ok(lines[1].includes('Father 40y, G6PD deficiency'),lines[1]);
  assert.ok(lines[1].includes('Mother 32y, thyroid disease')||lines[2]?.includes('Mother 32y, thyroid disease'),
    `母親註記要帶病名\n${lines.join('\n')}`);
  assert.ok(lines[lines.length-2].includes('->( )'),'本人性別沿用第 1 區（女）');
});

// ── 規格鐵則 ─────────────────────────────────────────────────────────────────
test('樹裡不得出現 __（複製鈕的「尚有 N 空格」會誤算）',({seg,input,addSib,tree})=>{
  seg('gender','male');input('matAge','30');
  const a=addSib();   // 全空的一列：沒填的資訊一律省略，不補佔位
  const text=tree();
  assert.doesNotMatch(text,/_/,`家庭樹不得出現底線佔位\n${text}`);
  assert.ok(text.includes('< >'),'空手足仍畫出未知符號（結構不是捏造）');
});

test('什麼都沒填也畫最小樹，年齡／GPA 缺就整段省略',({tree})=>{
  assert.equal(tree(),[
    ' [ ]------+------( )',
    ' Father          Mother',
    '          |',
    '       ->< >',
    '         NB'].join('\n'));
});

let failures=0;
for(const [name,check] of tests){
  try{check();console.log(`PASS ${name}`);}
  catch(error){failures++;console.error(`FAIL ${name}\n${error.stack}`);}
}
console.log(`${tests.length-failures}/${tests.length} pedigree checks passed`);
if(failures)process.exitCode=1;
