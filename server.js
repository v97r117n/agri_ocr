const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const parser = new Parser({
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
});

const CACHE_DIR = path.join(__dirname, 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'news_cache.json');
const KEYWORDS_FILE = path.join(__dirname, 'keywords.json');
const KEYWORDS = JSON.parse(fs.readFileSync(KEYWORDS_FILE, 'utf8'));
const MAX_CACHE_ITEMS = 500; // Limit cache size to prevent file bloating

// Ensure data directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Standardized list of feeds to crawl
const FEEDS = [
  {
    name: 'The Hindu - Agriculture',
    url: 'https://www.thehindu.com/sci-tech/agriculture/feeder/default.rss',
    source: 'The Hindu',
    lang: 'English'
  },
  {
    name: 'The Hindu - Andhra Pradesh',
    url: 'https://www.thehindu.com/news/national/andhra-pradesh/feeder/default.rss',
    source: 'The Hindu',
    lang: 'English',
    filterKeywords: ['agriculture', 'farmer', 'crop', 'fertilizer', 'irrigation', 'paddy', 'cotton', 'rythu', 'seed', 'harvest', 'pest', 'soil']
  },
  {
    name: 'Eenadu - Agriculture (Google News)',
    url: 'https://news.google.com/rss/search?q=site:eenadu.net%20(%E0%B0%B5%E0%B1%8D%E0%B0%AF%E0%B0%B5%E0%B0%B8%E0%B0%BE%E0%B0%AF%E0%B0%82%20OR%20%E0%B0%B0%E0%B1%8E%E0%B0%A4%E0%B1%81%20OR%20%E0%B0%AA%E0%B0%82%E0%B0%9F%20OR%20%E0%B0%8E%E0%B0%B0%E0%B1%81%E0%B0%B5%E0%B1%81%E0%B0%B2%E0%B1%81%20OR%20%E0%B0%B5%E0%B1%8D%E0%B0%AF%E0%B0%B5%E0%B0%B8%E0%B0%BE%E0%B0%AF%20%E0%B0%B6%E0%B0%BE%E0%B0%96)&hl=te&gl=IN&ceid=IN:te',
    source: 'Eenadu',
    lang: 'Telugu'
  },
  {
    name: 'Sakshi - Agriculture (Google News)',
    url: 'https://news.google.com/rss/search?q=site:sakshi.com%20(%E0%B0%B5%E0%B1%8D%E0%B0%AF%E0%B0%B5%E0%B0%B8%E0%B0%BE%E0%B0%AF%E0%B0%82%20OR%20%E0%B0%B0%E0%B1%8E%E0%B0%A4%E0%B1%81%20OR%20%E0%B0%AA%E0%B0%82%E0%B0%9F%20OR%20%E0%B0%8E%E0%B0%B0%E0%B1%81%E0%B0%B5%E0%B1%81%E0%B0%B2%E0%B1%81%20OR%20%E0%B0%B5%E0%B1%8D%E0%B0%AF%E0%B0%B5%E0%B0%B8%E0%B0%BE%E0%B0%AF%20%E0%B0%B6%E0%B0%BE%E0%B0%96)&hl=te&gl=IN&ceid=IN:te',
    source: 'Sakshi',
    lang: 'Telugu'
  },
  {
    name: 'Andhra Jyothy - Agriculture (Google News)',
    url: 'https://news.google.com/rss/search?q=site:andhrajyothy.com%20(%E0%B0%B5%E0%B1%8D%E0%B0%AF%E0%B0%B5%E0%B0%B8%E0%B0%BE%E0%B0%AF%E0%B0%82%20OR%20%E0%B0%B0%E0%B1%8E%E0%B0%A4%E0%B1%81%20OR%20%E0%B0%AA%E0%B0%82%E0%B0%9F%20OR%20%E0%B0%8E%E0%B0%B0%E0%B1%81%E0%B0%B5%E0%B1%81%E0%B0%B2%E0%B1%81%20OR%20%E0%B0%B5%E0%B1%8D%E0%B0%AF%E0%B0%B5%E0%B0%B8%E0%B0%BE%E0%B0%AF%20%E0%B0%B6%E0%B0%BE%E0%B0%96)&hl=te&gl=IN&ceid=IN:te',
    source: 'Andhra Jyothy',
    lang: 'Telugu'
  },
  {
    name: 'Andhra Prabha - Agriculture (Google News)',
    url: 'https://news.google.com/rss/search?q=site:andhraprabha.in%20(%E0%B0%B5%E0%B1%8D%E0%B0%AF%E0%B0%B5%E0%B0%B8%E0%B0%BE%E0%B0%AF%E0%B0%82%20OR%20%E0%B0%B0%E0%B1%8E%E0%B0%A4%E0%B1%81%20OR%20%E0%B0%AA%E0%B0%82%E0%B0%9F%20OR%20%E0%B0%8E%E0%B0%B0%E0%B1%81%E0%B0%B5%E0%B1%81%E0%B0%B2%E0%B1%81%20OR%20%E0%B0%B5%E0%B1%8D%E0%B0%AF%E0%B0%B5%E0%B0%B8%E0%B0%BE%E0%B0%AF%20%E0%B0%B6%E0%B0%BE%E0%B0%96)&hl=te&gl=IN&ceid=IN:te',
    source: 'Andhra Prabha',
    lang: 'Telugu'
  },
  {
    name: 'Prajasakti - Agriculture (Google News)',
    url: 'https://news.google.com/rss/search?q=site:prajasakti.com%20(%E0%B0%B5%E0%B1%8D%E0%B0%AF%E0%B0%B5%E0%B0%B8%E0%B0%BE%E0%B0%AF%E0%B0%82%20OR%20%E0%B0%B0%E0%B1%8E%E0%B0%A4%E0%B1%81%20OR%20%E0%B0%AA%E0%B0%82%E0%B0%9F%20OR%20%E0%B0%8E%E0%B0%B0%E0%B1%81%E0%B0%B5%E0%B1%81%E0%B0%B2%E0%B1%81%20OR%20%E0%B0%B5%E0%B1%8D%E0%B0%AF%E0%B0%B5%E0%B0%B8%E0%B0%BE%E0%B0%AF%20%E0%B0%B6%E0%B0%BE%E0%B0%96)&hl=te&gl=IN&ceid=IN:te',
    source: 'Prajasakti',
    lang: 'Telugu'
  },
  {
    name: 'Suryaa - Agriculture (Google News)',
    url: 'https://news.google.com/rss/search?q=site:suryaa.com%20(%E0%B0%B5%E0%B1%8D%E0%B0%AF%E0%B0%B5%E0%B0%B8%E0%B0%BE%E0%B0%AF%E0%B0%82%20OR%20%E0%B0%B0%E0%B1%8E%E0%B0%A4%E0%B1%81%20OR%20%E0%B0%AA%E0%B0%82%E0%B0%9F%20OR%20%E0%B0%8E%E0%B0%B0%E0%B1%81%E0%B0%B5%E0%B1%81%E0%B0%B2%E0%B1%81%20OR%20%E0%B0%B5%E0%B1%8D%E0%B0%AF%E0%B0%B5%E0%B0%B8%E0%B0%BE%E0%B0%AF%20%E0%B0%B6%E0%B0%BE%E0%B0%96)&hl=te&gl=IN&ceid=IN:te',
    source: 'Suryaa',
    lang: 'Telugu'
  },
  {
    name: 'Deccan Chronicle - AP Agriculture (Google News)',
    url: 'https://news.google.com/rss/search?q=site:deccanchronicle.com%20(agriculture%20OR%20farmer%20OR%20crop%20OR%20fertilizer%20OR%20irrigation)%20"andhra%20pradesh"&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Deccan Chronicle',
    lang: 'English'
  },
  {
    name: 'Times of India - AP Agriculture (Google News)',
    url: 'https://news.google.com/rss/search?q=site:timesofindia.indiatimes.com%20(agriculture%20OR%20farmer%20OR%20crop%20OR%20fertilizer%20OR%20irrigation)%20"andhra%20pradesh"&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Times of India',
    lang: 'English'
  },
  {
    name: 'Indian Express - AP Agriculture (Google News)',
    url: 'https://news.google.com/rss/search?q=site:indianexpress.com%20(agriculture%20OR%20farmer%20OR%20crop%20OR%20fertilizer%20OR%20irrigation)%20"andhra%20pradesh"&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Indian Express',
    lang: 'English'
  },
  {
    name: 'AP Agriculture - National (Google News)',
    url: 'https://news.google.com/rss/search?q=agriculture%20(%22andhra%20pradesh%22%20OR%20%22AP%22)%20(site:thehindu.com%20OR%20site:deccanchronicle.com%20OR%20site:timesofindia.indiatimes.com%20OR%20site:indianexpress.com)&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'National/Other',
    lang: 'English'
  }
];

// Load cache from disk
function loadCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.error('Error reading cache file, starting fresh:', e);
      return { lastUpdated: null, articles: [] };
    }
  }
  return { lastUpdated: null, articles: [] };
}

// Save cache to disk
function saveCache(cacheData) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving cache file:', e);
  }
}

// Clean titles from Google News suffix (e.g. "Headline - Eenadu" or "Headline - The Hindu")
function cleanTitle(title, sourceName) {
  if (!title) return '';
  const suffixes = [
    ` - ${sourceName}`,
    ` - Eenadu`,
    ` - Sakshi`,
    ` - The Hindu`,
    ` - Deccan Chronicle`,
    ` - Times of India`,
    ` - Indian Express`,
    ` - Andhra Jyothy`,
    ` - AndhraJyothy`,
    ` - Andhra Prabha`,
    ` - Prajasakti`,
    ` - Prajasakthi`,
    ` - Suryaa`
  ];
  let cleaned = title;
  for (const suffix of suffixes) {
    if (cleaned.toLowerCase().endsWith(suffix.toLowerCase())) {
      cleaned = cleaned.substring(0, cleaned.length - suffix.length);
      break;
    }
  }
  // Also remove generic trailing publication name patterns if any (e.g., " - ABC News")
  const hyphenIndex = cleaned.lastIndexOf(' - ');
  if (hyphenIndex > cleaned.length - 25 && hyphenIndex !== -1) {
    cleaned = cleaned.substring(0, hyphenIndex);
  }
  return cleaned.trim();
}

// Generate a unique key for an article based on its title to avoid duplicates
function getUniqueKey(title) {
  if (!title) return '';
  // Normalize by converting to lowercase, removing non-alphanumeric/non-Telugu characters, and squeezing spaces
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u0C00-\u0C7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Categorize articles based on shared keyword taxonomy
function getCategory(title, snippet) {
  const text = `${title} ${snippet || ''}`.toLowerCase();
  for (const [category, words] of Object.entries(KEYWORDS.categories || {})) {
    if (words.some(kw => text.includes(kw.toLowerCase()))) return category;
  }
  return 'General Agriculture';
}

// Detect source if from Google News aggregator
function detectSource(title, defaultSource) {
  const text = title.toLowerCase();
  if (text.endsWith('eenadu')) return 'Eenadu';
  if (text.endsWith('sakshi')) return 'Sakshi';
  if (text.endsWith('the hindu')) return 'The Hindu';
  if (text.endsWith('deccan chronicle')) return 'Deccan Chronicle';
  if (text.endsWith('times of india')) return 'Times of India';
  if (text.endsWith('indian express') || text.endsWith('the indian express')) return 'Indian Express';
  if (text.endsWith('andhra jyothy') || text.endsWith('andhrajyothy')) return 'Andhra Jyothy';
  if (text.endsWith('andhra prabha')) return 'Andhra Prabha';
  if (text.endsWith('prajasakti') || text.endsWith('prajasakthi')) return 'Prajasakti';
  if (text.endsWith('suryaa')) return 'Suryaa';
  return defaultSource;
}

// Strict positive-match filter: article must be clearly about Andhra Pradesh Agriculture
// OR contain generic agriculture content (for Telugu feeds) while NOT being about another specific state.
function isRelatedToAP(title, snippet, language) {
  const text = `${title} ${snippet || ''}`.toLowerCase();
  const titleOnly = (title || '').toLowerCase();
  const lang = language ? language.toLowerCase() : 'english';
  const categories = Object.values(KEYWORDS.categories || {}).flat();
  const hasAgri = categories.some(kw => text.includes(kw.toLowerCase()));
  if (!hasAgri) return false;

  if (lang === 'telugu') {
    const hasAPInTitle = KEYWORDS.telugu_ap.some(kw => titleOnly.includes(kw.toLowerCase()));
    const hasOtherState = KEYWORDS.telugu_other_states.some(kw => text.includes(kw.toLowerCase()));
    if (hasAPInTitle) return true;
    if (hasOtherState) return false;
    return true;
  }

  const match = kw => new RegExp(`\\b${kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(text);
  const matchTitle = kw => new RegExp(`\\b${kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(titleOnly);
  if (KEYWORDS.english_ap.some(matchTitle)) return true;
  if (KEYWORDS.english_other_states.some(match)) return false;
  return KEYWORDS.english_ap.some(match);
}

// Core crawler function
async function crawlNews() {
  console.log(`[${new Date().toISOString()}] Starting agricultural news crawl...`);
  const cache = loadCache();
  const existingArticles = cache.articles || [];
  
  // Set to track existing articles by their normalized unique key
  const seenKeys = new Set(existingArticles.map(a => getUniqueKey(a.title)));
  const seenUrls = new Set(existingArticles.map(a => a.link));
  
  const newArticles = [];

  for (const feed of FEEDS) {
    try {
      console.log(`Fetching feed: ${feed.name}`);
      const parsedFeed = await parser.parseURL(feed.url);
      
      let count = 0;
      for (const item of parsedFeed.items) {
        // Source detection (important for Google News search aggregate)
        const source = detectSource(item.title, feed.source);
        const title = cleanTitle(item.title, source);
        const link = item.link;
        const pubDateStr = item.pubDate || item.isoDate || new Date().toISOString();
        const snippet = item.contentSnippet || item.content || '';
        
        // Deduplicate using URL or normalized title
        const uniqueKey = getUniqueKey(title);
        if (seenKeys.has(uniqueKey) || seenUrls.has(link) || !title) {
          continue;
        }

        // Apply strict AP-only filtering
        if (!isRelatedToAP(title, snippet, feed.lang)) {
          continue;
        }

        // Apply keyword filtering for general feeds (like The Hindu AP section)
        if (feed.filterKeywords) {
          const contentText = `${title} ${snippet}`.toLowerCase();
          const matchesKeyword = feed.filterKeywords.some(kw => contentText.includes(kw));
          if (!matchesKeyword) continue;
        }

        const category = getCategory(title, snippet);
        
        newArticles.push({
          title,
          link,
          pubDate: new Date(pubDateStr).toISOString(),
          snippet: snippet.substring(0, 300) + (snippet.length > 300 ? '...' : ''),
          source,
          language: feed.lang,
          category,
          scrapedDate: new Date().toISOString()
        });

        seenKeys.add(uniqueKey);
        seenUrls.add(link);
        count++;
      }
      console.log(`Feed ${feed.name}: Found ${count} new articles.`);
    } catch (err) {
      console.error(`Error processing feed ${feed.name}:`, err.message);
    }
  }

  // Combine old and new articles
  let allArticles = [...newArticles, ...existingArticles];

  // Sort by pubDate descending (newest first)
  allArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  // Enforce cache limit
  if (allArticles.length > MAX_CACHE_ITEMS) {
    allArticles = allArticles.slice(0, MAX_CACHE_ITEMS);
  }

  cache.articles = allArticles;
  cache.lastUpdated = new Date().toISOString();
  saveCache(cache);

  console.log(`Crawl completed. Total cached articles: ${cache.articles.length}`);
  return cache;
}

// API Routes
app.get('/api/news', (req, res) => {
  const cache = loadCache();
  // If cache is empty, trigger a crawl asynchronously
  if (cache.articles.length === 0) {
    crawlNews().then(newCache => {
      res.json(newCache);
    }).catch(err => {
      res.status(500).json({ error: 'Crawl failed', message: err.message });
    });
  } else {
    res.json(cache);
  }
});

app.get('/api/news/with-ocr', (req, res) => {
  const cache = loadCache();
  let allArticles = cache.articles || [];
  
  // Try to load OCR agriculture articles
  try {
    const ocrPath = path.join(__dirname, 'output', 'agriculture.json');
    if (fs.existsSync(ocrPath)) {
      const ocrData = JSON.parse(fs.readFileSync(ocrPath, 'utf8'));
      const ocrArticles = ocrData.map(r => {
        const [day, month, year] = r.date.split('/').map(Number);
        const pubDate = new Date(year, month - 1, day).toISOString();
        const pubDateStr = new Date(year, month - 1, day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const editionType = r.eid === '2' ? 'Main Edition' : 'District Edition';
        const snippetPrefix = `📰 ${r.edition} (${editionType}) | Published: ${pubDateStr}\n\n`;
        return {
          title: `[OCR] ${r.edition} - Page ${r.page_index} (${pubDateStr})`,
          snippet: snippetPrefix + r.text.substring(0, 250),
          text: r.text,
          link: r.image_path,
          pubDate: pubDate,
          source: `OCR (${r.edition})`,
          language: 'Telugu',
          category: r.category || 'General Agriculture',
          scrapedDate: new Date().toISOString(),
          is_agriculture: r.is_agriculture,
          matched_keywords: r.matched_keywords || [],
          editionType: editionType,
          editionName: r.edition,
          pageNo: r.page_index,
          publishedDate: pubDateStr
        };
      });
      allArticles = [...ocrArticles, ...allArticles];
      allArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    }
  } catch (e) {
    console.warn('OCR agriculture.json not found or error reading:', e.message);
  }
  
  res.json({ articles: allArticles, lastUpdated: cache.lastUpdated });
});

app.post('/api/news/refresh', async (req, res) => {
  try {
    const newCache = await crawlNews();
    res.json({ success: true, cache: newCache });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Periodic crawling - run every 1 hour
setInterval(() => {
  crawlNews().catch(err => console.error('Scheduled crawl failed:', err));
}, 60 * 60 * 1000);

// Initialize crawl on startup (if cache is cold or older than 1 hour)
const initialCache = loadCache();
const ONE_HOUR = 60 * 60 * 1000;
if (!initialCache.lastUpdated || (new Date() - new Date(initialCache.lastUpdated)) > ONE_HOUR) {
  console.log('Cache cold or outdated. Triggering initial startup crawl...');
  crawlNews().catch(err => console.error('Startup crawl failed:', err));
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
