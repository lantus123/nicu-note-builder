#!/usr/bin/env node
'use strict';
// One reusable JSDOM per child; preserve logs and timings even on child failure.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const DEFAULT_OUT='/Users/changwenyi/Documents/NICU-Claude-Handoff-2026-10-12/evidence-batch8/02-corpus.jsonl';
const write=(file,data)=>fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
const compareId=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
function addCounts(target,source){
  for(const [key,value]of Object.entries(source)){
    if(typeof value==='number')target[key]=(target[key]||0)+value;
    else addCounts(target[key]||={},value);
  }
}
async function main(){
  if(process.argv.length>6)throw Error('Usage: corpus-parallel.cjs [out.jsonl] [n=8] [per-route=400] [seed=20261012]');
  const [outArg=DEFAULT_OUT,nArg='8',perRouteArg='400',seedArg='20261012']=process.argv.slice(2);
  const out=path.resolve(outArg),n=Number(nArg),perRoute=Number(perRouteArg),seed=Number(seedArg);
  const domBatch=Number(process.env.CORPUS_DOM_BATCH||25);
  if(!Number.isSafeInteger(n)||n<1||!Number.isSafeInteger(perRoute)||perRoute<1)throw Error('n and per-route must be positive integers');
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('seed must be uint32');
  if(!Number.isSafeInteger(domBatch)||domBatch<1)throw Error('CORPUS_DOM_BATCH must be a positive integer');
  fs.mkdirSync(path.dirname(out),{recursive:true});
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'nicu-corpus-'));
  const started=performance.now(),children=new Set(),shards=[];
  const processInfo={seed,perRoute,shards:n,domBatch,out,tempDirectory:tmp,startedAt:new Date().toISOString(),cpuCount:os.cpus().length,totalMemoryBytes:os.totalmem(),freeMemoryBytesAtStart:os.freemem(),workers:shards};
  let interrupted=false;
  const stop=()=>{interrupted=true;for(const child of children)child.kill('SIGTERM');};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  console.log(`Starting ${n} shards; seed=${seed}; perRoute=${perRoute}; logs=${tmp}`);
  try{
    await Promise.all(Array.from({length:n},(_,k)=>new Promise(resolve=>{
      const file=path.join(tmp,`shard-${k}.jsonl`),log=path.join(tmp,`shard-${k}.log`);
      // Eight JSDOM workers share an 8 GiB host. Keep garbage collection local
      // instead of allowing each V8 heap to grow under system swap pressure.
      const args=['--expose-gc','--max-old-space-size=192','--max-semi-space-size=4',path.join(__dirname,'corpus-generator.cjs'),'--shard',`${k}/${n}`,'--per-route',String(perRoute),'--seed',String(seed),'--dom-batch',String(domBatch),'--out',file];
      const logFd=fs.openSync(log,'w'),start=performance.now();
      const child=spawn(process.execPath,args,{stdio:['ignore','pipe','pipe']});
      children.add(child);
      const info={k,pid:child.pid,command:[process.execPath,...args],out:file,log,startedAt:new Date().toISOString()};
      shards.push(info);
      for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{fs.writeSync(logFd,chunk);process.stdout.write(`[shard ${k}/${n}] ${chunk}`);});
      child.on('error',e=>{info.error=String(e.stack||e);});
      child.on('close',(code,signal)=>{
        children.delete(child);fs.closeSync(logFd);
        Object.assign(info,{exitCode:code,signal,wallSeconds:+((performance.now()-start)/1000).toFixed(3)});
        console.log(`Shard ${k}/${n} finished: exit=${code}; signal=${signal}; wall=${info.wallSeconds}s`);
        resolve();
      });
    })));
    const failed=shards.filter(s=>s.exitCode!==0||s.error);
    if(failed.length||interrupted){
      for(const s of failed)console.error(`FAILED shard ${s.k}/${n}: ${s.error||s.signal||s.exitCode}\n${fs.readFileSync(s.log,'utf8')}`);
      throw Error(interrupted?'Runner interrupted':`${failed.length} shard(s) failed; logs retained in ${tmp}`);
    }
    const summary={seed,perRoute,shard:null,shards:n,domBatch,routes:{},exceptions:[],elapsedSeconds:0,optionCounts:{},availableOptions:{},stateCounts:{}};
    const rows=[];
    for(const s of shards){
      const part=JSON.parse(fs.readFileSync(s.out+'.summary.json','utf8'));
      if(part.seed!==seed||part.perRoute!==perRoute||part.domBatch!==domBatch||part.shard?.k!==s.k||part.shard?.n!==n)throw Error(`Invalid summary for shard ${s.k}`);
      s.elapsedSeconds=part.elapsedSeconds;
      summary.elapsedSeconds=Math.max(summary.elapsedSeconds,part.elapsedSeconds);
      summary.fixedClock=part.fixedClock;
      for(const key of ['routes','optionCounts','stateCounts'])addCounts(summary[key],part[key]);
      summary.exceptions.push(...part.exceptions);
      for(const [route,options]of Object.entries(part.availableOptions))Object.assign(summary.availableOptions[route]||={},options);
      for(const line of fs.readFileSync(s.out,'utf8').split('\n').filter(Boolean)){
        const row=JSON.parse(line),index=Number(row.id.slice(2))-1;
        if(!'ABCDE'.includes(row.route)||row.id!==`${row.route}-${String(index+1).padStart(4,'0')}`||index<0||index>=perRoute||index%n!==s.k)throw Error(`Invalid shard membership: ${row.id}`);
        rows.push({id:row.id,line});
      }
    }
    rows.sort(compareId);summary.exceptions.sort(compareId);
    if(rows.length!==5*perRoute||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Incomplete corpus or duplicate IDs');
    if(Object.values(summary.routes).reduce((a,b)=>a+b,0)+summary.exceptions.length!==rows.length)throw Error('Summary record count mismatch');
    // Keep each original JSON line byte-for-byte; only sort the line order.
    const merged=path.join(tmp,'merged.jsonl');
    fs.writeFileSync(merged,rows.map(r=>r.line).join('\n')+'\n');
    fs.copyFileSync(merged,out);
    summary.wallSeconds=+((performance.now()-started)/1000).toFixed(3);
    write(out+'.summary.json',summary);
    console.log(JSON.stringify({records:rows.length,routes:summary.routes,exceptions:summary.exceptions.length,elapsedSeconds:summary.elapsedSeconds,wallSeconds:summary.wallSeconds,out}));
    processInfo.records=rows.length;processInfo.exceptions=summary.exceptions.length;processInfo.exitCode=0;
  }catch(e){processInfo.error=String(e.stack||e);processInfo.exitCode=1;throw e;}
  finally{
    process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
    Object.assign(processInfo,{finishedAt:new Date().toISOString(),wallSeconds:+((performance.now()-started)/1000).toFixed(3),freeMemoryBytesAtEnd:os.freemem()});
    write(out+'.process.json',processInfo);
  }
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
