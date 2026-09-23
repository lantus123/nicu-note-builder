// 家庭樹（Pedigree）：HIS 是純文字等寬環境，對齊靠空格，所以這裡驗的是「欄位」不是「像不像」。
// 只有符號樣式（□○）：例 A／B／F／G／H 用精確字串，同胎與多組半手足另外量顯示欄位座標。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');

// 顯示寬度：□○◇ 與 ─│┬ 以及 CJK 在等寬中文字型下佔 2 欄，年齡／備註的 ASCII 佔 1 欄。
const WIDE=/[←-↓■-◿─-╿　-〿぀-ヿ一-鿿＀-｠￠-￦]/;
const dw=s=>[...String(s)].reduce((n,ch)=>n+(WIDE.test(ch)?2:1),0);
// 某字元在該行的「起始欄」＝它左邊所有字元的顯示寬度總和
const colOf=(line,ch)=>{const i=[...line].findIndex(c=>c===ch); return i<0?-1:dw([...line].slice(0,i).join(''));};
const colsOf=(line,set)=>{const out=[]; let col=0;
  for(const c of line){ if(set.includes(c))out.push(col); col+=dw(c); }
  return out;};

function withPage(check){
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
  // 三個子代清單：手足、父親與其他伴侶的小孩、母親與其他伴侶的小孩（列 UI 相同，靠 data-sib-list 分辨）
  const PED_HOST={sibs:'#sibList',fatherOther:'#fatherOtherKids',motherOther:'#motherOtherKids'};
  const PED_ADD={sibs:'#addSib',fatherOther:'#addFatherOtherKid',motherOther:'#addMotherOtherKid'};
  const sibCards=(list='sibs')=>[...d.querySelectorAll(`${PED_HOST[list]} [data-sib-id]`)];
  // 新增一位子代並回傳操作它的小工具；欄位 id 是 sib-{id}-age／sib-{id}-note（三個清單共用 id 池）
  function addSib(list='sibs'){
    const before=sibCards(list).map(el=>el.dataset.sibId);
    click(PED_ADD[list]);
    const added=sibCards(list).filter(el=>!before.includes(el.dataset.sibId));
    assert.equal(added.length,1,`＋ 按鈕必須只在 ${list} 新增一列`);
    const id=added[0].dataset.sibId;
    // 每次都重新查：新增／刪除會整段重畫清單，抓著舊節點點下去不會冒泡到 document
    const card=()=>{const el=d.querySelector(`${PED_HOST[list]} [data-sib-id="${id}"]`);assert.ok(el,`子代 ${id} 已不在清單上`);return el;};
    const hit=selector=>{const el=card().querySelector(selector);assert.ok(el,`Missing sib control: ${selector}`);el.click();};
    return{id,card,
      sex:v=>hit(`[data-sibseg="sex"] [data-v="${v}"]`),
      affected:()=>hit('[data-sibtog="affected"] button'),
      twin:()=>hit('[data-sibtog="twin"] button'),
      hasTwin:()=>!!card().querySelector('[data-sibtog="twin"]'),
      age:v=>input(`sib-${id}-age`,v),
      note:v=>input(`sib-${id}-note`,v),
      remove:()=>hit('[data-sib-action="remove"]')};
  }
  // 其他伴侶的關係（不預選；再點一次回到未選）
  const otherRel=(which,v)=>click(`[data-pedrel="${which}"] [data-v="${v}"]`);
  // note 只有一棵樹，取 "Pedigree:" 之後到結尾
  function tree(){
    const text=get('#note').textContent;
    const at=text.indexOf('Pedigree:\n');
    assert.ok(at>=0,`Admission note 必須以 Pedigree: 之後接家庭樹\n${text}`);
    return text.slice(at+'Pedigree:\n'.length);
  }
  const api={W,d,get,click,input,seg,toggle,addSib,sibCards,otherRel,tree};
  try{
    check(api);
    assert.deepEqual(errors,[],'家庭樹操作不得觸發頁面錯誤');
  }finally{W.close();}
}

const tests=[];
const test=(name,check)=>tests.push([name,()=>withPage(check)]);
// 每一列用顯示寬度量測都不得留行尾空白（HIS 貼上後會多出看不見的欄）
const noTrailing=lines=>lines.forEach(l=>assert.doesNotMatch(l,/\s$/,`行尾不得留空白：${JSON.stringify(l)}`));

// ── 例 A：本人男、母 30y G1P1、無父親年齡、無手足 ─────────────────────────────
// 子代只有本人 → 單元中心 10；父 2、junction 10、母 18，橫桿與子代主幹兩列省略。
test('例 A：最小樹（父母＋本人）逐字相符',({seg,input,tree})=>{
  seg('gender','male');input('matAge','30');input('gravida','1');input('para','1');
  assert.equal(tree(),[
    '  □───┬───○',
    '  Father          Mother 30y G1P1',
    '          │',
    '        →□',
    '          NB'].join('\n'));
});

// ── 例 B：父 35、母 32 G3P2A1、手足兩位、本人女 ───────────────────────────────
// 座標：子代中心 10／18／26，junction 18，父親符號 10、母親 26（符號佔中心欄與其右一欄）。
test('例 B：兩位手足＋帶病＋備註逐字相符，各列落在同一組中心欄',({seg,input,click,addSib,tree})=>{
  seg('gender','female');input('matAge','32');input('gravida','3');input('para','2');
  click('#addAbortion');input('abortion','1');input('fatherAge','35');
  const a=addSib();a.sex('male');a.age('5y');
  const b=addSib();b.sex('female');b.age('3y');b.note('G6PD deficiency');b.affected();
  assert.equal(tree(),[
    '          □───┬───○',
    '          Father 35y      Mother 32y G3P2A1',
    '                  │',
    '          ┌───┼───┐',
    '          │      │      │',
    '          □      ●    →○',
    '          5y      3y      NB',
    '                  G6PD deficiency'].join('\n'));
  // 同一棵樹再用顯示欄位量一次：精確字串若日後被誤更新，欄位錯位仍會被抓到
  const lines=tree().split('\n');
  assert.deepEqual(colsOf(lines[0],'□○'),[10,26],'父母符號起始欄');
  assert.equal(colOf(lines[0],'┬'),18,'父母線中點 ┬ 起始欄');
  assert.equal(colOf(lines[2],'│'),18,'主幹 │ 起始欄');
  // 橫桿：兩端 ┌ ┐、單元中心 ┬；junction 與子代接點重合時用 ┼（例 B 的 18 正好是中間單元）
  assert.deepEqual(colsOf(lines[3],'┌┬┐┴┼'),[10,18,26],'橫桿接點起始欄');
  assert.equal([...lines[3]].filter(c=>c==='┼').length,1,'junction 與子代接點重合 → ┼');
  assert.deepEqual(colsOf(lines[4],'│'),[10,18,26],'子代主幹 │ 起始欄');
  assert.deepEqual(colsOf(lines[5],'□●○'),[10,18,26],'子代符號起始欄');
  assert.equal(colOf(lines[5],'→'),24,'本人箭頭緊貼符號左邊（2 欄）');
  noTrailing(lines);
});

// ── 例 C：同胎（結構驗證）─────────────────────────────────────────────────────
// 單元 1 中心 10；同胎組成員中心 18、24（算術中心 21 落在奇數欄，接點往左靠成 20）。
test('例 C：同胎組畫成分叉，成員中心 18／24 對齊',({seg,addSib,tree})=>{
  seg('gender','male');
  const a=addSib();a.sex('female');a.age('5y');
  const b=addSib();b.sex('male');b.twin();
  const lines=tree().split('\n');
  const bar=lines.findIndex(l=>/^\s*┌/.test(l));
  assert.ok(bar>=0,`必須有橫桿列\n${lines.join('\n')}`);
  assert.deepEqual(colsOf(lines[bar],'┌┬┐┴┼'),[10,16,20],'橫桿：單元中心 10／同胎組接點 20，父母主幹接點在中點 16');
  const fork=lines.findIndex((l,i)=>i>bar+1&&/^\s*│\s+┌/.test(l));
  assert.ok(fork>=0,`必須有同胎分叉列\n${lines.join('\n')}`);
  assert.deepEqual(colsOf(lines[fork],'┌┬┐┴┼'),[18,20,24],'分叉列：成員中心 18／24，組接點 20');
  assert.deepEqual(colsOf(lines[fork],'│'),[10],'非同胎的單元在分叉列仍畫主幹');
  const syms=lines[lines.length-2];
  assert.deepEqual(colsOf(syms,'□○◇'),[10,18,24],'符號起始欄＝中心（單元 1 在 10、同胎成員在 18／24）');
  assert.ok(syms.includes('→□'),`本人在同胎組最後、緊貼箭頭\n${syms}`);
  noTrailing(lines);
});

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
  assert.deepEqual(colsOf(after.split('\n')[after.split('\n').length-2],'□○◇'),[10,18],
    '剩兩個子代單元：中心 10／18');
  a.remove();
  assert.equal(sibCards().length,0);
  assert.equal(tree().split('\n').length,5,'全刪回到最小樹（父母＋本人五列）');
});

test('手足未選性別畫成 ◇（不預選、不當成男或女）',({seg,addSib,tree})=>{
  seg('gender','male');
  const a=addSib();a.age('5y');
  const lines=tree().split('\n');
  assert.ok(lines[lines.length-2].includes('◇'),`未選性別要畫未知符號\n${lines.join('\n')}`);
  a.sex('female');
  assert.ok(!tree().includes('◇'),'選了性別就不再是未知');
  a.sex('female');   // 再點一次＝回到未選
  assert.ok(tree().includes('◇'),'再點一次已選的性別要能回到未選');
});

// ── 本人與父母的資料來源 ─────────────────────────────────────────────────────
test('本人性別沿用第 1 區，父母帶病畫實心並附病名',({seg,click,input,tree})=>{
  seg('gender','female');input('matAge','32');input('fatherAge','40');
  click('[data-par="g6pd"] [data-v="father"]');
  click('[data-par="thyroid"] [data-v="mother"]');
  const lines=tree().split('\n');
  assert.equal(lines[0],'  ■───┬───●','父母都帶病 → 兩邊都實心');
  assert.ok(lines[1].includes('Father 40y, G6PD deficiency'),lines[1]);
  assert.ok(lines[1].includes('Mother 32y, thyroid disease')||lines[2]?.includes('Mother 32y, thyroid disease'),
    `母親註記要帶病名\n${lines.join('\n')}`);
  assert.ok(lines[lines.length-2].includes('→○'),'本人性別沿用第 1 區（女）');
});

// ── 規格鐵則 ─────────────────────────────────────────────────────────────────
test('樹裡不得出現 __（複製鈕的「尚有 N 空格」會誤算）',({seg,input,addSib,tree})=>{
  seg('gender','male');input('matAge','30');
  const a=addSib();   // 全空的一列：沒填的資訊一律省略，不補佔位
  const text=tree();
  assert.doesNotMatch(text,/_/,`家庭樹不得出現底線佔位\n${text}`);
  assert.ok(text.includes('◇'),'空手足仍畫出未知符號（結構不是捏造）');
});

test('什麼都沒填也畫最小樹，年齡／GPA 缺就整段省略',({tree})=>{
  assert.equal(tree(),[
    '  □───┬───○',
    '  Father          Mother',
    '          │',
    '        →◇',
    '          NB'].join('\n'));
});

// ── 例 F：父親前段離婚（有一女）＋父母未婚 ───────────────────────────────────
// 左組 hw=0、中組 hw=0 → D=16；其他伴侶一啟用，成人列就是四個席位（未啟用的留白），
// 故父親中心 18（其他伴侶 2、母 34），左 junction 10、中 junction 26。
test('例 F：離婚前段＋未婚父母，半手足掛在左邊那段',({seg,input,otherRel,addSib,tree})=>{
  seg('gender','male');input('matAge','30');input('gravida','1');input('para','1');input('fatherAge','36');
  otherRel('fatherOther','divorced');
  const h=addSib('fatherOther');h.sex('female');h.age('8y');
  seg('pedRel','unmarried');
  assert.equal(tree(),[
    '  ○╱╱─┬───□╌╌╌┬╌╌╌○',
    '                  Father 36y      Mother 30y G1P1',
    '          │              │',
    '          ○            →□',
    '          8y              NB'].join('\n'));
  const lines=tree().split('\n');
  assert.deepEqual(colsOf(lines[0],'□○'),[2,18,34],'成人符號起始欄：其他伴侶 2、父 18、母 34');
  assert.deepEqual(colsOf(lines[0],'┬'),[10,26],'兩段 junction 在各自兩人的中點');
  assert.deepEqual(colsOf(lines[2],'│'),[10,26],'兩條主幹各自掛在自己的 junction 底下');
  assert.deepEqual(colsOf(lines[3],'□○'),[10,26],'子代符號起始欄＝各組 junction');
  assert.equal(colOf(lines[3],'→'),24,'本人箭頭緊貼符號左邊（2 欄）');
  noTrailing(lines);
});

// ── 例 G：只有母親有其他伴侶（未婚），兩個小孩 ───────────────────────────────
// 中組 hw=0、右組 hw=4 → D=16；左側沒有伴侶不留席位：父 2、母 18、伴侶 34；中 junction 10、右 junction 26，右組單元中心 22／30。
test('例 G：母親側兩位半手足，橫桿只在右組，中組畫主幹',({seg,input,otherRel,addSib,tree})=>{
  seg('gender','female');input('matAge','35');input('gravida','3');input('para','2');input('fatherAge','40');
  otherRel('motherOther','unmarried');
  const a=addSib('motherOther');a.sex('male');a.age('10y');
  const b=addSib('motherOther');b.sex('female');b.age('7y');
  assert.equal(tree(),[
    '  □───┬───○╌╌╌┬╌╌╌□',
    '  Father 40y      Mother 35y G3P2',
    '          │              │',
    '          │          ┌─┴─┐',
    '          │          │      │',
    '        →○          □      ○',
    '          NB          10y     7y'].join('\n'));
  const lines=tree().split('\n');
  assert.deepEqual(colsOf(lines[3],'┌┬┐┴┼'),[22,26,30],'橫桿列在右組 22→30，junction 26 也是接點（左側沒有伴侶就不留席位）');
  noTrailing(lines);
});

// ── 例 H：父親不詳 ───────────────────────────────────────────────────────────
test('例 H：父親不詳畫 ◇ 並寫 Father unknown（不寫年齡）',({seg,input,toggle,d,tree})=>{
  seg('gender','male');input('matAge','28');input('gravida','1');input('para','1');
  toggle('fatherUnknown');
  assert.equal(d.getElementById('fatherAge').disabled,true,'父親不詳時年齡欄位要停用');
  assert.equal(tree(),[
    '  ◇───┬───○',
    '  Father unknown  Mother 28y G1P1',
    '          │',
    '        →□',
    '          NB'].join('\n'));
});

// ── 父母關係三種線型 ─────────────────────────────────────────────────────────
test('父母關係三種線型',({seg,tree})=>{
  seg('gender','male');
  const first=()=>tree().split('\n')[0];
  assert.equal(first(),'  □───┬───○','一般＝實線');
  seg('pedRel','unmarried');
  assert.equal(first(),'  □╌╌╌┬╌╌╌○','未婚＝虛線字元');
  seg('pedRel','divorced');
  assert.equal(first(),'  □╱╱─┬───○','離婚・分居＝兩個 ╱');
});

// ── 兩邊都有其他伴侶：D 放大、三組不重疊 ─────────────────────────────────────
test('兩邊各 3 個半手足＋中間 2 位手足：D 放大成 24，三組符號不重疊',({seg,otherRel,addSib,tree})=>{
  seg('gender','female');
  ['fatherOther','motherOther'].forEach(which=>{
    otherRel(which,'married');
    ['10y','9y','8y'].forEach((age,i)=>{const k=addSib(which);k.sex(i%2?'female':'male');k.age(age);});
  });
  const s1=addSib();s1.sex('male');s1.age('6y');
  const s2=addSib();s2.sex('female');s2.age('4y');
  const lines=tree().split('\n');
  // 中組 hw=8、兩側 hw=8 → D=max(16,8+8+8)=24；成人中心 2／26／50／74
  assert.deepEqual(colsOf(lines[0],'□○'),[2,26,50,74],'成人符號起始欄，相鄰成人距離 24');
  assert.deepEqual(colsOf(lines[0],'┬'),[14,38,62],'三段 junction 各在兩人中點');
  const syms=lines[lines.length-2];
  const cols=colsOf(syms,'□○◇');
  assert.equal(cols.length,9,`子代符號應有 9 個（3＋3＋3）\n${syms}`);
  cols.forEach((x,i)=>{ if(i)assert.ok(x-cols[i-1]>=4,`第 ${i} 與第 ${i+1} 個符號起始欄只差 ${x-cols[i-1]}\n${syms}`); });
  colsOf(lines[0],'□○').forEach((x,i,all)=>{ if(i)assert.ok(x-all[i-1]>=4,'成人符號也不得重疊'); });
});

// ── 半手足增刪與「完全沒啟用就回到原樣」 ─────────────────────────────────────
test('半手足刪掉後重畫；三個開關都回到未選時與例 A 逐字相同',({seg,input,otherRel,addSib,sibCards,tree})=>{
  seg('gender','male');input('matAge','30');input('gravida','1');input('para','1');
  const before=tree();
  assert.equal(before,[
    '  □───┬───○',
    '  Father          Mother 30y G1P1',
    '          │',
    '        →□',
    '          NB'].join('\n'),'起點＝例 A');
  otherRel('fatherOther','divorced');
  const h=addSib('fatherOther');h.sex('female');h.age('8y');
  assert.equal(sibCards('fatherOther').length,1,'半手足列在自己的清單裡');
  assert.equal(sibCards().length,0,'不會混進手足清單');
  assert.equal(h.hasTwin(),false,'半手足沒有「同胎」開關');
  assert.ok(tree().includes('8y'),'半手足畫出來了');
  h.remove();
  assert.equal(sibCards('fatherOther').length,0,'刪除後清單要重畫');
  assert.ok(!tree().includes('8y'),`刪掉的半手足不得留在樹上\n${tree()}`);
  assert.ok(tree().split('\n')[0].includes('╱╱'),'關係還在就照樣畫離婚線');
  otherRel('fatherOther','divorced');   // 再點一次＝回到未選
  assert.equal(tree(),before,'新欄位全部沒啟用時，輸出必須與例 A 逐字元相同');
});

let failures=0;
for(const [name,check] of tests){
  try{check();console.log(`PASS ${name}`);}
  catch(error){failures++;console.error(`FAIL ${name}\n${error.stack}`);}
}
console.log(`${tests.length-failures}/${tests.length} pedigree checks passed`);
if(failures)process.exitCode=1;
