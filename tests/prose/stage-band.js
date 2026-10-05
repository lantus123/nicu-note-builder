// 分段顯示＋時序帶（2026-10-06）。虛構資料；只驗導覽與畫面狀態，不改病歷文字。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(__dirname+'/../../index.html','utf8');
assert.equal(source.split('function render(){').length,2);
const html=source.replace('function render(){','window.bandTest={S,render}; function render(){');
const tests=[];
const test=(name,run)=>tests.push([name,run]);
async function page(run){
  const errors=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-band.test/',beforeParse(W){
    let y=0;Object.defineProperty(W,'scrollY',{get:()=>y,configurable:true});
    W.scrollTo=(a,b)=>{y=typeof a==='object'?(a.top??y):b;};
    W.HTMLElement.prototype.scrollIntoView=()=>{};
    Object.defineProperty(W.HTMLElement.prototype,'innerText',{configurable:true,get(){return this.textContent;}});   // jsdom 沒有排版
    Object.defineProperty(W.navigator,'clipboard',{configurable:true,value:{async writeText(text){(W.copies=W.copies||[]).push(text);}}});
    W.addEventListener('error',e=>errors.push(String(e.error?.stack||e.message)));
  }});
  const W=dom.window,d=W.document;
  const get=s=>{const e=d.querySelector(s);assert.ok(e,'Missing '+s);return e;};
  const click=s=>get(s).click();
  const input=(id,v)=>{const e=get('#'+id);e.value=v;e.dispatchEvent(new W.Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));};
  const seg=(k,v)=>click(`[data-seg="${k}"] [data-v="${v}"]`);
  const story=s=>{if(['A','B'].includes(s)&&!d.querySelector('#entryDirect[aria-checked="true"]'))click('#entryDirect');click(`[data-story="${s}"]`);};
  const note=()=>get('#note').textContent;
  const chapter=()=>get('#stageBand .band-head[aria-current="step"] .t').textContent;
  const current=()=>d.querySelector('#stageBand .band-node[aria-current="step"] .nm')?.textContent||'';
  const shown=()=>[...d.querySelectorAll('#admSections > .card')].filter(c=>!c.hasAttribute('data-stage-off')).map(c=>c.id||c.querySelector('.sec-h').textContent.replace(/\s+/g,'').slice(0,5));
  const status=i=>get(`[data-band-seg="${i}"] .band-head .s`);
  const nodes=i=>[...d.querySelectorAll(`[data-band-seg="${i}"] .band-node`)].map(n=>n.dataset.bandNode);
  const places=i=>[...d.querySelectorAll(`[data-band-seg="${i}"] .band-places span`)].map(s=>s.textContent);
  const key=(k,target=d.activeElement||d.body)=>target.dispatchEvent(new W.KeyboardEvent('keydown',{key:k,altKey:true,bubbles:true,cancelable:true}));
  try{await run({W,d,get,click,input,seg,story,note,chapter,current,shown,status,nodes,places,key});assert.deepEqual(errors,[],'Page errors');}
  finally{W.close();}
}

test('only the active stage cards are displayed; every stage is reachable from the band',({click,shown,chapter,get,W})=>{
  assert.deepEqual(shown(),['admissionContext']);assert.equal(chapter(),'入院設定');
  const expected={admissionContext:['admissionContext'],prenatalCard:['prenatalCard','2產前篩檢','2產程用藥'],birthHistoryCard:['birthHistoryCard'],pathwayCard:['pathwayCard'],finalReviewCard:['finalReviewCard']};
  for(const [id,cards] of Object.entries(expected)){
    W.scrollTo(0,900);click(`#stageBand [data-flow-target="${id}"]`);
    assert.deepEqual(shown(),cards,id);assert.equal(W.scrollY,0,'Changing stage returns to the top');
    assert.equal(get('#'+id).hasAttribute('hidden'),false,'Stage hiding never uses the hidden attribute');
  }
  assert.equal(get('#stageBand').querySelectorAll('.band-head[aria-current="step"]').length,1);
});

test('stage next/back buttons switch stages instead of scrolling a long page',({click,shown,chapter,W})=>{
  click('#admissionContext .stage-actions .primary');assert.equal(chapter(),'產前資料');assert.ok(shown().includes('prenatalCard'));
  click('#prenatalNext');assert.equal(chapter(),'出生資料');
  W.scrollTo(0,600);click('#birthHistoryCard .stage-actions .secondary');assert.equal(chapter(),'產前資料');assert.equal(W.scrollY,0);
});

test('the band is built once; switching stage only changes classes and text',({d,click,get,story})=>{
  const band=get('#stageBand'),heads=[...band.querySelectorAll('.band-head')];
  click('#stageBand [data-flow-target="birthHistoryCard"]');click('#stageBand [data-flow-target="finalReviewCard"]');
  assert.equal(get('#stageBand'),band);heads.forEach((h,i)=>assert.equal(band.querySelectorAll('.band-head')[i],h));
  assert.equal(get('[data-band-seg="5"]').classList.contains('cur'),true);assert.equal(get('[data-band-seg="3"]').classList.contains('cur'),false);
  story('D');const node=get('#stageBand [data-band-node="course:obCare"]');click('#stageBand [data-flow-target="admissionContext"]');
  assert.equal(get('#stageBand [data-band-node="course:obCare"]'),node,'Unchanged node sets keep the same elements');
  assert.equal(d.querySelectorAll('#workflowNav').length,1);
});

const STORIES={
  A:{birth:['birth:info','birth:standby','birth:birth','birth:dr','birth:drEnd'],course:['course:route','course:adm'],birthPlaces:[],coursePlaces:[]},
  B:{birth:['birth:info','birth:birth','birth:consult','birth:dr','birth:drEnd'],course:['course:route','course:adm'],birthPlaces:[],coursePlaces:[]},
  C:{birth:['birth:info','birth:birth','birth:dr','birth:drEnd'],course:['course:route','course:brEval','course:adm'],birthPlaces:['產房'],coursePlaces:['嬰兒室','病房']},
  D:{birth:['birth:info','birth:birth','birth:dr','birth:drEnd'],course:['course:obCare','course:obConsult','course:obArrive','course:route','course:adm'],birthPlaces:['外院'],coursePlaces:['外院','轉送途中','本院']},
  E:{birth:['birth:info','birth:birth','birth:dr','birth:drEnd'],course:['course:prior','course:illness','course:evaluation'],birthPlaces:['出院前'],coursePlaces:['出院前','家中','門急診']}
};
for(const [name,want] of Object.entries(STORIES))test(`story ${name} nodes and place grouping come from the existing stage definitions`,({story,nodes,places})=>{
  story(name);
  assert.deepEqual(nodes(3),want.birth);assert.deepEqual(nodes(4),want.course);
  assert.deepEqual(places(3),want.birthPlaces);assert.deepEqual(places(4),want.coursePlaces);
});

test('no scenario: course stage shows a prompt instead of nodes; C/S renames the birth place',({get,nodes,story,seg,places})=>{
  assert.deepEqual(nodes(4),[]);assert.equal(get('[data-band-seg="4"] .band-empty').textContent,'尚未選情境');assert.equal(get('[data-band-seg="4"] .band-places').hidden,true);
  story('C');seg('delivery','cs');assert.deepEqual(places(3),['刀房']);
});

test('prenatal nodes are fixed plus only what the user recorded',({nodes,seg,click,input,get})=>{
  assert.deepEqual(nodes(2),['prenatal:anc','prenatal:admit']);
  seg('toco','ritodrine');input('tocoSince','8/20');assert.deepEqual(nodes(2),['prenatal:anc','prenatal:admit','prenatal:toco']);
  assert.equal(get('[data-band-node="prenatal:toco"] .tm').textContent,'8/20');
  click('[data-tog="tocoDischarged"] button');input('tocoGaW','32');input('tocoGaD','3');
  assert.deepEqual(nodes(2),['prenatal:anc','prenatal:tocoStay','prenatal:admit']);assert.equal(get('[data-band-node="prenatal:tocoStay"] .tm').textContent,'32+3 wk');
  click('[data-ryn="prom"] [data-v="yes"]');click('[data-ryn="steroid"] [data-v="yes"],[data-r3="steroid"] [data-v="yes"],.risk-item[data-k="steroid"] [data-v="yes"]');seg('iap','complete');input('iapSince','10/4');
  assert.deepEqual(nodes(2),['prenatal:anc','prenatal:tocoStay','prenatal:admit','prenatal:rom','prenatal:steroid','prenatal:iap']);
  assert.equal(get('[data-band-node="prenatal:iap"] .tm').textContent,'10/4');
  input('admReason','scheduled C/S');assert.equal(get('[data-band-node="prenatal:admit"]').classList.contains('has'),true);
});

test('status text follows filling: missing, not started and complete',({status,story,seg,input,click})=>{
  assert.equal(status(1).textContent,'缺 3 項');assert.equal(status(1).dataset.risk,'true');
  assert.equal(status(2).textContent,'未開始');assert.equal(status(2).dataset.risk,'false');
  assert.match(status(3).textContent,/^缺 4 項$/);assert.equal(status(4).textContent,'未開始');assert.equal(status(5).textContent,'未開始');
  story('A');seg('dest','NICU');input('birthDate','2026-08-29');assert.equal(status(1).textContent,'完成');assert.equal(status(1).dataset.risk,'false');
  seg('gender','female');input('gaW','38');input('bw','3100');assert.equal(status(3).textContent,'缺 1 項');
  seg('delivery','nsd');assert.equal(status(3).textContent,'已記錄 1／5');
  assert.equal(status(4).textContent,'未開始');click('#admissionStatusBody [data-seg="resp"] [data-v="room air"]');assert.equal(status(4).textContent,'已記錄 1／2');
  click('#prenatalNext');assert.equal(status(2).textContent,'完成');
  click('#stageBand [data-flow-target="finalReviewCard"]');assert.equal(status(5).textContent,'完成');
});

test('node dots: filled when recorded, hollow when not; current node is marked',({story,get,input,click,current})=>{
  story('D');assert.equal(get('[data-band-node="birth:birth"]').classList.contains('has'),false);
  assert.equal(get('[data-band-node="birth:birth"] .tm').textContent,'未記錄');
  input('birthBreathing','crying');assert.equal(get('[data-band-node="birth:birth"]').classList.contains('has'),true);
  input('birthFinalMin','10');input('birthFinalSupport','cpap');assert.equal(get('[data-band-node="birth:drEnd"] .tm').textContent,'生後 10 分');
  click('[data-band-node="course:obArrive"]');assert.equal(current(),'我方抵達外院');
  assert.equal(get('[data-band-node="course:obArrive"]').getAttribute('aria-current'),'step');
});

test('clicking a node switches stage, focuses the stage and briefly marks the target block',({d,click,get,chapter,current,story,seg,input})=>{
  seg('iap','complete');input('iapSince','8/26');
  click('[data-band-node="prenatal:iap"]');assert.equal(chapter(),'產前資料');
  const block=get('[data-seg="iap"]').closest('.field');assert.ok(block.contains(d.activeElement),'Focus lands inside the IAP field');assert.equal(block.classList.contains('band-pulse'),true);
  story('C');click('[data-band-node="birth:dr"]');assert.equal(chapter(),'出生資料');assert.equal(current(),'出生場所處置');
  assert.ok(get('#birthStage-dr').contains(d.activeElement));assert.equal(get('#birthStage-dr').classList.contains('band-pulse'),true);
  click('[data-band-node="course:brEval"]');assert.equal(chapter(),'本次病程');assert.equal(current(),'兒科評估・抽血');
  assert.equal(d.activeElement,get('#journeyWorkspace'));assert.equal(get('#journeyWorkspace').classList.contains('band-pulse'),true);
});

test('review "go to field" jumps across stages and focuses the exact field',({d,click,get,chapter,note})=>{
  click('#stageBand [data-flow-target="finalReviewCard"]');const before=note();
  for(const [selector,stage] of [['#bw','出生資料'],['#birthDate','入院設定'],['#entryRoutes','入院設定']]){
    click('#stageBand [data-flow-target="finalReviewCard"]');
    const link=[...d.querySelectorAll('#workflowReview [data-review-target]')].find(b=>b.dataset.reviewTarget===selector);assert.ok(link,selector);link.click();
    assert.equal(chapter(),stage);assert.equal(d.activeElement,get(selector));assert.equal(get(selector).closest('[data-stage-off]'),null);
  }
  assert.equal(note(),before);
});

test('switching tabs and returning keeps the same stage',({click,chapter,shown})=>{
  click('#stageBand [data-flow-target="birthHistoryCard"]');
  for(const t of ['plan','acc','proc','adm'])click(`[data-tab="${t}"]`);
  assert.equal(chapter(),'出生資料');assert.deepEqual(shown(),['birthHistoryCard']);
});

test('preview dims other stages, follows stage changes, and never changes the copied text',({d,click,get,note,story})=>{
  story('A');const n=get('#note'),text=note();
  click('#stageBand [data-flow-target="prenatalCard"]');assert.equal(n.dataset.stageFocus,'2');
  const scopes=[...n.querySelectorAll('.note-scope')];assert.ok(scopes.length>2);
  for(const s of scopes)assert.equal(s.dataset.current,String(s.dataset.notePhase==='prenatal'),s.dataset.notePhase);
  click('#stageBand [data-flow-target="birthHistoryCard"]');assert.equal(n.dataset.stageFocus,'3');
  for(const s of n.querySelectorAll('.note-scope'))assert.equal(s.dataset.current,String(s.dataset.notePhase.startsWith('birth:')));
  click('#stageBand [data-flow-target="finalReviewCard"]');assert.equal(n.hasAttribute('data-stage-focus'),false,'Review shows the whole note at full strength');
  for(const s of n.querySelectorAll('.note-scope'))assert.equal(s.dataset.current,'true');
  assert.equal(note(),text);
  const reading=get('.dock').dataset.reading;click('#stageBand [data-flow-target="prenatalCard"]');assert.equal(get('.dock').dataset.reading,reading,'Reading mode is not changed by stage focus');
});

test('Alt+Right / Alt+Left move between stages; plain arrows and text fields keep their own behaviour',({W,d,get,chapter,key,story})=>{
  key('ArrowRight',d.body);assert.equal(chapter(),'產前資料');key('ArrowRight',d.body);assert.equal(chapter(),'出生資料');
  key('ArrowLeft',d.body);assert.equal(chapter(),'產前資料');
  const choice=get('[data-seg="ancReg"] [data-v="regular"]');choice.focus();key('ArrowRight',choice);assert.equal(chapter(),'出生資料','Alt+arrow on a choice switches stage, not choice focus');
  const field=get('#bw');field.focus();key('ArrowLeft',field);assert.equal(chapter(),'出生資料','Text inputs keep Option/Alt+arrow word movement');
  get('#stageBand [data-flow-target="admissionContext"]').click();key('ArrowLeft',d.body);assert.equal(chapter(),'入院設定','No stage before the first');
  get('#stageBand [data-flow-target="finalReviewCard"]').click();key('ArrowRight',d.body);assert.equal(chapter(),'核對病歷','No stage after the last');
  get('[data-tab="plan"]').click();key('ArrowLeft',d.body);get('[data-tab="adm"]').click();assert.equal(chapter(),'核對病歷','Other tabs ignore Alt+arrows');
  const plain=new W.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true});d.body.dispatchEvent(plain);assert.equal(chapter(),'核對病歷');
});

test('focusing a field that belongs to another stage shows that stage first',({get,chapter,shown})=>{
  get('#gaW').focus();assert.equal(chapter(),'出生資料');assert.deepEqual(shown(),['birthHistoryCard']);
  get('#gravida').focus();assert.equal(chapter(),'產前資料');
});

// ── 第三階段：產前確認清單、各段結尾缺漏、核對收合、複製把關 ──
test('prenatal checklist keeps every item visible as one row; ids and data attributes are unchanged',({d,get,click})=>{
  click('#stageBand [data-flow-target="prenatalCard"]');
  for(const card of [get('#prenatalCard'),...d.querySelectorAll('#admSections > .card.pn-compact')])assert.equal(card.classList.contains('pn-compact'),true);
  assert.equal(d.querySelectorAll('#admSections > .card.pn-compact').length,3);
  for(const sel of ['[data-ryn="gdm"]','[data-ryn="pih"]','[data-r3="pre"]','[data-ryn="aph"]','[data-ryn="pph"]','[data-ryn="uri"]','[data-ryn="fever"]','[data-ryn="prom"]','[data-ryn="steroid"]','[data-seg="ancReg"]','[data-seg="us"]','[data-seg="amnio"]','[data-seg="nipt"]','[data-par="thal"]','[data-par="g6pd"]','[data-par="thyroid"]','[data-habit="smoking"]','[data-habit="alcohol"]','[data-habit="drug"]','[data-seg="mgso4"]','[data-seg="toco"]','[data-seg="iap"]','#habitStatus','#admReason','#edc','#ancPlace','#matOtherHx','#gravida','#para','#matAge','#tocoSince','#iapSince','#iapDrug']){
    const el=get(sel);assert.equal(el.closest('[hidden]'),null,sel+' stays on screen');assert.equal(el.closest('details:not([open])'),null,sel+' is not folded away');
  }
  for(const k of ['hbsag','syphilis','rubella','hiv','gbs'])assert.equal(get(`.scr-row[data-scr="${k}"]`).closest('[hidden]'),null);
  assert.equal(get('#prenatalStatus-gdm').dataset.default,'true','Default badges remain for assistive technology');
  assert.ok(d.querySelectorAll('#prenatalCard .pn-row').length>=8);assert.ok(get('#risks').classList.contains('pn-grid'));
  assert.match(get('#prenatalDefaultStatus').textContent,/直接帶入病歷/);assert.equal(get('.prenatal-default-info').children.length,1,'The long explanation is one line');
});

test('only abnormal choices carry the risk marker; defaults and unknown stay neutral',({d,get})=>{
  for(const sel of ['[data-ryn="gdm"] [data-v="yes"]','[data-r3="pre"] [data-v="confirmed"]','[data-r3="pre"] [data-v="highrisk"]','[data-seg="ancReg"] [data-v="irregular"]','[data-seg="us"] [data-v="abnormal"]','[data-seg="nipt"] [data-v="high"]','[data-par="thal"] [data-v="mother"]','[data-habit="smoking"] button','[data-seg="iap"] [data-v="complete"]','[data-seg="toco"] [data-v="ritodrine"]'])assert.ok(get(sel).hasAttribute('data-abn'),sel);
  for(const sel of ['[data-ryn="gdm"] [data-v="no"]','[data-ryn="gdm"] [data-v="unknown"]','[data-r3="pre"] [data-v="neg"]','[data-seg="ancReg"] [data-v="regular"]','[data-seg="us"] [data-v="normal"]','[data-seg="nipt"] [data-v="low"]','[data-par="thal"] [data-v="none"]','[data-seg="iap"] [data-v="none"]'])assert.equal(get(sel).hasAttribute('data-abn'),false,sel);
  assert.equal(d.querySelectorAll('#prenatalCard [aria-pressed="true"][data-abn]').length,0,'Fresh defaults have no abnormal selection');
});

test('stage ends list their own missing items and the links land on the field',({d,get,click,chapter,note})=>{
  const before=note();
  assert.match(get('#stageMissing-1').textContent,/入院路徑.*收治單位.*出生日期/);assert.equal(get('#stageMissing-2').hidden,true);
  assert.match(get('#stageMissing-3').textContent,/GA.*出生體重.*性別.*生產方式/);
  const link=[...get('#stageMissing-3').querySelectorAll('[data-stage-target]')].find(b=>b.dataset.stageTarget==='#bw');
  click('#stageBand [data-flow-target="admissionContext"]');link.click();
  assert.equal(chapter(),'出生資料');assert.equal(d.activeElement,get('#bw'));assert.equal(get('#reviewJumpBar').hidden,true,'Stage-end links do not offer "return to review"');
  assert.equal(note(),before);
  get('#bw').value='3000';get('#bw').dispatchEvent(new d.defaultView.Event('input',{bubbles:true}));assert.doesNotMatch(get('#stageMissing-3').textContent,/出生體重/);
});

test('"all correct" records confirmation without changing the note',({W,get,click,note,chapter,status})=>{
  assert.equal(get('#prenatalNext').textContent,'以上都對，下一段：出生資料 →');
  const before=note();click('#stageBand [data-flow-target="prenatalCard"]');assert.equal(W.bandTest.S.prenatalConfirmed,false);
  click('#prenatalNext');assert.equal(W.bandTest.S.prenatalConfirmed,true);assert.equal(chapter(),'出生資料');assert.equal(note(),before);assert.equal(status(2).textContent,'完成');
});

test('review: missing and optional groups fold into one-line counts; conflicts stay expanded',({get,input})=>{
  assert.equal(get('#reviewMissing').tagName,'DETAILS');assert.equal(get('#reviewMissing').open,false);
  assert.match(get('#reviewMissingSummary').textContent,/關鍵資料未填（\d+ 項/);assert.equal(get('#reviewOptional').open,false);
  assert.equal(get('#reviewConflicts').tagName,'SECTION');
  input('gaW','99');assert.match(get('#reviewConflictList').textContent,/GA/);assert.equal(get('#reviewConflictList').closest('details'),null);
});

// ── 第四階段：帶子標示時間矛盾（只反映既有「前後不一致／格式需核對」結果）──
test('a conflicting IAP date marks the IAP node and the prenatal header; review counts all conflicts',({d,get,input,seg,status})=>{
  input('birthDate','2026-10-04');seg('iap','complete');input('iapSince','8/26');
  assert.match(get('#reviewConflictList').textContent,/IAP開始日期比出生早/);
  assert.equal(get('[data-band-node="prenatal:iap"]').classList.contains('warn'),true);
  assert.match(get('[data-band-node="prenatal:iap"]').getAttribute('aria-label'),/待核對/);
  assert.equal(get('[data-band-node="prenatal:anc"]').classList.contains('warn'),false);
  assert.equal(status(2).textContent,'1 項待核對');assert.equal(status(2).dataset.risk,'true');
  const total=d.querySelectorAll('#reviewConflictList .review-item').length;assert.equal(status(5).textContent,`${total} 項待核對`);
  input('iapSince','10/3');assert.equal(get('[data-band-node="prenatal:iap"]').classList.contains('warn'),false);assert.notEqual(status(2).textContent,'1 項待核對');
});

test('birth and course conflicts mark only the node whose block holds the target',({get,story,input,click,status,W})=>{
  story('A');click('#stageBand [data-flow-target="birthHistoryCard"]');input('birthResusStatus','performed');
  click('[data-add-birth="ppv"]');click('[data-add-birth="assessment"]');
  const ids=W.bandTest.S.birthEvents.map(e=>e.id);input(`event-${ids[0]}-minutes`,'5');input(`event-${ids[1]}-minutes`,'2');
  assert.equal(get('[data-band-node="birth:dr"]').classList.contains('warn'),true,'Out-of-order event times mark the delivery-room node');
  assert.equal(get('[data-band-node="birth:birth"]').classList.contains('warn'),false);
  assert.match(status(3).textContent,/項待核對/);
  input(`event-${ids[1]}-minutes`,'7');assert.equal(get('[data-band-node="birth:dr"]').classList.contains('warn'),false);
  story('D');input('obTransferFrom',get('#homeHosp').value||'TPEMMH');
  assert.equal(get('[data-band-node="course:obCare"]').classList.contains('warn'),true,'Transfer origin equal to our campus marks outside care');
  assert.equal(get('[data-band-node="course:route"]').classList.contains('warn'),false);assert.match(status(4).textContent,/1 項待核對/);
});

test('copy gate: unconfirmed prenatal data adds a reminder but still copies',async({W,get,click})=>{
  const copy=async()=>{click('#copy');await new Promise(r=>setImmediate(r));return get('#copyStatus').textContent;};
  let text=await copy();assert.equal(W.copies.length,1,'Copy is not blocked');assert.match(text,/產前資料仍是預設值，尚未確認/);
  click('#stageBand [data-flow-target="finalReviewCard"]');assert.equal(get('#copy').textContent,'複製病歷');text=await copy();assert.match(text,/尚未確認/);
  click('#stageBand [data-flow-target="prenatalCard"]');click('#prenatalNext');text=await copy();assert.doesNotMatch(text,/尚未確認/);assert.equal(W.copies.length,3);
  assert.equal(W.copies[0],W.copies[2],'The gate never changes the copied text');
});

(async()=>{
let failed=0;
for(const [name,run] of tests){try{await page(run);console.log('✓ '+name);}catch(e){failed++;console.error('✗ '+name+'\n'+e.stack);}}
console.log(`${tests.length-failed}/${tests.length} stage band checks passed`);
if(failed)process.exitCode=1;
})();
