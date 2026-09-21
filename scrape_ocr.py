#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

import requests
from PIL import Image
import pytesseract
from playwright.sync_api import sync_playwright

EDITIONS = {
    "2": "MAIN",
    "489": "ALLURI SEETARAMARAJU",
    "10": "AMARAVATI GUNTUR",
    "14": "AMARAVATI KRISHNA",
    "6": "AMARAVATI NTR",
    "21": "ANAKAPALLI",
    "7": "ANANTAPUR",
    "497": "ANNAMAYYA",
    "8": "BAPATLA",
    "495": "CHITTOOR",
    "491": "DR B R AMBEDKAR KONASEEMA",
    "9": "EAST GODAVARI",
    "492": "ELURU",
    "490": "KAKINADA",
    "15": "KURNOOL",
    "501": "MARKAPURAM",
    "499": "NANDYALA",
    "11": "PALNADU",
    "487": "PARVATHIPURAM MANYAM",
    "502": "POLAVARAM",
    "18": "PRAKASAM",
    "16": "SRI POTTI SRIRAMULU NELLORE",
    "498": "SRI SATYASAI",
    "19": "SRIKAKULAM",
    "500": "TIRUPATI",
    "22": "VISAKHAPATNAM",
    "23": "VIZIANAGARAM",
    "24": "WEST GODAVARI",
    "13": "YSR KADAPA",
}


def args():
    p = argparse.ArgumentParser(description="Download Eenadu #imgmain2 pages and OCR Telugu text.")
    p.add_argument("--date", required=True, help="dd/mm/yyyy or dd/mm/yyyy..dd/mm/yyyy")
    p.add_argument("--eid", action="append", default=[], help="Edition id. Repeatable. Default: all editions.")
    p.add_argument("--out", default="output/results.json", help="Output JSON path.")
    p.add_argument("--keywords", default="keywords.json", help="Agriculture keyword JSON path.")
    p.add_argument("--agri-only-out", help="Optional agriculture-only JSON path.")
    p.add_argument("--min-keyword-matches", type=int, default=1, help="Minimum matched keywords for agriculture flag.")
    p.add_argument("--headful", action="store_true", help="Show browser window.")
    return p.parse_args()


def dates(value):
    parts = value.split("..", 1)
    start = datetime.strptime(parts[0], "%d/%m/%Y")
    end = datetime.strptime(parts[-1], "%d/%m/%Y")
    if end < start:
        raise ValueError("date range end is before start")
    days = (end - start).days + 1
    return [(start + timedelta(days=i)).strftime("%d/%m/%Y") for i in range(days)]


def page_url(date, eid):
    return f"https://epaper.eenadu.net/Home/Index?date={date}&eid={eid}"


def clean_ext(url):
    ext = Path(urlparse(url).path).suffix.lower()
    return ext if ext in {".jpg", ".jpeg", ".png", ".webp"} else ".jpg"


def download(url, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = requests.get(url, timeout=60, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    dest.write_bytes(r.content)


def ocr_telugu(path):
    with Image.open(path) as img:
        return pytesseract.image_to_string(img, lang="tel").strip()


def load_keywords(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def classify_agriculture(text, keywords, min_matches):
    haystack = (text or "").lower()
    category_matches = {}
    for category, words in keywords.get("categories", {}).items():
        hits = sorted({w for w in words if w.lower() in haystack})
        if hits:
            category_matches[category] = hits

    matched = sorted({w for hits in category_matches.values() for w in hits})
    category = max(category_matches, key=lambda k: len(category_matches[k])) if category_matches else None
    return {
        "is_agriculture": len(matched) >= min_matches,
        "category": category,
        "matched_keywords": matched,
    }


def thumbnail_count(page):
    try:
        page.wait_for_selector(".owl-item", timeout=30000)
    except Exception as e:
        print(f"Carousel load timeout or not found: {e}")
        return 0
    count = page.locator(".owl-item .item, .owl-item img.imgTitleBelow").count()
    if count == 0:
        print("No thumbnails found in carousel")
    return count


def imgmain2_url(page):
    img = page.locator("#imgmain2").first
    img.wait_for(state="attached", timeout=10000)
    return img.get_attribute("src") or ""


def scrape_edition(browser, date, eid, keywords, min_matches):
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    page = ctx.new_page()
    records = []
    url = page_url(date, eid)
    print(f"Loading: {url}")
    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_load_state("networkidle", timeout=15000)
    print(f"Page loaded. Waiting for carousel...")
    count = thumbnail_count(page)
    print(f"Found {count} pages in carousel")
    
    if count == 0:
        ctx.close()
        return records

    seen = set()
    for i in range(count):
        record = {"date": date, "eid": eid, "edition": EDITIONS.get(eid, eid), "page_index": i + 1}
        try:
            thumb = page.locator(".owl-item .item, .owl-item img.imgTitleBelow").nth(i)
            thumb.scroll_into_view_if_needed(timeout=10000)
            thumb.click(timeout=10000)
            page.wait_for_timeout(1200)
            url = imgmain2_url(page)
            if not url:
                raise RuntimeError("#imgmain2 has no src")
            record["imgmain2_url"] = url
            if url in seen:
                record["error"] = "duplicate imgmain2_url after click"
                records.append(record)
                continue
            seen.add(url)
            ext = clean_ext(url)
            date_dir = date.replace("/", "-")
            local = Path("downloads") / date_dir / eid / f"page_{i + 1:02d}{ext}"
            download(url, local)
            record["image_path"] = str(local)
            record["text"] = ocr_telugu(local)
            record.update(classify_agriculture(record["text"], keywords, min_matches))
        except Exception as e:
            record["error"] = str(e)
        records.append(record)
    ctx.close()
    return records


def main():
    a = args()
    eids = a.eid or list(EDITIONS)
    keywords = load_keywords(a.keywords)

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    all_records = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not a.headful)
        for date in dates(a.date):
            for eid in eids:
                try:
                    records = scrape_edition(browser, date, eid, keywords, a.min_keyword_matches)
                    all_records.extend(records)
                except Exception as e:
                    print(f"Error scraping {date} edition {eid}: {e}")
                    continue
        browser.close()

    out.write_text(json.dumps(all_records, ensure_ascii=False, indent=2), encoding="utf-8")
    if a.agri_only_out:
        agri = [r for r in all_records if r.get("is_agriculture")]
        agri_out = Path(a.agri_only_out)
        agri_out.parent.mkdir(parents=True, exist_ok=True)
        agri_out.write_text(json.dumps(agri, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"wrote {len(agri)} agriculture records to {agri_out}")
    print(f"wrote {len(all_records)} records to {out}")


if __name__ == "__main__":
    main()
