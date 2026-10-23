// A2 ABG 貼上解析：多行 POCT、單行 / 與逗號、無空白、B.E.、未知 token 原文保留。虛構數值。
// 直接呼叫頁內 parseGas／classifyGas（函式宣告會提升，可在宣告前掛出），再驗 Acceptance 實際輸出。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(__dirname+'/../../index.html','utf8');
assert.equal(source.split('function parseGas(txt){').length,2);
const html=source.replace('function parseGas(txt){','window.gasTest={parseGas:t=>parseGas(t),classifyGas:v=>classifyGas(v)}; function parseGas(txt){');
const errors=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-gas.test/',beforeParse(W){
  W.scrollTo=()=>{};W.HTMLElement.prototype.scrollIntoView=()=>{};
  W.addEventListener('error',e=>errors.push(String(e.error?.stack||e.message)));}});
const W=dom.window,d=W.document,{parseGas,classifyGas}=W.gasTest;
const plain=o=>JSON.parse(JSON.stringify(o));
const FULL={PH:'7.28',PCO2:'52',PO2:'60',HCO3:'22',BE:'-4'};
const FULL_LINE='pH 7.28 / pCO2 52 / pO2 60 / HCO3 22 / BE -4';
const cases=[
  ['POCT 多行原格式（含單位、檢體來源、H/L 旗標）','檢體來源：Arterial\npH L 7.28\npCO2 H 52 mmHg\npO2 60 mmHg\nHCO3 22 mmol/L\nBE -4 mmol/L',
    FULL_LINE+' (Arterial)',{...FULL,SRC:'Arterial'}],
  ['單行斜線','pH 7.28 / pCO2 52 / pO2 60 / HCO3 22 / BE -4',FULL_LINE,FULL],
  ['單行逗號','pH 7.28, pCO2 52, pO2 60, HCO3 22, BE -4',FULL_LINE,FULL],
  ['無空白＋冒號＋下標','pH7.28/pCO₂:52/pO2=60/HCO3-22/BE-4',FULL_LINE,FULL],
  ['B.E. 與 HCO3- 寫法、全形分號','pH: 7.28；PCO2 52；PO2 60；HCO3- 22；B.E. -4',FULL_LINE,FULL],
  ['空白分隔同一行','pH 7.28 PCO2 52 PO2 60 HCO3 22 BE -4',FULL_LINE,FULL],
  ['未知 token 原文保留','pH 7.28 / pCO2 52 / BE -4; Lac 3.2 mmol/L | Na 135',
    'pH 7.28 / pCO2 52 / BE -4; Lac 3.2 mmol/L; Na 135',{PH:'7.28',PCO2:'52',BE:'-4'}],
  ['檢體來源與數值同一段不整段丟（Codex 2026-10-24）','檢體來源：Arterial pH 7.28\npCO2 52',
    'pH 7.28 / pCO2 52 (Arterial)',{PH:'7.28',PCO2:'52',SRC:'Arterial'}],
  ['整份報告貼進來：姓名／病歷號／日期行不進 note，像檢驗值的片段才留','Name: WANG XIAO MING\nChart No. 12345678\n2026/10/24 08:15\nBed A-3\npH 7.28 / pCO2 52 / Lac 3.2',
    'pH 7.28 / pCO2 52; Lac 3.2',{PH:'7.28',PCO2:'52'}],
  ['SaO2 帶百分比','pH 7.40 / SaO2 96%','pH 7.40 / SaO2 96%',{PH:'7.40',SAO2:'96'}],
  ['完全解析不到時保留原文','血氣待補 drawn at 08:00','血氣待補 drawn at 08:00',{}],
];
let fail=0;
for(const [name,txt,line,vals] of cases){
  try{const r=parseGas(txt);assert.equal(r.line,line,name+' line');assert.deepEqual(plain(r.vals),vals,name+' vals');console.log('✓',name);}
  catch(e){fail++;console.log('✗',name,'\n ',e.message);}
}
try{
  const multi=plain(classifyGas(parseGas(cases[0][1]).vals));
  for(const [name,txt] of cases.slice(1,6))assert.deepEqual(plain(classifyGas(parseGas(txt).vals)),multi,name+' 判讀同多行');
  assert.equal(multi.acid,'respiratory acidosis');
  console.log('✓ 單行各格式判讀與多行相同（respiratory acidosis）');
}catch(e){fail++;console.log('✗ 判讀一致性\n ',e.message);}
// 端到端：Acceptance 的實際病歷文字（不是只驗函式）
try{
  d.querySelector('[data-tab="acc"]').click();
  const el=d.getElementById('accABG');el.value='pH 7.28 / pCO2 52 / pO2 60 / HCO3 22 / BE -4; Lac 3.2';
  el.dispatchEvent(new W.Event('input',{bubbles:true}));
  const note=d.getElementById('note').textContent;
  assert.ok(note.includes('pH 7.28 / pCO2 52 / pO2 60 / HCO3 22 / BE -4; Lac 3.2'),'Acceptance 寫出完整整理行與保留原文');
  assert.match(note,/respiratory acidosis/);
  assert.deepEqual(errors,[]);
  console.log('✓ Acceptance 病歷含整理行與判讀');
}catch(e){fail++;console.log('✗ Acceptance 端到端\n ',e.message);}
W.close();
console.log(fail?`✗ ${fail} 項失敗`:'✓ gas-parse 全過');process.exit(fail?1:0);
