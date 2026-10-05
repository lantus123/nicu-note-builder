// Real Chrome layout/interaction checks. Synthetic data only. Isolated CDP port 9333.
// Run browser suites serially: native pointer/keyboard focus belongs to one page.
// Zoom-equivalent viewports test reflow, not native browser zoom or iOS Safari.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const url=process.argv[2]||pathToFileURL(path.resolve(__dirname,'../../index.html')).href;
async function main(){
 const target=await(await fetch('http://127.0.0.1:9333/json/new?'+encodeURIComponent(url),{method:'PUT',signal:AbortSignal.timeout(10000)})).json();
 const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 let seq=0;const pending=new Map(),errors=[],checks=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(Error('Timeout: '+method)),20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const click=async selector=>{
  await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();if(!e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)))e.scrollIntoView({block:'center',behavior:'instant'});})()`);await pause(70);
  const p=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return {x:r.x+r.width/2-visualViewport.offsetLeft,y:r.y+r.height/2-visualViewport.offsetTop,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})()`);assert.ok(p.hit,'Covered: '+selector);
  for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,x:p.x,y:p.y});await pause(80);
 };
 const input=async(id,value)=>{await click('#'+id);await ev(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(e.tagName==='SELECT'||e.type==='date'?'change':'input',{bubbles:true}));})()`);};
 // 時序帶取代原章節／階段選單：段＝帶子標頭，病程站點＝帶子節點（窄螢幕帶子自己橫向捲動）。
 const phase=async key=>click(`#stageBand [data-phase-target="${key}"]`);
 const chapter=async key=>click(`#stageBand [data-flow-target="${key}"]`);
 const resize=async(width,height=900,scale=1)=>{await send('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight:height,deviceScaleFactor:scale,mobile:width<600});await send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await pause(120);};
 const align=async selector=>{await ev(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',behavior:'instant'})`);await pause(100);};
 const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/private/tmp/nicu-clarity-'+name+'.png',Buffer.from(r.data,'base64'));};
 const note=()=>ev("document.getElementById('note').textContent");
 const geometry=selector=>ev(`(()=>{const g=document.querySelector(${JSON.stringify(selector)}),r=g.getBoundingClientRect();return [...g.querySelectorAll('button')].filter(b=>b.checkVisibility()).map(b=>{const a=b.getBoundingClientRect();return [b.dataset.v||b.dataset.clearSeg,a.x-r.x,a.y-r.y,a.width,a.height];});})()`);
 const layout=async label=>{
  const result=await ev(`(()=>{
   const visible=e=>e.checkVisibility()&&e.getBoundingClientRect().width>0,rect=e=>e.getBoundingClientRect(),scroller=document.getElementById('bandScroll'),form=document.querySelector('.wrap'),preview=document.querySelector('.dock');
   const controls=[...document.querySelectorAll('input,select,textarea,button')].filter(visible),bad=[];
   for(const e of controls){const box=e.closest('.card,.clinical-event');if(!box)continue;const r=rect(e),b=rect(box);if(r.left<b.left-1||r.right>b.right+1)bad.push(e.id||e.textContent.slice(0,45));if(e.tagName==='BUTTON'&&e.scrollWidth>e.clientWidth+2)bad.push('clipped '+e.textContent);}
   const railClips=rect(scroller).right>innerWidth+1||rect(scroller).left<-1?['band outside viewport']:[],bandScrolls=scroller.scrollWidth>scroller.clientWidth+1,current=document.querySelector('#stageBand .band-seg.cur'),currentClipped=!!current&&scroller.checkVisibility()&&(rect(current).left<rect(scroller).left-1||rect(current).left>rect(scroller).right-40||rect(current).width<=rect(scroller).width&&rect(current).right>rect(scroller).right+1);
   const nav=document.getElementById('workflowNav');return {width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,bad,railClips,bandScrolls,currentClipped,previewCollapsed:preview.classList.contains('collapsed'),gap:rect(preview).left-rect(form).right,navHeight:rect(nav).height,navBackground:getComputedStyle(nav).backgroundColor};
  })()`);
  checks.push({label,...result});assert.ok(result.overflow<=1,label+' document overflow '+JSON.stringify(result));assert.deepEqual(result.bad,[],label+' controls overflow');assert.deepEqual(result.railClips,[],label+' rail clips');
  if(result.width>=1180){assert.equal(result.previewCollapsed,false);assert.ok(Math.abs(result.gap-24)<1,'Shared grid gap: '+JSON.stringify(result));}
  else assert.equal(result.previewCollapsed,true);
  if(result.width>=1440)assert.equal(result.bandScrolls,false,label+' band fits without scrolling at '+result.width);
  assert.equal(result.currentClipped,false,label+' current stage must be scrolled into the band view');
  assert.doesNotMatch(result.navBackground,/rgba\(.*0\)$/,'Navigation must be opaque');
 };
 try{
  await send('Page.enable');await send('Page.bringToFront');await send('Runtime.enable');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});for(let i=0;i<100;i++){if(await ev("!!document.getElementById('note')?.textContent"))break;await pause(100);}
  await resize(1440);await click('[data-story="D"]');await click('[data-seg="dest"] [data-v="NICU"]');await input('birthDate','2026-10-03');
  await chapter('birthHistoryCard');await click('[data-seg="gender"] [data-v="male"]');await input('gaW','37');await input('bw','2800');await click('[data-seg="delivery"] [data-v="cs"]');
  await phase('birth:dr');await input('birthResusStatus','performed');await click('[data-add-birth="ppv"]');await click('[data-add-birth="epinephrine"]');
  for(const width of [1920,1440,1366,1280,1024,900,800,390,360,320]){await resize(width);await phase('birth:dr');await align('#birthEvents');await layout('birth-events');if([1440,320].includes(width))await shot('birth-'+width);}
  await resize(1440);await phase('birth:drEnd');await input('birthFinalSupport','o2');await phase('course:obCare');await click('#obM1Relation-choice-continued');await phase('course:obArrive');await input('obArrival','The infant had mild retractions.');await phase('course:route');await click('#obRespRelation-choice-continued');
  for(const theme of ['light','dark']){
   await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
   for(const width of [1920,1440,1366,1280,1024,900,800,390,360,320]){
    await resize(width);await phase('course:route');await align('#journeyWorkspace');await layout('transport-'+theme);
    const before=await geometry('[data-msel="obSx"]');await click('[data-msel="obSx"] [data-v="tachypnea"]');assert.deepEqual(await geometry('[data-msel="obSx"]'),before,'Multi-selection must not move siblings at '+width);await click('[data-msel="obSx"] [data-v="tachypnea"]');
    await align('#journeyWorkspace');if([1920,1366,1024,390,320].includes(width))await shot('transport-'+theme+'-'+width);
   }
  }
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
  for(const scale of [1,1.25,1.5]){await resize(Math.round(1440/scale),Math.round(1000/scale),scale);await phase('course:route');await align('#journeyWorkspace');await layout('zoom-equivalent-'+scale);}
  await resize(1366);await phase('course:obArrive');const beforePreview=await note(),scroll=await ev('scrollY');await click('#previewStage');assert.equal(await note(),beforePreview);assert.equal(await ev('scrollY'),scroll,'Preview must not scroll the form');assert.ok(await ev('document.getElementById("previewBody").scrollTop>0'));await shot('current-stage-preview');
  await chapter('admissionContext');const beforeRoute=await note();await click('[data-story="D"]');assert.equal(await note(),beforeRoute);assert.equal(await ev("document.querySelector('[data-story=\"D\"]').getAttribute('aria-checked')"),'true');
  const beforeDest=await geometry('[data-seg="dest"]');await click('[data-seg="dest"] [data-v="NICU"]');assert.equal(await note(),beforeRoute);assert.deepEqual(await geometry('[data-seg="dest"]'),beforeDest);
  await chapter('prenatalCard');for(const width of [1920,1366,1024,390,320]){await resize(width);await align('#prenatalCard');await layout('prenatal');if([1366,320].includes(width))await shot('prenatal-'+width);}
  for(const story of ['A','B','C','E']){
   await resize(1366);await chapter('admissionContext');if(['A','B'].includes(story)){await click('#entryDirect');await chapter('birthHistoryCard');}await click(`[data-story="${story}"]`);
   if(story==='E'){await click('[data-seg="dest"] [data-v="NBC"]');await click('[data-msel="readmitProblems"] [data-v="respiratory"]');await click('[data-msel="readmitProblems"] [data-v="poor-feeding"]');}
   await phase('course:'+(story==='E'?'illness':'route'));
   for(const width of [1366,1024,390,320]){await resize(width);await align('#journeyWorkspace');await layout('story-'+story);if(width===1366||story==='E'&&width===320)await shot('story-'+story+'-'+width);}
   if(story==='E')assert.equal(await ev("document.getElementById('readmitTSB').checkVisibility()"),false);
  }
  // Stress all eight E modules, including native date-time controls and long labels.
  await resize(1366);await chapter('admissionContext');
  const unselected=await ev(`[...document.querySelectorAll('[data-msel="readmitProblems"] button[data-v]')].filter(b=>b.getAttribute('aria-pressed')!=='true').map(b=>b.dataset.v)`);
  for(const value of unselected)await click(`[data-msel="readmitProblems"] [data-v="${value}"]`);
  await phase('course:illness');await input('rm_fever_time','2026-10-03T10:30');
  for(const width of [1366,1024,390,320]){await resize(width);await align('#readmitModules');await layout('all-E-modules');if(width===320)await shot('all-E-modules-mobile');}
  await phase('course:evaluation');assert.equal(await ev("document.getElementById('readmitTSB').checkVisibility()"),true);await layout('E-bilirubin-when-selected');
  await resize(1366);await chapter('finalReviewCard');await align('#finalReviewCard');await layout('review');await shot('review');
  for(const tab of ['plan','acc','proc']){await click(`[data-tab="${tab}"]`);for(const width of [1366,1024,320]){await resize(width);await ev('window.scrollTo(0,0)');await layout('tab-'+tab);if(width===1366)await shot('tab-'+tab);}}
  assert.deepEqual(errors,[]);const report={ok:true,checks:checks.length,viewports:[1920,1440,1366,1280,1024,900,800,390,360,320],themes:['light','dark'],zoomEquivalent:[1,1.25,1.5],nativeBrowserZoom:false,actualIOS:false,observations:checks,errors};fs.writeFileSync('/private/tmp/nicu-clarity-layout.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,observations:undefined},null,2));
 }catch(error){console.error(JSON.stringify(checks.slice(-3),null,2));await shot('failure').catch(()=>{});throw error;}
 finally{await send('Page.close').catch(()=>{});socket.close();for(const p of pending.values())clearTimeout(p.timer);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
