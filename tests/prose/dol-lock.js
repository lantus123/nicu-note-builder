// Synthetic DOL locks: source bytes, field HTML, and rendered openings. Do not update during this audit round.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'../..');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(root+'/index.html','utf8');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
// Locate the declaration by regexp, then count nested braces through the matching end.
function functionSource(name){
  const declaration=new RegExp('\\bfunction\\s+'+name+'\\s*\\([^)]*\\)\\s*\\{').exec(source);
  assert.ok(declaration,'Missing function '+name);
  const opening=declaration.index+declaration[0].lastIndexOf('{');
  let depth=0;
  for(let i=opening;i<source.length;i++){
    if(source[i]==='{')depth++;
    if(source[i]==='}'&&--depth===0)return source.slice(declaration.index,i+1);
  }
  throw Error('Unclosed function '+name);
}
function dolFieldSource(){
  // Parse only to locate the stable field; hash the original bytes, not serialized DOM.
  const parsed=new JSDOM(source,{includeNodeLocations:true});
  try{
    const field=parsed.window.document.querySelector('#dolAutoReset')?.closest('.field');
    assert.ok(field,'Missing #dolAutoReset closest .field');
    assert.ok(field.textContent.includes('出生當天＝DOL 1'),'DOL label must remain in the field');
    const location=parsed.nodeLocation(field);assert.ok(location,'DOL field source location');
    return source.slice(location.startOffset,location.endOffset);
  }finally{parsed.window.close();}
}

const LOCKS = {
  dolInfo:'76133b565fc823405abcf415c7ef229eeba3707a9f4272ee371f9f057d05552f',
  dolOnDate:'5b240d219c626ea79fc87aaefed5a45145f06fb5456676383b474327aa9ea56d',
  dolField:'9ca426012d02497cf65b3bda47eb98589b343ea2b0b1472a5ac6caef673c58f1',
};
const FORBIDDEN='DOL 相關程式／輸出改變，本輪不允許';
let passed=0,failed=0;
function test(id,run){
  try{run();passed++;console.log('PASS '+id);}
  catch(error){failed++;console.error(`FAIL ${id}: ${FORBIDDEN}\n${error.message}`);}
}
for(const name of ['dolInfo','dolOnDate'])test(name+' sha256',()=>{
  const actual=hash(functionSource(name));assert.equal(actual,LOCKS[name],name+' sha256');console.log(`LOCK ${name} ${actual}`);
});
test('admission age field sha256',()=>{
  const actual=hash(dolFieldSource());assert.equal(actual,LOCKS.dolField,'#dolAutoReset closest .field sha256');console.log(`LOCK dolField ${actual}`);
});
// Do not execute an app whose locked source has changed.
if(failed){console.log(`${passed} passed / ${failed} failed`);process.exit(1);}
const expose=['S','render','renderAdm','renderAcc'];
const errors=[];
const dom=new JSDOM(source.replace('function render(){',`window.auditAPI={${expose.join(',')}};function render(){`),{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-synthetic-audit.test/',beforeParse(W){const D=W.Date,fixed=new D(2026,9,12,12).getTime();W.Date=class extends D{constructor(...a){super(...(a.length?a:[fixed]));}static now(){return fixed;}};W.scrollTo=()=>{};W.HTMLElement.prototype.scrollIntoView=()=>{};W.addEventListener('error',e=>errors.push(String(e.error?.stack||e.message)));}});
const W=dom.window,d=W.document,A=W.auditAPI,S=A.S;
assert.ok(A,'API injected');
const initial=JSON.parse(JSON.stringify(S));
const fields=[...d.querySelectorAll('input[id],select[id],textarea[id]')].map(e=>[e.id,e.value]);
const get=s=>{const e=d.querySelector(s);assert.ok(e,'Missing '+s);return e;};
const raw=(id,v)=>{get('#'+id).value=String(v);};
const reset=(path='direct')=>{Object.assign(S,JSON.parse(JSON.stringify(initial)));for(const [id,v]of fields){const e=d.getElementById(id);if(e)e.value=v;}Object.assign(S,{pathway:path,outborn:path==='outborn',dest:path==='readmit'?'NBC':'NICU',gender:'male',delivery:'nsd',resus:'none',resp:'',mode:'adm'});for(const [id,v]of Object.entries({gaW:39,gaD:0,bw:3200,matAge:31,gravida:2,para:1,ap1:8,ap5:9,birthDate:'2026-10-12',birthTime:'10:00',admissionDate:'2026-10-12',ancPlace:'TPEMMH'}))raw(id,v);raw('birthResusStatus','');if(path==='outborn')raw('obFacility','Example Birth Hospital');if(path==='readmit'){raw('birthDate','2026-09-28');raw('birthHosp','Example Birth Hospital');S.readmitSource='clinic';}};
const click=s=>{const e=get(s);assert.equal(e.disabled,false,'Disabled '+s);e.click();};
const input=(id,v)=>{const e=get('#'+id);e.value=v;e.dispatchEvent(new W.Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));};

function openings(expected){
  A.render();S.mode='adm';A.renderAdm();const adm=get('#note').textContent.trim();
  S.mode='acc';A.renderAcc();const acc=get('#note').textContent.trim();
  assert.ok(adm.startsWith(`This ${expected}-day-old `),`Admission opening: ${adm.split(' ').slice(0,3).join(' ')}`);
  assert.ok(acc.startsWith(`DOL ${expected}, `),`Acceptance opening: ${acc.split(' ').slice(0,4).join(' ')}`);
  console.log(`OUTPUT This ${expected}-day-old / DOL ${expected}, `);
}
try{
  test('direct birth and admission 2026-10-12',()=>{reset('direct');openings(1);});
  test('direct admission changed to 2026-10-14',()=>{reset('direct');A.render();input('admissionDate','2026-10-14');openings(3);});
  test('readmit birth 2026-09-28 and admission 2026-10-12',()=>{reset('readmit');openings(15);});
  test('no page errors',()=>assert.deepEqual(errors,[]));
}finally{W.close();}
console.log(`${passed} passed / ${failed} failed`);
if(failed)process.exit(1);
