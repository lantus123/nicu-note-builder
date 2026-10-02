// Real Chrome smoke test through CDP. Start isolated Chrome with port 9333.
// Usage: node browser-workflow.cjs [file-or-preview-url]
// Artifacts contain synthetic test data only and are written to /private/tmp.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),path=require('node:path');
const url=process.argv[2]||pathToFileURL(path.resolve(__dirname,'../../index.html')).href;
async function main(){
  const target=await(await fetch('http://127.0.0.1:9333/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();
  const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  let seq=0;const pending=new Map(),errors=[];
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);const p=pending.get(m.id);if(!p)return;clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(Error(method)),20000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
  const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  let clicks=0,entries=0;
  const position=async selector=>{
    await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center',inline:'center',behavior:'instant'});})()`);await pause(100);
    return ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,w:r.width,h:r.height,hit:e.contains(document.elementFromPoint(x,y))};})()`);
  };
  const click=async s=>{const r=await position(s);assert.ok(r.w&&r.h&&r.hit,'Control hidden or covered: '+s);await send('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x,y:r.y,button:'left',clickCount:1});clicks++;await pause(70);};
  const input=async(id,value)=>{const r=await position('#'+id);assert.ok(r.w&&r.h&&r.hit,'Input hidden or covered: '+id);await ev(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.focus({preventScroll:true});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(e.tagName==='SELECT'||e.type==='date'?'change':'input',{bubbles:true}));})()`);entries++;};
  const note=()=>ev(`document.querySelector('#note').textContent`);
  const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/private/tmp/'+name,Buffer.from(r.data,'base64'));};
  const at=async s=>{await ev(`document.querySelector(${JSON.stringify(s)}).scrollIntoView({block:'start',behavior:'instant'})`);await pause(120);};
  try{
    await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    let ready=false;for(let i=0;i<100;i++){ready=await ev(`!!document.querySelector('#admissionContext')&&!!document.querySelector('#note')?.textContent`);if(ready)break;await pause(100);}assert.ok(ready);
    const entryTop=await ev(`Math.round(document.querySelector('#entryRoutes').getBoundingClientRect().top+scrollY)`);assert.ok(entryTop<1000);
    await click('[data-story="E"]');
    await click('[data-seg="readmitSource"] [data-v="clinic"]');await click('[data-msel="readmitProblems"] [data-v="respiratory"]');await click('[data-msel="readmitProblems"] [data-v="poor-feeding"]');
    await click('[data-seg="dest"] [data-v="NBC"]');
    await input('birthDate','2026-09-15');await input('birthTime','06:20');await input('admissionDate','2026-10-02');await input('admissionTime','14:37');
    assert.match(await note(),/day of life 18/);
    await at('#admissionContext');await shot('nicu-forward-entry-desktop.png');
    await click('#admissionContext [data-flow-target="prenatalCard"]');await input('gravida','2');await input('para','2');await input('matAge','32');
    await click('#confirmMaternalNegatives');await click('[data-scrall] [data-v="neg"]');
    await click('.stage-actions [data-flow-target="birthHistoryCard"]');await click('[data-seg="gender"] [data-v="male"]');await input('gaW','39');await input('bw','3200');await click('[data-seg="delivery"] [data-v="nsd"]');
    await input('birthHosp','Example Birth Clinic');await input('ap1','9');await input('ap5','10');await input('birthBreathing','crying');await input('birthResusStatus','none');
    await click('#birthHistoryCard [data-flow-target="pathwayCard"]');
    await click('[data-seg="readmitPrior"] [data-v="uneventful"]');await input('readmitDischargeDate','2026-09-17');await input('readmitDischargeWeight','3080');await click('[data-seg="readmitFeeding"] [data-v="breast milk"]');
    await click('[data-msel="readmitBaseline"] [data-v="feeding well"]');await click('[data-msel="readmitBaseline"] [data-v="active"]');
    await click('#journeyNext');await input('readmitOnsetDOL','17');await input('readmitCourseType','new');await click('[data-rm-chip="rm_respiratory_symptoms"][data-v="tachypnea"]');await click('[data-rm-chip="rm_respiratory_symptoms"][data-v="cough"]');
    await input('rm_feeding_usual','90');await input('rm_feeding_current','45');await input('rm_feeding_frequency','every 3 hours');await click('[data-set-field="readmitUrine"][data-v="remained adequate"]');await input('readmitSickContact','An older sibling had URI symptoms.');
    await at('#journeyWorkspace');await shot('nicu-forward-E-desktop.png');
    await click('#journeyNext');assert.equal(await ev(`!!document.querySelector('#readmitTSB').getClientRects().length`),false);
    await input('readmitCurrentWeight','3450');await input('readmitSpO2','96');await input('readmitEvaluation','Mild subcostal retractions were noted.');await click('#admissionStatusBody [data-seg="resp"] [data-v="room air"]');
    await click('#pathwayCard [data-flow-target="finalReviewCard"]');await input('tentDx','respiratory distress with poor feeding');
    const text=await note(),forwardClicks=clicks,forwardEntries=entries;assert.match(text,/Example Birth Clinic/);assert.match(text,/receiving breast milk/);assert.match(text,/90 to 45 mL/);assert.match(text,/14:37/);assert.doesNotMatch(text,/bilirubin|notable for an older sibling had/);
    fs.writeFileSync('/private/tmp/nicu-forward-synthetic-note.txt',text);
    await click('[data-tab="acc"]');await click('#useAdmissionResp');await click('[data-seg="acceptanceResp"] [data-v="NC"]');await click('[data-tab="adm"]');assert.equal(await note(),text);
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(200);await at('#admissionContext');await shot('nicu-forward-entry-mobile.png');
    assert.ok(await ev(`document.documentElement.scrollWidth<=innerWidth+1`),'Mobile overflow');
    await click('[data-stop-toggle="illness"]');await at('#journeyWorkspace');await shot('nicu-forward-E-mobile.png');
    const rectangles=await ev(`(()=>{const t=document.querySelector('.tabs').getBoundingClientRect(),n=document.querySelector('.flow-nav').getBoundingClientRect(),p=document.querySelector('#journeyProgress').getBoundingClientRect();return {tabBottom:t.bottom,navTop:n.top,navBottom:n.bottom,progressTop:p.top};})()`);
    assert.ok(rectangles.navTop>=rectangles.tabBottom-1,'Tabs cover the workflow navigation');assert.ok(rectangles.progressTop>=rectangles.navBottom-1,'Navigation covers current stage');
    await click('#journeyPrev');assert.equal(await ev(`document.querySelector('#readmitDischargeWeight').value`),'3080');await click('#journeyNext');assert.equal(await ev(`document.querySelector('#rm_feeding_current').value`),'45');
    // Existing routes must still expose every stage after the birth controls move.
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    const routeStages={};
    for(const [story,expected] of [['A',2],['B',2],['C',3],['D',5]]){
      if(story==='A')await click('#entryDirect');
      await click(`[data-story="${story}"]`);
      const stops=await ev(`[...document.querySelectorAll('#journey > li')].filter(e=>!e.hidden).map(e=>e.dataset.stop)`);
      assert.equal(stops.length,expected,story+' stage count');
      for(const stop of stops){await click(`[data-stop-toggle="${stop}"]`);assert.ok(await ev(`document.querySelector('#journeyWorkspace').children.length>0`));}
      routeStages[story]=stops.length;
    }
    await click('[data-story="E"]');assert.equal(await note(),text,'Returning to E must restore its complete narrative');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,url,entryTop,forwardClicks,forwardEntries,forcedBackwardSteps:0,EStages:3,routeStages,DOL:18,desktop:'1440×1000',mobile:'390×844',rectangles,screenshots:'/private/tmp/nicu-forward-*.png',syntheticNote:'/private/tmp/nicu-forward-synthetic-note.txt'},null,2));
  }finally{await send('Page.close').catch(()=>{});ws.close();for(const p of pending.values())clearTimeout(p.timer);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
