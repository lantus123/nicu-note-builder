# Admission 順向填寫與欄位輸出對照（2026-10-02）

此對照涵蓋本次 Admission 工作流程、八組 E 模組與受影響的 Acceptance／NI plan／Procedure 連動。不是對所有歷史功能或任意自由文字的醫療正確性背書。所有病歷仍須由醫師通讀後貼回 HIS。

## 填寫順序與資料歸屬

1. 本次入院設定：路徑、E 的來源與問題、收治單位、出生／入院日期時間、DOL。
2. 產前：母親 G/P/A、病史、產檢、篩檢、產程用藥，保留 chart 順序。
3. 出生：性別、GA、出生體重、實際出生院所、生產方式、Apgar、團隊介入、觀察、處置、處置後狀況。E 也能直接填寫。
4. 入院病程：直接入院兩階段；嬰兒室三階段；外院轉入五階段；E 三階段（出院與返家基準 → 症狀與變化 → 評估與收治）。
5. 核對：關鍵資料未填、已記錄待確認、前後不一致／格式問題分開列出；其他重點選填空白預設收合、中性顯示，不算錯誤。其後是暫定診斷、母病歷號、家庭樹。

情境選擇不捲動到頁面下方。直接入院的 A/B 在出生段選 standby／出生後會診；未選不推定團隊介入。出生事件不再藏在入院 stepper。前後不同時間的實際處置不視為重複事件。

initializeAdmissionWorkflow 只搬動既有 DOM 控制項，保留 ID；各事實只有一份可編輯來源。renderAdmissionWorkflow 管理來源摘要、條件欄位與時點引用。renderJourney 保留固定工作區，輸入不自動換段；切換階段保留當次開頁資料及可恢復的焦點／相對位置。

workflowNav 合併章節與子階段，手機只固定分頁列與這條導覽。選單支援章節／子階段直達，前後鈕依實際路徑銜接出生、病程與核對。workflowViews／journeyViews 僅存本次頁面的焦點及相對位置，ResizeObserver 量測實際導覽高度避免定位遮擋。填寫中可複製草稿，不因空白欄位鎖住；核對階段才強調複製病歷。

## 共用資料與出生史

| 輸入／狀態 | 輸出或用途 | 邊界 |
| --- | --- | --- |
| birthDate、admissionDate | Admission 日期、DOL；Acceptance DOL/PMA | 入院日預設填寫當天、平常免填；回補時才展開修改，收合後仍顯示實際採用日期。日曆日期差 + 1，出生當天 DOL 1。日期未齊／先後不成立不退回舊 DOL。手動覆寫另行警示。 |
| birthTime、admissionTime | 分別寫出生與入院句；入院時間為 24 小時制 | 不以入院時間計算日曆 DOL；同日入院早於出生提示。 |
| homeHosp、rocYear | 院區與日期顯示設定 | 非病人資料；僅這些偏好等既有設定可儲存於瀏覽器。 |
| birthHosp／obFacility、obTransferFrom | 出生地／外院轉出來源 | 外院路徑出生院所移到出生區。E 留白不推定出生於本院。母親入院句不推定在本院待產。 |
| gender、gaW/D、bw、growth | 開頭、體重分級、背景診斷、Acceptance | 出生體重不當成本次 E 評估體重；既有成長計算規則不改。 |
| gravida、para、abortion、matAge、ap1/5/10 | 母親背景與 Apgar | 共用一次，不在出生處置或 E 重新輸入。 |
| 母親風險、家族史、amnio、nipt | 明確陽性／陰性／不詳敘述 | 未填不寫陰性。批次「確認無」保留已有陽性。羊穿已有結果時不額外強調 NIPT 未做。 |
| habitStatus、smoking/alcohol/drug | 已確認的陽性與陰性習慣史 | 未確認不寫 denied；不詳只涵蓋尚未勾陽性的項目。 |
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
- obM1Relation／obRespRelation 確認持續同前時，用唯讀摘要顯示來源模式；模式按鈕暫藏，另外的裝置／參數仍可展開編輯。已填參數保留且繼續輸出，未填參數不從前段猜測；前段模式改變時，原有確認失效並恢復可編輯欄位。
- 切換路徑保存該次開頁的各路徑草稿（包含 E 模組、來源及手填診斷）。不新增病人資訊的 localStorage 或雲端儲存。

## 驗收與界限

- tests/prose/workflow.js：順向排列、唯一 ID、DOL 邊界、各模組輸出、混合症狀、陰性／未知、草稿隔離、支持／體重時點、E 既往急救隔離。
- 既有 prose／timeline／downstream／plan／pedigree／navigation／clipboard 等測試繼續執行；變更輸出快照須逐項核對，不能只更新快照掩蓋錯誤。
- tests/prose/browser-workflow.cjs：獨立 Chrome CDP，1440／1366 px 桌面、320／360／390 px 手機尺寸、短視窗及亮／暗主題；檢查 CSS viewport、遮擋、點擊命中、原生文字輸入與複製。混合 E 假病例從入口走到核對，另重新開頁填直接入院 A 及外院轉入 D；檢查返回相對位置、跨分頁、舊進食描述衝突與復原。截圖需由驗收者目視，不只看程式斷言。
- 自動化結果與模擬試填不等同真實住院醫師使用者測試，也不表示任意自由文字的所有語意矛盾都能偵測。檢查與劑量規則未在此次改版重新做醫療有效性驗證。
