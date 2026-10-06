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
// 某段文字在該行的起始欄（找不到回 -1）；用來驗年齡列／疾病列左緣對齊成人符號左緣
const colOfText=(line,s)=>{const i=line.indexOf(s); return i<0?-1:dw(line.slice(0,i));};
// 找出含某段文字的那一列，回傳 [列號, 起始欄]
const findText=(lines,s)=>{const r=lines.findIndex(l=>l.includes(s)); return [r,r<0?-1:colOfText(lines[r],s)];};
// 2026-10-06 起圖內不寫任何中文角色標籤，圖下也沒有註記
const NO_LABEL=/父親|母親|本人|父方伴侶|母方伴侶|父母關係|註：/;

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
      twin:()=>hit('[data-sibtog="twin"] button'),
      hasTwin:()=>!!card().querySelector('[data-sibtog="twin"]'),
      age:v=>input(`sib-${id}-age`,v),
      note:v=>input(`sib-${id}-note`,v),
      remove:()=>hit('[data-sib-action="remove"]')};
  }
  // 其他伴侶的關係（不預選；再點一次回到未選）
  const otherRel=(which,v)=>click(`[data-pedrel="${which}"] [data-v="${v}"]`);
  // 年齡與疾病都畫在圖內（Ryan 2026-10-06）；圖下不再有註記，tree() 順便驗 Pedigree: 之後只有圖本身。
  function tree(){
    const text=get('#note').textContent;
    const at=text.indexOf('Pedigree:\n');
    assert.ok(at>=0,`Admission note 必須以 Pedigree: 之後接家庭樹\n${text}`);
    const rest=text.slice(at+'Pedigree:\n'.length), t=rest.split('\n\n')[0];
    assert.equal(rest.replace(/\s+$/,''),t,`家庭樹之後不得再接任何註記\n${rest}`);
    assert.equal(d.querySelector('.pedigree-notes'),null,'不再有 .pedigree-notes 元素');
    assert.doesNotMatch(t,NO_LABEL,`圖內不寫中文角色標籤\n${t}`);
    return t;
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
// 年齡列只有母親 30（左緣 18＝母親符號左緣）；父親沒填年齡就整段省略；疾病列全空不佔列；
// G/P 不再出現；本人只靠箭頭＋實心，下面沒有任何字。
test('例 A：最小樹（父母＋本人）逐字相符',({seg,input,tree})=>{
  seg('gender','male');input('matAge','30');input('gravida','1');input('para','1');
  assert.equal(tree(),[
    '  □------+-------○',
    '                  30',
    '          |',
    '        ->■'].join('\n'));
  const lines=tree().split('\n');
  assert.equal(colOfText(lines[1],'30'),colsOf(lines[0],'□○◇')[1],'母親年齡左緣＝母親符號左緣');
  assert.doesNotMatch(tree(),/G1|P1/,'G/P 不寫進圖');
});

// ── 例 B：父 35、母 32 G3P2A1、手足兩位、本人女 ───────────────────────────────
// 座標：子代中心 10／18／26，junction 18，父親符號 10、母親 26（符號佔中心欄與其右一欄）。
test('例 B：兩位手足＋診斷備註逐字相符（本人實心、手足空心），各列落在同一組中心欄',({seg,input,click,addSib,tree})=>{
  seg('gender','female');input('matAge','32');input('gravida','3');input('para','2');
  click('#addAbortion');input('abortion','1');input('fatherAge','35');
  const a=addSib();a.sex('male');a.age('5y');
  const b=addSib();b.sex('female');b.age('3y');b.note('G6PD deficiency');
  // 成人年齡列：父 35 在 10、母 32 在 26（各自符號左緣）；父母沒有疾病 → 疾病列不佔列。
  // 本人那欄（26）在年齡列不再寫「本人」。
  assert.equal(tree(),[
    '          □------+-------○',
    '          35              32',
    '                  |',
    '          +-------+-------+',
    '          |       |       |',
    '          □      ○    ->●',
    '          5y      3y',
    '                  G6PD deficiency'].join('\n'));
  // 同一棵樹再用顯示欄位量一次：精確字串若日後被誤更新，欄位錯位仍會被抓到
  const lines=tree().split('\n');
  assert.deepEqual(colsOf(lines[0],'□○■●◆'),[10,26],'父母符號起始欄');
  assert.deepEqual([colOfText(lines[1],'35'),colOfText(lines[1],'32')],[10,26],'父母年齡左緣＝各自符號左緣');
  assert.deepEqual([colOfText(lines[6],'5y'),colOfText(lines[6],'3y')],[10,18],'手足年齡左緣＝各自符號左緣');
  assert.equal(colOfText(lines[7],'G6PD deficiency'),18,'手足備註在年齡下一列、同一左緣');
  assert.equal(colOf(lines[0],'+'),18,'父母線中點 + 起始欄');
  assert.equal(colOf(lines[2],'|'),18,'主幹 | 起始欄');
  // 橫桿：兩端 ┌ ┐、單元中心 ┬；junction 與子代接點重合時用 ┼（例 B 的 18 正好是中間單元）
  assert.deepEqual(colsOf(lines[3],'+'),[10,18,26],'橫桿接點起始欄');
  assert.deepEqual(colsOf(lines[4],'|'),[10,18,26],'子代主幹 | 起始欄');
  assert.deepEqual(colsOf(lines[5],'□●○■◆'),[10,18,26],'子代符號起始欄');
  assert.equal(colOf(lines[5],'>'),25,'本人箭頭緊貼符號左邊');
  noTrailing(lines);
});

// ── 例 C：同胎（結構驗證）─────────────────────────────────────────────────────
// 單元 1 中心 10；同胎組成員中心 18、24（算術中心 21 落在奇數欄，接點往左靠成 20）。
test('例 C：同胎組畫成分叉，成員中心 18／24 對齊',({seg,addSib,tree})=>{
  seg('gender','male');
  const a=addSib();a.sex('female');a.age('5y');
  const b=addSib();b.sex('male');b.twin();
  const lines=tree().split('\n');
  const bar=lines.findIndex(l=>/^\s*\+/.test(l));
  assert.ok(bar>=0,`必須有橫桿列\n${lines.join('\n')}`);
  assert.deepEqual(colsOf(lines[bar],'+'),[10,16,20],'橫桿：單元中心 10／同胎組接點 20，父母主幹接點在中點 16');
  const fork=lines.findIndex((l,i)=>i>bar+1&&/^\s*\|\s+\+/.test(l));
  assert.ok(fork>=0,`必須有同胎分叉列\n${lines.join('\n')}`);
  assert.deepEqual(colsOf(lines[fork],'+'),[18,20,24],'分叉列：成員中心 18／24，組接點 20');
  assert.deepEqual(colsOf(lines[fork],'|'),[10],'非同胎的單元在分叉列仍畫主幹');
  const syms=lines[lines.length-2];
  assert.deepEqual(colsOf(syms,'□○◇■●◆'),[10,18,24],'符號起始欄＝中心（單元 1 在 10、同胎成員在 18／24）');
  assert.ok(syms.includes('->■'),`本人在同胎組最後、緊貼箭頭\n${syms}`);
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
  assert.deepEqual(colsOf(after.split('\n')[after.split('\n').length-2],'□○◇■●◆'),[10,18],
    '剩兩個子代單元：中心 10／18');
  a.remove();
  assert.equal(sibCards().length,0);
  // 沒填父母年齡／疾病 → 成人下面沒有文字列；本人下面也沒有字 → 成人列、主幹、本人三列
  assert.equal(tree().split('\n').length,3,'全刪回到最小樹（成人列＋主幹＋本人三列）');
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
// 父 2、母 18：年齡列 40／32。疾病列 G6PD deficiency 佔 2..16，下一項至少要隔 2 欄（≥19），
// 母親 thyroid disease 在 18 → 挪到下一列，仍在母親符號左緣 18。
test('本人性別沿用第 1 區並畫實心；父母年齡與英文病名畫在各自符號下',({seg,click,input,tree})=>{
  seg('gender','female');input('matAge','32');input('fatherAge','40');
  click('[data-par="g6pd"] [data-v="father"]');
  click('[data-par="thyroid"] [data-v="mother"]');
  const lines=tree().split('\n');
  assert.equal(lines[0],'  □------+-------○','父母家族史陽性也維持空心（實心只表示本人）');
  assert.equal(lines[1],'  40              32','年齡列：左緣對齊各自符號');
  assert.equal(lines[2],'  G6PD deficiency','父親疾病列：年齡下一列、只有英文');
  assert.equal(lines[3],'                  thyroid disease','母親疾病與父親只隔 1 欄 → 換到下一列');
  assert.deepEqual([findText(lines,'G6PD deficiency'),findText(lines,'thyroid disease')],[[2,2],[3,18]],'疾病左緣＝各自符號左緣');
  assert.doesNotMatch(tree(),/蠶豆症|甲狀腺/,'病名不再附中文');
  assert.ok(lines[lines.length-1].includes('->●'),'本人性別沿用第 1 區（女）且實心');
});

// ── 規格鐵則 ─────────────────────────────────────────────────────────────────
test('樹裡不得出現 __（複製鈕的「尚有 N 空格」會誤算）',({seg,input,addSib,tree})=>{
  seg('gender','male');input('matAge','30');
  const a=addSib();   // 全空的一列：沒填的資訊一律省略，不補佔位
  const text=tree();
  assert.doesNotMatch(text,/_/,`家庭樹不得出現底線佔位\n${text}`);
  assert.ok(text.includes('◇'),'空手足仍畫出未知符號（結構不是捏造）');
});

test('什麼都沒填也畫最小樹，年齡／疾病缺就整段省略（不留空列）',({tree})=>{
  assert.equal(tree(),[
    '  □------+-------○',
    '          |',
    '        ->◆'].join('\n'));
});

// ── 例 F：父親前段離婚（有一女）＋父母未婚 ───────────────────────────────────
// 左組 hw=0、中組 hw=0 → D=16；其他伴侶一啟用，成人列就是四個席位（未啟用的留白），
// 故父親中心 18（其他伴侶 2、母 34），左 junction 10、中 junction 26。
// 年齡列：其他伴侶沒填年齡 → 2 欄空著；父 36 在 18、母 30 在 34。本人下面不再寫字，故最後一列只剩半手足的 8y。
test('例 F：離婚前段＋未婚父母，半手足掛在左邊那段',({seg,input,otherRel,addSib,tree})=>{
  seg('gender','male');input('matAge','30');input('gravida','1');input('para','1');input('fatherAge','36');
  otherRel('fatherOther','divorced');
  const h=addSib('fatherOther');h.sex('female');h.age('8y');
  seg('pedRel','unmarried');
  assert.equal(tree(),[
    '  ○//----+-------□- - - + - - - ○',
    '                  36              30',
    '          |               |',
    '          ○            ->■',
    '          8y'].join('\n'));
  const lines=tree().split('\n');
  assert.ok(lines[0].startsWith('  ○//'),'前段離婚：線型 // 仍畫在圖上（緊貼左邊成人符號右緣）');
  // 父母未婚：父右緣 20 起到母左緣前 33，奇數欄留白成 - - -，junction 26 不動
  assert.deepEqual(colsOf(lines[0],'-').filter(x=>x>=20),[20,22,24,28,30,32],'未婚段 - 只落在偶數欄（虛線）');
  assert.deepEqual(colsOf(lines[0],'□○■●◆'),[2,18,34],'成人符號起始欄：其他伴侶 2、父 18、母 34');
  assert.deepEqual([colOfText(lines[1],'36'),colOfText(lines[1],'30')],[18,34],'父母年齡左緣＝各自符號左緣');
  assert.deepEqual(colsOf(lines[0],'+'),[10,26],'兩段 junction 在各自兩人的中點');
  assert.deepEqual(colsOf(lines[2],'|'),[10,26],'兩條主幹各自掛在自己的 junction 底下');
  assert.deepEqual(colsOf(lines[3],'□○■●◆'),[10,26],'子代符號起始欄＝各組 junction');
  assert.equal(colOf(lines[3],'>'),25,'本人箭頭緊貼符號左邊');
  noTrailing(lines);
});

// ── 例 G：只有母親有其他伴侶（未婚），兩個小孩 ───────────────────────────────
// 中組 hw=0、右組 hw=4 → D=16；左側沒有伴侶不留席位：父 2、母 18、伴侶 34；中 junction 10、右 junction 26，右組單元中心 22／30。
// 年齡列：父 40 在 2、母 35 在 18，母方伴侶沒填年齡 → 34 欄空著；子代年齡列本人那欄（10）空著，半手足 10y／7y 在 22／30。
test('例 G：母親側兩位半手足，橫桿只在右組，中組畫主幹',({seg,input,otherRel,addSib,tree})=>{
  seg('gender','female');input('matAge','35');input('gravida','3');input('para','2');input('fatherAge','40');
  otherRel('motherOther','unmarried');
  const a=addSib('motherOther');a.sex('male');a.age('10y');
  const b=addSib('motherOther');b.sex('female');b.age('7y');
  assert.equal(tree(),[
    '  □------+-------○- - - + - - - □',
    '  40              35',
    '          |               |',
    '          |           +---+---+',
    '          |           |       |',
    '        ->●          □      ○',
    '                      10y     7y'].join('\n'));
  const lines=tree().split('\n');
  assert.deepEqual([colOfText(lines[1],'40'),colOfText(lines[1],'35')],[2,18],'父母年齡左緣＝各自符號左緣');
  assert.deepEqual([colOfText(lines[6],'10y'),colOfText(lines[6],'7y')],colsOf(lines[5],'□○'),'半手足年齡左緣＝各自符號左緣');
  assert.deepEqual(colsOf(lines[0],'-').filter(x=>x>=20),[20,22,24,28,30,32],'母方伴侶未婚：右段畫虛線、junction 26 不動');
  assert.deepEqual(colsOf(lines[3],'+'),[22,26,30],'橫桿列在右組 22→30，junction 26 也是接點（左側沒有伴侶就不留席位）');
  noTrailing(lines);
});

// ── 例 H：父親不詳 ───────────────────────────────────────────────────────────
// 年齡列：父親不詳寫 ? 在 2（父親符號左緣）、母 28 在 18。
test('例 H：父親不詳畫 ◇、年齡列寫 ?（不寫年齡、不寫中文）',({seg,input,toggle,d,tree})=>{
  seg('gender','male');input('matAge','28');input('gravida','1');input('para','1');
  toggle('fatherUnknown');
  assert.equal(d.getElementById('fatherAge').disabled,true,'父親不詳時年齡欄位要停用');
  assert.equal(tree(),[
    '  ◇------+-------○',
    '  ?               28',
    '          |',
    '        ->■'].join('\n'));
  const lines=tree().split('\n');
  assert.deepEqual([colOfText(lines[1],'?'),colOfText(lines[1],'28')],[2,18],'? 與母親年齡左緣＝各自符號左緣');
});

// ── 父母關係三種線型 ─────────────────────────────────────────────────────────
// 關係只剩線型可辨（圖下不再有「父母關係：…」）：一般實線、未婚 ASCII 虛線 - - -、離婚 //。
// 未婚：線段 4..17，奇數欄 5,7,9,11,13,15,17 留白；junction 10 是偶數欄，不受影響。
test('父母關係用 ASCII 連線：一般實線、未婚 - - -、離婚 //，圖下不再有中文關係註記',({seg,tree})=>{
  seg('gender','male');
  const first=()=>tree().split('\n')[0];
  assert.equal(first(),'  □------+-------○','一般連線');
  seg('pedRel','unmarried');
  assert.equal(first(),'  □- - - + - - - ○','未婚畫 ASCII 虛線 - - -（不使用 HIS 不相容的 ╌）');
  assert.deepEqual(colsOf(first(),'-'),[4,6,8,12,14,16],'虛線的 - 落在偶數欄');
  assert.equal(colOfText(first(),'+'),10,'junction 仍在兩人中點');
  assert.doesNotMatch(tree(),/[╌╱]/);
  seg('pedRel','divorced');
  assert.equal(first(),'  □//----+-------○','離婚・分居使用 ASCII //');
  assert.equal(colOfText(first(),'//'),4,'// 緊貼父親符號右緣');
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
  assert.deepEqual(colsOf(lines[0],'□○■●◆'),[2,26,50,74],'成人符號起始欄，相鄰成人距離 24');
  assert.deepEqual(colsOf(lines[0],'+'),[14,38,62],'三段 junction 各在兩人中點');
  const syms=lines[lines.length-2];
  const cols=colsOf(syms,'□○◇■●◆');
  assert.equal(cols.length,9,`子代符號應有 9 個（3＋3＋3）\n${syms}`);
  cols.forEach((x,i)=>{ if(i)assert.ok(x-cols[i-1]>=4,`第 ${i} 與第 ${i+1} 個符號起始欄只差 ${x-cols[i-1]}\n${syms}`); });
  colsOf(lines[0],'□○■●◆').forEach((x,i,all)=>{ if(i)assert.ok(x-all[i-1]>=4,'成人符號也不得重疊'); });
});

// ── 半手足增刪與「完全沒啟用就回到原樣」 ─────────────────────────────────────
test('半手足刪掉後重畫；三個開關都回到未選時與例 A 逐字相同',({seg,input,otherRel,addSib,sibCards,tree})=>{
  seg('gender','male');input('matAge','30');input('gravida','1');input('para','1');
  const before=tree();
  assert.equal(before,[
    '  □------+-------○',
    '                  30',
    '          |',
    '        ->■'].join('\n'),'起點＝例 A');
  otherRel('fatherOther','divorced');
  const h=addSib('fatherOther');h.sex('female');h.age('8y');
  assert.equal(sibCards('fatherOther').length,1,'半手足列在自己的清單裡');
  assert.equal(sibCards().length,0,'不會混進手足清單');
  assert.equal(h.hasTwin(),false,'半手足沒有「同胎」開關');
  assert.ok(tree().includes('8y'),'半手足畫出來了');
  h.remove();
  assert.equal(sibCards('fatherOther').length,0,'刪除後清單要重畫');
  assert.ok(!tree().includes('8y'),`刪掉的半手足不得留在樹上\n${tree()}`);
  assert.ok(tree().split('\n')[0].includes('//'),'關係還在就照樣畫離婚線');
  otherRel('fatherOther','divorced');   // 再點一次＝回到未選
  assert.equal(tree(),before,'新欄位全部沒啟用時，輸出必須與例 A 逐字元相同');
});

test('三項雙親病史維持產前原位且只有一個入口，父親其他病史留家族區',({d,input,click,get,tree})=>{
  for(const key of ['thal','g6pd','thyroid']){
    assert.equal(d.querySelectorAll(`[data-par="${key}"]`).length,1);
    const control=get(`[data-par="${key}"]`);
    assert.ok(control.closest('#prenatalCard'));
    assert.ok(get('#risks').compareDocumentPosition(control)&d.defaultView.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.ok(control.compareDocumentPosition(get('[data-habit="smoking"]'))&d.defaultView.Node.DOCUMENT_POSITION_FOLLOWING);
  }
  assert.equal(d.querySelectorAll('#familyHistoryFields [data-par]').length,0);
  assert.ok(get('#thyWrap').closest('#prenatalCard'));
  assert.ok(get('#fatherHistory').closest('#familyHistoryFields'));
  input('fatherHistory','type 2 diabetes mellitus');
  click('[data-par="g6pd"] [data-v="father"]');
  assert.match(get('#note').textContent.split('Pedigree:')[0],/paternal G6PD deficiency and paternal type 2 diabetes mellitus/);
  // 父親沒填年齡 → 年齡列省略，疾病列緊接成人列；多個病名以 ", " 連接，左緣＝父親符號左緣 2
  const lines=tree().split('\n');
  assert.equal(lines[1],'  G6PD deficiency, type 2 diabetes mellitus','父親疾病列（英文、逗號連接）');
  assert.equal(colOfText(lines[1],'G6PD'),colsOf(lines[0],'□○◇')[0]);
  click('[data-tab="acc"]');click('[data-tab="adm"]');
  assert.equal(get('#fatherHistory').value,'type 2 diabetes mellitus');
});

test('同一父親疾病重填不重複輸出，清空不刪其他選擇',({input,click,get,tree})=>{
  click('[data-par="g6pd"] [data-v="father"]');
  for(const value of ['G6PD deficiency','g6pd deficiency.','蠶豆症']){
    input('fatherHistory',value);
    assert.equal((tree().match(/G6PD deficiency/gi)||[]).length,1,`重填「${value}」後圖內只出現一次\n${tree()}`);
    assert.doesNotMatch(tree(),/蠶豆症/);
    assert.equal((get('#note').textContent.split('Pedigree:')[0].match(/paternal G6PD deficiency/g)||[]).length,1);
  }
  input('fatherHistory','');
  assert.deepEqual(findText(tree().split('\n'),'G6PD deficiency'),[1,2],'清空自由文字後，勾選的病名仍在父親下方');
  assert.equal(get('[data-par="g6pd"] [data-v="father"]').getAttribute('aria-pressed'),'true');
});

test('父親疾病與無病史衝突時提醒可直達，且不產生相反的否認句',({input,click,d,get,tree})=>{
  click('[data-par="g6pd"] [data-v="none"]');input('fatherHistory','G6PD deficiency');
  assert.doesNotMatch(get('#note').textContent.split('Pedigree:')[0],/denied a history of G6PD deficiency/);
  const issue=d.querySelector('#reviewConflictList [data-review-target="#fatherHistory"]');assert.ok(issue);
  issue.click();assert.equal(d.activeElement.id,'fatherHistory');
  assert.equal(get('#fatherHistory').value,'G6PD deficiency');
  click('[data-par="g6pd"] [data-v="father"]');
  assert.equal(d.querySelector('#reviewConflictList [data-review-target="#fatherHistory"]'),null);
  assert.equal((tree().match(/G6PD deficiency/g)||[]).length,1);
  click('[data-par="g6pd"] [data-v="unknown"]');
  assert.ok(d.querySelector('#reviewConflictList [data-review-target="#fatherHistory"]'));
  assert.doesNotMatch(get('#note').textContent,/Parental history regarding G6PD deficiency was unavailable/);
});

test('甲狀腺類型沿用唯一資料，不由病名推定藥物或另一方疾病類型',({click,seg,input,d,get,tree})=>{
  click('[data-par="thyroid"] [data-v="both"]');seg('thyType','hypo');
  // 父母都畫 hypothyroidism：父 2..15、母 18，同一列不相撞
  const lines=tree().split('\n');
  assert.equal(lines[1],'  hypothyroidism  hypothyroidism');
  assert.deepEqual([colOfText(lines[1],'hypo'),dw(lines[1].slice(0,lines[1].lastIndexOf('hypo')))],[2,18],'父母疾病左緣＝各自符號左緣');
  assert.match(get('#note').textContent,/parental hypothyroidism/);
  assert.doesNotMatch(get('#note').textContent,/treated with thyroxine/);
  click('[data-par="thyroid"] [data-v="mother"]');input('fatherHistory','hyperthyroidism');
  const prose=get('#note').textContent.split('Pedigree:')[0];
  assert.match(prose,/maternal hypothyroidism and paternal hyperthyroidism/);
  assert.doesNotMatch(prose,/paternal hypothyroidism/);
  assert.equal(d.querySelector('#reviewConflictList [data-review-target="#fatherHistory"]'),null,'只記母親的類型，不等於否認父親可有另一類型');
});

// 病名改畫在圖內：長病名只多出父親下方一列（左緣 2），其餘結構不變；自由文字仍只當文字。
test('長病名只多一列疾病列、不動其他結構，自由文字不被當成 HTML 執行',({input,get,tree,addSib})=>{
  const before=tree().split('\n');
  const long='congenital heart disease with prior repair; <img src=x onerror=alert(1)>';
  input('fatherHistory',long);
  const after=tree().split('\n');
  assert.deepEqual([after[0],...after.slice(2)],before,'除了插入的疾病列，其他列逐字不變');
  assert.equal(after[1],'  '+long,'長病名在父親符號左緣起畫成一列');
  noTrailing(after);
  assert.equal(get('#note').querySelector('img'),null);
  const a=addSib();a.note('<script>bad()</script>');
  assert.match(tree(),/<script>bad\(\)<\/script>/);
  assert.equal(get('#note').querySelector('script'),null);
});

test('中文手足備註按顯示欄寬換列，不互相覆寫',({addSib,tree})=>{
  const a=addSib();a.note('先天性心臟病');const b=addSib();b.note('蠶豆症');
  assert.ok(tree().includes('先天性心臟病'));assert.ok(tree().includes('蠶豆症'));
  const lines=tree().split('\n');assert.ok(lines.findIndex(l=>l.includes('先天性心臟病'))!==lines.findIndex(l=>l.includes('蠶豆症')));
  noTrailing(lines);
});

test('未知父親不清空病史草稿、不推定無疾病',({input,toggle,get,tree})=>{
  input('fatherAge','35');input('fatherHistory','type 2 diabetes mellitus');toggle('fatherUnknown');
  let lines=tree().split('\n');
  assert.equal(lines[0].slice(0,3),'  ◇','父親不詳畫未知符號');
  assert.deepEqual([findText(lines,'?'),findText(lines,'type 2 diabetes mellitus')],[[1,2],[2,2]],'年齡列寫 ?、疾病列保留草稿，左緣都是父親符號 2');
  assert.doesNotMatch(tree(),/35|無疾病/);
  toggle('fatherUnknown');assert.equal(get('#fatherAge').value,'35');
  lines=tree().split('\n');
  assert.deepEqual([findText(lines,'35'),findText(lines,'type 2 diabetes mellitus')],[[1,2],[2,2]],'取消不詳後年齡回到 35');
});

test('桌機與收合預覽的文字複製保留圖內病名及 ASCII 連線、沒有中文註記',({W,d,click,input,seg,get})=>{
  const copies=[];Object.defineProperty(W.navigator,'clipboard',{configurable:true,value:{writeText(text){copies.push(text);return Promise.resolve();}}});
  // DOM contract only: native HIS rendering still requires an in-hospital paste test.
  Object.defineProperty(W.HTMLElement.prototype,'innerText',{configurable:true,get(){return this.textContent;}});
  seg('pedRel','unmarried');input('fatherHistory','type 2 diabetes mellitus');
  for(const width of [1440,390]){
    W.innerWidth=width;W.dispatchEvent(new W.Event('resize'));const expected=get('#note').textContent;
    click('#copy');assert.equal(copies.at(-1),expected);
    const ped=copies.at(-1).split('Pedigree:\n')[1];
    assert.ok(ped,'複製內容含 Pedigree:');
    assert.match(ped,/^  □- - - \+ - - - ○\n  type 2 diabetes mellitus\n/,'複製後父親病名仍在父親符號下');
    assert.doesNotMatch(ped,NO_LABEL,'複製內容不含中文角色標籤或圖下註記');
    assert.doesNotMatch(copies.at(-1),/[╌╱─│┬┴┼┌┐→]/);
  }
  assert.equal(d.querySelectorAll('#fatherHistory').length,1);
});

let failures=0;
for(const [name,check] of tests){
  try{check();console.log(`PASS ${name}`);}
  catch(error){failures++;console.error(`FAIL ${name}\n${error.stack}`);}
}
console.log(`${tests.length-failures}/${tests.length} pedigree checks passed`);
if(failures)process.exitCode=1;
