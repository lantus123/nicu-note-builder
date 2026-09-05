// 文體驗收：golden master（baseline.json）＋佔位符紀律不變量
// 平常: node check.js            → 輸出與 baseline 逐字元比對,任何 diff=紅燈
// 改文案後: node check.js --update → 先過不變量,再檢查佔位符 vs 舊 baseline 不減,才允許覆寫
//   （佔位符減少=可能把沒填的欄位寫成了事實;確認合理時 --update --force）
const fs=require('fs');
const {run}=require('./corpus');
const BASELINE=__dirname+'/baseline.json';
const update=process.argv.includes('--update'), force=process.argv.includes('--force');

const cnt=t=>(t.match(/____/g)||[]).length+(t.match(/(?<!_)__(?!_)/g)||[]).length;
const FORBIDDEN=[ // 舊病句迴歸掃描（都是已修掉的措辭,重現=改壞了）
  'had been conducted','septic work-up','We would keep','planned to keep',
  'cc/kg','critical baby care','LISA procedure','due to poor response','haemorrhage',
  'pending for final report','delay of initial crying','Antibiotics course',
  'Delivery was by vaginal delivery','Explained to family fully','pulmonary infiltrations'];

const out=run();
const fails=[];

for(const [name,r] of Object.entries(out)){
  if(r.error){fails.push(`${name}: render 例外 ${r.error}`);continue;}
  if(r._misses.length)fails.push(`${name}: 選擇器缺失(靜默 no-op)→ ${r._misses.join('; ')}`);
  if(r._errors.length)fails.push(`${name}: page error → ${r._errors.join('; ')}`);
  for(const sec of ['admission','plan','acceptance'])
    if(!r[sec]||!r[sec].trim())fails.push(`${name}/${sec}: 空輸出`);
  const joined=(r.admission||'')+'\n'+(r.acceptance||'')+'\n'+(r.plan||'');
  for(const w of FORBIDDEN)if(joined.includes(w))fails.push(`${name}: 禁詞「${w}」`);
  // The/There 開頭句 ≤35% 且無三連發（admission 敘事段）
  const body=(r.admission||'').split('Tentative diagnosis')[0];
  const ss=body.split(/(?<=[.!?])\s+/).map(s=>s.trim()).filter(Boolean);
  const tt=ss.map(s=>/^(The|There)\b/.test(s));
  const ratio=tt.filter(Boolean).length/Math.max(1,ss.length);
  if(ratio>0.35)fails.push(`${name}: The/There 開頭 ${(ratio*100).toFixed(0)}% >35%`);
  let runLen=0,maxRun=0; tt.forEach(b=>{runLen=b?runLen+1:0; maxRun=Math.max(maxRun,runLen);});
  if(maxRun>=3)fails.push(`${name}: The/There ${maxRun} 連發`);
}
// 佔位符紀律哨兵：14=全未表態情境,篩檢必須是佔位、不得被寫成全陰
{const s14=out['14_稀疏欄位_佔位符測試'];
 if(s14&&!s14.error){
   const unknownScreens=s14.admission.split(/\.\s+/).find(sentence=>
     ['(GBS)','(RPR)','(HBsAg)','(HIV)'].every(label=>sentence.includes(label)));
   if(!unknownScreens||!unknownScreens.includes('____'))
     fails.push('14: 未表態篩檢佔位句消失');
   if(/all negative/.test(s14.admission))fails.push('14: 未表態被寫成 all negative（捏造）');}}

if(fails.length){
  console.error('✗ 不變量未過:');
  fails.forEach(f=>console.error('  -',f));
  process.exit(1);
}

if(update){
  if(fs.existsSync(BASELINE)&&!force){
    const old=JSON.parse(fs.readFileSync(BASELINE,'utf8'));
    const drops=[];
    for(const name of Object.keys(old)){
      if(!out[name]||old[name].error||out[name].error)continue;
      for(const sec of ['admission','acceptance'])
        if(cnt(out[name][sec]||'')<cnt(old[name][sec]||''))
          drops.push(`${name}/${sec}: ${cnt(old[name][sec])}→${cnt(out[name][sec])}`);
    }
    if(drops.length){
      console.error('✗ 佔位符數量減少（沒填的欄位可能被寫成事實）,確認合理請加 --force:');
      drops.forEach(d=>console.error('  -',d));
      process.exit(1);
    }
  }
  fs.writeFileSync(BASELINE,JSON.stringify(out,null,1));
  console.log('✓ baseline 已更新(不變量全過)');
  process.exit(0);
}

if(!fs.existsSync(BASELINE)){
  console.error('✗ 無 baseline.json — 先跑 node check.js --update 建立');
  process.exit(1);
}
const base=JSON.parse(fs.readFileSync(BASELINE,'utf8'));
const diffs=[];
for(const name of new Set([...Object.keys(base),...Object.keys(out)])){
  const a=base[name],b=out[name];
  if(!a||!b){diffs.push(`${name}: 情境${!a?'新增':'消失'}`);continue;}
  for(const sec of ['admission','plan','acceptance'])
    if((a[sec]||'')!==(b[sec]||'')){
      // 找第一個相異位置,印上下文
      const x=a[sec]||'',y=b[sec]||'';
      let i=0; while(i<Math.min(x.length,y.length)&&x[i]===y[i])i++;
      diffs.push(`${name}/${sec} @${i}:\n    baseline: …${x.slice(Math.max(0,i-40),i+90)}…\n    current : …${y.slice(Math.max(0,i-40),i+90)}…`);
    }
}
if(diffs.length){
  console.error(`✗ 輸出偏離 baseline（${diffs.length} 處）。改動是刻意的就跑 npm run update 並 review diff:`);
  diffs.slice(0,10).forEach(d=>console.error('  -',d));
  if(diffs.length>10)console.error(`  …其餘 ${diffs.length-10} 處省略`);
  process.exit(1);
}
console.log(`✓ ${Object.keys(out).length} 情境全數符合 baseline,不變量全過`);
