# Eenadu OCR + AP Agriculture News Hub

Downloads Eenadu epaper #imgmain2 pages, runs Telugu OCR, tags agriculture-related text with shared Telugu/English keywords, and keeps the agriculture RSS crawler/dashboard working from the same keyword taxonomy.

## Folder structure

```text
ocr_news/
  scrape_ocr.py          # Eenadu image download + Telugu OCR + agri keyword tagging
  keywords.json          # Shared agriculture/AP keyword taxonomy
  requirements.txt       # Python dependencies
  server.js              # Agriculture RSS crawler + dashboard API
  package.json           # Node dependencies/scripts
  console_snippet.js     # Browser console helper for imgmain2 URLs
  data/news_cache.json   # RSS crawler cache
  downloads/             # Downloaded OCR page images
  output/                # OCR JSON outputs
  public/                # Dashboard UI
```

## Setup

```bash
python3 -m pip install -r requirements.txt
python3 -m playwright install chromium
brew install tesseract tesseract-lang
npm install
```

## OCR all main + district editions

Single date:

```bash
python3 scrape_ocr.py --date 14/09/2026 --out output/all.json --agri-only-out output/agriculture.json
```

Date range:

```bash
python3 scrape_ocr.py --date 13/09/2026..14/09/2026 --out output/all.json --agri-only-out output/agriculture.json
```

Single edition only:

```bash
python3 scrape_ocr.py --date 14/09/2026 --eid 10 --out output/guntur.json --agri-only-out output/guntur_agriculture.json
```

## OCR parameters

- --date: dd/mm/yyyy or dd/mm/yyyy..dd/mm/yyyy
- --eid: repeatable edition id. Omit to process main + all known editions.
- --out: full OCR JSON path.
- --agri-only-out: optional agriculture-only JSON path.
- --keywords: keyword JSON path. Default: keywords.json.
- --min-keyword-matches: default 1.
- --headful: show browser while scraping.

## OCR JSON fields

Each record includes: date, eid, edition, page_index, imgmain2_url, image_path, text, is_agriculture, category, matched_keywords, and optional error.

## Agriculture crawler/dashboard

```bash
npm start
```

Open http://localhost:3000

API:
- GET  /api/news
- POST /api/news/refresh

Both OCR tagging and the RSS crawler use keywords.json.
