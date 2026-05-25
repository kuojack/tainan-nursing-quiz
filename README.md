# 臺南市護理人員歷屆考題測驗網站

本網站使用 `試題` 與 `答案` 目錄中的 PDF 產生題庫，依年份提供測驗。題目與答案只做 PDF 文字抽取後的空白整理，不自行新增或改寫內容。

## 使用方式

直接開啟 `index.html` 即可使用，不需要啟動伺服器。

題庫已寫入 `questions-data.js`，網站不會在開啟時讀取 PDF 或發送網路請求。

## 重新產生題庫

```powershell
python scripts/build_quiz_data.py
```

產生檔案：

- `data/questions.json`
- `data/verification-report.json`
- `questions-data.js`

若解析或驗證失敗，腳本會停止並在驗證報告列出需要人工確認的項目。
