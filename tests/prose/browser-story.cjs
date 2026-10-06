// 故事線改版的真實排版量測（2026-10-06）：站內格線左緣、38px 控制項、帶子收合後 1440 寬不橫捲。虛構資料；獨立 CDP port 9333。
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
 const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/private/tmp/nicu-story-'+name+'.png',Buffer.from(r.data,'base64'));};
 const note=()=>ev("document.getElementById('note').textContent");
 const geometry=selector=>ev(`(()=>{const g=document.querySelector(${JSON.stringify(selector)}),r=g.getBoundingClientRect();return [...g.querySelectorAll('button')].filter(b=>b.checkVisibility()).map(b=>{const a=b.getBoundingClientRect();return [b.dataset.v||b.dataset.clearSeg,a.x-r.x,a.y-r.y,a.width,a.height];});})()`);

 // 同一站內所有控制項（chips、數字列、輸入框）的左緣座標集合；處置列也必須落在同一條線上。
 const lefts=root=>ev(`(()=>{const out=new Set(),heights=new Set(),odd=[];const root=document.querySelector(${JSON.stringify(root)});
   for(const ctl of root.querySelectorAll('.step>.ctl')){if(!ctl.checkVisibility())continue;for(const c of ctl.children){if(!c.checkVisibility()||c.tagName==='P')continue;out.add(Math.round(c.getBoundingClientRect().left));}}
   for(const b of root.querySelectorAll('.step .seg>button[data-v]:not(.choice-clear),.step .num input,.adders .add'))if(b.checkVisibility()){const h=Math.round(b.getBoundingClientRect().height);heights.add(h);if(h!==38&&innerWidth>=800)odd.push((b.id||b.dataset.v||b.className)+':'+h);}
   return {lefts:[...out].sort((a,b)=>a-b),heights:[...heights].sort((a,b)=>a-b),odd};})()`);
 const band=()=>ev(`(()=>{const s=document.getElementById('bandScroll');return {scrollWidth:s.scrollWidth,clientWidth:s.clientWidth,nodes:document.querySelectorAll('#stageBand .band-node').length};})()`);
 try{
  await send('Page.enable');await send('Page.bringToFront');await send('Runtime.enable');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});for(let i=0;i<100;i++){if(await ev("!!document.getElementById('note')?.textContent"))break;await pause(100);}
  await resize(1440);
  // A：產前 standby、壓胸＋Epi 全骨架
  await click('#entryDirect');await click('[data-story="A"]');await click('[data-seg="dest"] [data-v="NICU"]');await click('[data-ladder-v="cpr"]');
  await chapter('birthHistoryCard');
  const report={};
  for(const [name,target] of [['info','birth:info'],['birth','birth:birth'],['dr','birth:dr'],['drEnd','birth:drEnd']]){
   await phase(target);const sel=name==='info'?'#birthHistoryCard':'#birthStage-'+name;
   if(name!=='info'){await ev(`document.querySelector('#leaveMore').open=true`);}
   const r=await lefts(name==='info'?'#birthHistoryCard > .step, #birthHistoryCard':sel);report['A-'+name]=r;
   assert.equal(r.lefts.length,1,'A '+name+' controls share one left edge: '+JSON.stringify(r));
   assert.deepEqual(r.heights.filter(h=>h!==38),[],'A '+name+' buttons and number fields are 38px: '+JSON.stringify(r));
  }
  await shot('A-dr-1440');
  // D：外接全部節點（含轉送途中），帶子在 1440 寬不橫捲
  await chapter('admissionContext');await click('[data-story="D"]');await click('[data-band-opt="route"]');
  for(const stage of ['admissionContext','prenatalCard','birthHistoryCard','pathwayCard','finalReviewCard']){await chapter(stage);const b=await band();report['D-band-'+stage]=b;assert.ok(b.scrollWidth<=b.clientWidth+1,'D band fits at 1440 with '+stage+' current: '+JSON.stringify(b));}
  for(const stop of ['obCare','obArrive','route']){
   await phase('course:'+stop);await click('[data-add-'+(stop==='route'?'course':'stage-event')+'="ppv"]'+(stop==='route'?'':'[data-event-phase="'+(stop==='obCare'?'outside':'arrival')+'"]'));
   const r=await lefts('#journeyWorkspace');report['D-'+stop]=r;assert.equal(r.lefts.length,1,'D '+stop+' left edge: '+JSON.stringify(r));assert.deepEqual(r.odd,[],'D '+stop+' controls are 38px: '+JSON.stringify(r));
  }
  await shot('D-route-1440');
  for(const width of [1366,1024]){await resize(width);await chapter('birthHistoryCard');report['D-band-'+width]=await band();}
  await resize(390);await phase('birth:dr');const mobile=await lefts('#birthStage-dr');report['A-dr-390']=mobile;assert.deepEqual(mobile.heights.filter(h=>h<44),[],'Mobile keeps 44px targets');await shot('D-dr-390');
  assert.deepEqual(errors,[]);fs.writeFileSync('/private/tmp/nicu-story-layout.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(error){await shot('failure').catch(()=>{});throw error;}
 finally{await send('Page.close').catch(()=>{});socket.close();for(const p of pending.values())clearTimeout(p.timer);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
