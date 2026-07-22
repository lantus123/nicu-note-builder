// ═══════════════════════════════════════════════════════════════
// lab-parse.js — 檢驗/血氣貼上解析器(單一真相 / SHARED)
//   來源:nbc-note-app 的 doLabParse。此檔為兩個工具(nbc-note-app、nicu-note-builder)共用。
//   ⚠ 勿在各 app 內各自修改;要改請改此檔的標記區塊,再重新內嵌回兩個 app 的同名標記區塊。
//   純字串處理、無 DOM 依賴;可 node 直接跑(module.exports)或瀏覽器內嵌(window.LabParse)。
// ═══════════════════════════════════════════════════════════════
//__LABPARSE_START__
const LAB_ORDER=["since","BloodGroup","病人血型","血袋血型","pH","pCO2","pO2","HCO3","B.E.","B.E","SaO2","Na","K","Cl","Ca","iCa","P","Mg","BUN","Creatinine","AST","GOT","ALT","GPT","Albumin","Bilirubin","D-Bil","T-Bil","Ammonia","Lactate","Glucose","Glucose PC60'","Glucose PC120'","Glucose AC (75GM)","Glucose AC","Glucose PC","HbA1c","TG","T-Chol","ALK-P","LDH","r-GT","CRP","PCT","Procalcitonin","E.S.R.","Troponin","CK","CKMB","CKMB/CK Ratio","BNP","NT-proBNP","AFP","PT","PT control","APTT","APTT control","INR","IAT","DAT","G6PD","Ferritin","Anti-dsDNA","CMV PCR","CMV viral load"];
const NAME_MAPPING={"Total Bilirubin":"T-Bil","Total Bilirubin (Child)":"T-Bil","Direct Bilirubin":"D-Bil","Triglyceride":"TG","Total Cholesterol":"T-Chol","ALK-Phosphatase":"ALK-P","Blood Gas pH":"pH","Blood Gas pCO2":"pCO2","Blood Gas pO2":"pO2","Blood Gas HCO3":"HCO3","Blood Gas B.E.":"B.E.","Blood Gas SaO2":"SaO2","Glucose AC (75GM)":"Glucose AC (75GM)","Glucose PC 60' (75GM)":"Glucose PC60'","Glucose PC 120' (75GM)":"Glucose PC120'","AST(GOT)":"AST","ALT(GPT)":"ALT","BUN":"BUN","Ammonia":"Ammonia","Creatinine":"Creatinine","Calcium":"Ca","Potassium":"K","Sodium":"Na","Chloride":"Cl","Na(POCT)":"Na(POCT)","K(POCT)":"K(POCT)","K POCT (Child)":"K(POCT)","Free Ca(POCT)":"iCa(POCT)","Free Calcium":"iCa","LDH":"LDH","CK":"CK","CKMB":"CKMB","r-GT":"r-GT","CKMB/CK Ratio":"CKMB/CK Ratio","PT patient":"PT","PT control":"PT control","MNPT":"PT control","APTT patient":"APTT","APTT control":"APTT control","MNAPTT":"APTT control","Glucose(Random)":"Glucose(Random)","Immunoglobulin M":"IgM","Anti-HBs B":"Anti-HBs","Anti-HBs":"Anti-HBs","HBsAg":"HBsAg","Anti-HCV Ab":"Anti-HCV","COVID-19 Ag":"COVID-19 Ag","NT-proBNP(POCT)":"NT-proBNP(POCT)","CRP":"CRP","Lactate":"Lactate","E.S.R.":"E.S.R.","Ferritin":"Ferritin","Anti-dsDNA":"Anti-dsDNA","IAT":"IAT","DAT":"DAT","G6PD":"G6PD","糖化血色素(HbA1c)":"HbA1c"};
const URINE_MAP={"比重檢查":"比重","酸、鹼度反應(pH)":"pH","蛋白質檢查(Protein)":"Protein","Protein":"Protein","糖檢查(Glucose)":"Glucose","Glucose":"Urine glucose","酮體檢查(Ketones)":"Ketones","Ketone Bodies":"Ketones","膽紅素檢查(Bilirubin)":"Bilirubin","尿液潛血反應":"尿液潛血反應","尿膽素原檢查":"Urobilinogen","Urobilinogen":"Urobilinogen","Leukocyte":"Leukocyte","亞硝酸鹽檢查":"Nitrite","Nitrite":"Nitrite","Bilirubin":"Bilirubin","Occult Blood":"Occult Blood","Specific Gravity":"Specific Gravity","pH":"pH","RBC count":"RBC count","WBC count":"WBC count","EPI count":"EPI count","Epithelium (/uL)":"Epithelium (/uL)","RBC (/uL)":"RBC (/uL)","WBC (/uL)":"WBC (/uL)"};
const INVALID_UNITS=['Negative','Positive','Detected','Not Detected','Reactive','Non-reactive','Normal','Abnormal','Trace','trace','None','Nil','Present','Absent','陰性','陽性'];
const BLOCK_PREFIXES={"血清-URINE":"Urine","Sputum":"Sputum","Blood":"Blood","BLOOD":"Blood","Throat swab":"Throat swab","Nasopharyngeal swab":"Nasopharyngeal swab","Stool":"Stool","STOOL":"Stool","CSF":"CSF","Ascites":"Ascites","Pleural fluid":"Pleural fluid","Urine":"Urine","URINE":"Urine"};
const WAIWEI_BLOCKS=['委外大安聯合','委外北馬','委外淡水馬偕','委外臺北馬偕'];
const EXCLUDED_KW=['rule in','cut-point','y/o','報告時間','開單日期','檢查日期','醫囑時間','執行時間','Comments','備註','檢體請冰浴','採血管','單位','參考值範圍','項 目 名 稱','項  目  名  稱','說明','micro','BIO comment','小兒血量','請空腹','簽收時間','醫 檢 師','驗 證 者','Rh D type','有疑慮請會診','診斷原因','採檢部位','主診斷','Urine biochemistry test','SEDIMENTS','SCREEN TEST','鏡檢','核酸檢測','多標的','PCR','LAB','速件','最終報告','not available','venous blood','arterial blood','reference','range','since','GA(WKS)','Median','MOM','Estimated GFR','eGFR','腎絲球過濾率','血糖（飯前）','血糖(隨機)','麩胺酸','CKD-EPI','MDRD','採檢前','是否為多重抗藥性','檢體代碼','檢體量','委外淡水病毒','委外台北馬偕','委外臺北馬偕','置於3.2%','Sodium Citrate管','檢驗方法適用','偵測極限','線性範圍','陰性檢測結果','委託大安聯合','委託台北馬偕','HDNB','網狀紅血球','肌酸磷化脢','Grayzone','Equivocal','加強手部衛生','採取隔離措施','報告備註','檢體備註','沿用既有報告','檢驗單無須送至細菌室','可加開','快速得知','表示:'];
const CBC_PAT=[{key:'WBC',pattern:/^WBC(?:\(白血球|\s)/},{key:'Seg',pattern:/^Seg(?:\(嗜中性|\s)/},{key:'Band',pattern:/Band/},{key:'Eosin',pattern:/Eosin/},{key:'Baso',pattern:/Baso/},{key:'Mono',pattern:/Mono/},{key:'Lymp',pattern:/Lymp/},{key:'Hb',pattern:/^(?!.*糖化).*(?:Hemoglobin|血色素)/},{key:'Ht',pattern:/^Ht(?:\(血球|\s)/},{key:'PLT',pattern:/Platelet|血小板/},{key:'RBC',pattern:/^RBC(?:\(紅血球|\s)/},{key:'Normoblast',pattern:/Normoblast/},{key:'RDW',pattern:/^RDW(?:\(紅血球|\s)/},{key:'Reticulocyte',pattern:/Reticulocyte/},{key:'Metamyelocyte',pattern:/Metamyelocyte/},{key:'Myelocyte',pattern:/^\s*Myelocyte/}];
const CN_KEEP=['白血球','血色素','血小板','嗜中性'];

function labClean(s){return s.replace(/\s+/g,' ').trim().replace(/\.$/,'');}
function labSortIdx(n){if(n.startsWith("配合試驗"))return 5;const i=LAB_ORDER.findIndex(k=>n.toLowerCase().includes(k.toLowerCase()));return i===-1?999:i;}
function labMapName(name){
  name=labClean(name).replace(/\.\s*$/,'').trim();
  if(NAME_MAPPING[name])return NAME_MAPPING[name];
  if(/冠狀病毒.*抗原/i.test(name)||/n-CoV.*抗原/i.test(name)||/COVID.*Ag/i.test(name))return'COVID-19 Ag';
  if(/冠狀病毒.*PCR/i.test(name)||/SARS-CoV-2.*PCR/i.test(name))return'COVID-19 PCR';
  const em=name.match(/^([A-Za-z][A-Za-z0-9\/\-\.\s\(\)']*?)\s*[\(（][\u4e00-\u9fa5]/);
  if(em){const p=em[1].trim();if(NAME_MAPPING[p])return NAME_MAPPING[p];return p;}
  if(/[a-zA-Z]/.test(name)&&/[\u4e00-\u9fa5]/.test(name)){
    const bm=name.match(/^([A-Za-z][A-Za-z0-9\/\-\.\s]*?)(?:\s+[\u4e00-\u9fa5]|(?<=[a-zA-Z0-9])[\u4e00-\u9fa5])/);
    if(bm){const c=bm[1].trim();if(NAME_MAPPING[c])return NAME_MAPPING[c];return c;}
    name=name.replace(/[\(（][^)）]*[\u4e00-\u9fa5][^)）]*[\)）]/g,'');
    name=name.replace(/[\)）]+$/,'').trim();
    name=name.replace(/[\u4e00-\u9fa5]+/g,m=>{if(CN_KEEP.some(t=>m.includes(t)))return m;return'';}).trim();
  }
  if(NAME_MAPPING[name])return NAME_MAPPING[name];
  if(name.startsWith("Blood Gas "))return name.replace("Blood Gas ","").trim();
  return name;
}
function labCreateBlock(ds,st,ts){return{dateStr:ds,sortTime:st,timeStr:ts||'',cbc:{},labs:[],urine:[],culture:[],bloodGroup:{},pcr:{header:null,results:[]},xmBuffer:{result:null,bag:null}};}
function labStoreCBC(o,k,v){if(!v)return;o[k]=v;}
function labExtVal(l){const m=l.match(/([<>＜＞]*(?:-)?\d+(\.\d+)?)/);return m?m[0].replace(/＜/g,'<').replace(/＞/g,'>'):'';}
function labExtMDW(l){let c=l.replace(/^MDW\s+/,'').trim();c=c.split(/\s{2,}/)[0]||c;c=c.replace(/^[HHL]{1,2}\s+/,'');return c;}
function labTryCBC(line,cbc){if(line.trim().startsWith('MDW')){labStoreCBC(cbc,'MDW',labExtMDW(line));return true;}for(const{key,pattern}of CBC_PAT){if(pattern.test(line)){labStoreCBC(cbc,key,labExtVal(line));return true;}}return false;}
function labFlushXM(b){if(b.xmBuffer.result||b.xmBuffer.bag){const r=b.xmBuffer.result||"",bg=b.xmBuffer.bag?`血袋號碼:(${b.xmBuffer.bag})`:"";let c=r;if(r&&bg)c+=" ";if(bg)c+=bg;b.labs.push({name:"配合試驗",fullString:c});b.xmBuffer={result:null,bag:null};}}
function labDispWidth(s){let w=0;for(const ch of s){const cp=ch.codePointAt(0);if((cp>=0x1100&&cp<=0x115F)||(cp>=0x2E80&&cp<=0x9FFF)||(cp>=0xAC00&&cp<=0xD7AF)||(cp>=0xF900&&cp<=0xFAFF)||(cp>=0xFE10&&cp<=0xFE6F)||(cp>=0xFF01&&cp<=0xFF60)||(cp>=0xFFE0&&cp<=0xFFE6)||(cp>=0x20000&&cp<=0x2FA1F))w+=2;else w+=1;}return w;}
function labColToIdx(s,tc){let c=0;for(let i=0;i<s.length;i++){if(c>=tc)return i;const cp=s.codePointAt(i);if((cp>=0x1100&&cp<=0x115F)||(cp>=0x2E80&&cp<=0x9FFF)||(cp>=0xAC00&&cp<=0xD7AF)||(cp>=0xF900&&cp<=0xFAFF)||(cp>=0xFE10&&cp<=0xFE6F)||(cp>=0xFF01&&cp<=0xFF60)||(cp>=0xFFE0&&cp<=0xFFE6)||(cp>=0x20000&&cp<=0x2FA1F))c+=2;else c+=1;}return s.length;}
function labDetectCols(raw){let vc=-1,uc=-1,rc=-1,col=0;for(let i=0;i<raw.length;i++){const rem=raw.substring(i);if(vc<0&&/^結\s*果\s*值/.test(rem))vc=col;if(uc<0&&/^單\s*位/.test(rem))uc=col;if(rc<0&&/^參\s*考/.test(rem))rc=col;const cp=raw.codePointAt(i);if((cp>=0x1100&&cp<=0x115F)||(cp>=0x2E80&&cp<=0x9FFF)||(cp>=0xAC00&&cp<=0xD7AF)||(cp>=0xF900&&cp<=0xFAFF)||(cp>=0xFE10&&cp<=0xFE6F)||(cp>=0xFF01&&cp<=0xFF60)||(cp>=0xFFE0&&cp<=0xFFE6)||(cp>=0x20000&&cp<=0x2FA1F))col+=2;else col+=1;}if(vc<0||uc<0)return null;if(rc<0)rc=col;return{valueCol:vc,unitCol:uc,refCol:rc};}
function labParseByCols(raw,cols){const lw=labDispWidth(raw);if(lw<cols.valueCol)return null;const vi=labColToIdx(raw,cols.valueCol),ui=labColToIdx(raw,cols.unitCol),ri=labColToIdx(raw,cols.refCol);let rn=raw.substring(0,vi).trim(),rv=raw.substring(vi,ui).trim(),ru=ui<raw.length?raw.substring(ui,ri).trim():'';if(!rn||!rv||rv==='***')return null;let flag=null;const nf=rn.match(/\s+(H{1,2}|L)\s*$/);if(nf){flag=nf[1];rn=rn.substring(0,rn.length-nf[0].length).trim();}const vf=rv.match(/^([HHL]{1,2})\s+(.+)$/);if(vf){flag=vf[1];rv=vf[2].trim();}rv=rv.replace(/＜/g,'<').replace(/＞/g,'>');const isN=/^[<>]*-?[\d\.]+/.test(rv),isS=/^(Positive|Negative|Detected|Not\s+Detected|Nonreactive|Reactive|trace)$/i.test(rv),isSp=/^\d+\+$/.test(rv)||rv==='-'||rv.includes('1:');if(!isN&&!isS&&!isSp)return null;if(/^(Negative|Positive|Grayzone|Equivocal|Nonreactive|Reactive)/i.test(ru))ru='';if(/^[<>＜＞]/.test(ru)||/^[\d\.-]+$/.test(ru))ru='';if(ru==='mmol/')ru='mmol/L';if(ru==='mg/')ru='mg/dL';if(ru==='sec.')ru='sec';if(ru==='log'||ru==='log I')ru='';ru=ru.replace(/\s+[<>＜＞≧≦]?[\d\.-].*$/,'').trim();ru=ru.replace(/\s+[A-Z]$/,'').trim();return{name:rn,flag,value:rv,unit:ru,rest:''};}
function labParseGenLine(line,isPcr){const rx=/^(.+?)\s+([HHL]{1,2})?\s*([<>＜＞]*(?:-)?[\d\.:]+|Positive|Negative|Not\s+Detected|Detected|Nonreactive|Reactive|[Tt]race|陰性|陽性|-)\s*(\S*)(.*)$/;const m=line.match(rx);if(m){let name=m[1].trim(),flag=m[2]?m[2].trim():null,val=m[3].trim();val=val.replace(/＜/g,'<').replace(/＞/g,'>');if(val.includes('超出儀器'))val='Out of Range';if(line.includes('(75GM)')){const om=line.match(/^(.+?\(75GM\))\s+([HHL]{1,2})?\s*([<>＜＞]*(?:-)?[\d\.]+)\s*(\S*)(.*)$/);if(om)return{name:om[1].trim(),flag:om[2]?om[2].trim():null,value:om[3].trim(),unit:om[4]?om[4].trim():'',rest:om[5]?om[5].trim():''};}if(val.includes('1:32')){if(val.startsWith('<'))val='Negative';else if(val.startsWith('>'))val='Reactive';}const isAN=/^\d+[A-Za-z]+/.test(val)||/^[A-Za-z]+\d+/.test(val)||/^\d+$/.test(val);const isKS=/Detected|Positive|Negative|Nonreactive|Reactive|trace/i.test(val);if(isPcr&&isAN&&!isKS)return null;if(!isPcr&&isAN&&!isKS&&/Coronavirus|Influenza/.test(name))return null;let unit=m[4]?m[4].trim():'',rest=m[5]?m[5].trim():'';if(/^[\d\.-]+$/.test(unit)||/^[<>＜＞]/.test(unit)||unit.includes(':')||unit.toLowerCase()==='non-reactive')unit='';if(name.toLowerCase().includes('no growth')||name==='Blood Gas'||name==='WBC-DC')return null;return{name,flag,value:val,unit,rest};}return null;}

function labFmtCulture(lines){const fmt=[];const rp=/^([SRIb](?:\([^\)]+\))?|\.)$/i;const isDP=lines.some(l=>/\bDetected\b/.test(l)&&/Not Detected|N\/A/.test(l));if(isDP){const di=[];for(let l of lines){l=l.trim();if(!l||/^[-=]+$/.test(l))continue;if(/菌\s*株|結果值|結\s*果\s*明\s*細|參\s*考\s*值/.test(l))continue;if(/\bN\/A\b/.test(l)&&!/\bDetected\b/.test(l))continue;if(/Not Detected/.test(l)&&!/(?<!Not\s)Detected/.test(l))continue;const dm=l.match(/^(.+?)\s{2,}(Detected)\s/);if(dm){di.push(`${labClean(dm[1])}:Detected`);continue;}const dn=l.match(/^(.+?)\s{2,}(Detected)\s+N\/A/);if(dn){di.push(`${labClean(dn[1])}:Detected`);continue;}if(/(?<!Not\s)Detected/.test(l)){const p=l.split(/\s{2,}/);if(p.length>=2)di.push(`${labClean(p[0])}:Detected`);}}return di.length>0?di.join(', '):'All Not Detected';}let nc=0;for(const l of lines){const t=l.trim().replace(/＜/g,'<').replace(/＞/g,'>');const mm=t.match(/\d+\.MIC/g);if(mm){nc=Math.max(nc,mm.length);continue;}const tk=t.split(/\s+/);let c=0;for(let x=tk.length-1;x>=1;x--){if(rp.test(tk[x]))c++;else break;}if(c>nc)nc=c;}for(let line of lines){line=line.trim().replace(/＜/g,'<').replace(/＞/g,'>');if(!line||line.includes('有疑慮')||line.includes('MIC (')||line.includes('-----')||line.includes('僅供參考')||/\d+\.MIC/.test(line))continue;if(/^\d+\.\s+[A-Za-z]/.test(line)){fmt.push(labClean(line));continue;}if(line.toLowerCase().includes('no growth')||line.toLowerCase().includes('not isolated')){fmt.push(labClean(line));continue;}const tk=line.split(/\s+/);if(nc>0&&tk.length>nc){const res=[];let ok=true;const tc=[...tk];for(let c=0;c<nc;c++){const last=tc[tc.length-1];if(rp.test(last))res.unshift(tc.pop());else{ok=false;break;}}if(ok&&tc.length>0){const nm=tc.join(' ');if(nm.includes('名稱')||nm.includes('結果'))continue;const pts=[];for(let c=0;c<res.length;c++){if(res[c]!=='.')pts.push(nc>1?`${c+1}.${res[c]}`:res[c]);}if(pts.length>0)fmt.push(`${labClean(nm)}:${pts.join(' ')}`);continue;}}if(tk.length>=2&&rp.test(tk[tk.length-1])){const r=tk.pop();const nm=tk.join(' ');if(nm.includes('名稱')||nm.includes('結果'))continue;if(r!=='.')fmt.push(`${labClean(nm)}:${r}`);}else{if(line.replace(/[\.\s]/g,'').length>0)fmt.push(labClean(line));}}return fmt.join(', ');}

function doLabParse(raw){
  const rawLines=raw.split('\n');const mergedLines=[];const mergedToRaw=[];
  const SKIP_LP=/^[\s]*(採檢時間|報告時間|醫囑時間|開單日期|檢查日期|簽收時間|執行時間|備註|Comments|項\s*目|結\s*果|-------|SCREEN TEST|SEDIMENTS|\[Blood\]|\[Urine\]|\[STOOL\]|\[分生\]|============|【委外|【STOOL|Blood Group|Rh D type|WBC-DC|BIO comment)/;
  const VP=/(?:^|\s)(?:[HHL]{1,2}\s+)?(?:[<>＜＞]*\d[\d\.]*|Detected|Not\s+Detected|Reactive|Nonreactive|Positive|Negative)/i;
  const HV=/(?:[HHL]{1,2}\s+)?(?:[<>＜＞]*-?\d[\d\.]*\s+(?:g\/dL|mg\/dL|mEq\/L|mmol|mmHg|U\/L|ng\/mL|pg\/mL|ug\/dL|sec|%|IU|10\^|u\/g|E\.U\.|Cells|cells|\/CMM|\/LPF|\/100)|Detected|Reactive|Nonreactive|Positive|Negative|\d+\+|\btrace\b|\d[\d\.]*\s{3,})/i;
  for(let i=0;i<rawLines.length;i++){const line=rawLines[i],trimmed=line.trim(),nextLine=i+1<rawLines.length?rawLines[i+1]:'',nextTrimmed=nextLine.trim();if(SKIP_LP.test(trimmed)||!trimmed){mergedLines.push(line);mergedToRaw.push(i);continue;}const hasEng=/[A-Za-z]/.test(trimmed),lineHasVal=HV.test(trimmed),nextIsIV=/^\s{10,}/.test(nextLine)&&VP.test(nextTrimmed),nextIsSkip=SKIP_LP.test(nextTrimmed);if(hasEng&&!lineHasVal&&nextIsIV&&!nextIsSkip&&nextTrimmed.length>0){if(/^\(.*\)$/.test(trimmed)){mergedLines.push(line);mergedToRaw.push(i);continue;}let vs=nextTrimmed;const rs=vs.match(/^(.+?)\s{5,}(Not\s+Detected|Negative|Positive|Nonreactive|Reactive|Grayzone|Equivocal)/i);if(rs)vs=rs[1].trim();mergedLines.push(line.match(/^(\s*)/)[1]+trimmed+'  '+vs);mergedToRaw.push(i);i++;}else{mergedLines.push(line);mergedToRaw.push(i);}}
  const lines=mergedLines;const blocks=[];let cur=null,ctx="",unpL=[],unpR=[];let isCult=false,curCult=null,lastPN="",inRepNote=false,curCols=null,nucMedItem=null,inNucRem=false;
  const dateRx=/(?:採檢時間|\[採檢時間\]|\[採檢日期\]|檢體日期)\s*[:：]?\s*(\d{4})\/(\d{1,2})\/(\d{1,2})(?:[\sT]+(\d{1,2})[:;](\d{1,2}))?/;
  const ensB=()=>{if(!cur)cur=labCreateBlock("未知日期",0);};
  for(let i=0;i<lines.length;i++){const rawLine=lines[i];let line=rawLine.trim();if(!line)continue;
    if(/^={3,}/.test(line)||/^[-_]{4,}/.test(line))continue;
    if(line.includes('LAB')&&(line.includes('速件')||line.includes('常規')))continue;
    if(/^\d{4}\/\d{1,2}\/\d{1,2}.*\d{1,2}[:;]\d{1,2}/.test(line)&&!line.includes('採檢時間'))continue;
    if(line.includes('Not Detected')){const dc=(line.match(/(?<!Not\s)Detected/g)||[]).length;const ndc=(line.match(/Not\s+Detected/g)||[]).length;if(dc===0&&ndc>0&&(/^\s*Not\s+Detected/.test(line)||/^N\/A/.test(line))){lastPN="";continue;}}
    const dm=line.match(dateRx);
    if(dm){if(cur){labFlushXM(cur);blocks.push(cur);}const yy=dm[1].substring(2),mm=dm[2].padStart(2,'0'),dd=dm[3].padStart(2,'0'),hh=dm[4]?dm[4].padStart(2,'0'):'00',min=dm[5]?dm[5].padStart(2,'0'):'00';const ts=(dm[4]&&dm[5])?`${hh}:${min}`:'';cur=labCreateBlock(`${yy}/${mm}/${dd}`,parseInt(`${yy}${mm}${dd}${hh}${min}`),ts);curCols=null;inRepNote=false;ctx="";isCult=false;nucMedItem=null;inNucRem=false;lastPN="";continue;}
    if(line.includes('核醫')&&line.includes('免疫')){nucMedItem=null;inNucRem=false;continue;}
    const nmi=line.match(/^ITEM\s+(?:Radio)?[Ii]mmunoassay\s+for\s+(.+?)(?:\s*\(委託檢驗\))?\s*$/);if(nmi){nucMedItem=nmi[1].trim();inNucRem=false;continue;}
    if(/^REMARKS:\s/.test(line)||/^REMARKS:\s*$/.test(line)){inNucRem=true;continue;}
    if(inNucRem){if(!line||/^[\[【]/.test(line)||/^採檢時間/.test(line)||/^ITEM\s/.test(line)||/核醫/.test(line)||/^檢體日期/.test(line))inNucRem=false;else continue;}
    if(line.includes('RESULT:')){ensB();const rm=line.match(/RESULT:\s*([HHL]{1,2})?\s*([<>＜＞]*[\d\.]+)\s*(\S+)?(?:\s+\(([^)]+)\))?/);const rs=line.match(/RESULT:\s*(Nonreactive|Reactive|Positive|Negative)/i);if(rm||rs){let rn=nucMedItem||"AFP",rv,ru='',rq='';if(rm){rv=rm[2].replace(/＜/g,'<').replace(/＞/g,'>');ru=rm[3]||'';rq=rm[4]||'';}else rv=rs[1];let mn=labMapName(rn)||rn;let fs=`${mn}:${rv}${ru}`;if(rq)fs+=` (${rq})`;cur.labs.push({name:mn,fullString:fs});nucMedItem=null;}continue;}
    const cmvM=line.match(/CMV\s+PCR\s+(\d+)\s*/);if(cmvM){ensB();cur.labs.push({name:"CMV PCR",fullString:`CMV PCR:${cmvM[1]}IU/mL`});continue;}
    const vlM=line.match(/viral\s+load\s+[HHL]*\s*([<>]?\d+)\s*(IU\/mL)?/);if(vlM){ensB();cur.labs.push({name:"CMV viral load",fullString:`${ctx?ctx+':':''}CMV viral load:${vlM[1]}IU/mL`});continue;}
    if(/viral\s+load\s+log/i.test(line))continue;if(/CMV\s+Quantitative\s+PCR/i.test(line))continue;
    const xpM=line.match(/病人血型\s*[:：]?\s*(\S+)/);if(xpM){ensB();cur.labs.push({name:"病人血型",fullString:`病人血型:${xpM[1]}`});continue;}
    const xdM=line.match(/血袋血型\s*[:：]?\s*(\S+)/);if(xdM){ensB();cur.labs.push({name:"血袋血型",fullString:`血袋血型:${xdM[1]}`});continue;}
    const xrM=line.match(/(?:配合試驗|Crossmatch(?:ing)?)\s*[:：]?\s*(\S+)/);if(xrM){ensB();if(cur.xmBuffer.bag)labFlushXM(cur);cur.xmBuffer.result=xrM[1];if(cur.xmBuffer.bag)labFlushXM(cur);continue;}
    const xbM=line.match(/(?:血袋號碼|Bag\s*No)\s*[:：]?\s*(\w+)/);if(xbM){ensB();cur.xmBuffer.bag=xbM[1];if(cur.xmBuffer.result)labFlushXM(cur);continue;}
    const sM=line.match(/since\s+(\d+)\s*h\/o/i);if(sM){ensB();cur.labs.push({name:'since',fullString:`since:${sM[1]}h/o`});}
    const bgM=line.match(/(?:血型)\s+([ABO]+|AB)/);if(bgM){ensB();cur.bloodGroup.abo=bgM[1];continue;}
    if(line.includes('Rh D type')&&i+1<lines.length){const nx=lines[i+1].trim();if(nx.match(/Positi|Pos|\+/i)||nx.match(/Negati|Neg|-/i)){ensB();cur.bloodGroup.rh=nx.match(/Positi|Pos|\+/i)?'+':'-';i++;continue;}}
    if(line.includes('[檢驗項目]')){ensB();let t=line.replace(/\[檢驗項目\]:/g,'').trim();if(t.includes(':'))t=t.split(':')[1].trim();curCult={date:cur.dateStr,title:t,lines:[]};cur.culture.push(curCult);isCult=true;continue;}
    if(isCult){if(line.includes('生物參考區間')||line.includes('報告備註')||line.includes('採檢時間')){if(line.includes('採檢時間'))i--;if(line.includes('報告備註'))inRepNote=true;isCult=false;curCult=null;}else if(!line.includes('-------')&&!line.includes('=======')){if(curCult){let c=line.replace('Detected Bin 10','').trim();if(!c.startsWith('[')&&!c.includes('備註')&&!EXCLUDED_KW.some(k=>line.includes(k)))curCult.lines.push(c);}}continue;}
    if((line.startsWith('【')&&line.endsWith('】'))||(line.startsWith('[')&&line.endsWith(']'))){const h=line.replace(/[【】\[\]]/g,'').trim();if(BLOCK_PREFIXES[h]){ctx=BLOCK_PREFIXES[h]==="Blood"?"":BLOCK_PREFIXES[h];continue;}if(WAIWEI_BLOCKS.some(w=>h.includes(w))){ctx="";curCols=null;continue;}}
    if(/報告備註|檢體備註/.test(line)){inRepNote=true;continue;}
    if(inRepNote){if(/採檢時間|^\[檢驗項目\]|^====|^----/.test(line))inRepNote=false;else continue;}
    if(line.includes('多標的核酸檢測')||line.includes('FILMARRAY')||/Panel.*核酸檢測|病原體核酸檢測/.test(line)){let t=line.trim();if(t.includes('FILMARRAY'))t="FILMARRAY呼吸道病原體多標的核酸檢測";ensB();cur.pcr.header=(ctx?`[${ctx}]`:"")+t;continue;}
    if(line.startsWith('[')&&line.endsWith(']'))continue;
    if(/^\[報告備註\]|^\[檢體備註\]/.test(line))continue;
    if(line.includes('項')&&line.includes('名')&&(line.includes('結果')||line.includes('結 果'))){const d=labDetectCols(rawLine);if(d)curCols=d;continue;}
    if(EXCLUDED_KW.some(k=>line.includes(k)))continue;
    if(line.includes('-------'))continue;
    if(/^=\d/.test(line))continue;
    if(/^[\u4e00-\u9fa5（）\(\)、]+$/.test(line))continue;
    if(/^\d+\.\s*[\u4e00-\u9fa5]/.test(line))continue;
    if(/^【註\d+】/.test(line))continue;
    if(/^\d{4}\s+[\u4e00-\u9fa5]/.test(line))continue;
    if(/^血袋號碼/.test(line))continue;
    if(/^\d{4}[A-Z]\d$/.test(line))continue;
    if(/^Limit of detection/i.test(line))continue;
    if(/^\[工\s*作\s*號\]/.test(line))continue;
    if(/^\(B\.M\.\)|^\(CD\d|^ALL\(CD/.test(line))continue;
    if(/^Hb-EP\s*\(/.test(line))continue;
    if(/^[<>＜＞]\d+\s+[\u4e00-\u9fa5]/.test(line))continue;
    if(/^\S+\s+N\/A\s+N\/A/.test(line))continue;
    if(/^(?:\d+-\d+歲|Newborn|＞\d+歲|＜\d+歲|>\d+歲|<\d+歲)\s*[\(（]?.*[:：]\s*[\d＜＞<>]/.test(line))continue;
    if(/^(?:Men|Women|Pre-menopausal|Menopausal|Post-menopausal|Children|Adult|Male|Female)\s+[\d<>＜＞]/i.test(line))continue;
    if(/^(?:Child|Adults?|Neonates?|Infant|Pediatric|Adolescent)\s*[\(（]?.*[:：]\s*[\d<>＜＞]/i.test(line))continue;
    if(/^(?:定量方法|定性方法|＜[\d\.]+\s*(?:MIU|S\/CO|IU)|[≧≤<>＜＞][\d\.]+\s*(?:MIU|S\/CO|IU))/i.test(line))continue;
    if(/^\d+[\.\d]*-[\d\.]+:\s*(?:Borderline|NEGATIVE|POSITIVE)/i.test(line))continue;
    if(/^REFERENCE\s+RANGE/i.test(line))continue;
    if(/^\(委託/.test(line))continue;
    if(/^[\u4e00-\u9fa5ＩＧＭ]+\s*$/.test(line))continue;
    if(/^\s*(Negative|Positive|Grayzone|Equivocal)\s*:/i.test(line))continue;
    ensB();
    if(ctx!=='Urine'&&labTryCBC(line,cur.cbc))continue;
    if(line.startsWith('1.'))continue;
    const voM=line.match(/^(Not\s+Detected|Detected)\s*(.*)?$/i);
    if(voM&&lastPN){ensB();let vn=labMapName(lastPN);if(vn){const eo={name:vn,value:voM[1],unit:'',fullString:`${vn}:${voM[1]}`};if(!cur.labs.some(e=>e.fullString===eo.fullString))cur.labs.push(eo);}lastPN="";continue;}
    if(/E\.S\.R\.\s+1hr/i.test(line))line=line.replace(/E\.S\.R\.\s+1hr/i,'E.S.R.');
    line=line.replace(/\)([HHL]{1,2})\s+([<>＜＞]*[\d])/,') $1 $2');
    const isPcr=cur?!!cur.pcr.header:false;
    if(isPcr){line=line.replace(/\bNot\s*$/i,'Not Detected');line=line.replace(/\bDet\s*$/i,'Detected');}
    if(isPcr&&cur.pcr.header){const pm=line.match(/^(.+?)\s{3,}(Not\s+Detected|Detected)\s*(?:\s{2,}(?:Not Detected|N\/A))?$/i);if(pm){if(/^Detected/i.test(pm[2]))cur.pcr.results.push(`${pm[1].trim()}: ${pm[2].trim()}`);continue;}if(/\bN\/A\b/.test(line)&&!/(?<!Not\s)Detected/.test(line))continue;}
    let parsed=labParseGenLine(line,isPcr);
    if(!parsed&&curCols)parsed=labParseByCols(rawLine,curCols);
    if(parsed){let dV=parsed.value,mN=labMapName(parsed.name);
      if(!mN&&lastPN&&dV.startsWith('Detected')){mN=labMapName(lastPN);lastPN="";}
      if(cur.pcr.header&&dV.startsWith('Detected')){let rem=parsed.unit+" "+(parsed.rest||"");dV=`${dV} ${rem.replace(/\s+Not Detected.*$/,'').trim()}`;cur.pcr.results.push(`${mN}: ${dV}`);continue;}
      if(ctx)mN=`${ctx}:${mN}`;
      let fU=parsed.unit;
      if(dV.includes('Detected')){let rem=parsed.unit+" "+(parsed.rest||"");dV=`${dV} ${rem.replace(/\s+Not Detected.*$/,'').trim()}`;fU='';}else{if(fU==='mmol/')fU='mmol/L';if(fU==='mg/')fU='mg/dL';if(/^(Negative|Positive|Grayzone|Equivocal|Nonreactive|Reactive)/i.test(fU))fU='';if(INVALID_UNITS.some(u=>fU.toLowerCase()===u.toLowerCase())||fU===dV)fU='';}
      if(mN){if(i+1<lines.length){const nL=lines[i+1].trim();if(/^(Reactive|Nonreactive|Positive|Negative)$/i.test(nL)&&!nL.includes(':')){dV+=` (${nL})`;i++;}}
        let isUr=false,uN=mN;const pnt=parsed.name.trim();
        if(URINE_MAP[pnt]){uN=URINE_MAP[pnt];isUr=true;}else{for(const k in URINE_MAP){if(/[\u4e00-\u9fa5]/.test(k)&&pnt.includes(k)){uN=URINE_MAP[k];isUr=true;break;}}}
        if(!isUr&&ctx==='Urine'){isUr=true;const on=labMapName(parsed.name);uN=fU&&fU.includes('/')?`${on}(${fU.replace('cells/','')})`  :on;}
        const isStV=/^(Reactive|Nonreactive|Positive|Negative)$/i.test(dV);
        const labL=isUr?cur.urine:cur.labs;
        if(isStV&&labL.length>0){const prev=labL[labL.length-1];if(prev.name===(isUr?uN:mN)){prev.fullString=`${prev.name}:${prev.value}${prev.unit||''} (${dV})`;continue;}}
        const eo={name:isUr?uN:mN,value:dV,unit:fU,fullString:`${isUr?uN:mN}:${dV}${fU}`};
        if(isUr){if(!cur.urine.some(e=>e.fullString===eo.fullString))cur.urine.push(eo);}
        else{if(!cur.labs.some(e=>e.fullString===eo.fullString))cur.labs.push(eo);}lastPN="";}
    }else{const hasN=/\d/.test(line),hasS=/Positive|Negative|Detected|trace/i.test(line);
      if(!hasS&&!line.includes(':')){if(!EXCLUDED_KW.some(k=>line.includes(k))){if(!/^\d{4}\/\d{1,2}\/\d{1,2}/.test(line))lastPN=line.trim();}}
      if(/^\d{3,}\s+[A-Za-z]/.test(line))continue;if(/^[\(（].*[\)）]\s*\d+/.test(line))continue;if(line.includes('============'))continue;if(/^\d{4}\/\d{1,2}\/\d{1,2}/.test(line))continue;
      if((hasN||hasS)&&/[A-Za-z\u4e00-\u9fa5]/.test(line)){if(!line.includes('Blood Group')&&!line.includes('Rh D type')){unpL.push(`【${cur?cur.dateStr:'未知日期'}】 [未解析] ${line}`);unpR.push(mergedToRaw[i]);}}}}
  if(cur){labFlushXM(cur);blocks.push(cur);}
  return labRenderBlocks(blocks,unpL,unpR);
}

function labRenderBlocks(blocks,unpL,unpR){
  blocks.sort((a,b)=>a.sortTime-b.sortTime);
  const dg=new Map();
  for(const b of blocks){if(!dg.has(b.dateStr))dg.set(b.dateStr,[]);const tb=dg.get(b.dateStr);const ex=tb.find(t=>t.timeStr&&b.timeStr&&t.timeStr===b.timeStr);if(ex){Object.assign(ex.cbc,b.cbc);ex.labs.push(...b.labs.filter(l=>!ex.labs.some(e=>e.fullString===l.fullString)));ex.urine.push(...b.urine.filter(u=>!ex.urine.some(e=>e.fullString===u.fullString)));ex.culture.push(...b.culture);if(b.bloodGroup.abo)ex.bloodGroup=b.bloodGroup;if(b.pcr.header){if(!ex.pcr.header)ex.pcr=b.pcr;else ex.pcr.results.push(...b.pcr.results);}}else tb.push(b);}
  let out="";
  for(const[ds,tbs]of dg){const single=tbs.length===1;for(const b of tbs){let li=[];
    if(b.bloodGroup.abo){let s=`血型:${b.bloodGroup.abo}`;if(b.bloodGroup.rh)s+=`,Rh D:${b.bloodGroup.rh}`;li.push(s);}
    const c=b.cbc;if(Object.keys(c).length>0){if(c.WBC){let dc=`${c.Band||0}-${c.Seg||0}-${c.Eosin||0}-${c.Baso||0}-${c.Mono||0}-${c.Lymp||0}`;if(c.Metamyelocyte&&c.Metamyelocyte!=='0')dc+=`-Meta${c.Metamyelocyte}`;if(c.Myelocyte&&c.Myelocyte!=='0')dc+=`-Myelo${c.Myelocyte}`;li.push(`WBC/DC:${c.WBC}(${dc})`);}if(c.Hb)li.push(`Hb:${c.Hb}g/dL`);if(c.Ht)li.push(`Ht:${c.Ht}%`);if(c.PLT)li.push(`PLT:${c.PLT}10^3/uL`);if(c.RBC)li.push(`RBC:${c.RBC}10^6/uL`);if(c.Normoblast&&c.Normoblast!=='0')li.push(`Normoblast:${c.Normoblast}/100`);if(c.Reticulocyte)li.push(`Reti:${c.Reticulocyte}/1000`);if(c.RDW)li.push(`RDW:${c.RDW}%`);if(c.MDW&&!c.MDW.includes('MO分析')&&!c.MDW.includes('無法分析'))li.push(`MDW:${c.MDW}`);}
    if(b.labs.length>0){let items=b.labs.sort((a,b)=>{if(a.name==='since')return-1;if(b.name==='since')return 1;return labSortIdx(a.name)-labSortIdx(b.name);});li.push(...items.map(x=>labClean(x.fullString)));}
    if(b.urine.length>0)li.push(`[Urine analysis]${b.urine.map(x=>labClean(x.fullString)).join('; ')}`);
    if(b.pcr.header){if(b.pcr.results.length>0)li.push(`${b.pcr.header} ${b.pcr.results.map(r=>labClean(r)).join('; ')}`);else li.push(`${b.pcr.header}: All not detected`);}
    b.culture.forEach(cu=>{let dt=cu.title;if(dt==="血清-URINE")dt="Urine";const ct=labFmtCulture(cu.lines);if(ct)li.push(`${dt}:${labClean(ct)}`);});
    if(li.length>0){if(single||!b.timeStr)out+=`【${ds}】 ${li.join('; ')}\n`;else out+=`【${ds} ${b.timeStr}】 ${li.join('; ')}\n`;}}}
  if(unpL.length>0){out+=`\n=== 【未解析/原始資料】 ===\n`;out+=unpL.join('\n');}
  out=out.replace(/\n\s*\n/g,'\n');
  return{text:out,unparsedCount:unpL.length,unparsedRawLines:unpR||[]};
}
//__LABPARSE_END__

if(typeof window!=='undefined')window.LabParse={doLabParse:doLabParse,labMapName:labMapName};
if(typeof module!=='undefined')module.exports={doLabParse:doLabParse,labMapName:labMapName};
