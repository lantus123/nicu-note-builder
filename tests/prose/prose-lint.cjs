#!/usr/bin/env node
'use strict';
// Diagnostics only: errors are reported in the summary, never a failing exit code.
const fs=require('node:fs'),path=require('node:path');
const RULES=['subject_run','repeated_phrase','for_evaluation_twice','long_sentence','measurement_phrasing','double_connector','malformed','placeholder_mid_sentence'];
const DEFAULT_DIR='/Users/changwenyi/Documents/NICU-Claude-Handoff-2026-10-12/evidence-batch8';
const words=s=>s.match(/[A-Za-z0-9]+(?:['’/-][A-Za-z0-9]+)*/g)||[];
// Keep decimal values, initials and clinical abbreviations within their sentence.
function sentences(p){
  const out=[];let start=0,depth=0;
  for(let i=0;i<p.length;i++){
    if(p[i]==='(')depth++;if(p[i]===')')depth=Math.max(0,depth-1);
    if(!/[.!?]/.test(p[i])||depth)continue;
    if(p[i]==='.'&&(/\d/.test(p[i-1]||'')&&/\d/.test(p[i+1]||'')||/\b(?:Dr|Mr|Mrs|Ms|vs|approx|e\.g|i\.e)\.$/i.test(p.slice(start,i+1))))continue;
    if(p[i+1]&&!/\s/.test(p[i+1]))continue;
    out.push(p.slice(start,i+1).trim());start=i+1;
  }
  if(p.slice(start).trim())out.push(p.slice(start).trim());return out;
}
function withoutDefinitions(s){
  // Drop abbreviation-only definitions, retaining measurements and other prose.
  return s.replace(/\([^()]*\)/g,m=>/^\([A-Za-z][A-Za-z0-9 /+&.,-]{1,24}\)$/.test(m)&&((m.match(/[A-Z]/g)||[]).length>=2||/^\((?:pH|iNO)\)$/.test(m))?'':m);
}
function lintText(text){
  const hits=[];
  // Notes use single newlines for prose paragraphs as well as blank separators.
  for(const paragraph of String(text).split(/\r?\n/).filter(p=>p.trim())){
    const context=paragraph,ss=sentences(paragraph);
    const emit=(rule,sentence)=>hits.push({rule,sentence,context});
    // Check raw paragraph spacing before sentence trimming discards separators.
    if(/ {2,}/.test(paragraph))emit('malformed',paragraph);
    let run=[];
    const flush=()=>{if(run.length>=3)emit('subject_run',run.join(' '));run=[];};
    for(const s of ss){if(/^The infant\b/.test(s))run.push(s);else flush();}flush();
    // Four-word windows suffice to detect every repeated phrase of >=4 words.
    // Emit maximal phrases only; do not flood the output with their subwindows.
    const clean=withoutDefinitions(paragraph),tokens=[...clean.matchAll(/[A-Za-z0-9]+(?:['’/-][A-Za-z0-9]+)*/g)];
    const buckets=new Map(),phrases=[];
    for(let i=0;i+3<tokens.length;i++){
      const key=tokens.slice(i,i+4).map(m=>m[0].toLowerCase()).join(' ');
      if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(i);
    }
    for(const starts of buckets.values()){
      if(starts.length<2)continue;
      const a=starts[0];let n=4;
      while(a+n<tokens.length&&starts.every(b=>b+n<tokens.length&&tokens[b+n][0].toLowerCase()===tokens[a+n][0].toLowerCase()))n++;
      const phrase=tokens.slice(a,a+n).map(m=>m[0]).join(' ');
      if(!phrases.some(p=>p.toLowerCase().includes(phrase.toLowerCase())))phrases.push(phrase);
    }
    for(const phrase of phrases)emit('repeated_phrase',ss.find(s=>words(withoutDefinitions(s)).join(' ').toLowerCase().includes(phrase.toLowerCase()))||paragraph);
    for(let i=0;i<ss.length;i++){
      const s=ss[i];
      if(i&&/\bfor (?:further )?evaluation\b/i.test(s)&&/\bfor (?:further )?evaluation\b/i.test(ss[i-1]))emit('for_evaluation_twice',ss[i-1]+' '+s);
      if(words(s).length>45)emit('long_sentence',s);
      if(/\busing [a-z]+ measurement\b/i.test(s))emit('measurement_phrasing',s);
      const beginning=s.replace(/^[\s"'“‘(\[\-*#\d.)]+/,'');
      const lower=/^[a-z]/.test(beginning)&&!/^(?:pH|iNO|aEEG|nCPAP|bCPAP|s\/p|mg\/dL|mmol\/L|cmH2O)\b/.test(beginning);
      // Field labels, list items and pedigree rows are formats, not sentences.
      const prose=/[.!?]$/.test(s)&&!/^[\s#*•-]/.test(s)&&!/^\s*[A-Za-z][A-Za-z /()-]{0,35}:/.test(s);
      if(/\bundefined\b|\bNaN\b|\[object|\.\.|,\s*\./.test(s)||(lower&&prose))emit('malformed',s);
      const stripped=s.replace(/\b(?:admitted to|born at|born in|transferred to|admission to)\s+____/gi,'').replace(/^\s*[^.!?]*?:\s*____(?:\s|$)/,'');
      if(/\S[^\n]*____[^\n]*\S/.test(stripped)&&!/^\s*____/.test(stripped))emit('placeholder_mid_sentence',s);
    }
    if((paragraph.match(/\b(?:however|therefore|subsequently)\b/gi)||[]).length>=2)emit('double_connector',paragraph);
  }
  return hits;
}
function main(){
  const argv=process.argv.slice(2);let input=path.join(DEFAULT_DIR,'corpus.jsonl'),out;
  if(argv[0]&&!argv[0].startsWith('--'))input=path.resolve(argv.shift());
  while(argv.length){const key=argv.shift(),value=argv.shift();if(key!=='--out'||!value)throw Error('Usage: prose-lint.cjs [corpus.jsonl] [--out lint.jsonl]');out=path.resolve(value);}
  out||=path.join(path.dirname(input),'lint.jsonl');
  if(out===input)throw Error('Input and output must differ');
  fs.mkdirSync(path.dirname(out),{recursive:true});
  const summary={input,records:0,notes:0,skippedExceptions:0,errors:[],rules:Object.fromEntries(RULES.map(r=>[r,{documents:0,notes:0,hits:0,examples:[]}]))};
  const docs=Object.fromEntries(RULES.map(r=>[r,new Set()])),notes=Object.fromEntries(RULES.map(r=>[r,new Set()]));
  const content=fs.readFileSync(input,'utf8'),fd=fs.openSync(out,'w');
  try{for(const [index,line]of content.split(/\r?\n/).entries()){
    if(!line.trim())continue;
    try{
      const row=JSON.parse(line);summary.records++;
      if(row.error){summary.skippedExceptions++;continue;}
      for(const note of ['adm','acc']){
        if(typeof row[note]!=='string')throw Error('Missing '+note+' for '+row.id);summary.notes++;
        for(const hit of lintText(row[note])){
          const entry={id:row.id,note,...hit};fs.writeSync(fd,JSON.stringify(entry)+'\n');
          const rule=summary.rules[hit.rule];rule.hits++;docs[hit.rule].add(row.id);notes[hit.rule].add(row.id+':'+note);
          if(rule.examples.length<5)rule.examples.push(entry);
        }
      }
    }catch(e){summary.errors.push({line:index+1,error:String(e.message)});}
  }}finally{fs.closeSync(fd);}
  for(const r of RULES){summary.rules[r].documents=docs[r].size;summary.rules[r].notes=notes[r].size;}
  fs.writeFileSync(path.join(path.dirname(out),'lint-summary.json'),JSON.stringify(summary,null,2)+'\n');
  console.table(Object.fromEntries(RULES.map(r=>[r,{documents:summary.rules[r].documents,notes:summary.rules[r].notes,hits:summary.rules[r].hits}])));
  console.log(`records=${summary.records}; notes=${summary.notes}; skippedExceptions=${summary.skippedExceptions}; errors=${summary.errors.length}`);
}
if(require.main===module){try{main();}catch(e){console.error('Diagnostic error: '+e.stack);}process.exitCode=0;}
module.exports={sentences,lintText,withoutDefinitions};
