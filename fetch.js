const fs = require('fs');
const axios = require('axios');
const ti = require('technicalindicators');
const cheerio = require('cheerio');
const math = require('mathjs');

// Configuration with all scanner criteria
const CONFIG = {
  CRYPTO: {
    apiUrl: 'https://api.coingecko.com/api/v3/coins/markets',
    params: {
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: 250,
      sparkline: true,
      price_change_percentage: '1h,24h'
    },
    filters: {
      priceMin: 0.001,
      priceMax: 100,
      volumeMin: 10000000,
      marketCapMin: 10000000,
      marketCapMax: 5000000000,
      priceChangeMin: 2,
      priceChangeMax: 20,
      rsiMin: 50,
      rsiMax: 70,
      rvolMin: 2,
      vwapMaxDiff: 2,
      twitterMentionsMin: 10,
      sentimentMin: 0.6
    }
  },
  STOCKS: {
    apiUrl: 'https://financialmodelingprep.com/api/v3',
    apiKey: 'YOUR_FMP_API_KEY', // Replace with your actual key
    filters: {
      priceMin: 0.04,
      volumeMin: 500000,
      priceChangeMin: 1,
      rvolMin: 1.2,
      rsiMin: 45,
      rsiMax: 75,
      vwapMaxDiff: 1.5,
      twitterMentionsMin: 5,
      sentimentMin: 0.6
    }
  },
  CACHE: {
    cryptoFile: 'data/crypto.json',
    stocksFile: 'data/stocks.json',
    alertedAssets: new Set(), // Track alerted assets to avoid duplicates
    alertedFile: 'data/alerted.json'
  }
};

// Load previously alerted assets
function loadAlertedAssets() {
  try {
    if (fs.existsSync(CONFIG.CACHE.alertedFile)) {
      const data = JSON.parse(fs.readFileSync(CONFIG.CACHE.alertedFile));
      return new Set(data.alerted || []);
    }
  } catch (error) {
    console.error('Error loading alerted assets:', error);
  }
  return new Set();
}

// Save alerted assets
function saveAlertedAssets(alertedAssets) {
  try {
    fs.writeFileSync(CONFIG.CACHE.alertedFile, JSON.stringify({
      lastUpdated: new Date().toISOString(),
      alerted: Array.from(alertedAssets)
    }));
  } catch (error) {
    console.error('Error saving alerted assets:', error);
  }
}

// Enhanced fetch with retries and timeout
async function fetchWithRetry(url, params = {}, retries = 3, timeout = 15000) {
  try {
    const source = axios.CancelToken.source();
    const timer = setTimeout(() => {
      source.cancel(`Timeout after ${timeout}ms`);
    }, timeout);

    const response = await axios.get(url, {
      params,
      cancelToken: source.token,
      timeout
    });

    clearTimeout(timer);
    return response.data;
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return fetchWithRetry(url, params, retries - 1, timeout);
    }
    throw error;
  }
}

// Calculate all technical indicators
function calculateIndicators(prices, volumes) {
  if (!prices || prices.length < 50) return null;
  
  const closes = prices.slice(-100);
  const ema5 = ti.ema({ values: closes, period: 5 }).pop();
  const ema13 = ti.ema({ values: closes, period: 13 }).pop();
  const ema50 = ti.ema({ values: closes, period: 50 }).pop();
  
  // Calculate VWAP
  let vwap = 0;
  if (volumes && volumes.length === closes.length) {
    const typicalPrices = closes.map((close, i) => {
      const high = close * 1.01; // Approximate high/low
      const low = close * 0.99;
      return (high + low + close) / 3;
    });
    const pv = typicalPrices.map((p, i) => p * volumes[i]);
    vwap = math.sum(pv) / math.sum(volumes);
  }

  // Check for price spikes (pump filter)
  const lastHourPrices = prices.slice(-12); // Assuming 5min intervals
  const maxPrice = Math.max(...lastHourPrices);
  const minPrice = Math.min(...lastHourPrices);
  const priceSpike = ((maxPrice - minPrice) / minPrice) * 100;

  return {
    rsi: ti.rsi({ values: closes.slice(-24), period: 14 }).pop() || 50,
    ema5,
    ema13,
    ema50,
    emaAlignment: ema5 > ema13 && ema13 > ema50,
    vwap,
    atr: ti.atr({
      high: closes.map(p => p * 1.01),
      low: closes.map(p => p * 0.99),
      close: closes,
      period: 14
    }).pop(),
    currentPrice: closes[closes.length - 1],
    priceSpike,
    priceSpikeValid: priceSpike <= 50 // Reject if >50% spike in last hour
  };
}

// Calculate RVOL (Relative Volume)
function calculateRVol(currentVol, avgVol) {
  if (!avgVol || avgVol === 0) return 1;
  return currentVol / avgVol;
}

// Fetch Twitter mentions and sentiment (mock implementation)
async function fetchTwitterData(symbol, isCrypto) {
  try {
    // In a real implementation, use Twitter API or alternative
    return {
      count: isCrypto ? Math.floor(Math.random() * 100) + 20 : Math.floor(Math.random() * 30) + 5,
      sentiment: Math.random() * 0.3 + 0.6, // Mock sentiment 0.6-0.9
      engagement: isCrypto ? Math.floor(Math.random() * 200) + 100 : Math.floor(Math.random() * 100) + 50,
      hasInfluencer: Math.random() > 0.7 // 30% chance of influencer mention
    };
  } catch {
    return { count: 0, sentiment: 0, engagement: 0, hasInfluencer: false };
  }
}

// Fetch news with sentiment analysis
async function fetchNews(symbol, isCrypto) {
  try {
    const url = isCrypto
      ? `https://www.tradingview.com/symbols/${symbol}USD/news/`
      : `https://www.tradingview.com/symbols/${symbol}/news/`;
    
    const { data } = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(data);
    const items = $('.news-item').slice(0, 5).map((_, el) => ({
      title: $(el).find('.title').text().trim(),
      url: $(el).attr('href'),
      time: $(el).find('.time').text().trim(),
      sentiment: Math.random() * 0.3 + 0.6 // Mock sentiment 0.6-0.9
    })).get();

    return {
      items,
      avgSentiment: items.length > 0 
        ? items.reduce((sum, item) => sum + item.sentiment, 0) / items.length
        : 0,
      hasCatalyst: items.some(item => 
        /earnings|report|launch|announce|update/i.test(item.title))
    };
  } catch {
    return { items: [], avgSentiment: 0, hasCatalyst: false };
  }
}

// Generate AI score based on multiple factors
function generateAIScore(asset, isCrypto) {
  let score = 50; // Base score
  
  // Technical factors (40% weight)
  const techWeight = 0.4;
  let techScore = 0;
  
  // RSI score (0-20)
  if (isCrypto) {
    techScore += Math.max(0, 20 - Math.abs(asset.rsi - 60) * 2);
  } else {
    techScore += Math.max(0, 20 - Math.abs(asset.rsi - 60) * 1.5);
  }
  
  // EMA alignment (0-20)
  techScore += asset.emaAlignment ? 20 : 0;
  
  // VWAP proximity (0-10)
  const vwapDiff = Math.abs(asset.currentPrice - asset.vwap) / asset.vwap * 100;
  techScore += Math.max(0, 10 - vwapDiff * 2);
  
  // RVOL (0-10)
  techScore += Math.min(10, asset.rvol * 2);
  
  score += techScore * techWeight;
  
  // Social factors (30% weight)
  const socialWeight = 0.3;
  let socialScore = 0;
  
  // Twitter mentions (0-15)
  socialScore += Math.min(15, asset.twitter.count / (isCrypto ? 6 : 3));
  
  // Sentiment (0-15)
  socialScore += Math.min(15, asset.twitter.sentiment * 20);
  
  // Engagement (0-10)
  socialScore += Math.min(10, asset.twitter.engagement / (isCrypto ? 20 : 10));
  
  // Influencer (0-10)
  socialScore += asset.twitter.hasInfluencer ? 10 : 0;
  
  score += socialScore * socialWeight;
  
  // News factors (20% weight)
  const newsWeight = 0.2;
  let newsScore = 0;
  
  // News count (0-10)
  newsScore += Math.min(10, asset.news.items.length * 2);
  
  // News sentiment (0-10)
  newsScore += Math.min(10, asset.news.avgSentiment * 15);
  
  // Catalyst (0-10)
  newsScore += asset.news.hasCatalyst ? 10 : 0;
  
  score += newsScore * newsWeight;
  
  // Risk factors (10% weight)
  const riskWeight = 0.1;
  let riskScore = 0;
  
  // Price spike check (0-10)
  riskScore += asset.priceSpikeValid ? 10 : 0;
  
  score += riskScore * riskWeight;
  
  // Ensure score is between 0-100
  return Math.min(100, Math.max(0, Math.round(score)));
}

// Generate AI validation message
function generateAIValidation(asset, score) {
  if (score >= 80) {
    return "Strong buy signal with multiple confirmations";
  } else if (score >= 65) {
    return "Bullish with good technicals and sentiment";
  } else if (score >= 50) {
    return "Neutral market conditions";
  } else if (score >= 35) {
    return "Caution advised - mixed signals";
  } else {
    return "Avoid - weak technicals or negative sentiment";
  }
}

// Calculate risk assessment
function calculateRisk(asset) {
  const atrPercent = (asset.atr / asset.currentPrice) * 100;
  const stopLoss = asset.currentPrice * (1 - (atrPercent * 1.5 / 100));
  const takeProfit = asset.currentPrice * (1 + (atrPercent * 3 / 100));
  const positionSize = Math.min(10, (1 / atrPercent) * 100).toFixed(1);
  
  return {
    entry: asset.currentPrice,
    exit: asset.ema5 < asset.ema13 ? "EMA Bearish Cross" : "Hold",
    stopLoss,
    takeProfit,
    positionSize: `${positionSize}%`
  };
}

// Process crypto data with all filters
async function processCryptoData(alertedAssets) {
  try {
    const data = await fetchWithRetry(CONFIG.CRYPTO.apiUrl, CONFIG.CRYPTO.params);
    const results = [];
    const config = CONFIG.CRYPTO.filters;

    for (const coin of data) {
      try {
        // Skip if already alerted
        if (alertedAssets.has(coin.symbol)) continue;
        
        // Basic filters
        if (coin.current_price < config.priceMin || coin.current_price > config.priceMax) continue;
        if (coin.total_volume < config.volumeMin) continue;
        if (coin.market_cap < config.marketCapMin || coin.market_cap > config.marketCapMax) continue;
        
        // Price change filter
        if (!coin.price_change_percentage_24h || 
            coin.price_change_percentage_24h < config.priceChangeMin ||
            coin.price_change_percentage_24h > config.priceChangeMax) continue;

        // Calculate indicators
        const indicators = calculateIndicators(
          coin.sparkline_in_7d.price,
          Array(coin.sparkline_in_7d.price.length).fill(coin.total_volume / 24)
        );
        
        if (!indicators || !indicators.priceSpikeValid) continue;

        // Technical filters
        if (indicators.rsi < config.rsiMin || indicators.rsi > config.rsiMax) continue;
        if (!indicators.emaAlignment) continue;

        // Calculate RVOL (using 24h avg volume)
        const rvol = calculateRVol(coin.total_volume, coin.total_volume / 2);
        if (rvol < config.rvolMin) continue;

        // VWAP proximity filter
        const vwapDiff = Math.abs(indicators.currentPrice - indicators.vwap) / indicators.vwap * 100;
        if (vwapDiff > config.vwapMaxDiff) continue;

        // Get social data
        const twitter = await fetchTwitterData(coin.symbol, true);
        const news = await fetchNews(coin.symbol, true);

        // Social filters
        if (twitter.count < config.twitterMentionsMin) continue;
        if (twitter.sentiment < config.sentimentMin) continue;
        if (news.avgSentiment < config.sentimentMin) continue;
        if (!twitter.hasInfluencer && coin.market_cap < 100000000) continue; // Small caps need influencer

        // Generate AI score and validation
        const aiScore = generateAIScore({
          ...indicators,
          twitter,
          news,
          rvol
        }, true);
        
        if (aiScore < 50) continue; // Skip low-score assets

        // Risk management
        const risk = calculateRisk(indicators);

        results.push({
          symbol: coin.symbol.toUpperCase(),
          name: coin.name,
          price: coin.current_price,
          change24h: coin.price_change_percentage_24h,
          volume: coin.total_volume,
          marketCap: coin.market_cap,
          ...indicators,
          rvol,
          twitterMentions: twitter.count,
          twitterSentiment: twitter.sentiment,
          twitterEngagement: twitter.engagement,
          hasInfluencer: twitter.hasInfluencer,
          news: news.items,
          newsSentiment: news.avgSentiment,
          hasCatalyst: news.hasCatalyst,
          risk,
          aiScore,
          aiValidation: generateAIValidation(indicators, aiScore),
          tradingViewUrl: `https://www.tradingview.com/chart/?symbol=${coin.symbol.toUpperCase()}USD`,
          sentimentUrl: `https://www.tradingview.com/symbols/${coin.symbol.toUpperCase()}USD/sentiment/`,
          newsUrl: `https://www.tradingview.com/symbols/${coin.symbol.toUpperCase()}USD/news/`,
          catalystUrl: news.items.length > 0 ? news.items[0].url : '',
          lastUpdated: new Date().toISOString()
        });
        
        // Add to alerted assets
        alertedAssets.add(coin.symbol);
      } catch (error) {
        console.error(`Error processing ${coin.symbol}:`, error.message);
      }
    }

    return results;
  } catch (error) {
    console.error('Failed to process crypto data:', error);
    return [];
  }
}

// Process stock data with all filters
async function processStockData(alertedAssets) {
  try {
    const config = CONFIG.STOCKS;
    const filters = config.filters;
    
    // Fetch active stocks meeting basic criteria
    const activeStocks = await fetchWithRetry(
      `${config.apiUrl}/stock-screener?apikey=${config.apiKey}`,
      {
        priceMoreThan: filters.priceMin,
        priceLowerThan: 100, // Upper limit for penny stocks
        volumeMoreThan: filters.volumeMin,
        exchange: 'NASDAQ,NYSE,AMEX'
      }
    );

    const results = [];
    
    for (const stock of activeStocks.slice(0, 100)) { // Limit to top 100
      try {
        // Skip if already alerted
        if (alertedAssets.has(stock.symbol)) continue;
        
        // Get detailed stock data
        const detail = await fetchWithRetry(
          `${config.apiUrl}/quote/${stock.symbol}?apikey=${config.apiKey}`
        );
        
        if (!detail || !detail[0]) continue;
        
        const priceChange = (detail[0].price / detail[0].previousClose - 1) * 100;
        
        // Basic filters
        if (priceChange < filters.priceChangeMin) continue;
        
        // Get historical data for indicators
        const historical = await fetchWithRetry(
          `${config.apiUrl}/historical-chart/5min/${stock.symbol}?apikey=${config.apiKey}`
        );
        
        if (!historical || historical.length < 50) continue;
        
        const closes = historical.map(h => h.close).filter(Boolean).slice(-100);
        const volumes = historical.map(h => h.volume).filter(Boolean).slice(-100);
        
        // Calculate indicators
        const indicators = calculateIndicators(closes, volumes);
        if (!indicators || !indicators.priceSpikeValid) continue;
        
        // Technical filters
        if (indicators.rsi < filters.rsiMin || indicators.rsi > filters.rsiMax) continue;
        if (!indicators.emaAlignment) continue;
        
        // Calculate RVOL (using 30-day avg volume)
        const rvol = calculateRVol(stock.volume, stock.avgVolume || stock.volume / 2);
        if (rvol < filters.rvolMin) continue;
        
        // VWAP proximity filter
        const vwapDiff = Math.abs(indicators.currentPrice - indicators.vwap) / indicators.vwap * 100;
        if (vwapDiff > filters.vwapMaxDiff) continue;
        
        // Get news and social data
        const twitter = await fetchTwitterData(stock.symbol, false);
        const news = await fetchNews(stock.symbol, false);
        
        // News/social filters
        if (twitter.count < filters.twitterMentionsMin) continue;
        if (twitter.sentiment < filters.sentimentMin) continue;
        if (news.avgSentiment < filters.sentimentMin) continue;
        if (!news.hasCatalyst && stock.price < 5) continue; // Penny stocks need catalyst

        // Generate AI score and validation
        const aiScore = generateAIScore({
          ...indicators,
          twitter,
          news,
          rvol
        }, false);
        
        if (aiScore < 45) continue; // Skip low-score stocks

        // Risk management
        const risk = calculateRisk(indicators);

        // Check for insider activity (mock implementation)
        const hasInsiderActivity = Math.random() > 0.7; // 30% chance
        
        results.push({
          symbol: stock.symbol,
          name: stock.companyName,
          price: detail[0].price,
          change24h: priceChange,
          volume: stock.volume,
          marketCap: stock.marketCap,
          ...indicators,
          rvol,
          twitterMentions: twitter.count,
          twitterSentiment: twitter.sentiment,
          twitterEngagement: twitter.engagement,
          hasInfluencer: twitter.hasInfluencer,
          news: news.items,
          newsSentiment: news.avgSentiment,
          hasCatalyst: news.hasCatalyst,
          hasInsiderActivity,
          risk,
          aiScore,
          aiValidation: generateAIValidation(indicators, aiScore),
          tradingViewUrl: `https://www.tradingview.com/chart/?symbol=${stock.symbol}`,
          sentimentUrl: `https://www.tradingview.com/symbols/${stock.symbol}/sentiment/`,
          newsUrl: `https://www.tradingview.com/symbols/${stock.symbol}/news/`,
          catalystUrl: news.items.length > 0 ? news.items[0].url : '',
          lastUpdated: new Date().toISOString()
        });
        
        // Add to alerted assets
        alertedAssets.add(stock.symbol);
      } catch (error) {
        console.error(`Error processing ${stock.symbol}:`, error.message);
      }
    }
    
    return results;
  } catch (error) {
    console.error('Failed to process stock data:', error);
    return [];
  }
}

// Main scan function
async function runScan() {
  try {
    console.log('Starting market scan...');
    
    // Load previously alerted assets
    const alertedAssets = loadAlertedAssets();
    
    const [cryptoData, stockData] = await Promise.all([
      processCryptoData(alertedAssets),
      processStockData(alertedAssets)
    ]);
    
    // Save alerted assets
    saveAlertedAssets(alertedAssets);
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data');
    }
    
    // Save results
    fs.writeFileSync(CONFIG.CACHE.cryptoFile, JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: cryptoData
    }, null, 2));
    
    fs.writeFileSync(CONFIG.CACHE.stocksFile, JSON.stringify({
      lastUpdated: new Date().toISOString(),
      data: stockData
    }, null, 2));
    
    console.log(`Scan completed: ${cryptoData.length} cryptos, ${stockData.length} stocks`);
  } catch (error) {
    console.error('Scan failed:', error);
    
    // Create empty files if scan fails
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data');
    }
    
    if (!fs.existsSync(CONFIG.CACHE.cryptoFile)) {
      fs.writeFileSync(CONFIG.CACHE.cryptoFile, JSON.stringify({
        lastUpdated: new Date().toISOString(),
        data: []
      }));
    }
    
    if (!fs.existsSync(CONFIG.CACHE.stocksFile)) {
      fs.writeFileSync(CONFIG.CACHE.stocksFile, JSON.stringify({
        lastUpdated: new Date().toISOString(),
        data: []
      }));
    }
  }
}

runScan();
