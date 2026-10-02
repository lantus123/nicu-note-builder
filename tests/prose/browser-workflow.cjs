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
  const resize=async(width,height,mobile=false)=>{
    await send('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight:height,deviceScaleFactor:1,mobile});
    await send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await pause(160);
    const dimensions=await ev(`({width:innerWidth,clientWidth:document.documentElement.clientWidth,visualWidth:visualViewport.width,scale:visualViewport.scale})`);
    assert.equal(dimensions.clientWidth,width,'CSS viewport must match requested width: '+JSON.stringify(dimensions));
    assert.equal(dimensions.width,width,'No offscreen field may expand the mobile layout viewport: '+JSON.stringify(dimensions));
    assert.ok(Math.abs(dimensions.visualWidth-width)<1,'Visual viewport must match the screenshot width: '+JSON.stringify(dimensions));
  };
  let clicks=0,entries=0;
  const position=async selector=>{
    await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});const r=e.getBoundingClientRect(),hit=e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));if(!hit)e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});})()`);await pause(100);
    return ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,inputX:x-visualViewport.offsetLeft,inputY:y-visualViewport.offsetTop,w:r.width,h:r.height,hit:e.contains(document.elementFromPoint(x,y))};})()`);
  };
  // CDP pointer coordinates use the visual viewport; DOM rects use the layout viewport.
  // Mobile scrollIntoView can move the visual viewport even when scale is 1.
  const click=async s=>{const r=await position(s);assert.ok(r.w&&r.h&&r.hit,'Control hidden or covered: '+s);await send('Input.dispatchMouseEvent',{type:'mousePressed',x:r.inputX,y:r.inputY,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.inputX,y:r.inputY,button:'left',clickCount:1});clicks++;await pause(70);};
  const input=async(id,value)=>{const r=await position('#'+id);assert.ok(r.w&&r.h&&r.hit,'Input hidden or covered: '+id);await ev(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.focus({preventScroll:true});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(e.tagName==='SELECT'||e.type==='date'?'change':'input',{bubbles:true}));})()`);entries++;};
  const typeText=async(id,value)=>{await click('#'+id);await ev(`document.getElementById(${JSON.stringify(id)}).select()`);await send('Input.insertText',{text:value});assert.equal(await ev(`document.getElementById(${JSON.stringify(id)}).value`),value);entries++;};
  const chapter=async id=>{await click('#flowMenu > summary');await click(`#flowMenu [data-flow-target="${id}"]`);};
  const note=()=>ev(`document.querySelector('#note').textContent`);
  const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/private/tmp/'+name,Buffer.from(r.data,'base64'));};
  const at=async s=>{await ev(`document.querySelector(${JSON.stringify(s)}).scrollIntoView({block:'start',behavior:'instant'})`);await pause(120);};
  try{
    await send('Page.enable');await send('Runtime.enable');
    let ready=false;for(let i=0;i<100;i++){ready=await ev(`!!document.querySelector('#admissionContext')&&!!document.querySelector('#note')?.textContent`);if(ready)break;await pause(100);}assert.ok(ready);
    await resize(1440,1000); // A remote page may not have a documentElement when the target first opens.
    const entryTop=await ev(`Math.round(document.querySelector('#entryRoutes').getBoundingClientRect().top+scrollY)`);assert.ok(entryTop<1000);
    const today=await ev(`(()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());})()`);
    assert.equal(await ev(`document.querySelector('#admissionDate').value`),today);
    assert.equal(await ev(`document.querySelector('#admissionDateDetails').open`),false);
    assert.equal(await ev(`document.querySelector('#admissionDate').checkVisibility()`),false,'Default admission date must not require an input');
    assert.ok(await ev(`[...document.querySelectorAll('#entryRoutes .d, #entryRoutes .p, #entryRoutes .k')].every(e=>e.getClientRects().length&&getComputedStyle(e).display!=='none')`),'Scenario descriptions must be visible');
    await input('birthDate',today);assert.match(await note(),/day of life 1\b/);
    assert.equal(await ev(`document.querySelector('#admissionDateDetails').open`),false);
    clicks=0;entries=0;
    await click('[data-story="E"]');
    await click('[data-seg="readmitSource"] [data-v="clinic"]');await click('[data-msel="readmitProblems"] [data-v="respiratory"]');await click('[data-msel="readmitProblems"] [data-v="poor-feeding"]');
    await click('[data-seg="dest"] [data-v="NBC"]');
    await input('birthDate','2026-09-15');await input('birthTime','06:20');
    await click('#admissionDateDetails > summary');await input('admissionDate','2026-10-02');await input('admissionTime','14:37');await click('#admissionDateDetails > summary');
    assert.match(await ev(`document.querySelector('#admissionDateSummary').textContent`),/2026-10-02.*14:37/);
    assert.match(await note(),/day of life 18/);
    assert.equal(await ev(`document.querySelector('#copy').dataset.primary`),'false');
    await at('#admissionContext');await shot('nicu-forward-entry-desktop.png');
    await click('#admissionContext [data-flow-target="prenatalCard"]');await input('gravida','2');await input('para','2');await input('matAge','32');
    await click('[data-scrall] [data-v="neg"]');
    await click('#confirmPrenatalNext');await click('[data-seg="gender"] [data-v="male"]');await input('gaW','39');await input('bw','3200');await click('[data-seg="delivery"] [data-v="nsd"]');
    await input('birthHosp','Example Birth Clinic');await input('ap1','9');await input('ap5','10');await input('birthBreathing','crying');await input('birthResusStatus','none');
    await click('#birthHistoryCard [data-flow-target="pathwayCard"]');
    await click('[data-seg="readmitPrior"] [data-v="uneventful"]');await input('readmitDischargeDate','2026-09-17');await input('readmitDischargeWeight','3080');await click('[data-seg="readmitFeeding"] [data-v="breast milk"]');
    await click('[data-msel="readmitBaseline"] [data-v="feeding well"]');await click('[data-msel="readmitBaseline"] [data-v="active"]');
    await click('#journeyNext');await input('readmitOnsetDOL','17');await input('readmitCourseType','new');await click('[data-rm-chip="rm_respiratory_symptoms"][data-v="tachypnea"]');await click('[data-rm-chip="rm_respiratory_symptoms"][data-v="cough"]');
    await input('rm_feeding_usual','90');await input('rm_feeding_current','45');await input('rm_feeding_frequency','every 3 hours');await click('[data-set-field="readmitUrine"][data-v="remained adequate"]');await typeText('readmitSickContact','An older sibling had URI symptoms.');
    assert.equal(await ev(`document.querySelector('#readmitIntake').checkVisibility()`),false);
    assert.match(await ev(`document.querySelector('#readmitFeedingSummary').textContent`),/90 → 45.*減少/);
    await at('#journeyWorkspace');await shot('nicu-forward-E-desktop.png');
    await click('#journeyNext');assert.equal(await ev(`!!document.querySelector('#readmitTSB').getClientRects().length`),false);
    await input('readmitCurrentWeight','3450');await input('readmitSpO2','96');await input('readmitEvaluation','Mild subcostal retractions were noted.');await click('#admissionStatusBody [data-seg="resp"] [data-v="room air"]');
    await click('#journeyNext');await typeText('tentDx','respiratory distress with poor feeding');
    assert.equal(await ev(`document.querySelector('#copy').dataset.primary`),'true');
    await at('#finalReviewCard');await shot('nicu-forward-review-desktop.png');
    const text=await note(),forwardClicks=clicks,forwardEntries=entries;assert.match(text,/Example Birth Clinic/);assert.match(text,/receiving breast milk/);assert.match(text,/90 to 45 mL/);assert.match(text,/14:37/);assert.doesNotMatch(text,/bilirubin|notable for an older sibling had/);
    fs.writeFileSync('/private/tmp/nicu-forward-synthetic-note.txt',text);
    await click('[data-tab="acc"]');await click('#useAdmissionResp');await click('[data-seg="acceptanceResp"] [data-v="NC"]');await click('[data-tab="adm"]');assert.equal(await note(),text);
    await resize(390,844,true);await at('#admissionContext');await shot('nicu-forward-entry-mobile.png');
    assert.ok(await ev(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`),'Mobile overflow');
    assert.ok(await ev(`[...document.querySelectorAll('#entryRoutes .d, #entryRoutes .p, #entryRoutes .k')].every(e=>e.getClientRects().length&&getComputedStyle(e).display!=='none')`),'Mobile scenario descriptions must be visible');
    assert.equal(await ev(`document.querySelector('#admissionDateDetails').open`),false);
    await click('[data-stop-toggle="illness"]');await at('#journeyWorkspace');await shot('nicu-forward-E-mobile.png');
    const rectangles=await ev(`(()=>{const t=document.querySelector('.tabs').getBoundingClientRect(),n=document.querySelector('.flow-nav').getBoundingClientRect();return {tabBottom:t.bottom,navTop:n.top,navBottom:n.bottom,thirdTierVisible:document.querySelector('#journeyProgress').checkVisibility()};})()`);
    assert.ok(rectangles.navTop>=rectangles.tabBottom-1,'Tabs cover the workflow navigation');assert.equal(rectangles.thirdTierVisible,false,'Mobile has only two fixed tiers');assert.ok(rectangles.navBottom<150,'Fixed navigation leaves enough room for the form');
    assert.ok(await ev(`document.querySelector('#journeyWorkspace').getBoundingClientRect().top>=document.querySelector('#workflowNav').getBoundingClientRect().bottom+6`),'Workspace heading must not be covered');
    assert.match(await ev(`document.querySelector('#flowDetail').textContent`),/症狀與變化.*2\/3/);
    await at('#readmitGeneral');await shot('nicu-forward-feeding-mobile.png');
    // Native keyboard text entry and switching stages must keep focus/value and relative scroll.
    await typeText('readmitFeedingNote','The infant required frequent pauses during feeds.');
    const beforeBack=await ev(`-document.querySelector('#journeyWorkspace').getBoundingClientRect().top`);
    await click('#flowNext');await click('#flowBack');
    const afterBack=await ev(`-document.querySelector('#journeyWorkspace').getBoundingClientRect().top`);
    assert.ok(Math.abs(beforeBack-afterBack)<3,'Returning to a stage should restore its relative viewport');
    assert.equal(await ev(`document.activeElement.id`),'readmitFeedingNote');
    assert.equal(await ev(`document.querySelector('#readmitFeedingNote').value`),'The infant required frequent pauses during feeds.');
    await input('readmitFeedingNote','');
    for(const width of [320,360,390]){
      await resize(width,844,true);await at('#journeyWorkspace');
      assert.ok(await ev(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`),'Overflow at '+width);
      await click('#flowMenu > summary');assert.ok((await position('#flowMenu [data-flow-target="birthHistoryCard"]')).hit,'Chapter menu must be tappable at '+width);
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});assert.equal(await ev(`document.querySelector('#flowMenu').open`),false);
      await shot('nicu-forward-E-mobile-'+width+'.png');
    }
    await chapter('finalReviewCard');await shot('nicu-forward-review-mobile.png');assert.equal(await ev(`document.querySelector('#copy').dataset.primary`),'true');
    await chapter('pathwayCard');
    await click('#journeyPrev');assert.equal(await ev(`document.querySelector('#readmitDischargeWeight').value`),'3080');await click('#journeyNext');assert.equal(await ev(`document.querySelector('#rm_feeding_current').value`),'45');
    // Existing routes must still expose every stage after the birth controls move.
    await resize(1440,1000);
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
    // Preserve a prior qualitative statement, explicitly resolve it, and undo the resolution.
    await click('[data-stop-toggle="illness"]');await input('rm_feeding_usual','90');await input('rm_feeding_current','45');
    await click('[data-msel="readmitProblems"] [data-v="poor-feeding"]');
    await click('[data-set-field="readmitIntake"][data-v="remained at the usual level"]');
    await click('[data-msel="readmitProblems"] [data-v="poor-feeding"]');
    assert.equal(await ev(`document.querySelector('#readmitIntakeReview').dataset.conflict`),'true');
    await at('#readmitGeneral');await shot('nicu-forward-intake-conflict.png');
    await click('#clearPreviousIntake');assert.equal(await ev(`document.querySelector('#readmitIntake').value`),'');
    await click('#restorePreviousIntake');assert.equal(await ev(`document.querySelector('#readmitIntake').value`),'remained at the usual level');
    await click('#clearPreviousIntake');assert.equal(await note(),text);
    // Short viewport: expanded preview and its controls still remain usable.
    await resize(390,540,true);await click('#dockToggle');assert.equal(await ev(`document.querySelector('#previewBody').hidden`),false);
    await click('#previewReading');await click('#dockToggle');await at('#readmitGeneral');await shot('nicu-forward-short-mobile.png');
    assert.ok((await position('#flowNext')).hit);assert.ok((await position('#copy')).hit);
    // Fresh direct and outborn admissions: do not rely on values from the E case.
    await resize(1366,768);await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
    const fresh=async()=>{const previous=await ev('performance.timeOrigin');await send('Page.reload',{ignoreCache:true});for(let i=0;i<100;i++){if(await ev(`performance.timeOrigin!==${previous}&&!!document.querySelector('#workflowNav')&&document.readyState==='complete'`))return;await pause(100);}throw Error('Reload did not initialize');};
    const background=async(kind)=>{
      await click(kind==='A'?'#entryDirect':'[data-story="D"]');await click('[data-seg="dest"] [data-v="NICU"]');await input('birthDate',today);
      await click('#flowNext');await input('gravida','2');await input('para','2');await input('matAge','30');await click('[data-scrall] [data-v="neg"]');
      await click('#confirmPrenatalNext');await click('[data-seg="gender"] [data-v="male"]');await input('gaW',kind==='A'?'35':'37');await input('bw',kind==='A'?'2300':'2800');await click('[data-seg="delivery"] [data-v="nsd"]');await input('ap1','8');await input('ap5','9');
    };
    await fresh();await background('A');await click('[data-story="A"]');await click('[data-msel="pwSbR"] [data-v="preterm labor"]');
    await input('birthBreathing','labored');await input('birthResusStatus','performed');await click('[data-add-birth="ppv"]');
    const eventId=await ev(`document.querySelector('#birthEvents [data-event-id]').dataset.eventId`);
    await input('event-'+eventId+'-minutes','2');await input('event-'+eventId+'-fiO2','25');await input('event-'+eventId+'-pip','20');await input('event-'+eventId+'-peep','5');await input('birthFinalSupport','cpap');
    const birthScroll=await ev(`-document.querySelector('#birthHistoryCard').getBoundingClientRect().top`);
    await click('#flowNext');await click('#flowBack');assert.ok(Math.abs(await ev(`-document.querySelector('#birthHistoryCard').getBoundingClientRect().top`)-birthScroll)<3,'Chapter back restores position');
    await click('#flowNext');await input('obRespRelation','continued');await click('#journeyNext');await click('#admissionStatusBody [data-seg="resp"] [data-v="NCPAP"]');await click('#journeyNext');
    const directNote=await note();assert.match(directNote,/35 weeks/);assert.match(directNote,/preterm labor/);assert.match(directNote,/2 minutes/);assert.match(directNote,/25%/);assert.match(directNote,/NCPAP/);assert.doesNotMatch(directNote,/discharged home|An older sibling/);
    await at('#finalReviewCard');await shot('nicu-forward-direct-review-light.png');await click('#copy');assert.match(await ev(`document.querySelector('#copyStatus').textContent`),/^已複製/,'Real Chrome clipboard action');
    await fresh();await background('D');await input('obFacility','Example Transfer Hospital');await input('birthBreathing','crying');await input('birthResusStatus','none');
    await click('#flowNext');await input('obM1Relation','new');await click('[data-seg="obM1Type"] [data-v="o2"]');await click('[data-seg="obM1Dev"] [data-v="hood"]');await input('obM1Flow','2');
    await click('#journeyNext');await click('[data-fill="obReason"] [data-v="respiratory distress"]');
    await click('#journeyNext');await typeText('obArrival','The infant was tachypneic with subcostal retractions.');
    await click('#journeyNext');await input('obRespRelation','continued');
    assert.equal(await ev(`document.querySelector('[data-seg="obRespType"]').checkVisibility()`),false,'Do not ask for the inherited mode again');
    assert.equal(await ev(`document.querySelector('#obRespRelationSummary').checkVisibility()`),true);
    assert.equal(await ev(`document.querySelector('#obRespRelationDetails').open`),false);
    await at('#journeyWorkspace');await shot('nicu-forward-outborn-desktop-light.png');
    await resize(390,844,true);await at('#journeyWorkspace');await shot('nicu-forward-outborn-mobile-light.png');
    await click('#journeyNext');await click('#admissionStatusBody [data-seg="resp"] [data-v="NC"]');await typeText('obAdmissionStatus','Mild tachypnea persisted.');await click('#journeyNext');
    const outbornNote=await note();assert.match(outbornNote,/Example Transfer Hospital/);assert.match(outbornNote,/oxygen hood/);assert.match(outbornNote,/subcostal retractions/);assert.match(outbornNote,/Mild tachypnea persisted/i);assert.match(outbornNote,/NC/);assert.doesNotMatch(outbornNote,/discharged home|An older sibling|bilirubin/);
    // Institutional destination rules: real pointer interactions on a narrow mobile viewport.
    await fresh();await resize(320,844,true);
    await click('#entryDirect');await click('[data-seg="dest"] [data-v="NICU"]');await click('[data-story="E"]');
    const destinationOptions=await ev(`[...document.querySelectorAll('[data-seg="dest"] button')].filter(b=>b.checkVisibility()).map(b=>b.dataset.v)`);
    assert.deepEqual(destinationOptions,['NBC','PICU'],JSON.stringify(await ev(`({stories:[...document.querySelectorAll('#entryRoutes button')].map(b=>[b.id||b.dataset.story,b.getAttribute('aria-checked')]),dest:[...document.querySelectorAll('[data-seg="dest"] button')].map(b=>({v:b.dataset.v,hidden:b.hidden,disabled:b.disabled,display:getComputedStyle(b).display})),help:document.querySelector('#destHelp').textContent})`)));
    assert.equal(await ev(`document.querySelector('[data-seg="dest"] [data-v="NICU"]').disabled`),true);
    assert.equal(await ev(`document.querySelector('[data-seg="dest"] [aria-pressed="true"]')`),null,'Changing to E must not choose a replacement unit');
    assert.match(await ev(`document.querySelector('#destNotice').textContent`),/原選 NICU.*重新選 NBC 或 PICU/);
    assert.match(await note(),/admitted to ____/);
    await position('[data-seg="dest"] [data-v="PICU"]');await shot('nicu-destination-E-cleared-mobile.png');
    await click('[data-seg="dest"] [data-v="PICU"]');
    assert.equal(await ev(`document.querySelector('#destNotice').checkVisibility()`),false);
    assert.match(await note(),/admitted to our PICU/);
    await position('[data-seg="dest"] [data-v="PICU"]');await shot('nicu-destination-E-PICU-mobile.png');
    assert.ok(await ev(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`),'Destination help must fit 320px');
    await click('[data-tab="acc"]');assert.match(await note(),/admitted to our PICU/);assert.doesNotMatch(await note(),/admitted to our NICU/);
    await click('[data-tab="plan"]');assert.equal(await note(),'');assert.equal(await ev(`document.querySelector('#planControls').checkVisibility()`),false);
    assert.match(await ev(`document.querySelector('#planWarn').textContent`),/PICU.*尚未設定/);
    await click('#copy');assert.match(await ev(`document.querySelector('#copyStatus').textContent`),/沒有可複製的 NI plan/);
    await shot('nicu-destination-PICU-plan-mobile.png');
    await click('[data-tab="adm"]');await click('#entryDirect');
    assert.equal(await ev(`document.querySelector('[data-seg="dest"] [aria-pressed="true"]').dataset.v`),'NICU');
    await click('[data-story="E"]');
    assert.equal(await ev(`document.querySelector('[data-seg="dest"] [aria-pressed="true"]').dataset.v`),'PICU');
    await click('[data-seg="dest"] [data-v="NBC"]');assert.match(await note(),/admitted to our NBC/);
    await click('[data-tab="plan"]');assert.ok(await note());assert.doesNotMatch(await note(),/Giraffe|Minimize handling/);
    await click('[data-tab="adm"]');await resize(1440,1000);await click('[data-story="C"]');await click('[data-seg="dest"] [data-v="PICU"]');
    assert.match(await note(),/initially cared for in the baby room/);assert.match(await note(),/admitted to our PICU/);assert.doesNotMatch(await note(),/admitted to our baby room/);
    await at('#admissionContext');await shot('nicu-destination-C-desktop.png');
    // Visible normal presets: the UI selection is not a recorded negative until confirmed.
    await fresh();await resize(1440,1000);await chapter('prenatalCard');
    const pendingDefaults=()=>ev(`document.querySelectorAll('.prenatal-status[data-pending="true"]').length`);
    assert.equal(await pendingDefaults(),10);
    assert.doesNotMatch(await note(),/No gestational diabetes|regular prenatal care|ultrasound showed normal/);
    const risksAt=async()=>{await ev(`window.scrollTo({top:scrollY+document.querySelector('#risks').getBoundingClientRect().top-145,behavior:'instant'})`);await pause(120);};
    await risksAt();await shot('nicu-prenatal-defaults-desktop.png');
    for(const width of [320,390]){
      await resize(width,844,true);await risksAt();
      assert.ok(await ev(`[...document.querySelectorAll('#risks button, [data-seg="ancReg"] button, [data-seg="us"] button')].filter(b=>!b.closest('.child')).every(b=>b.checkVisibility())`),'Normal and exception choices remain visible');
      assert.ok(await ev(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`),'Prenatal choices must wrap on mobile');
      assert.equal(await ev(`document.querySelector('[data-ryn="gdm"] [data-v="no"]').getAttribute('aria-pressed')`),'true');
      assert.equal(await ev(`getComputedStyle(document.querySelector('[data-ryn="gdm"] [data-v="no"]')).borderTopStyle`),'dashed');
      await shot('nicu-prenatal-defaults-mobile-'+width+'.png');
    }
    await click('[data-ryn="gdm"] [data-v="yes"]');
    assert.equal(await ev(`document.querySelector('[data-child="gdm"]').checkVisibility()`),true);
    await click('[data-rc="gdm"] [data-v="insulin"]');await risksAt();await shot('nicu-prenatal-exception-mobile.png');
    await click('[data-ryn="fever"] [data-v="unknown"]');await click('[data-seg="ancReg"] [data-v="unknown"]');
    await click('[data-seg="us"] [data-v="abnormal"]');await typeText('usFindings','a synthetic ultrasound finding');
    await input('scr-select-hbsag','pos');await input('scr-select-gbs','pend');await click('[data-scrall] [data-v="neg"]');
    assert.equal(await ev(`document.querySelector('.scr-row[data-scr="hbsag"]').dataset.state`),'pos');
    assert.equal(await ev(`document.querySelector('.scr-row[data-scr="gbs"]').dataset.state`),'pend');
    const pendingBeforeConfirm=await pendingDefaults();assert.equal(pendingBeforeConfirm,6);
    await click('#confirmPrenatalNext');assert.equal(await pendingDefaults(),0);
    const confirmedPrenatal=await note();assert.match(confirmedPrenatal,/treated with insulin/);assert.match(confirmedPrenatal,/synthetic ultrasound finding/);
    assert.match(confirmedPrenatal,/prenatal care.*was unavailable/);assert.match(confirmedPrenatal,/GBS\) culture result was pending/);
    assert.doesNotMatch(confirmedPrenatal,/ultrasound showed normal|all negative|No gestational diabetes/);
    await chapter('prenatalCard');await risksAt();await shot('nicu-prenatal-confirmed-mobile.png');
    // A keyboard activation of the sticky action is one explicit confirmation, not navigation alone.
    await fresh();await resize(390,844,true);await chapter('prenatalCard');
    assert.match(await ev(`document.querySelector('#flowNext').getAttribute('aria-label')`),/正常預設/);
    await ev(`document.querySelector('#flowNext').focus({preventScroll:true})`);
    assert.equal(await ev('document.activeElement.id'),'flowNext');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await pause(80);
    assert.equal(await pendingDefaults(),0);assert.match(await note(),/regular prenatal care/);assert.match(await note(),/prenatal ultrasound showed normal findings/);
    await fresh();await chapter('prenatalCard');await click('#prenatalSkip');assert.equal(await pendingDefaults(),10);
    assert.doesNotMatch(await note(),/No gestational diabetes|regular prenatal care|ultrasound showed normal/);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,url,entryTop,forwardClicks,forwardEntries,forcedBackwardSteps:0,EStages:3,routeStages,freshAdmissions:['direct A','outborn D'],destinations:{E:destinationOptions,C:'BR history to PICU',routeDraftsRestored:true,unsupportedPICUPlanBlocked:true},prenatalPresets:{visible:10,unconfirmedFactsExcluded:true,exceptionsPreserved:true,inPlaceDetails:true,keyboardConfirmation:true,skipDoesNotConfirm:true},DOL:18,desktop:['1440×1000','1366×768'],mobile:['320×844','360×844','390×844','390×540'],themes:['dark','light'],nativeKeyboard:true,clipboard:true,rectangles,screenshots:['/private/tmp/nicu-forward-*.png','/private/tmp/nicu-destination-*.png','/private/tmp/nicu-prenatal-*.png'],syntheticNote:'/private/tmp/nicu-forward-synthetic-note.txt'},null,2));
  }finally{await send('Page.close').catch(()=>{});ws.close();for(const p of pending.values())clearTimeout(p.timer);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
