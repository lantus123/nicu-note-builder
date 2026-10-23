# 2026-10-12 稽核修正：驗收標準（先定標準，再動程式）

對象：`_demo_structured.html` → `build/build.sh` → `index.html`。基底＝HEAD `7c6071d`＋既有未提交工作（母親抗生素多療程、分娩契機、處置反應、呼吸問題核對、拼字提示）；全部保留，不 reset。

設計原則（Ryan 2026-10-12：「住院醫師填寫最流暢、畫面同步清晰、不增加負擔、簡易寫出好的 note」）：

1. **不新增表單區、不新增必填、不新增確認步驤。** 本輪只允許三種 UI 變動：既有事件卡片多一個「移除」；既有「＋」按鈕文字隨狀態變；既有核對區多幾條可點回欄位的提示。
2. **預設照舊一鍵帶出，但只寫已確認或已記錄的事實。** 預設值仍可直接進病歷（Ryan 9/20 明示接受），但系統要分得清「建議值」與「實際值」。
3. **寧可兩句中性，不寫一句未確認的因果／診斷／改善。**
4. **Admission、Acceptance、`#` 診斷列、核對總覽共用同一份事實。**
5. **DOL 完全不動**：`dolInfo()`、`dolOnDate()`、開場 `N-day-old`、Acceptance `DOL n` 的程式與輸出逐字相同。
6. 美式英文；不靜默改藥名、日期、病名、醫師自由文字。

四種狀態分開回報，不互相替代：**本機已改 → 自動測試已過 → 真實畫面已驗證 → 已部署**。

---

## 0. 測試基礎建設（第 0 批，不改應用程式）

- [ ] 把交接包 `audit.cjs` 的 16 個代表情境與 8 個矩陣規則移入 `tests/prose/audit-regression.js`，改成**明確斷言**（不是 flags 計數）。移入當天在未修正程式上必須紅：至少 `nrp_order`、`ladder_cpr`、`cause`、`lab_map`、`lab_opposites`、`resolved_resus`、`event_dx`、`manual_dx`、`assessment_grammar`、`cyanosis_dx`、`screen_grammar`、`antibiotic_dates` 十二案紅。
- [ ] 新增「操作順序等價」測試：同一組資料以 ≥2 種合理順序填寫，Admission／Acceptance／核對提示三者逐字相同。
- [ ] 新增 DOL 鎖定快照：`dolInfo` 相關函式原文、開場句、Acceptance 首行，修正前後逐字相同。
- [ ] 加進 `package.json` 的 `test` 串列；全套 `npm --prefix tests/prose test` 在修正前的既有部分仍綠（基線先跑一次存檔）。

---

## 1. PPV 預設值：建議值 vs 實際值（P1）

**資料結構**：出生 PPV 事件新增 `nrpFields:['fiO2','pip','peep']`＝目前仍是「建議值」的欄位。`e.nrp` 保留為衍生布林（`nrpFields.length>0`），既有讀 `e.nrp` 的地方（`drawEvents`、`timelineReview`、`eventFilled`、故事線測試）不壞。

**行為**：

- GA（`gaW`）改變 → 只重算仍在 `nrpFields` 的欄位；已改過的欄位不動。GA 清空 → 建議值回足月預設（與現況同）。
- 改任一欄 → 只把該欄移出 `nrpFields`；其他欄仍標建議。
- 「值正確，採用」→ `nrpFields=[]`，值不變。
- 外院 PPV（`S.outborn`）照舊不帶預設。

**UI（不新增控制項）**：仍是同一張卡；虛線框只套在仍為建議值的欄位；卡內提示文字改為列出剩餘欄位，例如「IP、PEEP 仍是 NRP 預設，請核對」；核對總覽同一句，點擊跳到第一個剩餘欄位。

**驗收**：

- [ ] 先選 PPV 再填 24 週 ＝ 先填 24 週再選 PPV：兩份 note、核對提示逐字相同（FiO2 30%，IP/PEEP 20/5）。
- [ ] 先選 PPV（GA 空）→ 把 FiO2 改 40 → 填 24 週：FiO2 維持 40，IP 變 20，PEEP 5；提示只列 IP、PEEP。
- [ ] 只改 FiO2 不會讓 IP／PEEP 的建議狀態消失；按「採用」才整組消失。
- [ ] 全部採用或全部改過後，病歷文字與現況一致（`FiO2 x%, IP/PEEP a/b cmH2O`）。
- [ ] 24 週與 39 週各一組，病歷寫出的數字等於 `NRP.ventilation` 表。

---

## 2. 急救階梯：一鍵帶出，但每一筆可獨立「本次沒做」（P1）

**行為**：

- 第 1 區階梯按鈕不變，仍一鍵帶出 NRP 標準順序（`LADDER_SKELETON` 不改）。
- 第 3 區每一筆出生處置卡片都有「移除」（現況第一筆同類沒有）。移除骨架事件不改階梯層級（`ladderLevel()` 仍由現存事件推），不影響其他筆，可用既有「復原剛移除的事件」還原。
- 站內「＋」按鈕：骨架內**存在**的項目顯示「＋ 再做一次 X」，**已移除**的顯示「＋ X」（補回）。
- 階梯摘要行（`renderBirthStation` 的 `birthLadderSummary`）改顯示**實際現存**的事件順序，不再顯示骨架。
- 核對總覽加兩條**提示型**（非阻擋）訊息：
  - 有插管、無 PPV（本院出生）：「已記錄插管但沒有插管前 PPV；實際有做請按 ＋ PPV」→ 跳 `#birthAdderButtons`。
  - 有 epinephrine、無壓胸：「已記錄 epinephrine 但沒有壓胸」→ 同上。
- 病歷只寫現存事件；順序照事件陣列。

**驗收**：

- [ ] 選「插管」→ 移除 PPV：病歷只有 `Endotracheal intubation was performed…`，無 PPV 句，無 NRP 預設提示；出現「無插管前 PPV」提示；按「＋ PPV」補回後提示消失、PPV 句回來（仍帶預設並標建議）。
- [ ] 選「壓胸＋Epi」→ 移除 Epi：病歷有 PPV、插管、壓胸，無 epinephrine；階梯層級仍為 cpr；Epi 劑量／途徑提示消失。
- [ ] 選「壓胸＋Epi」不移除任何筆：輸出與現況逐字相同（真正做全套的病人不退步）。
- [ ] 移除後再「復原」：事件順序、參數、建議狀態全部回復。
- [ ] 降階（cpr→ppv）仍走既有「已填參數要先確認」流程，不因新按鈕繞過。
- [ ] 390px 寬手機：卡片頭的「移除」不造成水平捲動（既有 browser-*.cjs 的 viewport 斷言）。

---

## 3. 入院前敘事：症狀與支持方式的因果（P1）

**規則**（`postnatalNarrative()` 的 `because`／`replaceSx`／`repeatedSx`）：

- 只有在「所有被接進 because 的症狀都是呼吸症狀（`RESP_SX`）」時，才寫 `Because … persisted, <support> was initiated`。這是院內模板句型，呼吸症狀持續接著給呼吸支持，是已記錄的時序，不是捏造。
- 任一症狀非呼吸（黃疸、低血糖、發燒、餵食差、活動力差等）→ 改中性兩句：`<Context>, jaundice persisted. Supplemental oxygen was initiated in the baby room.` 時間片語只寫一次。
- 混合（黃疸＋tachypnea 皆持續）→ 中性寫法：`…, jaundice and tachypnea persisted. Supplemental oxygen was initiated.` 不拆句硬接因果。
- `persistingBirthFindings()`（出生觀察的呼吸所見）維持現況可接 Therefore。
- 不新增任何「原因」欄位。

**驗收**：

- [ ] 情境 C、room air→O₂、黃疸持續：兩份 note 皆無 `Because jaundice persisted`，有中性兩句；admissionProblems／診斷不變。
- [ ] 情境 C、tachypnea 持續、O₂：維持 `Because tachypnea persisted, supplemental oxygen was initiated in the baby room.`（現況不退步）。
- [ ] 5,184 組矩陣：`unconfirmed_causal_link_from_nonrespiratory_symptom` 計數 300 → 0；呼吸症狀組的輸出與修正前逐字相同。
- [ ] 不出現 `improved`、`therefore` 以外新加的接句詞。

---

## 4. 嬰兒室檢查與結果對應（P1）

**映射表**：`bandemia/leukocytosis/leukopenia → cbc`、`crp → crp`、`hypoglycemia → glucose`、`cxr → cxr`、`normal → 所有已勾檢查`、`brFindIn 自由文字 → 不歸屬`。

**組句**：

- 已勾檢查且結果對得上 → 現況句型 `<Tests> were obtained in the baby room, which showed <matched findings>.`
- 結果的檢查未勾 → 不塞進 `which showed`；另寫一句所見：`Hypoglycemia (blood glucose 32 mg/dL) was noted in the baby room.`；核對總覽加提示「勾了低血糖但未勾 Blood sugar；已寫成所見，未寫成檢查結果」→ 跳 `[data-msel="brWorkup"]`。**不自動替使用者勾檢查。**
- 白血球↑與↓同時勾 → 兩個都寫（不丟資料），核對總覽列**衝突**：「白血球↑與↓同時勾選；不同時間點請在『其他結果』註明，否則請擇一」→ 跳 `[data-msel="brFindings"]`。
- 只勾檢查沒勾結果 → 維持現況（只寫做了檢查，不寫正常）。
- 自由文字 `brFindIn` 照舊接在結果後。

**驗收**：

- [ ] 只勾 CXR＋低血糖 32：無 `Chest radiography … showed hypoglycemia`；有 `Chest radiography was obtained in the baby room.` 與 `Hypoglycemia (blood glucose 32 mg/dL) was noted…`；診斷仍 neonatal hypoglycemia；提示出現且可點。
- [ ] CBC＋CRP 勾、只勾 CRP↑：`…were obtained…, which showed an elevated CRP level` 維持（CRP 對 CRP）；CBC 只勾、CRP↑：改為分開所見＋提示。
- [ ] 2,080 組矩陣：`result_attributed_to_unmatched_test` 1,499 → 0；`opposite_wbc_results_without_timepoints` 512 組全部有衝突提示。
- [ ] B/C 勾了沒結果：不寫 negative／normal。

---

## 5. 入院問題推論：既往處置 vs 最新狀態 vs 收治理由（P1）

**新概念 `latestKnownSupport()`**：依時間由後往前找第一個有記錄的呼吸支持：`S.resp`（入院時）→ 外接轉送途中事件／再評估的 support → `obRespType`（本段）→ 我方現場事件／再評估 → 到場 `obM1Type` → 外院事件 → `birthFinalSupport`。非外接 A／B／C：入院時 → 站內最後一筆有支持意義的事件／再評估 → 本段支持 → 離開產房支持。都沒有 → `''`（未知）。

**`admissionProblems().respiratory` 改為**：

- 最新已知支持是 O₂／CPAP／PPV／ETT → true；或
- 本次收治理由 `symptomatic`：本次入院經過 `obSx∩RESP_SX`、outborn 的 obReason 含 respiratory distress、嬰兒室 CXR 異常、E 的 respiratory／apnea → true；或
- 既往處置 `hadIntervention`（含外接到場時掛著的 O₂／CPAP／PPV／ETT）**且**最新支持未知 → true；最新支持為 room air 且無 `symptomatic` → false 並提示。
- **終版規則：既往觀察不自動產生診斷，只提示；既往處置在最新支持未知時列、room air 時不列並提示。** `observed` 包含出生／離開產房異常呼吸、`birthSigns`／`birthFinalSigns`、courseEvents assessment 的異常呼吸，任何情況都不因觀察本身推論呼吸問題；觀察保留於敘事與摘要，手填診斷仍由 `respiratoryDxNeedsReview()` 提示確認。
- 待核對提示限非 E 路徑、尚未列入呼吸問題、手填診斷未含共用呼吸關鍵字、無 `symptomatic`、最新支持非 O₂／CPAP／PPV／ETT，且有觀察或「有處置＋最新 room air」。只有處置時：「出生／途中曾有呼吸處置（PPV），之後紀錄為 room air：未列入呼吸問題。若仍以呼吸問題收治，請填入院時呼吸支持或暫定診斷。」有觀察時（room air 或未知）：「出生時曾記錄呼吸徵象（grunting），未列入呼吸問題；若以呼吸問題收治，請填入院時呼吸支持或暫定診斷。」途中再評估的呼吸觀察改用「途中再評估曾記錄呼吸徵象」，不歸為出生時；兩者並存時合併列出處置與觀察。連結皆跳 `[data-seg="resp"]`。
- 更正（2026-10-24）：此處原寫「CPR → birth asphyxia 的既有規則不動」有誤——程式裡從來沒有這條規則。perinatal asphyxia／HIE 的觸發、DX 列、NI plan HIE 評估與核對提醒已另外實作（`asphyxiaBasis()`／`HIE_TEXT`，見 `tests/prose/hie-safety.js`）。

**`#` 診斷列**（`renderAdm` 的 `DX`）：每列加 `auto:true` 標記（由 `probs.*` 推出的症狀／問題列）；手填 `tentDx` 只替換 `auto` 列，**保留**基底列（term／prematurity）與母體／周產期風險列（Fetal distress、DOIC、MSAF、PROM／PPROM、IDM、PIH、preeclampsia、GBS）。

**驗收**：

- [ ] `resolved_resus`：出生 PPV→room→room→入院 room air＋黃疸：主診斷 `neonatal hyperbilirubinemia`，`#` 列無 Respiratory distress，PPV 句仍在，提示出現；Acceptance `admitted … with neonatal hyperbilirubinemia`。
- [ ] 同上但入院時選 CPAP：主診斷回 respiratory distress，提示消失。
- [ ] `event_dx`：外接到場後插管、沒填其他欄：respiratory=true，主診斷 respiratory distress，`#` 列有 Respiratory distress；Procedure 連動（`ourIntubation`）不變。
- [ ] 1,728 組矩陣 `historic_resuscitation_becomes_current_respiratory_dx` 12 → 0；72 組 `procedure_omitted_from_problem_inference` 24 → 0；其餘組 problems 與修正前相同（用矩陣前後 diff 證明）。
- [ ] `manual_dx`：GBS 陽性＋手填 respiratory distress：`#` 列同時有 Respiratory distress 與 Maternal GBS colonization；前文 GBS 句不變。PROM、IDM 各一組同樣保留。
- [ ] 手填診斷後 Admission 結語、Acceptance 入院原因、`#` 第二列三處同字。

---

## 6. E 情境 apnea 模組標籤同源（P2）

- 選了具體觀察（`rm_apnea_type`）：cyanosis-only → `a cyanotic episode`（次數>1 → `cyanotic episodes`）；apnea-only → `apnea`；兩者 → `apnea and cyanosis`。未選 → 維持 `apnea or a cyanotic episode`。
- 前文（`readmitEpisodes`／`apneaEpisode`）、結語 `with a tentative diagnosis of …`、`#` 列三處用同一個函式取字；`#` 列對應 `# Cyanotic episode(s)`／`# Apnea`／`# Apnea and cyanosis`／`# Apnea or cyanotic episode`；respiratory 模組仍 `# Respiratory symptoms`。
- 不補 apnea、不猜。

**驗收**：四種狀態各一案，前文、結語、`#` 列一致；768 組矩陣 `generic_apnea_label_in_diagnosis` 只剩「未選具體觀察」的組。

---

## 7. 篩檢異常受詞（P2）

- 有填檢查名：`referred for evaluation of an abnormal <test> result`；檢查名本身已含 abnormal／elevated／low／positive／high 字樣 → `referred for evaluation of <test>`（不雙重）。未填 → 現況。結果句不變。
- 驗收：`newborn screening`＋結果 → `…of an abnormal newborn screening result; the reported result was an elevated screening marker.`；`abnormal TSH` → 不出現 `abnormal abnormal`。

---

## 8. 母親抗生素日期一致性（P2）

- 能解析（`M/D` 或 `YYYY/M/D`、`YYYY-M-D`）且同一年或皆無年份、結束早於開始 → 核對總覽**衝突**：「抗生素結束日早於開始日，請核對；跨年請加年份」→ 跳該筆 `until` 欄。病歷文字不改。
- 開始欄已是區間又填結束欄 → 病歷只寫區間（`from 10/10 to 10/11`），結束欄不寫入；核對總覽衝突：「開始欄已是區間，結束欄 10/12 未寫入；請擇一」→ 跳 `until` 欄。
- 不補年份、不倒轉、不推定 IAP 用途或完整性（既有未提交邏輯不動）。
- 驗收：108 組矩陣 `reversed_course_dates` 12 組全部有衝突提示；`nested_date_range` 24 組病歷不含 `from x-y to z`。

---

## 9. 再評估句動詞平行結構（P2）

- `assessmentText()` 去重規則：從第 2 個片語起，只有它與前面所有片語的助動詞（had／was）皆與第 1 個相同時才省略（前綴同質）；一旦出現不同助動詞，之後全部保留。
- 驗收：`was crying, had poor muscle tone, and was receiving CPAP`；`had labored breathing and poor muscle tone`（現況不退步）；`was crying and breathing room air`；1,344 組 `mixed_predicate_auxiliary_dropped` 304 → 0；其餘組逐字不變。

---

## 10. 不在本輪範圍

- 文體潤飾（重複 `The infant …`、`using rectal measurement`）另開一批，避免與語意修正混在同一 diff。
- DOL、BR／NBC／PICU 去處規則、母親病史預設、產前篩檢預設、rubella 預設：不碰。
- HIS 貼入相容性：需 Ryan 在院內實貼。

---

## 11. 外接 ETT 與轉送 CPAP（第 7 批，Ryan 2026-10-12）

- 我方到場已插管：寫 `was intubated, with positive-pressure ventilation (PPV) provided through the endotracheal tube`，保留已填設定與 SpO2。
- 轉送 ETT：前站相同寫 `PPV was continued through the endotracheal tube`；新開始、改變或前站未知均寫 `PPV was provided through the endotracheal tube`，沿用時間片語去重與設定值。
- 到場後／途中 ETT 再評估寫 `was receiving PPV through the endotracheal tube`；外院照護（outside）仍保留 `mechanical ventilation via an endotracheal tube`。改成 room air 時，前站用字同樣依來源站別取字。
- 產房離開的原有敘事不變；ETT 摘要與既往支持標籤寫 `PPV via ETT`，Acceptance 接手時支持仍讀 `S.resp`。
- `courseAdderButtons` 的外接事件預設 phase=transport；outside／arrival 有各自獨立按鈕。隱藏轉送支持的 CPAP 與途中「＋ CPAP」，已存 `obRespType=cpap` 的按鈕仍顯示且不清值；到場 CPAP、外院與我方現場獨立事件按鈕保留。
- 新增合成回歸涵蓋兩份 note、continued／未知／new／changed、設定與 SpO2、時間去重、各站再評估與 CPAP 舊資料；不加入 KNOWN_FAILING，不改矩陣常數、DOL 或 golden baseline。

---

## 12. 每批共同驗收程序

1. `bash build/build.sh --check` 綠。
2. `npm --prefix tests/prose test` 全綠（含第 0 批新測試），並附修正前紅、修正後綠的輸出。
3. 重跑交接包 `audit.cjs`（scratchpad 版）：8 矩陣 11,572 組，flags 依各節目標歸零；16 情境輸出前後 diff 只含該批預期變更。
4. 真實瀏覽器（Chrome 桌面 1280 寬＋手機 390 寬，`tests/prose/browser-*.cjs` 走 CDP）：跑該批情境，截圖核對提示可點、跳欄正確、無水平捲動、事件卡片不跳動；修正過的句子在畫面上實際出現。
5. 回報用四欄：本機已改／自動測試已過／真實畫面已驗證／已部署。部署與 commit／push 等 Ryan 看過畫面後指示。

## 13. 分工

- 作者：Codex（`codex exec`，每批一份契約＝本檔對應節＋基底 SHA＋鐵則：不 commit／push、不動 DOL、不改既有未提交工作以外的無關行、證據寫到指定目錄、最後交 `99-report.md`）。
- 非作者審：Opus 子代理讀 diff、跑全套、做突變（故意把 `nrpFields` 改回整筆布林等）確認新測試會紅。
- 規格、驗收、真實畫面、回報：Fable（本 session）。


補充（2026-10-12，Fable）：§11 的 PPV 經 ETT 用字也適用本院 A／B／C 的「入院前處置」選 ETT 的情況（Ryan：本院產房同理）；只有外院照護站（phase outside）保留 mechanical ventilation。
