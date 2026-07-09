# NICU Note Builder

馬偕新生兒科（NICU）快速產生 **admission / acceptance / procedure note** 的線上工具。
表單快填 → 即時預覽 → 一鍵複製貼回 HIS。

## 設計原則
- **純前端、單檔 HTML**：所有計算與組稿都在瀏覽器完成。
- **病人資料一律不上雲端**：不送任何後端，僅 `localStorage` 記住操作者署名等非病人資訊。
- **部署目標**：GitHub Pages 靜態頁 → Google Sites 以「嵌入 → 依網址」內嵌。
- **輸出紀年可切換**（預設西元），輸入日期用 `<input type=date>`。

## 目前狀態
| Note | 狀態 |
|------|------|
| Admission | 雛形 v0.1（可用，句型引擎依 `docs/admission-spec.md`） |
| Acceptance | 待格式 |
| Procedure | 待格式 |

## 檔案
- `index.html` — 主程式（standalone，直接開即可用，也是 GitHub Pages 部署檔）
- `_artifact.html`、`_check.js` — 開發用暫存（git 忽略）

> **設計規格與範例病歷不放在本 repo**。admission note 的完整實作規格與真實範例含病人可識別資訊（病歷號、院所名、個案細節），依「病人資料一律不上雲端」原則只保留在本機，不進版控。

## admission note 引擎重點（已實作）
- 自動計算：早產判定（GA<37 → Prematurity）、體重分類（<1000 ELBW／<1500 VLBW／<2500 LBW）、GDM→IDM、CPR→birth asphyxia 自動進診斷
- 否定句安全網：未勾的常規項用 `or` 串成 "denied a history of …"；有陽性病史時改 "denied other history of …"
- 血清學三態（陰／陽／未驗）：未驗不寫入任何句；HBsAg 陽性自動改寫且不與 hepatitis 陰性句矛盾
- 產房急救階梯：Neopuff → 插管 → CPR＋Epinephrine 逐級展開
- 家系圖：由手足性別序＋病人排行自動產生對齊 ASCII pedigree
- 條件式段落：破水／類固醇／安胎／母體感染等有填才出現

## 本機開發
直接用瀏覽器開 `index.html` 即可。無需建置。
