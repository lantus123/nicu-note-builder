#!/usr/bin/env node
'use strict';
// Synthetic, diagnostic corpus. No dependency on audit-regression.js or its xfails.
const fs = require('node:fs');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const {JSDOM, VirtualConsole} = require('jsdom');
const DEFAULT_DIR = '/Users/changwenyi/Documents/NICU-Claude-Handoff-2026-10-12/evidence-batch8';
function args(argv) {
  const a = {seed:20261012, perRoute:400, domBatch:0, out:path.join(DEFAULT_DIR,'corpus.jsonl')};
  for (let i=0;i<argv.length;i++) {
    const k=argv[i];
    if(k==='--no-compare'){a.noCompare=true;continue;}
    const v=argv[++i];
    if (!v) throw Error(`${k} requires a value`);
    if(k==='--seed') a.seed=Number(v);
    else if(k==='--per-route') a.perRoute=Number(v);
    else if(k==='--out') a.out=path.resolve(v);
    else if(k==='--replay') a.replay=path.resolve(v);
    else if(k==='--dom-batch') a.domBatch=Number(v);
    else if(k==='--shard') {
      const match=/^(\d+)\/(\d+)$/.exec(v);
      if(!match)throw Error('shard must be k/n (zero-based k)');
      a.shard={k:Number(match[1]),n:Number(match[2])};
    }
    else throw Error(`Unknown option ${k}`);
  }
  if(!Number.isInteger(a.seed)||a.seed<0||a.seed>0xffffffff)throw Error('seed must be uint32');
  if(!Number.isInteger(a.perRoute)||a.perRoute<1)throw Error('per-route must be a positive integer');
  if(!Number.isSafeInteger(a.domBatch)||a.domBatch<0)throw Error('dom-batch must be a nonnegative integer (0 disables recycling)');
  if(a.shard&&(!Number.isSafeInteger(a.shard.k)||!Number.isSafeInteger(a.shard.n)||a.shard.n<1||a.shard.k>=a.shard.n))throw Error('shard requires 0 <= k < n');
  if(a.replay&&a.shard)throw Error('replay and shard cannot be combined');
  return a;
}
function mulberry32(seed) {return ()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
// FNV-1a 32-bit over the ASCII tuple "seed:route:index". index is zero-based
// within each route, so neither shard layout nor perRoute changes a case's RNG.
function hash32(seed,route,index){
  let hash=0x811c9dc5;
  for(const byte of Buffer.from(`${seed}:${route}:${index}`,'ascii'))hash=Math.imul(hash^byte,0x01000193);
  return hash>>>0;
}
function createHarness() {
  const source=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  const expose=['S','render','renderAdm','renderAcc','admissionProblems','primaryDx','drawEvents','drawMaternalAbx','deriveStory','syncScreen'];
  if(source.split('function render(){').length!==2)throw Error('Expected one render injection anchor');
  const errors=[], vc=new VirtualConsole();
  vc.on('jsdomError',e=>errors.push(String(e.stack||e)));
  const dom=new JSDOM(source.replace('function render(){',`window.corpusAPI={${expose.join(',')}};function render(){`),{
    runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-synthetic-corpus.test/',virtualConsole:vc,
    beforeParse(W){const D=W.Date,fixed=new D(2026,9,12,12).getTime();W.Date=class extends D{constructor(...a){super(...(a.length?a:[fixed]));}static now(){return fixed;}};
      W.scrollTo=()=>{};W.HTMLElement.prototype.scrollIntoView=()=>{};
      // JSDOM invalidates selector caches on redundant writes. Elide only writes
      // whose DOM result is identical; event dispatch and every render still run.
      const setAttribute=W.Element.prototype.setAttribute;
      W.Element.prototype.setAttribute=function(k,v){if(this.getAttribute(k)!==String(v))setAttribute.call(this,k,v);};
      for(const [proto,key]of [[W.Node.prototype,'textContent'],[W.HTMLElement.prototype,'hidden']]){
        const desc=Object.getOwnPropertyDescriptor(proto,key);
        Object.defineProperty(proto,key,{...desc,set(v){if(desc.get.call(this)!==v||(key==='textContent'&&this.childNodes.length>0&&!(this.childNodes.length===1&&this.firstChild.nodeType===3)))desc.set.call(this,v);}});
      }
      W.addEventListener('error',e=>errors.push(String(e.error?.stack||e.message)));}
  });
  const W=dom.window,d=W.document,A=W.corpusAPI;
  if(!A||errors.length) {W.close();throw Error(errors.join('\n')||'API injection failed');}
  // JSDOM 29 already depends on this selector engine. Use its standard-selector
  // fast path directly; preserve JSDOM for :scope/:has and unusual selectors.
  // CORPUS_NATIVE_SELECTORS=1 provides a full native control/replay run.
  if(!process.env.CORPUS_NATIVE_SELECTORS){
    const simpleCache=new Map();
    function simpleTest(selector){
      if(simpleCache.has(selector))return simpleCache.get(selector);
      let match,test=null;
      if((match=selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/)))test=e=>match[2]===undefined?e.hasAttribute(match[1]):e.getAttribute(match[1])===match[2];
      else if((match=selector.match(/^\.([\w-]+)$/)))test=e=>e.classList.contains(match[1]);
      else if((match=selector.match(/^([a-z]+)$/)))test=e=>e.localName===match[1];
      else if((match=selector.match(/^button\[([\w-]+)(?:="([^"]*)")?\]$/)))test=e=>e.localName==='button'&&(match[2]===undefined?e.hasAttribute(match[1]):e.getAttribute(match[1])===match[2]);
      simpleCache.set(selector,test);return test;
    }
    const nativeMatches=W.Element.prototype.matches,nativeClosest=W.Element.prototype.closest;
    W.Element.prototype.matches=function(s){const test=typeof s==='string'&&simpleTest(s);return test?test(this):nativeMatches.call(this,s);};
    W.Element.prototype.closest=function(s){const test=typeof s==='string'&&simpleTest(s);if(!test)return nativeClosest.call(this,s);for(let node=this;node;node=node.parentElement)if(test(node))return node;return null;};
    const engine=require('@asamuzakjp/nwsapi')(W);
    engine.configure({LOGERRORS:false});
    for(const proto of [W.Document.prototype,W.Element.prototype]){
      for(const [method,fn]of [['querySelector','first'],['querySelectorAll','select']]){
        const native=proto[method];
        proto[method]=function(selector){
          if(typeof selector!=='string'||/:scope|:has|::/.test(selector))return native.call(this,selector);
          try{return engine[fn](selector,this);}catch{return native.call(this,selector);}
        };
      }
    }
  }
  if(!process.env.CORPUS_NATIVE_SELECTORS){
    // Named form groups and their buttons are immutable after page initialization;
    // only their attributes change. Dynamic clinical-event rows are not indexed.
    const names=['seg','msel','ryn','r3','rc','re','par','po','as','hc','numunit','am','hcm','proctog','tog','habit','hct','planon','fill','select-chips','scr','csum','set-field','rm-chip','story','scrall','clear-seg'];
    const originalFirst=d.querySelector.bind(d),originalMany=d.querySelectorAll.bind(d);
    const groups=new Map(),buttons=new WeakMap(),parsed=new Map();
    for(const name of names){const nodes=[...originalMany(`[data-${name}]`)];groups.set(name,nodes);for(const node of nodes)buttons.set(node,[...node.querySelectorAll('button')]);}
    const nativeFirst=W.Element.prototype.querySelector,nativeMany=W.Element.prototype.querySelectorAll;
    const buttonQuery=(node,s)=>{
      if(!buttons.has(node)||! /^(?:button(?:\[|$)|\[aria-pressed(?:=|\])|\[data-v(?:=|\]))/.test(s)||/[ ,>+~:]/.test(s))return null;
      return s==='button'?buttons.get(node):buttons.get(node).filter(b=>b.matches(s));
    };
    W.Element.prototype.querySelector=function(s){const xs=typeof s==='string'&&buttonQuery(this,s);return xs?xs[0]||null:nativeFirst.call(this,s);};
    W.Element.prototype.querySelectorAll=function(s){return typeof s==='string'&&buttonQuery(this,s)||nativeMany.call(this,s);};
    function scoped(selector){
      if(typeof selector!=='string')return null;
      if(!parsed.has(selector)){
        const parts=selector.replace(/\.scr-row(?=\[data-scr(?:=|\]))/g,'').split(',').map(part=>part.trim().match(/^\[data-([a-z-]+)(?:="([^"]*)")?\](.*)$/));
        parsed.set(selector,parts.every(m=>m&&groups.has(m[1])&&(!m[3]||/^\s+/.test(m[3])||m[3]=== ':not([data-multi="true"])'))?parts.map(m=>({roots:groups.get(m[1]).filter(e=>(m[2]===undefined||e.getAttribute('data-'+m[1])===m[2])&&(m[3]!==':not([data-multi="true"])'||e.dataset.multi!=='true')),tail:m[3].startsWith(':not(')?'':m[3].trim()})):null);
      }
      const parts=parsed.get(selector);if(!parts)return null;
      const xs=[];
      for(const {roots,tail}of parts)for(const root of roots)if(root.isConnected)xs.push(...(tail?[...root.querySelectorAll(tail)]:[root]));
      return [...new Set(xs)].sort((a,b)=>a===b?0:a.compareDocumentPosition(b)&W.Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
    }
    d.querySelector=function(s){const xs=scoped(s);return xs?xs[0]||null:originalFirst(s);};
    d.querySelectorAll=function(s){return scoped(s)||originalMany(s);};
  }
  const S=A.S,initial=JSON.parse(JSON.stringify(S));
  const fields=[...d.querySelectorAll('input[id],select[id],textarea[id]')].map(e=>[e.id,e.value,e.checked]);
  const details=[...d.querySelectorAll('details')].map(e=>[e,e.open]);
  let ops=[],counts={},available={};
  const q=s=>d.querySelector(s);
  const all=s=>[...d.querySelectorAll(s)];
  const get=s=>{const e=q(s);if(!e)throw Error('Missing '+s);return e;};
  // JSDOM has no layout boxes. Check DOM visibility plus the application's CSS
  // containers; never use offsetParent (always null here). The extra selectors
  // below mirror this page's desktop CSS rules that hide interactive ancestors.
  // This avoids thousands of full CSS cascade evaluations per case.
  function visible(e){
    if(!e?.isConnected||e.matches('input[type="hidden"]')||e.closest('[hidden],[inert],[data-stage-off]'))return false;
    for(let n=e;n&&n.nodeType===1;n=n.parentElement){
      if(n.tagName==='DETAILS'&&!n.open&&!n.querySelector(':scope > summary')?.contains(e))return false;
      if(n.style.display==='none'||['hidden','collapse'].includes(n.style.visibility))return false;
      if(n.matches('.scr-select,.card.collap.collapsed > :not(.sec-h),#pathwayCard #journey,#pathwayCard #journeyProgress,#pathwayCard .tl.stepper li > .body'))return false;
    }
    return true;
  }
  const usable=e=>visible(e)&&!e.matches(':disabled')&&!e.readOnly&&e.getAttribute('aria-disabled')!=='true';
  const key=e=>{
    for(const a of ['seg','msel','ryn','r3','rc','re','select-chips','event-choice']){
      const p=e.closest(`[data-${a}]`);if(p)return `${a}:${p.getAttribute('data-'+a)}=${e.dataset.v}`;
    }
    for(const a of ['story','ladder-v','rm-chip','add-birth','add-course','add-stage-event','event-action'])if(e.hasAttribute('data-'+a))return `${a}:${e.getAttribute('data-'+a)}${e.dataset.v?'='+e.dataset.v:''}${e.dataset.eventPhase?'@'+e.dataset.eventPhase:''}`;
    if(e.matches('.scr-choice input'))return `screen:${e.closest('[data-scr]').dataset.scr}=${e.value}`;
    return (e.tagName==='SELECT'?'select:'+e.id:e.id)||e.getAttribute('data-phase-target')||e.getAttribute('data-flow-target')||e.tagName;
  };
  function selector(e){
    if(e.id)return '#'+e.id;
    // Stable positional selector, evaluated at precisely this operation in replay.
    const parts=[];while(e&&e!==d.documentElement){
      if(e.id){parts.unshift('#'+e.id);break;}
      const siblings=[...e.parentElement.children].filter(n=>n.tagName===e.tagName);
      parts.unshift(e.tagName.toLowerCase()+`:nth-of-type(${siblings.indexOf(e)+1})`);e=e.parentElement;
    }
    return parts.join(' > ');
  }
  function record(op,e,value){ops.push(op);const k=key(e)+(value===undefined?'':`=${value}`);counts[k]=(counts[k]||0)+1;}
  function click(s){const e=typeof s==='string'?get(s):s;if(!usable(e))throw Error('Not visible/enabled: '+selector(e));const op={type:'click',selector:selector(e)};record(op,e);e.click();}
  function input(id,v){const e=get('#'+id);if(!usable(e))throw Error('Not visible/enabled: #'+id);
    if(e.tagName==='SELECT'&&![...e.options].some(o=>o.value===String(v)&&!o.hidden&&!o.disabled&&!o.parentElement.disabled))throw Error('Unavailable option '+id+'='+v);
    if(e.tagName!=='SELECT'&&!['number','date','datetime-local','time'].includes(e.type)&&!['birthTime','iapSince','maternalAbxUntil','tentDx'].includes(id))throw Error('Free text prohibited: '+id);
    record({type:'input',id,value:String(v)},e,v);e.value=String(v);e.dispatchEvent(new W.Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));}
  const seg=(k,v)=>{const e=all(`[data-seg="${k}"] [data-v]`).find(e=>e.dataset.v===v&&usable(e));if(!e)throw Error(`Unavailable seg ${k}=${v}`);if(S[k]!==v)click(e);};
  const multi=(k,v)=>{if(!S[k].includes(v))click(`[data-msel="${k}"] [data-v="${v}"]`);};
  function options(s){const es=all(s).filter(usable);for(const e of es)available[key(e)]=true;return es;}
  function reset(route,navigate=true){
    Object.assign(S,JSON.parse(JSON.stringify(initial)));
    for(const [id,v,checked]of fields){const e=d.getElementById(id);if(e){e.value=v;e.checked=checked;}}
    for(const [e,open]of details)e.open=open;
    Object.assign(S,{pathway:'',outborn:false,dest:'',gender:'male',delivery:'nsd',resus:'none',resp:'',mode:'adm'});
    // Audit reset baseline, with all narrative free text (including facility names)
    // blank. Only structured date/numeric defaults and the requested tentDx vary.
    for(const [id,v]of Object.entries({gaW:39,gaD:0,bw:3200,matAge:31,gravida:2,para:1,ap1:8,ap5:9,birthDate:route==='E'?'2026-09-28':'2026-10-12',birthTime:'10:00',admissionDate:'2026-10-12'}))get('#'+id).value=String(v);
    for(const e of all('textarea,input[type="text"],input:not([type])'))if(!['birthTime'].includes(e.id))e.value='';
    get('#birthResusStatus').value='';
    for(const group of all('[data-seg],[data-msel],[data-tog]')){
      const {seg,msel,tog}=group.dataset,k=seg??msel??tog;
      for(const b of group.querySelectorAll('button'))b.setAttribute('aria-pressed',String(seg!==undefined?b.dataset.v===S[k]:msel!==undefined?S[k].includes(b.dataset.v):!!S[k]));
    }
    for(const k of Object.keys(S.scr))A.syncScreen(k); // radios have no id; reset DOM and state together
    A.drawEvents('birth');A.drawEvents('course');A.drawMaternalAbx();A.render();ops=[{type:'reset',route}];counts={};available={};
    if(navigate)click('#stageBand [data-flow-target="admissionContext"]');
  }
  function snapshot(){
    A.render();const review={conflicts:get('#reviewConflictList').textContent.trim(),pending:get('#reviewPendingList').textContent.trim(),missing:get('#reviewMissingList').textContent.trim()};
    const adm=get('#note').textContent.trim();A.renderAcc();const acc=get('#note').textContent.trim();
    return JSON.parse(JSON.stringify({adm,acc,review,problems:A.admissionProblems(),dx:A.primaryDx()}));
  }
  return {W,d,A,S,q,all,get,visible,usable,click,input,seg,multi,options,reset,snapshot,errors,get ops(){return ops;},get counts(){return counts;},get available(){return available;}};
}
function sample(h,route,rng){
  const {S,q,all,usable,click,input,seg,multi,options}=h;
  const chance=p=>rng()<p, int=(a,b)=>a+Math.floor(rng()*(b-a+1)), pick=a=>a[int(0,a.length-1)];
  const choose=s=>{const a=options(s);if(a.length)click(pick(a));};
  const group=k=>{const es=options(`[data-seg="${k}"] [data-v]`).filter(e=>e.dataset.v);if(es.length){const e=pick(es);seg(k,e.dataset.v);}};
  const subset=(k,p=.3,required=false)=>{const es=options(`[data-msel="${k}"] [data-v]`);const selected=es.filter(()=>chance(p));if(required&&!selected.length&&es.length)selected.push(pick(es));for(const e of selected)multi(k,e.dataset.v);};
  const field=(id,v)=>{if(q('#'+id)&&usable(q('#'+id)))input(id,v);};
  const select=id=>{const e=q('#'+id);if(e&&usable(e)){const opts=[...e.options].filter(o=>o.value&&!o.hidden&&!o.disabled&&!o.parentElement.disabled);for(const o of opts)h.available[`select:${id}=${o.value}`]=true;if(opts.length)input(id,pick(opts).value);}};
  const stage=id=>click(`#stageBand [data-flow-target="${id}"]`);
  const phase=id=>{const e=options(`#stageBand [data-phase-target="${id}"]`)[0];if(e)click(e);else throw Error('Missing phase '+id);};
  const chips=id=>choose(`[data-select-chips="${id}"] [data-v]`);
  const numeric=(scope)=>{for(const e of all(`${scope} input[type="number"]`).filter(usable)){
    let v;const id=e.id;
    if(/fiO2|FiO2/.test(id))v=int(21,60);else if(/pip|IP$/.test(id))v=int(15,25);else if(/peep|PEEP/.test(id))v=int(4,7);
    else if(/hr$|HR$/.test(id))v=int(60,180);else if(/rr$|RR$/.test(id))v=int(30,60);else if(/flow|Flow/.test(id))v=int(1,5);
    else if(/Spo2|SpO2/.test(id))v=int(80,100);else if(/minutes|Min$|duration/.test(id))v=int(1,15);else continue;
    if(chance(.65))input(id,v);
  }};
  function events(scope){
    for(const row of all(`[data-event-scope="${scope}"]`).filter(usable)){
      const id=row.dataset.eventId, base=`[data-event-id="${id}"]`;
      if(chance(.8))choose(base+' [data-event-choice="response"] [data-v]:not([data-v=""])');
      choose(base+' [data-event-choice="breathing"] [data-v]:not([data-v=""])');
      for(const suffix of ['tone','support','intubationAction'])select(`event-${id}-${suffix}`);
      numeric(base);
    }
  }
  h.reset(route);
  if('AB'.includes(route))click('#entryDirect');else click(`[data-story="${route}"]`);
  group('dest');if(route==='E'){group('readmitSource');subset('readmitProblems',.3,true);}
  // Fixed birthday and clock. E admission dates span DOL 2..28 relative to 9/28;
  // values after the fixed clock deliberately remain visible review conflicts.
  const dol=route==='E'?int(2,28):1;
  const iso=days=>new Date(Date.UTC(2026,8,28+days)).toISOString().slice(0,10);
  if(route==='E'){click('#admissionDateDetails > summary');input('admissionDate',iso(dol-1));}
  if('AB'.includes(route))click(`[data-story="${route}"]`);
  choose('[data-ladder-v]');
  stage('prenatalCard');
  for(const k of ['gdm','pih','fever','prom']){choose(`[data-ryn="${k}"] [data-v]`);choose(`[data-rc="${k}"] [data-v]`);}
  choose('[data-r3="pre"] [data-v]');choose('[data-re="pre"] [data-v]');field('promH',int(1,72));
  // Half retain all prenatal screening defaults; remaining cases sample GBS's
  // three clinically distinct states, with occasional other screening changes.
  if(chance(.5))choose('.scr-row[data-scr="gbs"] input[value="neg"],.scr-row[data-scr="gbs"] input[value="pos"],.scr-row[data-scr="gbs"] input[value="unknown"]');
  if(chance(.15))choose('.scr-row[data-scr="hbsag"] input[type="radio"]');
  if(chance(.25))group('ancReg');if(chance(.25))group('us');
  group('maternalAbxPurpose');if(S.maternalAbxPurpose==='iap')group('iap');
  const abxStart=route==='E'?`2026-09-${int(24,27)}`:`2026-10-${String(int(8,11)).padStart(2,'0')}`;
  input('iapSince',abxStart);
  const end=q('#maternalAbxUntil').closest('details');if(!end.open)click(end.querySelector('summary'));
  input('maternalAbxUntil',route==='E'?'2026-09-28':'2026-10-12');
  stage('birthHistoryCard');
  group('gender');const ga=route==='E'?int(35,41):int(23,41);
  input('gaW',ga);input('gaD',int(0,6));
  const median=[600,700,800,900,1050,1200,1350,1550,1750,1950,2150,2350,2550,2750,2950,3150,3300,3450,3550][ga-23];
  const bw=Math.round(median*(.85+rng()*.3)/10)*10;input('bw',bw);group('delivery');input('ap1',int(0,10));input('ap5',int(0,10));field('ap10',int(0,10));
  if(route==='A'){phase('birth:standby');subset('pwSbR',.3,true);}
  if(route==='B'){phase('birth:consult');field('pwConsultH',int(1,6)/10);}
  // These phases also represent the documented birth history for E.
  phase('birth:birth');chips('birthBreathing');chips('birthTone');field('birthHR',int(60,180));subset('birthSigns',.2);
  phase('birth:dr');
  const remove=options('[data-event-scope="birth"] [data-event-action="remove"]');if(remove.length&&chance(.3))click(pick(remove));
  if(chance(.5))choose('[data-add-birth="assessment"]');events('birth');
  phase('birth:drEnd');chips('birthFinalSupport');chips('birthFinalBreathing');chips('birthFinalTone');field('birthFinalHR',int(90,180));subset('birthFinalSigns',.2);
  stage('pathwayCard');
  if(route==='E'){
    phase('course:prior');group('readmitPrior');select('readmitPriorUnit');input('readmitDischargeDate',iso(int(0,Math.max(0,dol-2))));input('readmitDischargeWeight',Math.round(bw*.95));group('readmitFeeding');subset('readmitBaseline',.6);
    phase('course:illness');field('readmitOnsetDOL',int(2,dol));select('readmitCourseType');
    for(const panel of all('[data-rm-module]').filter(usable)){
      for(const e of [...panel.querySelectorAll('[data-rm-chip]')].filter(usable))if(chance(.6))click(e);
      for(const e of [...panel.querySelectorAll('select')].filter(usable))select(e.id);
      for(const e of [...panel.querySelectorAll('input[type="number"]')].filter(usable)){
        const v=/temperature/.test(e.id)?(int(360,400)/10):/count/.test(e.id)?int(1,8):/duration/.test(e.id)?int(5,45):/usual/.test(e.id)?int(40,100):/current/.test(e.id)?int(10,70):int(2,dol);input(e.id,v);
      }
      for(const e of [...panel.querySelectorAll('input[type="date"],input[type="datetime-local"]')].filter(usable))input(e.id,iso(dol-1)+(e.type==='datetime-local'?'T09:00':''));
    }
    subset('readmitJaundiceSigns',.3);phase('course:evaluation');input('readmitCurrentWeight',Math.round(bw*(.9+rng()*.25)));field('readmitSpO2',int(85,100));field('readmitTSB',int(80,250)/10);field('readmitDB',int(2,20)/10);group('resp');
  }else{
    if(route==='D'){
      phase('course:obCare');choose('[data-add-stage-event][data-event-phase="outside"]');events('course');
      phase('course:obArrive');group('obM1Type');group('obM1Dev');numeric('#journeyWorkspace');choose('[data-add-stage-event][data-event-phase="arrival"]');events('course');
    }
    phase('course:route');subset('obSx',.25,true);group('pwOnset');select('pwOnsetUnit');field('pwOnsetH',int(1,12));group('obRespType');group('obO2Dev');numeric('#journeyWorkspace');
    if(chance(.4)){choose('[data-add-course]');events('course');}
    if(route==='C'){phase('course:brEval');subset('brEval',.5,true);subset('brWorkup',.5,true);
      if(chance(.25))multi('brFindings','normal');else subset('brFindings',.35,true);
      field('brGlu',int(20,120));field('brCrp',int(1,100)/10);
    }
    phase('course:adm');group('resp');
  }
  stage('finalReviewCard');if(chance(.2))input('tentDx',pick(['respiratory distress','neonatal hypoglycemia','neonatal hyperbilirubinemia','suspected neonatal infection']));
  if(h.A.deriveStory()!==route)throw Error('Story mismatch: '+h.A.deriveStory());
}
async function main(){
  const config=args(process.argv.slice(2)),start=performance.now();
  fs.mkdirSync(path.dirname(config.out),{recursive:true});
  if(config.replay&&path.resolve(config.out)===config.replay)throw Error('Replay input and output must differ');
  let h=createHarness();
  const rows=config.replay?fs.readFileSync(config.replay,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):null;
  const summary={seed:config.seed,perRoute:config.perRoute,shard:config.shard||null,domBatch:config.domBatch,fixedClock:'2026-10-12T12:00:00 (local)',routes:{},optionCounts:{},availableOptions:{},exceptions:[],stateCounts:{},replay:!!rows};
  const fd=fs.openSync(config.out,'w');
  try{
    const cases=rows||'ABCDE'.split('').flatMap(route=>Array.from({length:config.perRoute},(_,index)=>({id:`${route}-${String(index+1).padStart(4,'0')}`,route,index,seed:config.seed,caseSeed:hash32(config.seed,route,index)}))).filter(c=>!config.shard||c.index%config.shard.n===config.shard.k);
    for(const [i,c]of cases.entries()){
      if(config.domBatch&&i&&i%config.domBatch===0){
        // Reuse one DOM + reset within each batch. Release closed-window tasks
        // before creating the next DOM, bounding JSDOM retention in long runs.
        h.W.close();h=null;
        await new Promise(resolve=>setImmediate(resolve));
        if(global.gc)global.gc();
        h=createHarness();
      }
      const errorStart=h.errors.length;let result;
      try{
        if(rows){for(const op of c.ops){if(op.type==='reset')h.reset(op.route,false);else if(op.type==='click')h.click(op.selector);else if(op.type==='input')h.input(op.id,op.value);else throw Error('Unknown op '+op.type);}}
        else sample(h,c.route,mulberry32(c.caseSeed));
        result={id:c.id,route:c.route,seed:c.seed,...(c.caseSeed===undefined?{}:{caseSeed:c.caseSeed}),ops:h.ops,...h.snapshot()};
        if(h.errors.length>errorStart)throw Error(h.errors.slice(errorStart).join('\n'));
        if(rows&&!config.noCompare)for(const k of ['ops','adm','acc','review','problems','dx'])if(JSON.stringify(result[k])!==JSON.stringify(c[k]))throw Error('Replay mismatch: '+k);
        summary.routes[c.route]=(summary.routes[c.route]||0)+1;
        const stateCounts=summary.stateCounts[c.route]||={};
        const mark=(k,v)=>{const key=k+'='+v;stateCounts[key]=(stateCounts[key]||0)+1;};
        for(const k of ['dest','delivery','gender','resp','maternalAbxPurpose','iap','pwOnset','obM1Type','obRespType'])mark(k,h.S[k]);
        for(const [k,v]of Object.entries(h.S.scr))mark('screen:'+k,v);
        for(const k of ['gaW','bw','admissionDate','ap1','ap5','ap10'])mark(k,h.get('#'+k).value);
        mark('manualDx',!!h.get('#tentDx').value);
        mark('prenatalScreenDefaults',Object.keys(h.S.scrEdited).length===0);
        for(const k of h.S.readmitProblems)mark('readmitProblem',k);
        for(const e of [...h.S.birthEvents,...h.S.courseEvents])mark('event:'+(e.phase||'birth'),e.kind);

        for(const [k,n]of Object.entries(h.counts)){const dest=summary.optionCounts[c.route]||={};dest[k]=(dest[k]||0)+n;}
        for(const k of Object.keys(h.available)){const dest=summary.availableOptions[c.route]||={};dest[k]=true;}
      }catch(e){result={id:c.id,error:String(e.stack||e),route:c.route,seed:c.seed,...(c.caseSeed===undefined?{}:{caseSeed:c.caseSeed}),ops:h.ops};summary.exceptions.push({id:c.id,error:result.error});}
      fs.writeSync(fd,JSON.stringify(result)+'\n');
      if((i+1)%25===0)console.log(`${i+1}/${cases.length}; exceptions=${summary.exceptions.length}; elapsed=${((performance.now()-start)/1000).toFixed(1)}s`);
    }
  }finally{fs.closeSync(fd);if(h)h.W.close();}
  summary.elapsedSeconds=+( (performance.now()-start)/1000).toFixed(3);
  fs.writeFileSync(config.out+'.summary.json',JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify({routes:summary.routes,exceptions:summary.exceptions.length,elapsedSeconds:summary.elapsedSeconds,out:config.out}));
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={mulberry32,hash32,createHarness,sample};
