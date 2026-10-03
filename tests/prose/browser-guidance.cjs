// Real Chrome acceptance for clinical guidance. Launch isolated CDP on port 9333.
// Only synthetic data; screenshots are local artifacts. No production writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const url=process.argv[2]||pathToFileURL(path.resolve(__dirname,'../../index.html')).href;
const screenshots=process.argv[3]||'/private/tmp';
async function main(){
 const target=await(await fetch('http://127.0.0.1:9333/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();
 const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 let id=0;const pending=new Map(),errors=[],layoutChecks=[];
 socket.addEventListener('message',event=>{const r=JSON.parse(event.data);if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails.text);const p=pending.get(r.id);if(!p)return;clearTimeout(p.timer);pending.delete(r.id);r.error?p.reject(Error(r.error.message)):p.resolve(r.result);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id,timer=setTimeout(()=>reject(Error('Timeout: '+method)),20000);pending.set(next,{resolve,reject,timer});socket.send(JSON.stringify({id:next,method,params}));});
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const trace=[];
 const navState=()=>ev(`({chapter:document.getElementById('flowChapter')?.textContent,phase:document.getElementById('flowDetail')?.textContent,focus:document.activeElement.id,top:document.getElementById('journeyWorkspace')?.getBoundingClientRect().top,offset:document.documentElement.style.getPropertyValue('--workflow-offset')})`);
 const click=async selector=>{
  const before=await navState();
  await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();if(!e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)))e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});})()`);await pause(80);
  const p=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return {x:r.x+r.width/2-visualViewport.offsetLeft,y:r.y+r.height/2-visualViewport.offsetTop,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),rect:{top:r.top,bottom:r.bottom}};})()`);assert.ok(p.hit,'Control hidden or covered: '+selector+' '+JSON.stringify(p));
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:p.x,y:p.y});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:p.x,y:p.y});await pause(100);
  trace.push({selector,before,after:await navState()});
 };
 const input=async(id,value)=>{const selector='#'+id;await click(selector);await ev(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(e.tagName==='SELECT'||e.type==='date'?'change':'input',{bubbles:true}));})()`);await pause(80);};
 const type=async(id,value)=>{await click('#'+id);await ev(`document.getElementById(${JSON.stringify(id)}).select()`);await send('Input.insertText',{text:value});await pause(100);assert.equal(await ev('document.activeElement.id'),id,'Typing must retain focus');};
 const phase=async key=>{if(await ev(`!!document.querySelector('#clinicalRail [data-phase-target="${key}"]')?.checkVisibility()`))await click(`#clinicalRail [data-phase-target="${key}"]`);else{await click('#phaseMenu > summary');await click(`#flowSubsteps [data-phase-target="${key}"]`);}};
 const chapter=async key=>{await click('#flowMenu > summary');await click(`#flowMenu [data-flow-target="${key}"]`);};
 const note=()=>ev("document.getElementById('note').textContent");
 const resize=async(width,height)=>{await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<800,screenWidth:width,screenHeight:height});await send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await pause(160);assert.equal(await ev('innerWidth'),width);assert.ok(await ev('document.documentElement.scrollWidth<=innerWidth+1'),'Horizontal overflow at '+width);};
 const align=async selector=>{await ev(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',behavior:'instant'})`);await pause(150);};
 const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshots,name),Buffer.from(r.data,'base64'));};
 const labelVisible=async selector=>{const r=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),n=document.getElementById('workflowNav').getBoundingClientRect();return {top:e.getBoundingClientRect().top,navBottom:n.bottom};})()`);assert.ok(r.top>=r.navBottom-1,'Target label covered: '+JSON.stringify(r));};
 const flatLayout=async()=>{
  const result=await ev(`(()=>{const root=document.getElementById('journeyWorkspace'),framed=e=>{const s=getComputedStyle(e);return ['Top','Right','Bottom','Left'].every(side=>parseFloat(s['border'+side+'Width'])>0);},panels=[root,...root.querySelectorAll('.phase-context,.support-before,.support-extra,.problem-details,.inherited-summary')].filter(e=>e.checkVisibility()),events=[...root.querySelectorAll('.clinical-event')].filter(e=>e.checkVisibility());return {width:innerWidth,framedPanels:panels.filter(framed).map(e=>e.id||e.className),tintedPanels:panels.filter(e=>getComputedStyle(e).backgroundColor!=='rgba(0, 0, 0, 0)').map(e=>e.id||e.className),nestedDisclosures:root.querySelectorAll('details details').length,maxEventFrames:Math.max(0,...events.map(e=>{let count=0;for(let p=e;p;p=p.parentElement)if(framed(p))count++;return count;})),hiddenEventLists:events.filter(e=>!!e.closest('details')).length};})()`);
  assert.deepEqual(result.framedPanels,[],'No extra panel frames');assert.deepEqual(result.tintedPanels,[],'No extra tinted panel layers');assert.equal(result.nestedDisclosures,0);assert.ok(result.maxEventFrames<=2,'At most section + event frame');assert.equal(result.hiddenEventLists,0);layoutChecks.push(result);
 };
 try{
  await send('Page.enable');await send('Runtime.enable');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
  for(let i=0;i<100;i++){if(await ev("!!document.getElementById('workflowNav')"))break;await pause(100);}
  await resize(1440,1050);await click('[data-story="D"]');await click('[data-seg="dest"] [data-v="NICU"]');await input('birthDate','2026-10-03');
  await chapter('birthHistoryCard');await click('[data-seg="delivery"] [data-v="cs"]');await input('gaW','37');await input('bw','2800');
  await phase('birth:birth');await input('birthBreathing','labored');await phase('birth:dr');await input('birthResusStatus','performed');await click('[data-add-birth="ppv"]');
  const birthId=await ev("document.querySelector('#birthEvents [data-event-id]').dataset.eventId");
  const beforeNav=await note();await phase('birth:drEnd');await phase('birth:dr');assert.equal(await note(),beforeNav,'Navigation cannot confirm NRP or rewrite note');
  assert.ok(await ev(`document.getElementById('event-${birthId}-pip').classList.contains('nrp-default')`));
  for(const width of [1440,390,320]){await resize(width,900);await phase('birth:dr');assert.ok(await ev("[...document.querySelectorAll('#birthEvents .event-tools button,#birthEvents .nrp-accept')].every(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44;})"),'Birth event controls need 44px touch targets');assert.equal(await ev(`getComputedStyle(document.getElementById('event-${birthId}-pip')).borderTopStyle`),'dashed');assert.equal(await note(),beforeNav);}
  await resize(1440,1050);await phase('birth:dr');
  await align('#context-birth-dr');await shot('nicu-guidance-birth-desktop.png');
  await phase('birth:drEnd');await input('birthFinalSupport','cpap');await click('#flowNext');assert.match(await ev("document.getElementById('flowDetail').textContent"),/外院照護/);
  await labelVisible('#journeyContext');await align('#journeyWorkspace');await flatLayout();await shot('nicu-guidance-outside-desktop.png');
  await click('#obM1Relation-choice-continued');assert.match(await note(),/CPAP was continued at the referring hospital/);
  const beforeHelp=await note();assert.equal(await ev("document.getElementById('obM1RelationHelp').open"),false);assert.equal(await ev("document.getElementById('obM1RelationSummary').checkVisibility()"),false);
  await click('#obM1RelationHelp > summary');assert.equal(await ev("document.getElementById('obM1RelationHelp').open"),true);assert.equal(await note(),beforeHelp);await click('#obM1RelationHelp > summary');
  await click('#obM1RelationDetails > summary');assert.equal(await ev("document.getElementById('obM1RelationSummary').checkVisibility()"),true);assert.equal(await note(),beforeHelp);await click('#obM1RelationDetails > summary');
  await phase('course:obConsult');await input('obReason','respiratory distress');await phase('course:obArrive');await type('obArrival','The infant had persistent tachypnea.');
  await click('#journeyWorkspace .optional-events > summary');await click('[data-add-stage-event="cpap"][data-event-phase="arrival"]');
  const eventId=await ev("document.querySelector('#obArriveEvents [data-event-id]').dataset.eventId");await input('event-'+eventId+'-minutes','25');await input('event-'+eventId+'-fiO2','30');
  const withEvent=await note();await click('#journeyWorkspace .optional-events > summary');assert.equal(await ev("document.querySelector('#journeyWorkspace .optional-events').open"),false);assert.equal(await ev(`document.getElementById('event-${eventId}-minutes').checkVisibility()`),true);assert.equal(await note(),withEvent);await align('#journeyWorkspace');await flatLayout();await shot('nicu-guidance-arrival-desktop.png');
  await phase('course:route');assert.match(await ev("document.getElementById('obRespRelationBefore').textContent"),/我方在外院.*CPAP/);await click('#obRespRelation-choice-continued');assert.equal(await ev("document.getElementById('obFiO2').value"),'');
  const complete=await note();
  for(const width of [390,320]){
   await resize(width,900);await phase('course:obCare');await align('#journeyWorkspace');await labelVisible('#journeyContext');
   assert.equal(await ev("document.getElementById('clinicalRail').checkVisibility()"),false);assert.ok(await ev("document.getElementById('workflowNav').getBoundingClientRect().bottom<165"),'Mobile navigation must leave room to write');
   assert.equal(await ev("document.querySelectorAll('#obM1RelationChoices small').length"),0);assert.ok(await ev("[...document.querySelectorAll('#obM1RelationChoices button')].filter(b=>b.checkVisibility()).every(b=>b.getBoundingClientRect().height>=44)"),'Concise choices retain 44px touch targets');
   await flatLayout();await shot('nicu-guidance-outside-'+width+'.png');
   await click('#obM1RelationHelp > summary');assert.equal(await ev("document.getElementById('obM1RelationHelp').open"),true);assert.equal(await note(),complete);await click('#obM1RelationHelp > summary');
   await phase('course:obArrive');await type('obArrival','The infant had persistent tachypnea.');const scroll=await ev("document.getElementById('journeyWorkspace').getBoundingClientRect().top");await click('#flowNext');await click('#flowBack');assert.equal(await ev('document.activeElement.id'),'obArrival');const returnedScroll=await ev("document.getElementById('journeyWorkspace').getBoundingClientRect().top");assert.ok(Math.abs(returnedScroll-scroll)<3,`Back restores viewport at ${width}px: ${scroll} → ${returnedScroll}`);assert.equal(await note(),complete);
   await flatLayout();await align('#journeyWorkspace');await shot('nicu-guidance-arrival-'+width+'.png');await click('#journeyWorkspace .optional-events > summary');await click('[data-add-stage-event="epinephrine"][data-event-phase="arrival"]');const epId=await ev("[...document.querySelectorAll('#obArriveEvents [data-event-id]')].at(-1).dataset.eventId");await click('#journeyWorkspace .optional-events > summary');
   await chapter('finalReviewCard');const before=await note();await click(`#reviewPendingList [data-review-target="#event-${epId}-drugDose"]`);assert.equal(await ev('document.activeElement.id'),'event-'+epId+'-drugDose');await labelVisible(`[for="event-${epId}-drugDose"]`);assert.match(await ev("document.getElementById('flowDetail').textContent"),/我方抵達外院/);assert.equal(await note(),before);await shot('nicu-guidance-review-jump-'+width+'.png');
   await click(`[data-event-id="${epId}"] [data-event-action="remove"]`);
  }
  await phase('course:obArrive');await input('event-'+eventId+'-phase','transport');assert.match(await ev("document.getElementById('flowDetail').textContent"),/轉送途中/);assert.equal(await ev(`document.querySelectorAll('[data-event-id="${eventId}"]').length`),1);assert.equal(await ev('document.activeElement.id'),'event-'+eventId+'-phase');await input('event-'+eventId+'-phase','arrival');assert.match(await ev("document.getElementById('flowDetail').textContent"),/我方抵達外院/);
  await resize(1440,1050);await chapter('admissionContext');await click('[data-story="C"]');await chapter('pathwayCard');await phase('course:brEval');assert.match(await ev("document.getElementById('journeyContext').textContent"),/兒科在 BR/);await align('#journeyWorkspace');await shot('nicu-guidance-br-desktop.png');
  await chapter('admissionContext');await click('[data-story="E"]');await click('[data-msel="readmitProblems"] [data-v="respiratory"]');await click('[data-seg="dest"] [data-v="NBC"]');await chapter('pathwayCard');await phase('course:illness');assert.equal(await ev("document.getElementById('readmitTSB').checkVisibility()"),false);await align('#journeyWorkspace');await shot('nicu-guidance-readmit-desktop.png');
  await resize(390,900);await phase('birth:dr');assert.match(await ev("document.getElementById('flowDetail').textContent"),/刀房/);await phase('course:evaluation');assert.match(await ev("document.getElementById('journeyContext').textContent"),/NBC/);await align('#journeyWorkspace');await flatLayout();await shot('nicu-guidance-readmit-mobile.png');
  await chapter('admissionContext');await click('#entryDirect');await chapter('birthHistoryCard');await click('[data-story="B"]');await phase('birth:birth');await ev("document.getElementById('flowNext').focus({preventScroll:true})");await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});await pause(100);assert.match(await ev("document.getElementById('flowDetail').textContent"),/出生後會診/);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,viewportWidths:[1440,390,320],scenarios:['birth','D','C','E','B'],nativeTyping:true,keyboard:true,reviewJump:true,noNRPConfirmationFromNavigation:true,returnRestoresPosition:true,flatLayout:{checks:layoutChecks.length,maxEventFrames:Math.max(...layoutChecks.map(c=>c.maxEventFrames)),nestedDisclosures:0,eventsVisibleWhenPickerClosed:true},screenshots},null,2));
 }catch(error){console.error(JSON.stringify(trace.slice(-12),null,2));await shot('nicu-guidance-failure.png').catch(()=>{});throw error;}
 finally{await send('Page.close').catch(()=>{});socket.close();for(const p of pending.values())clearTimeout(p.timer);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
