# Admission 順向填寫與欄位輸出對照（2026-10-03）

此對照涵蓋本次 Admission 工作流程、八組 E 模組與受影響的 Acceptance／NI plan／Procedure 連動。不是對所有歷史功能或任意自由文字的醫療正確性背書。所有病歷仍須由醫師通讀後貼回 HIS。

## 填寫順序與資料歸屬

1. 本次入院設定：路徑、E 的來源與問題、收治單位、出生／入院日期時間、DOL。
2. 產前：母親 G/P/A、病史、產檢、篩檢、產程用藥，保留 chart 順序。
3. 出生：性別、GA、出生體重、實際出生院所、生產方式、Apgar、團隊介入、觀察、處置、處置後狀況。E 也能直接填寫。
4. 入院病程：直接入院兩階段；嬰兒室三階段；外院轉入五階段；E 三階段（出院與返家基準 → 症狀與變化 → 評估與收治）。
5. 核對：關鍵資料未填、已記錄待確認、前後不一致／格式問題分開列出；其他重點選填空白預設收合、中性顯示，不算錯誤。其後是暫定診斷、母病歷號、家庭樹。

情境選擇不捲動到頁面下方。直接入院的 A/B 在出生段選 standby／出生後會診；未選不推定團隊介入。出生事件不再藏在入院 stepper。前後不同時間的實際處置不視為重複事件。

住院去處只列 NBC／NICU／PICU；BR 為健康新生兒照護，不是住院去處。C 保留尚未返家、由 BR 因病轉入病房的經過；E 已返家，只能選 NBC／PICU，不能選 NICU。情境與去處不相容時明確提示、取消去處但不代選；切回舊路徑會恢復該路徑的去處草稿並再次驗證。Admission／Acceptance、階段標題與最終核對共用同一白名單，未選或無效值只輸出佔位符。

PICU 專用 NI plan 尚未建立，顯示說明但不自動套用 NICU 醫囑；未確認去處亦不預設 NICU。此限制不影響 PICU 的 Admission／Acceptance，也不新增 PICU 治療規則、門檻或劑量。

initializeAdmissionWorkflow 只搬動既有 DOM 控制項，保留 ID；各事實只有一份可編輯來源。renderAdmissionWorkflow 管理來源摘要、條件欄位與時點引用。renderJourney 保留固定工作區，輸入不自動換段；切換階段保留當次開頁資料及可恢復的焦點／相對位置。

workflowNav 是唯一固定列（時序帶，2026-10-06 取代原 flow-nav），分頁不固定。五段一次只顯示一段：`applyStageVisibility` 以 `data-stage-off`（不是 `hidden`）切換卡片，`hidden` 仍只代表「資料條件不適用」，所以核對清單的數值檢查與跳轉判斷不受換段影響。段標頭帶 `data-flow-target`、病程節點帶 `data-phase-target`；`renderStageBand` 只在節點組成改變時重建節點，其餘只換 class／文字。段狀態與節點警示由 `stageReviewGroups` 依核對清單既有結果（`lastReviewLists`＋`reviewTargets`）以目標欄位所在段／`phaseForElement` 分組，不另寫檢查規則。換段回頂端；journeyViews 仍只存本次頁面病程站點的焦點及相對位置；視窗寬度改變後不套用舊寬度的病程捲動偏移。導覽高度在定位前同步量測，ResizeObserver 處理後續尺寸變化。填寫中可複製草稿，核對階段才強調複製病歷。

單選重點不取消；允許空值的群組有獨立清除。資料只由既有狀態／欄位管理，圓形或方形標記不建立另一份臨床來源。單選方向鍵移動焦點，Enter／Space 才選定；多選仍可再點取消。

預覽以 inline note-scope 標記已產生句子的原始階段，不變更正文、空白或段落格式。導航只更新淡色標示，無對應句子時不建立句子。「查看本段」只調整預覽容器的捲動位置；一般輸入及導航不自動捲動預覽，不把顯示偏好存為病人資料。

## 檢核提示直達欄位

timelineReview 在產生每個問題時，以 reviewIssue 同時登記明確 selector 與欄位名稱，不由顯示文字反推位置。四種核對清單與區內提醒共用連結；相同訊息涉及多筆事件或多個欄位時，逐一提供入口。數值範圍提示包含 GA、Apgar 分鐘數、模組或事件序號，避免只顯示「週」。

goToReviewTarget 依實際 DOM 決定章節／階段，開啟收合區和 details，必要時將 E 或 A–D 的對應階段掛回工作區，重新查找並聚焦精確欄位。以實際固定導覽高度定位，短暫框線標示，提供「返回核對」。提示 ID 依訊息與 selector 保持穩定，修正其他問題時不把鍵盤焦點移到另一項。

事件以穩定 event ID 尋找，重排後仍指向同一筆。缺少急救處置時聚焦「新增處置」群組，不點擊 PPV。導航不改情境、模組、預設核對狀態或臨床資料；已切換情境的舊連結回到入口，已移除或條件隱藏的舊欄位回到目前檢核並說明，不自動恢復或啟用資料。提示位置與狀態不寫入病歷或儲存病人資料。

## 可見且直接生效的正常預設

PRENATAL_NORMAL 定義八項母體／妊娠病史的「無」、ancReg「規則」及 us「正常」，直接初始化實際狀態，供 Admission／Acceptance／NI plan 共用。S.prenatalEdited 只追蹤是否修改，用於顯示「預設／目前」來源，不再設待核對或提交機制。

各項有／無／不詳等適用選項均保持可見，移除未記錄選項。下一段、章節選單、返回及切分頁僅導覽，不重新套用正常值。母親習慣 habitStatus 預設 negative，勾選的習慣寫陽性，其餘寫無；unknown 時只將未勾的習慣寫成資料不詳。介面提示正常預設已寫入但不代表已查證。

選擇未產檢會把尚未修改的正常超音波改為 unknown；已有明確結果仍保留。一般產前超音波不推定 level II 已施作。羊穿、NIPT、家族史與用藥不擴大套用正常預設，類固醇初始為不詳。

S.scr 預設 HBsAg／HBeAg／梅毒／HIV／GBS 為 neg，Rubella 為 pos（IgG 有抗體）。Rubella 的 nd 沿用「無抗體」，另以 untested 表示未驗；unknown 均寫 unavailable，不當成 pending 或未驗。S.scrEdited 保護單項手動結果（包括再點已選陰性）；批次只更新未手動修改的四個核心項目，S.scrBatch 標示整批來源。HBeAg 仍只在 HBsAg 陽性時顯示及寫入；Rubella 有抗體不列成異常陽性摘要。

## 共用資料與出生史

| 輸入／狀態 | 輸出或用途 | 邊界 |
| --- | --- | --- |
| birthDate、admissionDate | Admission 日期、DOL；Acceptance DOL/PMA | 入院日預設填寫當天、平常免填；回補時才展開修改，收合後仍顯示實際採用日期。日曆日期差 + 1，出生當天 DOL 1。日期未齊／先後不成立不退回舊 DOL。手動覆寫另行警示。 |
| birthTime、admissionTime | 分別寫出生與入院句；入院時間為 24 小時制 | 不以入院時間計算日曆 DOL；同日入院早於出生提示。 |
| homeHosp、rocYear | 院區與日期顯示設定 | 非病人資料；僅這些偏好等既有設定可儲存於瀏覽器。 |
| birthHosp／obFacility、obTransferFrom | 出生地／外院轉出來源 | 外院路徑出生院所移到出生區。E 留白不推定出生於本院。母親入院句不推定在本院待產。 |
| gender、gaW/D、bw、growth | 開頭、體重分級、背景診斷、Acceptance | 出生體重不當成本次 E 評估體重；既有成長計算規則不改。 |
| gravida、para、abortion、matAge、ap1/5/10 | 母親背景與 Apgar | 共用一次，不在出生處置或 E 重新輸入。 |
| 母親風險、家族史、amnio、nipt | 陽性／陰性／不詳敘述 | 母親風險正常預設直接寫無，例外即時替換。家族史與羊穿／NIPT 不設正常預設。羊穿已有結果時不額外強調 NIPT 未做。 |
| habitStatus、smoking/alcohol/drug | 陽性與陰性習慣史 | 預設無；只勾選特定習慣即寫陽性。不詳只涵蓋尚未勾陽性的項目。 |
| birthBreathing/Tone/HR、birthInitialNote | 出生初始觀察 | 不由 Apgar 推定其他生命徵象。 |
| birthResusStatus、birthEvents | 實際出生處置及重新評估 | 未記錄、確認無、實際施作分開；處置與重新評估可分別記錄。 |
| birthFinalBreathing/Tone/HR/Support/Min/Note | 出生處置後狀況 | 不推定改善、穩定或持續支持。 |
| fd、doic、doicMin、msaf、msafGrade、birthNegConfirmed | 出生事件與已確認陰性 | DOIC 分鐘只填一次；空白或取消選取不等於沒有發生。 |
| csReason、admReason、產前篩檢、iapDrug/Since 等 | 原有產前與產程敘述 | 沿用既有已填資料與條件，不改檢查／治療 protocol。 |

## E 共用病程

| 輸入／狀態 | 輸出或用途 | 邊界 |
| --- | --- | --- |
| readmitSource、readmitProblems、readmitComplaint | 來源、選用模組、其他主訴 | 全部放最上層。其他文字是新增問題，不覆蓋已選問題。Jaundice／prolonged jaundice 共用模組且互斥。 |
| readmitPrior/Unit/Course | 前次照護與治療 | 前次病程是既往史。支持 received／remained 等簡短片語補主詞；不任意改寫其他自由文字。 |
| readmitDischargeDate/Weight、readmitFeeding | 出院句、出院時餵食方式 | 有日期可算出院 DOL；奶種整合至同一出院句，避免漏寫。 |
| readmitBaseline、readmitHomeNote | 返家後基準狀況 | 合併在前次出院同一填寫階段，只寫確認的資料。 |
| readmitOnsetDOL、readmitCourseType | 共用症狀起始時間與性質 | 不預設新發病。純照護／異常篩檢不顯示症狀起始欄。 |
| rm_*_onset | 個別問題起始時間 | 預設沿用共用時間；不同才在展開區另填。超出出生至入院範圍即警示。取代舊 readmitJaundiceDOL。 |
| readmitCourse | 病程補充 | 已選事實不必重述；畫面位於專屬模組及共用狀況之後。 |
| readmitIntake/Urine/Activity | 進食變化、尿量、活動力 | 共用一組，不默認正常。啟用進食模組時不再問奶量是否減少；原本已填的 readmitIntake 保留並可明確移除／復原。 |
| readmitFeedingNote | 進食模組的其他觀察（英文完整句） | 僅進食模組作用中才輸出。與奶量不同，不加上 Oral intake 造成不合文法的前綴。切換路徑保留草稿，不混入其他路徑。 |
| feedingIntakeState | 唯讀奶量摘要、舊快捷描述一致性 | 已知前後數值才判定增減，0 mL 不是空白。同義快捷描述只輸出一次但不刪原值；相反時保留兩份並提醒人工修正。不把返家基準或其他時間的正常進食當成矛盾，不推論自由文字的全部語意。 |
| readmitSickContact | 接觸史完整句 | 不再接到 notable for 後造成子句錯接；快捷陰性需醫師明確點選。 |
| readmitCurrentWeight、readmitSpO2 | 本次評估數值 | 有填才寫。出院至評估體重差顯示在介面，不自動判定脫水。 |
| readmitTSB、readmitDB | 已有 total/direct bilirubin 結果 | 僅黃疸模組有效；未填不強迫檢查，隱藏草稿不輸出。 |
| readmitEvaluation、readmitTreatment | 本次實際評估、已做處置 | 不從入院問題自動建立檢查或治療紀錄。 |
| resp、obAdmissionStatus | 入院時支持與狀況 | E 合併在「評估與收治」階段；不同於接手時狀態。 |
| tentDx | 正式診斷清單及入院結語 | 手填優先且只有一個來源，避免另列同義症狀。選問題只提供症狀級預設，不把 URI 自動確診呼吸窘迫。 |

## 八組專屬模組

RM_MODULES 是欄位定義；rmFields 登記路徑草稿；readmitModuleNarrative 依有效模組寫入 Admission 與 Acceptance。未選模組的值保留在本次開頁，不能進入敘述。不同模組同一時間出現的症狀合成一句；出院前已發生的症狀寫在出院之前。

| 模組 | 欄位（rm_ 前綴） | 輸出 |
| --- | --- | --- |
| jaundice | jaundice_trend、jaundice_onset；共用尿便選項 | 起始與後續變化；不重複新生兒／持續性黃疸兩套起始時間。 |
| respiratory | respiratory_symptoms、respiratory_setting、respiratory_onset | 明選鼻塞、流鼻水、咳嗽、呼吸快／費力及出現情境。 |
| fever | fever_temperature、fever_method、fever_time、fever_onset | 實測 °C、測量方式與日期時間，不從溫度推論病原或確診。 |
| feeding | feeding_usual、feeding_current、feeding_frequency、feeding_onset | 原本與目前每餐 mL、頻率；數值改變用 increased/decreased/unchanged，不另自動推論脫水。 |
| apnea | apnea_type、apnea_count、apnea_duration、apnea_setting、apnea_recovery、apnea_onset | 明選觀察、次數、每次約幾秒、發作情境及實際恢復方式。 |
| gastrointestinal | gastrointestinal_symptoms、gastrointestinal_character、gastrointestinal_count、gastrointestinal_onset | 嘔吐／腹脹／腹瀉／血便；只有選嘔吐才顯示及使用嘔吐物特徵與過去 24 小時次數。 |
| screen | screen_test、screen_result、screen_date | 採檢項目、結果與日期；用轉介評估句，不寫成 developed an abnormal result。 |
| care | care_reason、care_needs | 收治理由與實際需求；不用發病句型，不預設疾病診斷。 |

screen_onset、care_onset 是草稿結構的非臨床佔位，保持隱藏且不讀入病歷。其他 onset 欄位僅在醫師明確另填時覆寫共用起始時間。

## 跨分頁與時間點

- resp 是入院支持；acceptanceResp 是接手支持。只有點「已確認接手時與入院時相同」才複製當時值；之後各自獨立。NI plan 不從 Acceptance 的未確認歷程倒推入院狀態。
- E 的 Acceptance 可沿用入院評估體重，會標記來源；「有重新測量」才填 accGrBW。新測量不改 readmitCurrentWeight；也不把出生體重回填成現在體重。
- E 出生時的急救與插管留在病史，不能自動觸發本次呼吸診斷、現在的呼吸支持或已完成的 Procedure。
- A–D 原有出生、嬰兒室、外院處置、外接及轉送事件仍保留。不同時間的同類處置不能以字串去重刪除。
- D 的 obSx／obCourse 位於轉送途中階段；其敘述在我方到場紀錄之後，症狀以 During transport 定位，不再寫 Before transfer。外院團隊及我方現場處置各由 outside／arrival 事件來源輸出，不與 transport 事件合併。
- 前段支持未記錄時，允許直接選本段方式，不迫使回填歷史。「僅記錄本段使用方式」置於次要說明，不推定持續、開始、停止時間；同前確認仍按 source stamp 失效，不能沿用已改變的來源或參數。
- （2026-10-06 起）obM1Relation／obRespRelation 兩個關係問題已移除：入院前／轉送途中的關係由 `resolvedSupport` 從前一站與本段的值推導（同＝continued、前段 room air＝new、不同＝changed、前段未記錄＝只描述本段）。前一站以唯讀一行顯示；參數不從前段複製。
- 切換路徑保存該次開頁的各路徑草稿（包含 E 模組、來源及手填診斷）。不新增病人資訊的 localStorage 或雲端儲存。

## 驗收與界限

- tests/prose/review-navigation.js：16 項精確定位檢查，涵蓋日期／DOL、E 模組、C／D 階段、出生事件、收合篩檢、穩定焦點與舊提示；比較跳轉前後病歷及臨床狀態。Chrome 腳本另以滑鼠與 Enter／Space 驗證 1440／390／320 px 跳轉、固定列不遮欄位、返回核對、修正後消失與重複事件定位，截圖使用合成資料。
- tests/prose/prenatal-defaults.js：正常值直接寫入、移除未記錄／確認門檻、母親習慣預設與例外、導航不重設、無產檢與超音波邊界、篩檢手動結果保護及跨路徑共享。ui-screening.js 驗證 Rubella 有／無抗體、待報、未驗及不詳的獨立語意。Chrome 試填驗證桌面及 320／390 px 全部選項可見、原地展開、鍵盤導覽、即時病歷與選取樣式，並留存合成資料截圖。
- tests/prose/destination.js：住院去處白名單、E 的 NICU 限制、BR 歷史與本次收治區分、切換路徑草稿、舊值防護及 PICU／未選去處的 plan 邊界。實際 Chrome 試填另驗證 320 px 的去處選項、提示、跨分頁病歷與切回草稿。
- tests/prose/stage-band.js：分段顯示／隱藏、A–E 節點清單與地點分組、段狀態隨填寫變化、節點點擊切段與聚焦、核對跨段跳轉、預覽變淡且複製文字不變、Alt+方向鍵、產前確認清單（項目全在畫面上、只有異常值帶 data-abn）、段尾缺漏連結、以上都對、核對收合、複製把關，以及時間矛盾反映到節點與段標頭（IAP 開始日、產房事件順序、外接來源；第 5 段顯示全部待核對數）。
- tests/prose/workflow.js：順向排列、唯一 ID、DOL 邊界、各模組輸出、混合症狀、陰性／未知、草稿隔離、支持／體重時點、E 既往急救隔離。
- 既有 prose／timeline／downstream／plan／pedigree／navigation／clipboard 等測試繼續執行；變更輸出快照須逐項核對，不能只更新快照掩蓋錯誤。
- tests/prose/browser-workflow.cjs：獨立 Chrome CDP，1440／1366 px 桌面、320／360／390 px 手機尺寸、短視窗及亮／暗主題；檢查 CSS viewport、遮擋、點擊命中、原生文字輸入與複製。混合 E 假病例從入口走到核對，另重新開頁填直接入院 A 及外院轉入 D；檢查返回相對位置、跨分頁、舊進食描述衝突與復原。截圖需由驗收者目視，不只看程式斷言。
- 自動化結果與模擬試填不等同真實住院醫師使用者測試，也不表示任意自由文字的所有語意矛盾都能偵測。檢查與劑量規則未在此次改版重新做醫療有效性驗證。
- tests/prose/browser-clarity.cjs：10 種寬度（320–1920 px）、明暗主題、125%／150% 等效 reflow、按鈕不位移、24 px 共用 grid 間距、階段軸完整、共用分頁與預覽定位；不是原生縮放或 Safari 實機測試。所有原生滑鼠／鍵盤瀏覽器腳本依序執行。

## 院內模板骨架（2026-10-05）

| 輸入／狀態 | 輸出或用途 | 邊界 |
| --- | --- | --- |
| DOL、性別、GA、BW、growth、matAge、G/P/A、出生時間／日期／院所、生產方式、csReason | Admission 開場一句＋ EDC 句 | 缺值規則沿用舊句；只改句型。Acceptance 出生段不變。 |
| complication 陰性清單 | `There was no … during pregnancy.` | 含 PPH 時省略 during pregnancy；陽性仍走 notable for 句。 |
| 四項篩檢全陰性＋rubella | 併為一句 | 任一項非陰性時 rubella 維持獨立句。 |
| admReason | 第二段首句 | 本院出生才寫 to our hospital；外接／E 無原因不出句。 |
| obSx、pwOnset、obRespType（關係由前後值推導）、obRespStable | 入院前段 | 已在出生／產房結束評估寫過的同一所見不重列；Because … persisted 只用於有實際處置動作的支持；時間片語同段一次。 |
| 結語 | Under the tentative diagnosis of … | A–D 不寫入院日期；E 不變；Acceptance 入院句不變。 |
| matOtherHx | `The mother had a history of …`（併發症句之後） | 自由英文；去 `#`／句點；空白不出句；只進 Admission。 |
| birthSigns、birthFinalSigns | 出生／產房結束評估的 with … 名詞片語；相同者 persisted | 比照 labored：不進 DX／plan 規則；參與入院前症狀去重。 |
| toco、tocoReason、tocoGaW/D、tocoSince、tocoUntil、tocoDischarged、tocoAbx | 已出院：第一段末的前次住院句（＋抗生素句），第二段改 readmitted；未出院：第二段原句加 due to | 未選安胎藥時細項隱藏且不輸出；日期不正規化。 |

## 故事線與站內填寫（2026-10-06）

| 輸入／狀態 | 輸出或用途 | 邊界 |
| --- | --- | --- |
| 急救階梯（第 1 區；無狀態，由 birthResusStatus＋birthEvents 推回） | 依 NRP 順序增刪 S.birthEvents（PPV 帶 NRP 預設與 nrp:true），birthResusStatus 同步（無＝none、其他＝performed） | 降階移除多出來的事件；已填參數（NRP 預設不算）先頁內確認，取消不動。 |
| pwStandby／pwConsult（既有旗標） | standby 句、出生後會診句 | 帶子可選站；移除時資料留作草稿、不寫入。 |
| pwBrEval／pwTransport（新旗標，同類型） | 讓嬰兒室抽血評估（C）、轉送途中（D）出現在故事裡 | 有資料就算在故事裡；移除有資料的站先確認並清空該站資料。 |
| 事件 response（improved／partial／none） | 處置句尾 `, after which heart rate and oxygen saturation improved`／`, with partial improvement`／`, without improvement` | 空＝不寫；再評估沒有這題。 |
| 事件 ratio（壓胸） | `at a 3:1 compression-to-ventilation ratio` | 只寫使用者填的文字。 |
| birthFinalSupport＋S.leaveSpo2 | 離開產房一句（continued via Neopuff／weaned to room air／remained intubated…）＋`with SpO2 maintained at N%` | 呼吸／張力／心率／時間在「補充評估」，有填才寫。 |
| obM1Type（改到「我方到場」）＋obArriveSpo2 | `On our team's arrival at the referring hospital, the infant was receiving …, with SpO2 N%.` | 只描述到場當時，不推延續；外院處置走 outside 事件。 |
| 節點三態 | 帶子與第 5 段總覽 | 實心＝有資料且核對清單沒有落在該站的缺漏／待確認；可略過的站沒填不計。 |
