# Admission 出生事件與入院路徑欄位對照

本文件只涵蓋這次第 5、6 區的時間線改版，以及這些資料與 Admission、Acceptance、NI plan 的連接；不是全專案歷史欄位均已完成稽核的聲明。所有紀錄須由使用者核對後再貼回 HIS。

## 2026-09-20 呈現層：故事卡與時間線

第 5、6 區合併為 `#pathwayCard`「出生到入院」。`applyStory(k)` 依 `STORY` 表設定 `pathway`／`pwStandby`／`pwConsult`（走既有 `switchPathway` 與 `[data-tog]`），`deriveStory()` 由三個開關反推故事字母（給故事卡高亮與區塊摘要）。`renderJourney()` 在每次 `renderAdm` 末尾執行：依路徑決定各 `li[data-stop]` 的顯隱、`order`、標籤與白話說明；`journeySummary(id)` 從既有欄位讀出一行摘要；`S.journeyOpen` 記住手動展開／收合，換路徑時重置。所有欄位 id／`data-*` 與本文件其餘各表相同，只是父層變成時間線的站。

## 敘事與資料歸屬

填寫區塊順序仍配合手寫 chart。產出的 Admission 是完整敘述，依「出生觀察 → 實際處置 → 再評估 → 後續路徑 → 入院」串接，不改成 HPI／Assessment 分段模板。

- 同一次處置只輸入一次；第 6 區的產房摘要是唯讀引用，不是第二份紀錄。
- 相同處置在不同時間再次發生時，另建事件，不用文字去重刪掉真正的再次處置。
- 產房最後狀態、外院後續狀態、我方抵達外院、轉送期間、入院及 Acceptance 接手時，是不同時點。
- 事件依使用者排列順序輸出；時間不一致時提示核對，不默默重排或補出時間。

## 第 5 區：出生觀察與實際處置

| 欄位／狀態 | 寫入位置 | 條件與用途 |
| --- | --- | --- |
| `birthBreathing`、`birthTone`、`birthHR` | Admission 出生初始觀察；Acceptance Brief history | 只寫已選／已填的觀察，不從 Apgar 反推呼吸、肌張力或心率。 |
| `birthInitialNote` | 初始觀察後的補充句 | 保留英文原意，不擅自改寫成因果或改善結論。 |
| `birthResusStatus` | 出生急救敘述的有效狀態 | 空白＝未記錄；`none`＝已確認無需急救；`performed`＝已確認有施作。處置事件只有 `performed` 時輸出；再評估不屬於急救處置，在空白或 `none` 時仍保留輸出。 |
| `S.birthEvents[]` | 初始觀察之後、最終評估之前 | 獨立處置與中途評估按排列順序輸出；詳見事件欄位表。 |
| `birthFinalBreathing`、`birthFinalTone`、`birthFinalHR` | 產房結束時的評估 | 不把新數值直接寫成「恢復」「改善」；仍需保留實際記錄的前後狀態。 |
| `birthFinalMin` | 產房最後評估的生後時間 | 單位為分鐘；未填時不補出時刻。只有時間、沒有評估內容時交代曾在該時點評估、所見未指定，不補出正常觀察。 |
| `birthFinalSupport` | 產房最後支持狀態；第 6 區支持銜接的來源 | 模式需明選；不以最後一個處置事件推定它仍持續。 |
| `birthFinalNote` | 產房最後評估後的補充句 | 不覆蓋初始觀察或後續入院狀況。 |
| `S.fd`、`S.doic`、`S.msaf` | 出生事件敘述；相關既有診斷標籤 | 勾選才表示事件曾發生；取消勾選本身不表示陰性。 |
| `doicMin` | DOIC 出生事件與相關診斷標籤 | 僅在 `S.doic` 啟用時採用，沿用同一個分鐘欄位。 |
| `S.msafGrade` | MSAF 出生事件的稠度 | 僅在 `S.msaf` 啟用時採用；未選不補稠度。 |
| `S.birthNegConfirmed` | 已確認未發生的出生事件敘述 | 只涵蓋 FD／DOIC／MSAF，不包含 PROM 或其他病史。陽性選項不被這個確認否定。 |
| 第 1 區 `ap1`、`ap5`、`ap10` | 獨立 Apgar 總結 | 沿用原欄位，不在急救事件中重填，不代表等評分後才開始處置。 |

## 共用事件欄位

事件資料存於 `S.birthEvents[]` 或目前路徑的 `S.courseEvents[]`；動態控制項使用 `event-{id}-{key}` 與 `data-event-field="{key}"`。

| 事件 key | 適用事件 | 輸出方式 |
| --- | --- | --- |
| `id` | 全部 | UI 操作與欄位識別，不寫進病歷。 |
| `kind` | 全部 | `ppv`、`intubation`、`compressions`、`epinephrine`、`assessment`；後續事件另有 `o2`、`cpap`。每個項目只表示本身，不包含其他處置。 |
| `minutes` | 全部 | 已填時寫生後幾分鐘；未填時使用不含精確時間的敘述。 |
| `location` | 第 6 區後續事件 | 英文實際地點；未填不把它自動當成產房、外院或 NICU。 |
| `fiO2` | PPV、插管、CPAP、O₂ | 只列輸入值及 `%`。**例外（2026-09-20）**：產房急救 PPV 新增時依 `NRP` 表預設帶入 FiO₂／PIP／PEEP（依 GA），事件帶 `nrp:true` 標示直到醫師改過任一值；`timelineReview` 提醒「尚未核對」。插管與 course 範圍不帶預設。 |
| `pip`、`peep`、`rr` | 適用的呼吸支持事件 | PIP／PEEP 使用 cmH₂O；CPAP 的 `peep` 寫成 pressure；`rr` 僅在插管事件提供。 |
| `flow`、`device` | 適用的呼吸支持事件 | 氧氣流量以 L/min；裝置依實際英文記錄。 |
| `duration` | 胸外按壓 | 已填時列按壓持續分鐘數。 |
| `drugDose`、`drugRoute` | Epinephrine | 原樣呈現實際劑量與單位、給藥途徑；不自動計算，不代填途徑或濃度。 |
| `breathing`、`tone`、`hr`、`support` | 再評估 | 只寫實際觀察；不自行加上治療有效或無效的判斷。 |
| `note` | 全部 | 該事件的英文完整補充句；不當成全局病史去推論其他事件。 |

## 第 6 區：後續路徑與團隊介入

| 欄位／狀態 | 寫入位置 | 條件與用途 |
| --- | --- | --- |
| `S.pathway` | 後續路徑的場域與入院結語 | `direct`、`nursery`、`outborn` 三者擇一；**無預設**（2026-09-19 起），未選時第 6 區摘要顯示「尚未選路徑」、路徑專屬欄位隱藏、結語不寫路徑。再點一次已選項目可取消。 |
| `S.dest`（第 1 區） | Admission 結語、`On admission to …` 句、Acceptance 入院句 | `NICU`／`NBC`／`BR` 擇一，整份 note 一次選；未選寫成 `____`。英文 `our NICU`／`our NBC`／`our baby room`（Ryan 2026-09-20 確認 BR＝baby room）。 |
| `S.delivery` → `deliveryPlace()` | standby 句、產房再評估句、Acceptance surfactant 句、直接入院的會診句 | `cs` 寫 operating room、其餘寫 delivery room；不另設地點欄位。 |
| `S.outborn` | 外院相關欄位與敘事的顯示條件 | 由 `S.pathway === "outborn"` 衍生，不是第二個獨立路徑。 |
| `S.pwStandby`、`S.pwSbR`、`pwSbRIn` | 分娩之前的兒科 standby 背景 | 與路徑分開；原因只在 standby 啟用時使用。 |
| `S.pwConsult`、`pwConsultReason`、`pwConsultH` | 出生後會診經過 | 與路徑及 standby 可並存；生後小時與原因都選填。 |
| `S.brEval`、`brEvalIn` | 嬰兒室路徑：兒科去看的原因句（`asked to evaluate`，不是會診） | `persist24`＝症狀持續超過 24 小時；`maternal`＝母體風險因子，由 `maternalRiskPhrases()` 從第 2 區帶（`S.r.fever`、`S.r.prom`＋`promH`、`S.scr.gbs==="pos"`），第 2 區沒紀錄則只寫 maternal risk factors 並提醒。 |
| `S.brWorkup` | 嬰兒室檢查句 | `cbc`／`crp`／`bc`／`glucose`／`cxr`；只寫做了什麼。 |
| `S.brFindings`、`brCrp`、`brGlu`、`brFindIn` | 檢查結果；有異常時結語改 `therefore` | 異常項與 `normal` 互斥；沒勾結果不寫成正常。 |
| `S.obSx` | 後續症狀句 | 第 5 區已記錄的同一個初始觀察不用重填；需交代持續、復發或新增症狀才在此記錄。 |
| `S.pwOnset` | 後續症狀的動詞 | `observed`＝觀察到、起始未明；`developed`＝新出現；`persisted`＝持續；`recurrent`＝再次出現。 |
| `pwOnsetH`、`pwOnsetUnit` | 症狀的生後時間 | 數值及 `hours`／`minutes` 均確認才寫時間；不把空白單位當成小時。 |
| `obFacility`、`obTransferFrom` | 外院出生地與轉入來源 | 保留既有院所選擇／繼承規則；外院出生地與轉入來源可以不同。非外院路徑不引用這組草稿。 |
| `obReason` | 外接團隊的轉入原因 | 原因不自動等於確診；保留原文的不確定語意。 |
| `S.obM1Type`、`obM1Relation` | 我方抵達前，外院後續呼吸支持 | 前段來源是 `birthFinalSupport`；不重複記成同一次插管。 |
| `S.obM1Dev`、`obM1Flow` | 外院 O₂ 支持的適用細節 | 只屬於外院後續支持，不當成轉送或本院設定。 |
| `obArrival` | 我方抵達外院時的觀察句 | 明確寫為我方到轉出院所，不當成已到本院。 |
| `S.obRespType`、`obRespRelation` | 直接入院前／嬰兒室／轉送中的支持 | 場域由有效路徑決定；外院路徑的前段來源是外院後續支持，其他路徑是產房最後支持。 |
| `S.obO2Dev`、`obO2Flow` | 上列支持中的 O₂ 細節 | 僅在 O₂ 模式適用。 |
| `obFiO2`、`obIP`、`obPEEP`、`obRR` | 上列支持中的呼吸設定 | CPAP 不採用 IP 或 RR；RR 僅在 ETT 模式適用。隱藏而不適用的舊設定不寫進病歷。 |
| `S.obRespStable` | PPV 時 HR／SpO₂ 穩定的確認句 | 僅明確勾選且當時模式為 PPV 才寫；不擴大成所有生命徵象正常。 |
| `S.courseEvents[]` | 後續評估與額外／再次處置 | 與前面的基本路徑支持分開；不重填同一次事件。時間、地點選填但需核對排列順序。 |
| `obCourse` | 後續經過補充 | 保留完整英文內容；不從自由文字自動建立結構化處置或自行裁決矛盾。 |
| `obAdmissionStatus` | 抵達本院並入院時的觀察句 | 與 `obArrival`、產房結束狀態及 Acceptance 當下狀態分開。 |
| 第 7 區 `tentDx` | 入院結語的暫定診斷 | 沿用既有診斷來源／規則，不由轉送前後的連接詞推定新診斷。 |

## 支持連續性與未記錄的處理

- 空白關係只描述已確認的當時支持，不用 `continued`、`initiated`、`reintubated` 等帶有事件關係的用語。
- 支持模式與 O₂ 裝置可明選「未記錄」清除先前選擇；不需要重開頁面，也不把未記錄當成 room air。
- 新增處置與再評估的按鈕始終可用；新增實際處置會自動把急救狀態設為 `performed`，單獨新增再評估不會宣稱曾急救。
- `continued` 需要使用者明確確認，而且前段有已知模式；來源模式改變或前後模式不同時提示重新核對。
- 「持續同前」只承接已確認的支持模式，不代表呼吸參數、症狀、心率或穩定程度也相同。
- `new`、`changed`、`repeat` 分別記錄新開始、調整或停止後再次施作；不能僅因模式相同就判定是同一次事件。
- `stopped` 只表示前段支持停止，不自行補成呼吸 room air 或病況改善；後續模式／參數草稿保留但不輸出。
- 時間、數值、藥物細節缺漏時不補造。中文核對提示留在 UI，不混進複製的英文病歷。

## 跨分頁範圍及刻意不採用的資料

| 消費端／UI 狀態 | 範圍與限制 |
| --- | --- |
| Admission | 使用 `birthNarrative()` 與 `postnatalNarrative()` 串接已知事實；既有出生摘要、產前內容與診斷清單保留。 |
| Acceptance Brief history | 引用同一份出生／後續事件資料，避免另一套急救階梯補出未記錄的處置。 |
| Acceptance 目前支持 `S.resp` | 只表示接手當下；不被產房、轉送或 Hospital course 中較早的模式覆蓋。 |
| Acceptance Hospital course `S.acc.resp` 等 | 保留既有住院歷程與日期；不把出生事件自動當成新的住院處置紀錄。 |
| NI plan | 維持既有可手動覆寫的規則。`S.resus` 由有效出生處置衍生粗分類供既有規則參考，不再用粗分類反推下層處置。出生／路徑支持不直接寫成接手當下應持續的模式。 |
| Procedure | 未將出生事件自動勾成 Procedure；處置筆記、既有計算與用藥規則保持其原本範圍。 |
| `birthBridge`、`birthReview`、`pathwayReview` | 只供畫面摘要／核對，不是新的臨床欄位，也不直接複製進病歷。 |
| `S.routeDrafts` | 切換路徑時保留各路徑本次開頁草稿；只有目前有效路徑輸出。重新整理後不保留病人草稿。 |
| `S.continuitySignatures` | 驗證「持續同前」是否仍對應已確認來源的 UI 狀態，不寫進病歷。 |
| `S.lastRemoved`、`S.nextEventId` | 移除／復原及事件識別用途，不表示病人資訊或病歷事件順序本身。 |

新增欄位或更動條件時，應同時核對這份對照、產出的 Admission／Acceptance、適用的 NI plan 行為與回歸測試。自由文字仍需臨床使用者確認；一般性的提示不是完整的矛盾判讀器。
