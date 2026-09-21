// ==========================================================================
// AP AgriNews Hub Client-Side Application Code
// ==========================================================================

// Application State
let allArticles = [];
let filteredArticles = [];
let currentPage = 1;
const itemsPerPage = 8;
let newsChartInstance = null;

// City coordinates mapping for AP Districts (Open-Meteo API)
const CITY_COORDS = {
  amaravati: { lat: 16.5062, lon: 80.5480, name: 'Amaravati' },
  guntur: { lat: 16.3067, lon: 80.4365, name: 'Guntur' },
  anantapur: { lat: 14.6819, lon: 77.6006, name: 'Anantapur' },
  kurnool: { lat: 15.8281, lon: 78.0373, name: 'Kurnool' },
  visakhapatnam: { lat: 17.6868, lon: 83.2185, name: 'Visakhapatnam' }
};

// DOM Elements
const elements = {
  themeToggle: document.getElementById('theme-toggle'),
  refreshBtn: document.getElementById('refresh-btn'),
  lastUpdatedText: document.getElementById('last-updated-text'),
  searchInput: document.getElementById('search-input'),
  langFilter: document.getElementById('lang-filter'),
  sourceFilter: document.getElementById('source-filter'),
  categoryFilter: document.getElementById('category-filter'),
  dateFilter: document.getElementById('date-filter'),
  weatherCitySelect: document.getElementById('weather-city-select'),
  weatherLoader: document.getElementById('weather-loader'),
  weatherContent: document.getElementById('weather-content'),
  wTemp: document.getElementById('w-temp'),
  wCondition: document.getElementById('w-condition'),
  wHumidity: document.getElementById('w-humidity'),
  wWind: document.getElementById('w-wind'),
  wIcon: document.getElementById('weather-icon'),
  wAdvisory: document.getElementById('weather-advisory-text'),
  statTotalArticles: document.getElementById('stat-total-articles'),
  statTodayArticles: document.getElementById('stat-today-articles'),
  articlesLoader: document.getElementById('articles-loader'),
  noArticlesMsg: document.getElementById('no-articles-msg'),
  newsGridContainer: document.getElementById('news-grid-container'),
  paginationContainer: document.getElementById('pagination-container'),
  loadMoreBtn: document.getElementById('load-more-btn'),
  resultsCount: document.getElementById('results-count')
};

// ==========================================================================
// Initialization & Theme Handling
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  fetchNews();
  initWeather();
  setupEventListeners();
});

// Setup Dark/Light Theme
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
    elements.themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
  } else {
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
    elements.themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
  }
}

function toggleTheme() {
  if (document.body.classList.contains('dark-theme')) {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
    elements.themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
    localStorage.setItem('theme', 'light');
  } else {
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
    elements.themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
    localStorage.setItem('theme', 'dark');
  }
  // Re-render chart to adjust grid colors if active
  if (newsChartInstance) {
    updateChartTheme();
  }
}

// ==========================================================================
// Fetch News from Backend API
// ==========================================================================
async function fetchNews(isRefresh = false) {
  if (isRefresh) {
    elements.refreshBtn.classList.add('spinning');
    elements.refreshBtn.disabled = true;
  }
  
  elements.articlesLoader.classList.remove('hidden');
  elements.newsGridContainer.classList.add('hidden');
  elements.noArticlesMsg.classList.add('hidden');
  
  try {
    const url = isRefresh ? '/api/news/refresh' : '/api/news/with-ocr';
    const method = isRefresh ? 'POST' : 'GET';
    const response = await fetch(url, { method });
    const data = await response.json();
    
    const cache = isRefresh ? data.cache : data;
    allArticles = cache.articles || [];
    
    // Update Sync Text
    if (cache.lastUpdated) {
      const syncDate = new Date(cache.lastUpdated);
      elements.lastUpdatedText.innerText = `Last sync: ${syncDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${syncDate.toLocaleDateString()})`;
    } else {
      elements.lastUpdatedText.innerText = 'Last sync: Never';
    }
    
    applyFilters(true); // reset page count
  } catch (err) {
    console.error('Error fetching articles:', err);
    elements.resultsCount.innerText = 'Error loading news';
    elements.articlesLoader.classList.add('hidden');
    elements.noArticlesMsg.classList.remove('hidden');
  } finally {
    if (isRefresh) {
      elements.refreshBtn.classList.remove('spinning');
      elements.refreshBtn.disabled = false;
    }
  }
}

// ==========================================================================
// Event Listeners & Interactive Filters
// ==========================================================================
function setupEventListeners() {
  // Theme Toggle Button
  elements.themeToggle.addEventListener('click', toggleTheme);
  
  // Refresh Button
  elements.refreshBtn.addEventListener('click', () => fetchNews(true));
  
  // Search Input (Debounced keyup filter)
  let searchTimeout;
  elements.searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => applyFilters(true), 250);
  });

  // Language Toggles
  elements.langFilter.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      elements.langFilter.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      applyFilters(true);
    });
  });

  // Category Selector Buttons
  elements.categoryFilter.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      elements.categoryFilter.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
      const targetBtn = e.target.closest('.category-btn');
      targetBtn.classList.add('active');
      applyFilters(true);
    });
  });

  // Source Checkbox Filters
  elements.sourceFilter.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => applyFilters(true));
  });

  // Date Filter Dropdown
  elements.dateFilter.addEventListener('change', () => applyFilters(true));

  // Load More Pagination Button
  elements.loadMoreBtn.addEventListener('click', () => {
    currentPage++;
    renderArticlesGrid();
  });

  // Weather City Selector
  elements.weatherCitySelect.addEventListener('change', (e) => {
    fetchWeather(e.target.value);
  });
}

// ==========================================================================
// Filtering Logic
// ==========================================================================
function applyFilters(resetPage = true) {
  if (resetPage) {
    currentPage = 1;
  }

  // Get active filter states
  const searchVal = elements.searchInput.value.toLowerCase().trim();
  
  const activeLangBtn = elements.langFilter.querySelector('button.active');
  const langVal = activeLangBtn ? activeLangBtn.dataset.lang : 'all';
  
  const activeCatBtn = elements.categoryFilter.querySelector('.category-btn.active');
  const catVal = activeCatBtn ? activeCatBtn.dataset.category : 'all';
  
  const checkedSources = Array.from(elements.sourceFilter.querySelectorAll('input:checked')).map(cb => cb.value);
  const dateVal = elements.dateFilter.value;

  // Filter the full dataset
  filteredArticles = allArticles.filter(article => {
    // 1. Search Query
    if (searchVal) {
      const matchTitle = article.title.toLowerCase().includes(searchVal);
      const matchSnippet = article.snippet && article.snippet.toLowerCase().includes(searchVal);
      if (!matchTitle && !matchSnippet) return false;
    }

    // 2. Language Filter
    if (langVal !== 'all' && article.language !== langVal) {
      return false;
    }

    // 3. Category Filter
    if (catVal !== 'all' && article.category !== catVal) {
      return false;
    }

    // 4. Source Filter
    const individualSources = ['Eenadu', 'Sakshi', 'Andhra Jyothy', 'Andhra Prabha', 'Prajasakti', 'Suryaa', 'The Hindu', 'Deccan Chronicle', 'Times of India', 'Indian Express'];
    if (individualSources.includes(article.source)) {
      if (!checkedSources.includes(article.source)) {
        return false;
      }
    } else {
      if (!checkedSources.includes('National/Other')) {
        return false;
      }
    }

    // 5. Date Period Filter
    if (dateVal !== 'all') {
      const pubDate = new Date(article.pubDate);
      const today = new Date(); // In 2026 current time format
      
      const timeDiff = today - pubDate;
      const oneDayMs = 24 * 60 * 60 * 1000;

      if (dateVal === 'today') {
        // Same calendar day
        const isSameDay = pubDate.getDate() === today.getDate() &&
                          pubDate.getMonth() === today.getMonth() &&
                          pubDate.getFullYear() === today.getFullYear();
        if (!isSameDay) return false;
      } else if (dateVal === 'yesterday') {
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const isYesterday = pubDate.getDate() === yesterday.getDate() &&
                            pubDate.getMonth() === yesterday.getMonth() &&
                            pubDate.getFullYear() === yesterday.getFullYear();
        if (!isYesterday) return false;
      } else if (dateVal === 'week') {
        if (timeDiff > oneDayMs * 7) return false;
      }
    }

    return true;
  });

  // Update stats counters
  updateStats();
  
  // Render output
  renderArticlesGrid();
  
  // Render Chart
  renderChart();
}

// ==========================================================================
// Render Articles Grid
// ==========================================================================
function renderArticlesGrid() {
  elements.articlesLoader.classList.add('hidden');
  
  if (filteredArticles.length === 0) {
    elements.newsGridContainer.innerHTML = '';
    elements.newsGridContainer.classList.add('hidden');
    elements.noArticlesMsg.classList.remove('hidden');
    elements.paginationContainer.classList.add('hidden');
    elements.resultsCount.innerText = 'Showing 0 articles';
    return;
  }

  elements.noArticlesMsg.classList.add('hidden');
  elements.newsGridContainer.classList.remove('hidden');

  // Slice articles array for pagination
  const startIndex = 0;
  const endIndex = currentPage * itemsPerPage;
  const pageArticles = filteredArticles.slice(startIndex, endIndex);

  elements.resultsCount.innerText = `Showing ${Math.min(endIndex, filteredArticles.length)} of ${filteredArticles.length} articles`;

  let htmlContent = '';
  pageArticles.forEach(article => {
    // Determine source badge color class
    let badgeClass = 'badge-other';
    if (article.source === 'Eenadu') badgeClass = 'badge-eenadu';
    else if (article.source === 'Sakshi') badgeClass = 'badge-sakshi';
    else if (article.source === 'The Hindu') badgeClass = 'badge-hindu';
    else if (article.source === 'Andhra Jyothy') badgeClass = 'badge-aj';
    else if (article.source === 'Andhra Prabha') badgeClass = 'badge-ap';
    else if (article.source === 'Prajasakti') badgeClass = 'badge-ps';
    else if (article.source === 'Suryaa') badgeClass = 'badge-su';
    else if (article.source === 'Deccan Chronicle') badgeClass = 'badge-dc';
    else if (article.source === 'Times of India') badgeClass = 'badge-toi';
    else if (article.source === 'Indian Express') badgeClass = 'badge-ie';

    // Format Date beautifully
    const pubDate = new Date(article.pubDate);
    const dateFormatted = pubDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const timeFormatted = pubDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    htmlContent += `
      <article class="news-card">
        <div class="news-card-meta">
          <span class="news-source-plain">${article.source}</span>
          <span class="news-date-badge">
            <i class="fa-regular fa-clock"></i> ${dateFormatted} at ${timeFormatted}
          </span>
        </div>
        <div class="news-card-body">
          <h3 class="news-card-title">
            <a href="${article.link}" target="_blank" rel="noopener noreferrer">${article.title}</a>
          </h3>
          <p class="news-card-snippet">${article.snippet || 'Click read full article to read more details about this agricultural development...'}</p>
        </div>
        <div class="news-card-footer">
          <span class="news-tag" title="Article Category">${article.category}</span>
          <a href="${article.link}" target="_blank" rel="noopener noreferrer" class="news-read-link">
            Read Full <i class="fa-solid fa-arrow-right-long"></i>
          </a>
        </div>
      </article>
    `;
  });

  elements.newsGridContainer.innerHTML = htmlContent;

  // Show pagination if more items exist
  if (endIndex < filteredArticles.length) {
    elements.paginationContainer.classList.remove('hidden');
  } else {
    elements.paginationContainer.classList.add('hidden');
  }
}

// Update counters
function updateStats() {
  elements.statTotalArticles.innerText = allArticles.length;

  const today = new Date();
  const todayCount = allArticles.filter(article => {
    const pubDate = new Date(article.pubDate);
    return pubDate.getDate() === today.getDate() &&
           pubDate.getMonth() === today.getMonth() &&
           pubDate.getFullYear() === today.getFullYear();
  }).length;

  elements.statTodayArticles.innerText = todayCount;
}

// ==========================================================================
// News Coverage Distribution — Number Grid (replaces chart)
// ==========================================================================
function renderChart() {
  const container = document.getElementById('coverage-numbers');
  if (!container) return;

  const sourceList = [
    'Eenadu', 'Sakshi', 'Andhra Jyothy', 'Andhra Prabha',
    'Prajasakti', 'Suryaa', 'The Hindu', 'Deccan Chronicle',
    'Times of India', 'Indian Express'
  ];

  const sourceCounts = {};
  sourceList.forEach(s => sourceCounts[s] = 0);
  sourceCounts['Other'] = 0;

  filteredArticles.forEach(a => {
    if (sourceCounts[a.source] !== undefined) {
      sourceCounts[a.source]++;
    } else {
      sourceCounts['Other']++;
    }
  });

  const allSources = [...sourceList, 'Other'];
  container.innerHTML = allSources
    .filter(s => sourceCounts[s] > 0)
    .map(s => `
      <div class="coverage-num-item">
        <span class="coverage-num-count">${sourceCounts[s]}</span>
        <span class="coverage-num-label">${s}</span>
      </div>
    `).join('');
}

function updateChartTheme() {
  // No chart to update — numbers don't need theme updates
}

// ==========================================================================
// Weather API & Agriculture Advisory Widget
// ==========================================================================
function initWeather() {
  fetchWeather('amaravati');
}

async function fetchWeather(cityKey) {
  const city = CITY_COORDS[cityKey];
  if (!city) return;

  elements.weatherLoader.classList.remove('hidden');
  elements.weatherContent.classList.add('hidden');

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current_weather=true&hourly=relativehumidity_2m`);
    const data = await response.json();
    
    if (data && data.current_weather) {
      const cw = data.current_weather;
      
      // Update UI Temp
      elements.wTemp.innerText = Math.round(cw.temperature);
      
      // Get Humidity from hourly forecast (closest index to current time)
      let humidity = '65%';
      if (data.hourly && data.hourly.relativehumidity_2m) {
        humidity = data.hourly.relativehumidity_2m[0] + '%';
      }
      elements.wHumidity.innerText = humidity;
      elements.wWind.innerText = cw.windspeed + ' km/h';

      // Parse Weather Code
      const code = cw.weathercode;
      const parsedWeather = parseWeatherCode(code);
      elements.wCondition.innerText = parsedWeather.text;
      elements.wIcon.innerHTML = `<i class="fa-solid ${parsedWeather.icon}"></i>`;
      
      // Generate Agri Advisory based on temperature, wind, and rain
      elements.wAdvisory.innerText = generateAgriAdvisory(parsedWeather.conditionType, cw.temperature, cw.windspeed);
      
      elements.weatherLoader.classList.add('hidden');
      elements.weatherContent.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Error fetching weather:', err);
    elements.weatherLoader.innerHTML = '<span class="text-red"><i class="fa-solid fa-triangle-exclamation"></i> Error loading weather</span>';
  }
}

// Map WMO codes to Icons & Conditions
function parseWeatherCode(code) {
  // WMO weather code translation
  switch(code) {
    case 0:
      return { text: 'Clear Sky (ఎండగా ఉంది)', icon: 'fa-sun', conditionType: 'clear' };
    case 1:
    case 2:
    case 3:
      return { text: 'Partly Cloudy (పాక్షిక మేఘావృతం)', icon: 'fa-cloud-sun', conditionType: 'cloudy' };
    case 45:
    case 48:
      return { text: 'Foggy (పొగమంచు)', icon: 'fa-smog', conditionType: 'fog' };
    case 51:
    case 53:
    case 55:
    case 56:
    case 57:
      return { text: 'Light Drizzle (చినుకులు)', icon: 'fa-cloud-rain', conditionType: 'drizzle' };
    case 61:
    case 63:
    case 65:
    case 66:
    case 67:
      return { text: 'Rain (వర్షం)', icon: 'fa-cloud-showers-heavy', conditionType: 'rain' };
    case 71:
    case 73:
    case 75:
    case 77:
      return { text: 'Snow (మంచు)', icon: 'fa-snowflake', conditionType: 'snow' };
    case 80:
    case 81:
    case 82:
      return { text: 'Rain Showers (జల్లులు)', icon: 'fa-cloud-showers-water', conditionType: 'rain' };
    case 95:
    case 96:
    case 99:
      return { text: 'Thunderstorm (ఉరుములతో కూడిన వర్షం)', icon: 'fa-cloud-bolt', conditionType: 'storm' };
    default:
      return { text: 'Clear (ప్రశాంతం)', icon: 'fa-sun', conditionType: 'clear' };
  }
}

// Generate Agri-advisories
function generateAgriAdvisory(condType, temp, windspeed) {
  if (condType === 'rain' || condType === 'storm' || condType === 'drizzle') {
    return 'Advisory: Stop fertilizer and pesticide application. Postpone harvesting. Ensure outlets are open to drain excess water from paddy and commercial crops.';
  }
  if (windspeed > 15) {
    return `Advisory: High wind speeds of ${windspeed} km/h detected. Postpone pesticide spraying to prevent drift. Provide support to young crop stalks and banana trees.`;
  }
  if (temp > 38) {
    return 'Advisory: High temperature alert. Irrigate field crops during early morning or late evening to check water stress. Protect nursery beds with shades.';
  }
  if (condType === 'fog') {
    return 'Advisory: Humid/foggy conditions may invite pest attacks (e.g. blast in paddy, blight in tomato). Keep a close watch on leaves and spray appropriate fungicide.';
  }
  
  // Default favorable advisory
  return 'Advisory: Weather is highly favorable for fertilizer/pesticide spraying, weeding, harvesting, and grain-drying. Maintain normal irrigation cycles.';
}
