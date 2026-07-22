# NICU Note Builder

馬偕新生兒科（NICU）快速產生 note 的線上工具。**點選式（選擇題）結構化組裝** → 即時預覽 → 一鍵複製貼回 HIS。

四個分頁，共用上方基本資料（填一次全帶）：

| 分頁 | 內容 |
|------|------|
| **Admission** | 入院摘要兩段式；母體病史／產檢／產程決策樹，自動 AGA/SGA/LGA（Fenton 2025）＋暫定診斷清單 |
| **NI plan** | 依週數＋admission 選擇自動組出 Diagnostic／Therapeutic／Prognostic 三段計畫 |
| **Acceptance** | 接手 note（模板填欄）；上半自動沿用 admission，Hospital course 點選組裝，ABG 貼上自動判酸鹼 |
| **Procedure** | 勾選 8 種 procedure（intubation／A-line／LISA／LP／UAC／UVC／chest tube／exchange transfusion），依體重自動帶 ETT size・深度・劑量等 |

## 設計原則
- **純前端、單檔 HTML**：所有計算與組稿都在瀏覽器完成，不送任何後端。
- **病人資料一律不上雲端**：本工具不儲存病人資料；預覽可編輯、複製後貼回 HIS。
- **點選優先**：平常無 risk 幾乎不用點；有陽性才展開子選項。任何組合都組得出通順句子。
- **即時預覽可編輯**：手動改字會鎖住不被覆蓋（琥珀色），可「↺ 重新產生」。

## 部署 / 嵌入
- GitHub Pages：<https://lantus123.github.io/nicu-note-builder/>
- Google Sites：「插入 → 嵌入 → 依網址」貼上上述網址即可內嵌（GitHub Pages 無 X-Frame-Options）。

## 檔案 / 建置
- `index.html` — GitHub Pages 部署檔（standalone 完整 HTML，直接開即可用）。
- `_demo_structured.html` — 本體原始碼（body-only，供 Artifact 預覽與編輯）。
- **建置**：`index.html` = HTML 外殼 ＋ `_demo_structured.html`。改動請編輯 `_demo_structured.html`，再重新產生 `index.html`（外殼見 repo commit 內指令）後 push。

> **零病人資料**：本 repo 只放程式碼＋README。設計規格、含真實個案的範例（病歷號／院所／個案細節）一律只留本機、不進版控。連 placeholder 都用假值（病歷號 `00000000`）。

## 本機開發
瀏覽器直接開 `index.html` 即可，無需建置環境。
