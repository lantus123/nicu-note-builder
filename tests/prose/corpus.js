// 20 情境語料庫：涵蓋路徑×風險×呼吸×急救 的代表性組合
const {render}=require('./driver');
const fs=require('fs');
const msel=(k,v)=>({click:`[data-msel="${k}"] [data-v="${v}"]`});
const r3=(k,v)=>({click:`[data-r3="${k}"] [data-v="${v}"]`});
const am=(k,v)=>({click:`[data-am="${k}"] [data-v="${v}"]`});
const seg=(k,v)=>({click:`[data-seg="${k}"] [data-v="${v}"]`});
const ryn=(k,v='yes')=>({click:`[data-ryn="${k}"] [data-v="${v}"]`});
const rc=(k,v)=>({click:`[data-rc="${k}"] [data-v="${v}"]`});
const re=(k,v)=>({click:`[data-re="${k}"] [data-v="${v}"]`});
const tog=k=>({click:`[data-tog="${k}"] button`});
const set=(id,v)=>({set:[id,v]});
const hcm=(k,v)=>({click:`[data-hcm="${k}"] [data-v="${v}"]`});
const hct=k=>({click:`[data-hct="${k}"] button`});
const hc=(k,v)=>({click:`[data-hc="${k}"] [data-v="${v}"]`});
const birth=kind=>({click:`[data-add-birth="${kind}"]`});
// These synthetic histories explicitly confirm the interventions and settings that
// the former cumulative selector implied; production defaults are no longer facts.
const PPV_ETT=[set('birthResusStatus','performed'),birth('ppv'),
  set('event-1-fiO2','21'),set('event-1-pip','20'),set('event-1-peep','5'),set('event-1-device','Neopuff'),
  birth('intubation'),set('event-2-fiO2','30'),set('event-2-pip','18'),set('event-2-peep','5'),set('event-2-rr','40')];

const BASE=[seg('gender','male'),set('matAge','32'),set('gravida','2'),set('para','1'),set('ap1','8'),set('ap5','9'),{click:'[data-scrall] [data-v="neg"]'}];   // 篩檢預設已改未表態,BASE 代表典型用法=按「全部陰性」;14 不含 BASE 故自動覆蓋 na 佔位路徑
const S={};
S['01_早產31w_直接入院_RDS_surfactant']=[...BASE,set('gaW','31'),set('gaD','4'),set('bw','1480'),
  seg('delivery','cs'),tog('csUncompl'),ryn('steroid'),re('steroid','complete'),
  seg('pathway','direct'),am('resp','NCPAP'),
  hct('workup'),hct('surf'),hcm('surfReason','o2'),hcm('surfReason','retraction'),hc('surfDrug','curosurf'),hc('surfRoute','lisa'),hct('improved'),
  hcm('cxrDx','rds2'),hc('infMarkers','none'),hc('abxPlan','cultures')];
S['02_極早產24w_插管_PIH']=[...BASE,set('gaW','24'),set('gaD','2'),set('bw','620'),set('ap1','4'),set('ap5','6'),
  seg('delivery','cs'),ryn('pih'),ryn('steroid'),re('steroid','incomplete'),seg('mgso4','neuro'),
  seg('pathway','direct'),...PPV_ETT,set('birthFinalSupport','ett'),seg('obRespType','ett'),set('obRespRelation','continued'),
  hct('workup'),hct('aline'),hct('surf'),hcm('surfReason','o2'),hcm('cxrDx','rds3')];
S['03_足月MSAF_胎兒窘迫_CPR_MAS']=[...BASE,set('gaW','39'),set('gaD','1'),set('bw','3180'),set('ap1','3'),set('ap5','7'),
  seg('delivery','nsd'),tog('fd'),tog('msaf'),seg('msafGrade','thick'),tog('doic'),
  seg('pathway','direct'),...PPV_ETT,birth('compressions'),birth('epinephrine'),set('event-4-drugRoute','ETT'),
  hcm('cxrDx','mas'),hct('workup'),hc('abxPlan','course')];
S['04_晚期早產35w_TTN_嬰兒室轉入']=[...BASE,set('gaW','35'),set('gaD','0'),set('bw','2350'),
  seg('delivery','nsd'),seg('pathway','nursery'),seg('pwOnset','developed'),set('pwOnsetH','3'),set('pwOnsetUnit','hours'),msel('obSx','tachypnea'),
  am('resp','NCPAP'),hcm('cxrDx','ttn')];
S['05_GDM_LGA_低血糖']=[...BASE,set('gaW','38'),set('gaD','3'),set('bw','4020'),
  seg('delivery','cs'),ryn('gdm'),rc('gdm','insulin'),seg('pathway','nursery'),seg('pwOnset','developed'),msel('obSx','hypoglycemia')];
S['06_PROM18h_GBS陽性_敗血症風險']=[...BASE,set('gaW','36'),set('gaD','5'),set('bw','2680'),
  seg('delivery','nsd'),ryn('prom'),set('promH','18'),ryn('fever'),{cycle:['.scr-row[data-scr="gbs"] .scr-btn','pos']},seg('iap','incomplete'),
  seg('pathway','direct'),hct('workup'),hc('infMarkers','crp'),
  am('abx','Ampicillin (200 mg/kg/day)'),am('abx','Gentamicin (4 mg/kg/dose)'),hc('abxPlan','cultures')];
S['07_外接outborn三段']=[...BASE,set('gaW','33'),set('gaD','2'),set('bw','1890'),
  seg('delivery','nsd'),seg('pathway','outborn'),seg('obRespType','o2'),seg('obO2Dev','hood'),hcm('cxrDx','rds1'),hct('workup')];
S['08_出生後會診']=[...BASE,set('gaW','37'),set('gaD','6'),set('bw','2890'),
  seg('delivery','nsd'),seg('pathway','direct'),tog('pwConsult'),msel('obSx','grunting'),seg('obRespType','o2'),seg('obO2Dev','hood')];
S['09_產前standby']=[...BASE,set('gaW','29'),set('gaD','0'),set('bw','1180'),
  seg('delivery','cs'),ryn('pih'),seg('pathway','direct'),tog('pwStandby'),am('resp','NCPAP'),hct('workup')];
S['10_preeclampsia_MgSO4_APH']=[...BASE,set('gaW','30'),set('gaD','5'),set('bw','1350'),
  seg('delivery','cs'),r3('pre','confirmed'),ryn('aph'),seg('mgso4','seizure'),ryn('steroid'),re('steroid','complete'),
  seg('pathway','direct'),am('resp','NCPAP'),hct('workup'),hcm('cxrDx','rds1'),hcm('cxrDx','pmd')];
S['11_家族史_菸酒']=[...BASE,set('gaW','38'),set('gaD','0'),set('bw','2980'),
  seg('delivery','nsd'),ryn('uri'),tog('thyMed'),seg('thyType','hypo'),
  {click:'[data-habit="smoking"] button'},seg('pathway','nursery'),msel('obSx','tachypnea')];
S['12_amnio_NIPT_SGA']=[...BASE,set('gaW','36'),set('gaD','2'),set('bw','1850'),
  seg('amnio','normal'),seg('nipt','low'),seg('delivery','nsd'),seg('pathway','direct'),hct('workup')];
S['13_低Apgar_DOIC_急救插管']=[...BASE,set('gaW','32'),set('gaD','6'),set('bw','1720'),set('ap1','2'),set('ap5','5'),
  seg('delivery','cs'),tog('fd'),tog('doic'),seg('pathway','direct'),...PPV_ETT,
  set('birthFinalSupport','ett'),seg('obRespType','ett'),set('obRespRelation','continued'),
  hct('workup'),hct('aline'),hct('bicarb'),hcm('cxrDx','rds2'),hcm('cxrDx','ptx')];
S['14_稀疏欄位_佔位符測試']=[seg('gender','female'),set('gaW','34'),set('bw','2100'),seg('pathway','direct')];
S['15_雙氧氣症狀_嬰兒室觀察後轉入']=[...BASE,set('gaW','36'),set('gaD','0'),set('bw','2450'),
  seg('delivery','nsd'),seg('pathway','nursery'),seg('pwOnset','developed'),set('pwOnsetH','6'),set('pwOnsetUnit','hours'),msel('obSx','cyanosis'),msel('obSx','desaturation'),
  seg('obRespType','o2'),seg('obO2Dev','hood'),hcm('cxrDx','ttn'),hcm('cxrDx','infl'),hct('workup'),hc('infMarkers','both'),hc('abxPlan','improve')];
S['16_足月順產_觀察']=[...BASE,set('gaW','40'),set('gaD','1'),set('bw','3350'),
  seg('delivery','nsd'),seg('pathway','direct'),set('birthResusStatus','none'),tog('birthNegConfirmed')];

S['17_amnio異常_NIPT未做']=[...BASE,set('gaW','35'),set('gaD','1'),set('bw','2240'),
  seg('amnio','abnormal'),seg('delivery','nsd'),seg('pathway','direct'),hct('workup')];
S['18_HBsAg陽性']=[...BASE,set('gaW','38'),set('gaD','2'),set('bw','3050'),
  seg('delivery','nsd'),{cycle:['.scr-row[data-scr="hbsag"] .scr-btn','pos']},seg('pathway','nursery'),msel('obSx','tachypnea')];
S['19_GBS_pending_IAP不足']=[...BASE,set('gaW','34'),set('gaD','4'),set('bw','2180'),
  seg('delivery','nsd'),{cycle:['.scr-row[data-scr="gbs"] .scr-btn','pend']},seg('iap','incomplete'),ryn('prom'),set('promH','20'),
  seg('pathway','direct'),hct('workup'),hc('abxPlan','cultures')];
S['20_家族史陽性_地中海貧血']=[...BASE,set('gaW','37'),set('gaD','0'),set('bw','2760'),
  seg('delivery','nsd'),{click:'[data-par="thal"] [data-v="mother"]'},seg('pathway','direct')];

function run(){
  const out={};
  for(const [name,steps] of Object.entries(S)){
    try{ const r=render({steps}); out[name]={...r.out, _misses:r.misses, _errors:r.errors}; }
    catch(e){ out[name]={error:e.message}; }
  }
  return out;
}
module.exports={run,S};
if(require.main===module){
  const out=run();
  fs.writeFileSync(__dirname+'/'+(process.argv[2]||'current')+'.json', JSON.stringify(out,null,1));
  console.log('完成', Object.keys(out).length, '情境');
}
